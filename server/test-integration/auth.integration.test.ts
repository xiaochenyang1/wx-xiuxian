import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  accrueRate,
  requiredExperienceForLevel,
} from "@cultivation-diary/shared";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createServerServices } from "../src/bootstrap";
import { loadAppConfig } from "../src/config/env";
import { createInfrastructure, type Infrastructure } from "../src/infrastructure";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://cultivation:cultivation_dev@127.0.0.1:5432/cultivation_diary_test";

describe("authentication and bootstrap PostgreSQL integration", () => {
  let app: FastifyInstance;
  let infrastructure: Infrastructure;
  let forceIdleDrops = false;

  beforeAll(async () => {
    await ensureTestDatabase(databaseUrl);
    const config = loadAppConfig({
      NODE_ENV: "test",
      ENABLE_DEV_AUTH: "true",
      DATABASE_URL: databaseUrl,
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    });
    infrastructure = createInfrastructure(config);
    await migrate(infrastructure.database, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    app = await buildApp({
      config,
      readiness: infrastructure,
      services: createServerServices(config, infrastructure.database, {
        dropRandomInt: (maximum) => (forceIdleDrops ? 0 : maximum - 1),
      }),
    });
  });

  beforeEach(async () => {
    forceIdleDrops = false;
    await infrastructure.pool.query("truncate table accounts cascade");
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates one initialized player and reuses it on repeated logins", async () => {
    const idempotencyKey = randomUUID();
    const first = await login(app, "repeat-player", idempotencyKey);
    const replay = await login(app, "repeat-player", idempotencyKey);
    const nextLogin = await login(app, "repeat-player", randomUUID());

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(nextLogin.statusCode).toBe(200);

    const firstBody = first.json();
    const replayBody = replay.json();
    const nextBody = nextLogin.json();
    expect(firstBody.data.isNewPlayer).toBe(true);
    expect(replayBody.data.isNewPlayer).toBe(true);
    expect(replayBody.data.tokens).toEqual(firstBody.data.tokens);
    expect(nextBody.data.isNewPlayer).toBe(false);
    expect(nextBody.data.bootstrap.player.id).toBe(firstBody.data.bootstrap.player.id);
    expect(nextBody.data.tokens.refreshToken).not.toBe(firstBody.data.tokens.refreshToken);
    expect(firstBody.data.bootstrap).toMatchObject({
      progress: {
        level: 1,
        realmId: "qi_refining",
        title: "练气初期",
        experience: "0",
        totalPower: "100",
      },
      wallet: { spiritStone: "0", immortalJade: "0" },
      inventory: { bagCapacity: 50 },
      unlocks: { partner: false, cave: false },
    });

    const counts = await infrastructure.pool.query<{
      accounts: string;
      players: string;
      progress: string;
      wallets: string;
      settings: string;
    }>(`select
      (select count(*) from accounts)::text as accounts,
      (select count(*) from players)::text as players,
      (select count(*) from player_progress)::text as progress,
      (select count(*) from player_wallets)::text as wallets,
      (select count(*) from player_settings)::text as settings`);
    expect(counts.rows[0]).toEqual({
      accounts: "1",
      players: "1",
      progress: "1",
      wallets: "1",
      settings: "1",
    });
  });

  it("allocates unique names under concurrent first-login requests", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        login(app, `parallel-player-${index}`, randomUUID()),
      ),
    );
    const bodies = responses.map((response) => response.json());
    const names = bodies.map((body) => body.data.bootstrap.player.displayName as string);

    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    expect(new Set(names).size).toBe(8);

    const databaseNames = await infrastructure.pool.query<{
      count: string;
      distinctCount: string;
    }>(`select
      count(*)::text as count,
      count(distinct display_name_key)::text as "distinctCount"
      from players`);
    expect(databaseNames.rows[0]).toEqual({ count: "8", distinctCount: "8" });
  });

  it("rejects reuse of an idempotency key with a different request", async () => {
    const idempotencyKey = randomUUID();
    const first = await login(app, "idempotency-player", idempotencyKey, "device-a");
    const conflicting = await login(
      app,
      "idempotency-player",
      idempotencyKey,
      "device-b",
    );

    expect(first.statusCode).toBe(200);
    expect(conflicting.statusCode).toBe(409);
    expect(conflicting.json()).toMatchObject({
      error: { code: "IDEMPOTENCY_KEY_REUSED", retryable: false },
    });
  });

  it("rotates refresh tokens idempotently and revokes the old access session", async () => {
    const loggedIn = await login(app, "refresh-player", randomUUID());
    const loginData = loggedIn.json().data;
    const idempotencyKey = randomUUID();
    const firstRefresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { "idempotency-key": idempotencyKey },
      payload: { refreshToken: loginData.tokens.refreshToken },
    });
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { "idempotency-key": idempotencyKey },
      payload: { refreshToken: loginData.tokens.refreshToken },
    });

    expect(firstRefresh.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.tokens).toEqual(firstRefresh.json().data.tokens);

    const oldBootstrap = await app.inject({
      method: "GET",
      url: "/api/v1/bootstrap",
      headers: { authorization: `Bearer ${loginData.tokens.accessToken}` },
    });
    const newBootstrap = await app.inject({
      method: "GET",
      url: "/api/v1/bootstrap",
      headers: {
        authorization: `Bearer ${firstRefresh.json().data.tokens.accessToken}`,
      },
    });
    expect(oldBootstrap.statusCode).toBe(401);
    expect(newBootstrap.statusCode).toBe(200);
  });

  it("settles through Lv.8, stops at Lv.10, and breaks through to Lv.11 exactly once", async () => {
    const loggedIn = await login(app, "cultivation-player", randomUUID());
    const loginData = loggedIn.json().data;
    const playerId = loginData.bootstrap.player.id as string;
    const accessToken = loginData.tokens.accessToken as string;

    await infrastructure.pool.query(
      "update player_progress set last_settled_at = now() - interval '3 hours' where player_id = $1",
      [playerId],
    );

    const settlementKey = randomUUID();
    const settled = await cultivationMutation(
      app,
      "/api/v1/cultivation/settle",
      accessToken,
      settlementKey,
    );
    const settlementReplay = await cultivationMutation(
      app,
      "/api/v1/cultivation/settle",
      accessToken,
      settlementKey,
    );

    expect(settled.statusCode).toBe(200);
    expect(settlementReplay.statusCode).toBe(200);
    expect(settlementReplay.json().data.settlement).toEqual(
      settled.json().data.settlement,
    );
    expect(settled.json().data).toMatchObject({
      settlement: { newcomerRewardGranted: true },
      bootstrap: {
        progress: { level: 10, status: "breakthrough_ready" },
        inventory: {
          stacks: [{ itemConfigId: "breakthrough_pill", quantity: "1" }],
        },
        newcomerTasks: [
          {
            taskConfigId: "newcomer.reach_level_8",
            progress: "8",
          },
        ],
      },
    });

    const breakthroughKey = randomUUID();
    const breakthrough = await cultivationMutation(
      app,
      "/api/v1/cultivation/breakthrough",
      accessToken,
      breakthroughKey,
    );
    const breakthroughReplay = await cultivationMutation(
      app,
      "/api/v1/cultivation/breakthrough",
      accessToken,
      breakthroughKey,
    );

    expect(breakthrough.statusCode).toBe(200);
    expect(breakthroughReplay.statusCode).toBe(200);
    expect(breakthroughReplay.json()).toMatchObject({
      data: {
        breakthroughId: breakthrough.json().data.breakthroughId,
        fromLevel: 10,
        toLevel: 11,
        consumedPills: 1,
        bootstrap: {
          progress: {
            level: 11,
            realmId: "foundation_establishment",
            experience: "0",
            status: "gaining",
          },
          unlocks: { partner: true, cave: true },
          inventory: { stacks: [] },
        },
      },
    });

    const persisted = await infrastructure.pool.query<{
      level: number;
      pillCount: string;
      taskCount: string;
      rewardLedgerCount: string;
      breakthroughLedgerCount: string;
    }>(
      `select
        pp.level,
        (select count(*) from inventory_stacks where player_id = pp.player_id and item_config_id = 'breakthrough_pill')::text as "pillCount",
        (select count(*) from newcomer_task_progress where player_id = pp.player_id and task_config_id = 'newcomer.reach_level_8')::text as "taskCount",
        (select count(*) from asset_ledger where player_id = pp.player_id and reason = 'newcomer_level_8_reward')::text as "rewardLedgerCount",
        (select count(*) from asset_ledger where player_id = pp.player_id and reason = 'cultivation_breakthrough')::text as "breakthroughLedgerCount"
      from player_progress pp
      where pp.player_id = $1`,
      [playerId],
    );
    expect(persisted.rows[0]).toEqual({
      level: 11,
      pillCount: "0",
      taskCount: "1",
      rewardLedgerCount: "1",
      breakthroughLedgerCount: "1",
    });
  });

  it("materializes idle drops and supports transactional transfer and salvage", async () => {
    const loggedIn = await login(app, "idle-drop-player", randomUUID());
    const loginData = loggedIn.json().data;
    const playerId = loginData.bootstrap.player.id as string;
    const accessToken = loginData.tokens.accessToken as string;
    await infrastructure.pool.query(
      `update player_progress
       set last_settled_at = now() - interval '61 seconds',
           last_heartbeat_at = now(),
           drop_clock_remainder_micros = 0
       where player_id = $1`,
      [playerId],
    );

    forceIdleDrops = true;
    const settled = await cultivationMutation(
      app,
      "/api/v1/cultivation/settle",
      accessToken,
      randomUUID(),
    );
    forceIdleDrops = false;

    expect(settled.statusCode).toBe(200);
    expect(settled.json().data.settlement).toMatchObject({
      dropAttempts: 1,
      drops: {
        configVersion: "idle-drop-2026-08-05-v1",
        stackItems: [
          { itemConfigId: "breakthrough_pill", quantity: "1" },
          { itemConfigId: "enhance_stone", quantity: "1" },
          { itemConfigId: "wood", quantity: "1" },
        ],
        equipmentCount: 1,
        techniqueCount: 1,
        harvestChestAdded: 2,
        autoSalvagedCount: 0,
      },
    });
    const entries = settled.json().data.bootstrap.harvestChest.entries as Array<{
      id: string;
      entryType: string;
      assetConfigId: string;
    }>;
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.assetConfigId).sort()).toEqual([
      "ironwood_sword",
      "quiet_breathing_art",
    ]);

    const techniqueEntry = entries.find((entry) => entry.entryType === "technique");
    const equipmentEntry = entries.find((entry) => entry.entryType === "equipment");
    expect(techniqueEntry).toBeDefined();
    expect(equipmentEntry).toBeDefined();

    const transferKey = randomUUID();
    const transferred = await inventoryMutation(
      app,
      "/api/v1/harvest/transfer",
      accessToken,
      transferKey,
      { entryIds: [techniqueEntry!.id] },
    );
    const transferReplay = await inventoryMutation(
      app,
      "/api/v1/harvest/transfer",
      accessToken,
      transferKey,
      { entryIds: [techniqueEntry!.id] },
    );
    expect(transferred.statusCode).toBe(200);
    expect(transferReplay.statusCode).toBe(200);
    expect(transferReplay.json().data.operationId).toBe(
      transferred.json().data.operationId,
    );
    expect(transferred.json().data).toMatchObject({
      transferredEquipment: 0,
      collectedTechniques: 1,
      techniqueDuplicates: 0,
      bootstrap: {
        techniques: [
          {
            techniqueConfigId: "quiet_breathing_art",
            duplicateCount: 0,
          },
        ],
        harvestChest: { pendingCount: 1 },
      },
    });

    const salvageKey = randomUUID();
    const salvaged = await inventoryMutation(
      app,
      "/api/v1/harvest/salvage",
      accessToken,
      salvageKey,
      { entryIds: [equipmentEntry!.id] },
    );
    const salvageReplay = await inventoryMutation(
      app,
      "/api/v1/harvest/salvage",
      accessToken,
      salvageKey,
      { entryIds: [equipmentEntry!.id] },
    );
    expect(salvaged.statusCode).toBe(200);
    expect(salvageReplay.statusCode).toBe(200);
    expect(salvageReplay.json().data.operationId).toBe(
      salvaged.json().data.operationId,
    );
    expect(salvaged.json().data).toMatchObject({
      salvagedCount: 1,
      spiritStoneGained: "100",
      enhanceStoneGained: "1",
      bootstrap: {
        harvestChest: { pendingCount: 0, entries: [] },
      },
    });
    const enhanceStack = salvaged.json().data.bootstrap.inventory.stacks.find(
      (stack: { itemConfigId: string }) => stack.itemConfigId === "enhance_stone",
    );
    expect(enhanceStack.quantity).toBe("2");

    const audit = await infrastructure.pool.query<{
      pending: string;
      transferred: string;
      salvaged: string;
      duplicateTechniqueLedgers: string;
      dropVersions: string[];
    }>(
      `select
        count(*) filter (where status = 'pending')::text as pending,
        count(*) filter (where status = 'transferred')::text as transferred,
        count(*) filter (where status = 'salvaged')::text as salvaged,
        (select count(*) from asset_ledger where player_id = $1 and reason = 'harvest_salvage' and asset_type = 'equipment')::text as "duplicateTechniqueLedgers",
        coalesce(array_agg(distinct config_version), '{}') as "dropVersions"
       from harvest_chest_entries where player_id = $1`,
      [playerId],
    );
    expect(audit.rows[0]).toEqual({
      pending: "0",
      transferred: "1",
      salvaged: "1",
      duplicateTechniqueLedgers: "1",
      dropVersions: ["idle-drop-2026-08-05-v1"],
    });
  });

  it("expands the bag idempotently with the configured quadratic cost", async () => {
    const loggedIn = await login(app, "bag-expand-player", randomUUID());
    const loginData = loggedIn.json().data;
    const playerId = loginData.bootstrap.player.id as string;
    const accessToken = loginData.tokens.accessToken as string;
    await infrastructure.pool.query(
      "update player_wallets set spirit_stone = '30000' where player_id = $1",
      [playerId],
    );

    const firstKey = randomUUID();
    const first = await inventoryMutation(
      app,
      "/api/v1/inventory/expand",
      accessToken,
      firstKey,
      {},
    );
    const replay = await inventoryMutation(
      app,
      "/api/v1/inventory/expand",
      accessToken,
      firstKey,
      {},
    );
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.operationId).toBe(first.json().data.operationId);
    expect(first.json().data).toMatchObject({
      expandedBy: 10,
      cost: "5000",
      nextCost: "20000",
      bootstrap: {
        inventory: { bagCapacity: 60 },
        wallet: { spiritStone: "25000" },
      },
    });

    const second = await inventoryMutation(
      app,
      "/api/v1/inventory/expand",
      accessToken,
      randomUUID(),
      {},
    );
    expect(second.statusCode).toBe(200);
    expect(second.json().data).toMatchObject({
      cost: "20000",
      nextCost: "45000",
      bootstrap: {
        inventory: { bagCapacity: 70 },
        wallet: { spiritStone: "5000" },
      },
    });

    const insufficient = await inventoryMutation(
      app,
      "/api/v1/inventory/expand",
      accessToken,
      randomUUID(),
      {},
    );
    expect(insufficient.statusCode).toBe(409);
    expect(insufficient.json()).toMatchObject({
      error: { code: "INSUFFICIENT_CURRENCY" },
    });
  });

  it("uses a small experience pill transactionally and replays it idempotently", async () => {
    const loggedIn = await login(app, "experience-pill-player", randomUUID());
    const loginData = loggedIn.json().data;
    const playerId = loginData.bootstrap.player.id as string;
    const accessToken = loginData.tokens.accessToken as string;

    const missing = await inventoryMutation(
      app,
      "/api/v1/inventory/use",
      accessToken,
      randomUUID(),
      { itemConfigId: "exp_pill_small", quantity: 1 },
      "1",
    );
    expect(missing.statusCode).toBe(409);
    expect(missing.json()).toMatchObject({ error: { code: "INSUFFICIENT_ITEM" } });

    await infrastructure.pool.query(
      `insert into inventory_stacks (player_id, item_config_id, quantity)
       values
        ($1, 'exp_pill_small', '2'),
        ($1, 'exp_pill_large', '1')`,
      [playerId],
    );

    const stale = await inventoryMutation(
      app,
      "/api/v1/inventory/use",
      accessToken,
      randomUUID(),
      { itemConfigId: "exp_pill_small", quantity: 1 },
      "0",
    );
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      error: { code: "PLAYER_VERSION_CONFLICT" },
    });

    const useKey = randomUUID();
    const used = await inventoryMutation(
      app,
      "/api/v1/inventory/use",
      accessToken,
      useKey,
      { itemConfigId: "exp_pill_small", quantity: 1 },
      "1",
    );
    const replay = await inventoryMutation(
      app,
      "/api/v1/inventory/use",
      accessToken,
      useKey,
      { itemConfigId: "exp_pill_small", quantity: 1 },
      "1",
    );
    expect(used.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.operationId).toBe(used.json().data.operationId);
    expect(used.json()).toMatchObject({
      playerVersion: "2",
      data: {
        itemConfigId: "exp_pill_small",
        consumedQuantity: 1,
        remainingQuantity: "1",
        effectType: "simulated_online_experience",
        fromLevel: 1,
        toLevel: 10,
        reachedBreakthrough: true,
        newcomerRewardGranted: true,
        bootstrap: {
          progress: {
            level: 10,
            status: "breakthrough_ready",
            totalPower: "1000",
          },
        },
      },
    });
    expect(BigInt(used.json().data.experienceGained)).toBeGreaterThan(0n);
    expect(used.json().data.events).toContainEqual({
      type: "breakthrough_ready",
      level: 10,
    });

    const blocked = await inventoryMutation(
      app,
      "/api/v1/inventory/use",
      accessToken,
      randomUUID(),
      { itemConfigId: "exp_pill_small", quantity: 1 },
      "2",
    );
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: { code: "ITEM_USE_BLOCKED" } });

    const reserved = await inventoryMutation(
      app,
      "/api/v1/inventory/use",
      accessToken,
      randomUUID(),
      { itemConfigId: "exp_pill_large", quantity: 1 },
      "2",
    );
    expect(reserved.statusCode).toBe(400);
    expect(reserved.json()).toMatchObject({ error: { code: "ITEM_NOT_USABLE" } });

    const audit = await infrastructure.pool.query<{
      smallPills: string;
      largePills: string;
      breakthroughPills: string;
      inventoryUseLedgers: string;
      newcomerTasks: string;
      version: string;
    }>(
      `select
        (select quantity::text from inventory_stacks where player_id = pp.player_id and item_config_id = 'exp_pill_small') as "smallPills",
        (select quantity::text from inventory_stacks where player_id = pp.player_id and item_config_id = 'exp_pill_large') as "largePills",
        (select quantity::text from inventory_stacks where player_id = pp.player_id and item_config_id = 'breakthrough_pill') as "breakthroughPills",
        (select count(*)::text from asset_ledger where player_id = pp.player_id and reason = 'inventory_use') as "inventoryUseLedgers",
        (select count(*)::text from newcomer_task_progress where player_id = pp.player_id and task_config_id = 'newcomer.reach_level_8') as "newcomerTasks",
        pp.version::text as version
       from player_progress pp where pp.player_id = $1`,
      [playerId],
    );
    expect(audit.rows[0]).toEqual({
      smallPills: "1",
      largePills: "1",
      breakthroughPills: "1",
      inventoryUseLedgers: "1",
      newcomerTasks: "1",
      version: "2",
    });
  });

  it("equips, replaces, and unequips techniques with idempotent power recalculation", async () => {
    const loggedIn = await login(app, "technique-loadout-player", randomUUID());
    const loginData = loggedIn.json().data;
    const playerId = loginData.bootstrap.player.id as string;
    const accessToken = loginData.tokens.accessToken as string;
    await infrastructure.pool.query(
      `insert into technique_progress
        (player_id, technique_config_id, star, duplicate_count, config_version)
       values
        ($1, 'quiet_breathing_art', 1, 0, 'mvp-0.3.0'),
        ($1, 'azure_cloud_heart_manual', 1, 0, 'mvp-0.3.0')`,
      [playerId],
    );

    const equipKey = randomUUID();
    const equipped = await inventoryMutation(
      app,
      "/api/v1/techniques/equip",
      accessToken,
      equipKey,
      { techniqueConfigId: "quiet_breathing_art" },
      "1",
    );
    const replay = await inventoryMutation(
      app,
      "/api/v1/techniques/equip",
      accessToken,
      equipKey,
      { techniqueConfigId: "quiet_breathing_art" },
      "1",
    );
    expect(equipped.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.operationId).toBe(equipped.json().data.operationId);
    expect(equipped.json()).toMatchObject({
      playerVersion: "2",
      data: {
        assetType: "technique",
        action: "equip",
        equippedSlot: "mind",
        previousTotalPower: "100",
        totalPower: "140",
        powerDelta: "40",
        bootstrap: {
          progress: {
            totalPower: "140",
            loadoutFixedPower: "40",
            experienceBonusBp: 200,
            experiencePerSecond: "1.02",
          },
        },
      },
    });

    const stale = await inventoryMutation(
      app,
      "/api/v1/techniques/equip",
      accessToken,
      randomUUID(),
      { techniqueConfigId: "azure_cloud_heart_manual" },
      "1",
    );
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: { code: "PLAYER_VERSION_CONFLICT" } });

    const replaced = await inventoryMutation(
      app,
      "/api/v1/techniques/equip",
      accessToken,
      randomUUID(),
      { techniqueConfigId: "azure_cloud_heart_manual" },
      "2",
    );
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json().data).toMatchObject({
      replacedAssetId: "quiet_breathing_art",
      previousTotalPower: "140",
      totalPower: "250",
      powerDelta: "110",
      bootstrap: {
        progress: {
          loadoutFixedPower: "150",
          experienceBonusBp: 750,
          experiencePerSecond: "1.075",
        },
      },
    });

    const unequipped = await inventoryMutation(
      app,
      "/api/v1/techniques/unequip",
      accessToken,
      randomUUID(),
      { techniqueConfigId: "azure_cloud_heart_manual" },
      "3",
    );
    expect(unequipped.statusCode).toBe(200);
    expect(unequipped.json().data).toMatchObject({
      action: "unequip",
      previousTotalPower: "250",
      totalPower: "100",
      powerDelta: "-150",
      bootstrap: { progress: { loadoutFixedPower: "0", experienceBonusBp: 0 } },
    });

    const persisted = await infrastructure.pool.query<{
      equippedCount: string;
      ledgerCount: string;
      version: string;
    }>(
      `select
        (select count(*) from technique_progress where player_id = pp.player_id and equipped_slot is not null)::text as "equippedCount",
        (select count(*) from asset_ledger where player_id = pp.player_id and reason like 'loadout_%')::text as "ledgerCount",
        pp.version::text as version
       from player_progress pp where pp.player_id = $1`,
      [playerId],
    );
    expect(persisted.rows[0]).toEqual({
      equippedCount: "0",
      ledgerCount: "3",
      version: "4",
    });
  });

  it("uses six legal equipment slots and preserves loadout power during settlement", async () => {
    const loggedIn = await login(app, "equipment-loadout-player", randomUUID());
    const loginData = loggedIn.json().data;
    const playerId = loginData.bootstrap.player.id as string;
    const accessToken = loginData.tokens.accessToken as string;
    const swordOne = "20000000-0000-4000-8000-000000000001";
    const robe = "20000000-0000-4000-8000-000000000002";
    const swordTwo = "20000000-0000-4000-8000-000000000003";
    await infrastructure.pool.query(
      `insert into equipment_instances
        (id, player_id, equipment_config_id, quality, enhance_level, rolled_affixes, location, config_version)
       values
        ($2, $1, 'ironwood_sword', 'uncommon', 2, '[{"stat":"experience_bonus","valueBp":100}]'::jsonb, 'bag', 'mvp-0.3.0'),
        ($3, $1, 'cloudweave_robe', 'common', 0, '[{"stat":"spirit_stone_bonus","valueBp":100}]'::jsonb, 'bag', 'mvp-0.3.0'),
        ($4, $1, 'ironwood_sword', 'common', 0, '[]'::jsonb, 'bag', 'mvp-0.3.0')`,
      [playerId, swordOne, robe, swordTwo],
    );

    const swordEquipped = await inventoryMutation(
      app,
      "/api/v1/equipment/equip",
      accessToken,
      randomUUID(),
      { equipmentInstanceId: swordOne, equippedSlot: "weapon" },
      "1",
    );
    expect(swordEquipped.statusCode).toBe(200);
    expect(swordEquipped.json().data).toMatchObject({
      totalPower: "244",
      powerDelta: "144",
      bootstrap: {
        progress: { loadoutFixedPower: "144", experienceBonusBp: 100 },
      },
    });

    const mismatch = await inventoryMutation(
      app,
      "/api/v1/equipment/equip",
      accessToken,
      randomUUID(),
      { equipmentInstanceId: robe, equippedSlot: "weapon" },
      "2",
    );
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json()).toMatchObject({ error: { code: "EQUIPMENT_SLOT_MISMATCH" } });

    const robeEquipped = await inventoryMutation(
      app,
      "/api/v1/equipment/equip",
      accessToken,
      randomUUID(),
      { equipmentInstanceId: robe, equippedSlot: "armor" },
      "2",
    );
    expect(robeEquipped.statusCode).toBe(200);
    expect(robeEquipped.json().data).toMatchObject({
      totalPower: "319",
      bootstrap: { progress: { spiritStoneBonusBp: 100 } },
    });

    const replacement = await inventoryMutation(
      app,
      "/api/v1/equipment/equip",
      accessToken,
      randomUUID(),
      { equipmentInstanceId: swordTwo, equippedSlot: "weapon" },
      "3",
    );
    expect(replacement.statusCode).toBe(200);
    expect(replacement.json().data).toMatchObject({
      replacedAssetId: swordOne,
      previousTotalPower: "319",
      totalPower: "255",
      powerDelta: "-64",
    });
    expect(
      replacement
        .json()
        .data.bootstrap.equipment.map((item: { id: string }) => item.id),
    ).toEqual([swordOne, robe, swordTwo]);

    await infrastructure.pool.query(
      `update player_progress
       set last_settled_at = now() - interval '60 seconds', last_heartbeat_at = now()
       where player_id = $1`,
      [playerId],
    );
    const settled = await cultivationMutation(
      app,
      "/api/v1/cultivation/settle",
      accessToken,
      randomUUID(),
      "4",
    );
    expect(settled.statusCode).toBe(200);
    expect(settled.json().data.bootstrap.progress).toMatchObject({
      level: 1,
      totalPower: "255",
      loadoutFixedPower: "155",
      spiritStoneBonusBp: 100,
      spiritStonePerMinute: "1.01",
    });

    const armorUnequipped = await inventoryMutation(
      app,
      "/api/v1/equipment/unequip",
      accessToken,
      randomUUID(),
      { equipmentInstanceId: robe },
      "5",
    );
    expect(armorUnequipped.statusCode).toBe(200);
    expect(armorUnequipped.json().data.totalPower).toBe("180");

    const weaponUnequipped = await inventoryMutation(
      app,
      "/api/v1/equipment/unequip",
      accessToken,
      randomUUID(),
      { equipmentInstanceId: swordTwo },
      "6",
    );
    expect(weaponUnequipped.statusCode).toBe(200);
    expect(weaponUnequipped.json().data).toMatchObject({
      totalPower: "100",
      bootstrap: { progress: { loadoutFixedPower: "0" } },
    });

    const persisted = await infrastructure.pool.query<{
      equippedCount: string;
      bagCount: string;
      version: string;
    }>(
      `select
        count(*) filter (where location = 'equipped')::text as "equippedCount",
        count(*) filter (where location = 'bag')::text as "bagCount",
        (select version::text from player_progress where player_id = $1) as version
       from equipment_instances where player_id = $1`,
      [playerId],
    );
    expect(persisted.rows[0]).toEqual({
      equippedCount: "0",
      bagCount: "3",
      version: "7",
    });
  });

  it("protects a full chest of rare assets and auto-salvages new common drops", async () => {
    const loggedIn = await login(app, "protected-chest-player", randomUUID());
    const loginData = loggedIn.json().data;
    const playerId = loginData.bootstrap.player.id as string;
    const accessToken = loginData.tokens.accessToken as string;
    await infrastructure.pool.query(
      `insert into harvest_chest_entries
        (id, player_id, entry_type, technique_config_id, quality, value_score, config_version, status, acquired_at)
       select
        ('10000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
        $1,
        'technique',
        'protected_technique_' || series,
        'rare',
        10000 + series,
        'protected-test-v1',
        'pending',
        now() - interval '1 day'
       from generate_series(1, 100) as series`,
      [playerId],
    );
    await infrastructure.pool.query(
      `update player_progress
       set last_settled_at = now() - interval '61 seconds',
           last_heartbeat_at = now(),
           drop_clock_remainder_micros = 0
       where player_id = $1`,
      [playerId],
    );

    forceIdleDrops = true;
    const settled = await cultivationMutation(
      app,
      "/api/v1/cultivation/settle",
      accessToken,
      randomUUID(),
    );
    forceIdleDrops = false;

    expect(settled.statusCode).toBe(200);
    expect(settled.json().data.settlement.drops).toMatchObject({
      harvestChestAdded: 0,
      autoSalvagedCount: 2,
      mailedCount: 0,
      autoSalvageSpiritStone: "180",
      autoSalvageEnhanceStone: "1",
    });
    expect(settled.json().data.bootstrap.harvestChest.pendingCount).toBe(100);

    const chest = await infrastructure.pool.query<{
      pendingRare: string;
      salvagedCommon: string;
      pendingTotal: string;
    }>(
      `select
        count(*) filter (where status = 'pending' and quality = 'rare')::text as "pendingRare",
        count(*) filter (where status = 'salvaged' and quality = 'common')::text as "salvagedCommon",
        count(*) filter (where status = 'pending')::text as "pendingTotal"
       from harvest_chest_entries where player_id = $1`,
      [playerId],
    );
    expect(chest.rows[0]).toEqual({
      pendingRare: "100",
      salvagedCommon: "2",
      pendingTotal: "100",
    });
  });

  it("serializes concurrent settle requests with the same idempotency key", async () => {
    const loggedIn = await login(app, "concurrent-settle-player", randomUUID());
    const loginData = loggedIn.json().data;
    const playerId = loginData.bootstrap.player.id as string;
    const accessToken = loginData.tokens.accessToken as string;
    await infrastructure.pool.query(
      "update player_progress set last_settled_at = now() - interval '1 minute' where player_id = $1",
      [playerId],
    );

    const idempotencyKey = randomUUID();
    const responses = await Promise.all([
      cultivationMutation(
        app,
        "/api/v1/cultivation/settle",
        accessToken,
        idempotencyKey,
      ),
      cultivationMutation(
        app,
        "/api/v1/cultivation/settle",
        accessToken,
        idempotencyKey,
      ),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(responses[1]?.json().data.settlement).toEqual(
      responses[0]?.json().data.settlement,
    );

    const persisted = await infrastructure.pool.query<{
      version: string;
      settlementLedgerCount: string;
      idempotencyCount: string;
    }>(
      `select
        pp.version::text as version,
        (select count(*) from asset_ledger where player_id = pp.player_id and reason = 'cultivation_settlement')::text as "settlementLedgerCount",
        (select count(*) from idempotency_records where account_id = (select account_id from players where id = pp.player_id) and scope = 'cultivation.settle' and idempotency_key = $2)::text as "idempotencyCount"
       from player_progress pp
       where pp.player_id = $1`,
      [playerId, idempotencyKey],
    );
    expect(persisted.rows[0]).toEqual({
      version: "2",
      settlementLedgerCount: "1",
      idempotencyCount: "1",
    });
  });

  it("credits inactive cultivation at 70% and records one offline settlement", async () => {
    const loggedIn = await login(app, "offline-settlement-player", randomUUID());
    const loginData = loggedIn.json().data;
    const playerId = loginData.bootstrap.player.id as string;
    const accessToken = loginData.tokens.accessToken as string;
    await infrastructure.pool.query(
      `update player_progress
       set level = 10,
           realm_key = 'qi_refining',
           exp = $2,
           progression_state = 'breakthrough_ready',
           last_settled_at = now() - interval '10 minutes',
           last_heartbeat_at = now() - interval '10 minutes'
       where player_id = $1`,
      [playerId, requiredExperienceForLevel(10)],
    );

    const idempotencyKey = randomUUID();
    const settled = await cultivationMutation(
      app,
      "/api/v1/cultivation/settle",
      accessToken,
      idempotencyKey,
    );
    const replay = await cultivationMutation(
      app,
      "/api/v1/cultivation/settle",
      accessToken,
      idempotencyKey,
    );

    expect(settled.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    const settlement = settled.json().data.settlement;
    const offlineSummary = settlement.offlineSettlement;
    expect(settlement).toMatchObject({
      mode: "offline",
      efficiencyBp: 7_000,
      experienceGained: "0",
    });
    expect(replay.json().data.settlement).toEqual(settlement);
    expect(offlineSummary).toMatchObject({
      id: settlement.settlementId,
      efficiencyBp: 7_000,
      experienceGained: "0",
      spiritStoneGained: settlement.spiritStoneGained,
      newcomerRewardGranted: true,
    });
    expect(settled.json().data.bootstrap.offlineSettlement).toEqual(
      offlineSummary,
    );

    const expectedStones = accrueRate({
      ratePerPeriod: 10,
      periodSeconds: 60,
      elapsedMilliseconds: settlement.elapsedMilliseconds,
      efficiencyBp: 7_000,
    });
    expect(settlement.spiritStoneGained).toBe(expectedStones.wholeUnits);
    expect(offlineSummary.effectiveSeconds).toBe(
      Math.floor(settlement.elapsedMilliseconds / 1_000),
    );

    const persisted = await infrastructure.pool.query<{
      id: string;
      effectiveSeconds: number;
      efficiencyBp: number;
      stoneReward: string;
      offlineLedgerCount: string;
    }>(
      `select
        os.id,
        os.effective_seconds as "effectiveSeconds",
        os.offline_efficiency_bp as "efficiencyBp",
        os.reward_snapshot->>'spiritStoneGained' as "stoneReward",
        (select count(*) from asset_ledger where player_id = os.player_id and reason = 'offline_cultivation_settlement')::text as "offlineLedgerCount"
       from offline_settlements os
       where os.player_id = $1`,
      [playerId],
    );
    expect(persisted.rows).toEqual([
      {
        id: settlement.settlementId,
        effectiveSeconds: offlineSummary.effectiveSeconds,
        efficiencyBp: 7_000,
        stoneReward: settlement.spiritStoneGained,
        offlineLedgerCount: "1",
      },
    ]);

    const next = await cultivationMutation(
      app,
      "/api/v1/cultivation/settle",
      accessToken,
      randomUUID(),
    );
    expect(next.statusCode).toBe(200);
    expect(next.json().data.settlement).toMatchObject({
      mode: "online",
      efficiencyBp: 10_000,
      offlineSettlement: null,
    });
    const recordCount = await infrastructure.pool.query<{ count: string }>(
      "select count(*)::text as count from offline_settlements where player_id = $1",
      [playerId],
    );
    expect(recordCount.rows[0]?.count).toBe("1");
  });

  it("caps offline rewards at 24 hours and advances the settlement cursor to now", async () => {
    const loggedIn = await login(app, "offline-cap-player", randomUUID());
    const loginData = loggedIn.json().data;
    const playerId = loginData.bootstrap.player.id as string;
    const accessToken = loginData.tokens.accessToken as string;
    await infrastructure.pool.query(
      `update player_progress
       set last_settled_at = now() - interval '48 hours',
           last_heartbeat_at = now() - interval '48 hours'
       where player_id = $1`,
      [playerId],
    );

    const settled = await cultivationMutation(
      app,
      "/api/v1/cultivation/settle",
      accessToken,
      randomUUID(),
    );
    expect(settled.statusCode).toBe(200);
    expect(settled.json().data.settlement).toMatchObject({
      mode: "offline",
      efficiencyBp: 7_000,
      elapsedMilliseconds: 86_400_000,
      offlineSettlement: { effectiveSeconds: 86_400 },
    });

    const immediate = await cultivationMutation(
      app,
      "/api/v1/cultivation/settle",
      accessToken,
      randomUUID(),
    );
    expect(immediate.statusCode).toBe(200);
    expect(immediate.json().data.settlement.elapsedMilliseconds).toBeLessThan(5_000);
    expect(immediate.json().data.settlement.offlineSettlement).toBeNull();

    const persisted = await infrastructure.pool.query<{
      cursorIsCurrent: boolean;
      recordCount: string;
    }>(
      `select
        last_settled_at > now() - interval '5 seconds' as "cursorIsCurrent",
        (select count(*) from offline_settlements where player_id = pp.player_id)::text as "recordCount"
       from player_progress pp where player_id = $1`,
      [playerId],
    );
    expect(persisted.rows[0]).toEqual({
      cursorIsCurrent: true,
      recordCount: "1",
    });
  });

  it("rejects a mutation with a stale player version without applying it", async () => {
    const loggedIn = await login(app, "stale-version-player", randomUUID());
    const loginData = loggedIn.json().data;
    const playerId = loginData.bootstrap.player.id as string;
    const accessToken = loginData.tokens.accessToken as string;
    await infrastructure.pool.query(
      "update player_progress set last_settled_at = now() - interval '1 minute' where player_id = $1",
      [playerId],
    );

    const first = await cultivationMutation(
      app,
      "/api/v1/cultivation/settle",
      accessToken,
      randomUUID(),
    );
    const stale = await cultivationMutation(
      app,
      "/api/v1/cultivation/settle",
      accessToken,
      randomUUID(),
      "1",
    );

    expect(first.statusCode).toBe(200);
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      error: { code: "PLAYER_VERSION_CONFLICT", retryable: false },
    });

    const persisted = await infrastructure.pool.query<{
      version: string;
      ledgerCount: string;
    }>(
      `select
        pp.version::text as version,
        (select count(*) from asset_ledger where player_id = pp.player_id)::text as "ledgerCount"
       from player_progress pp
       where pp.player_id = $1`,
      [playerId],
    );
    expect(persisted.rows[0]).toEqual({ version: "2", ledgerCount: "1" });
  });

  it("settles pending bottleneck income at the old level before breakthrough", async () => {
    const loggedIn = await login(app, "breakthrough-settlement-player", randomUUID());
    const loginData = loggedIn.json().data;
    const playerId = loginData.bootstrap.player.id as string;
    const accessToken = loginData.tokens.accessToken as string;
    await infrastructure.pool.query(
      `update player_progress
       set level = 10,
           realm_key = 'qi_refining',
           exp = $2,
           progression_state = 'breakthrough_ready',
           last_settled_at = now() - interval '1 hour'
       where player_id = $1`,
      [playerId, requiredExperienceForLevel(10)],
    );
    await infrastructure.pool.query(
      `insert into inventory_stacks (player_id, item_config_id, quantity)
       values ($1, 'breakthrough_pill', '1')`,
      [playerId],
    );

    const breakthrough = await cultivationMutation(
      app,
      "/api/v1/cultivation/breakthrough",
      accessToken,
      randomUUID(),
    );
    expect(breakthrough.statusCode).toBe(200);

    const settledLedger = await infrastructure.pool.query<{
      delta: string;
      level: number;
      elapsedMilliseconds: number;
    }>(
      `select
        delta,
        (metadata->>'level')::integer as level,
        (metadata->>'elapsedMilliseconds')::integer as "elapsedMilliseconds"
       from asset_ledger
       where player_id = $1 and reason = 'cultivation_settlement_before_breakthrough'`,
      [playerId],
    );
    expect(settledLedger.rows).toHaveLength(1);
    expect(settledLedger.rows[0]?.level).toBe(10);
    expect(settledLedger.rows[0]?.elapsedMilliseconds).toBeGreaterThanOrEqual(3_600_000);
    expect(BigInt(settledLedger.rows[0]?.delta ?? "0")).toBeGreaterThan(0n);

    const progressAfterBreakthrough = await infrastructure.pool.query<{
      level: number;
      experience: string;
      lastSettledAt: Date;
    }>(
      `select level, exp::text as experience, last_settled_at as "lastSettledAt"
       from player_progress where player_id = $1`,
      [playerId],
    );
    expect(progressAfterBreakthrough.rows[0]?.level).toBe(11);
    expect(progressAfterBreakthrough.rows[0]?.experience).toBe("0");
    expect(progressAfterBreakthrough.rows[0]?.lastSettledAt.getTime()).toBeGreaterThan(
      Date.now() - 5_000,
    );

    const immediateSettle = await cultivationMutation(
      app,
      "/api/v1/cultivation/settle",
      accessToken,
      randomUUID(),
    );
    expect(immediateSettle.statusCode).toBe(200);
    expect(immediateSettle.json().data.settlement.elapsedMilliseconds).toBeLessThan(
      5_000,
    );
    expect(
      BigInt(immediateSettle.json().data.settlement.experienceGained),
    ).toBeLessThan(200n);
  });

  it("does not mutate a breakthrough-ready player when the pill is missing", async () => {
    const loggedIn = await login(app, "no-pill-player", randomUUID());
    const loginData = loggedIn.json().data;
    const playerId = loginData.bootstrap.player.id as string;
    const accessToken = loginData.tokens.accessToken as string;
    await infrastructure.pool.query(
      `update player_progress
       set level = 10,
           exp = $2,
           progression_state = 'breakthrough_ready',
           total_power = '1000'
       where player_id = $1`,
      [playerId, requiredExperienceForLevel(10)],
    );

    const response = await cultivationMutation(
      app,
      "/api/v1/cultivation/breakthrough",
      accessToken,
      randomUUID(),
    );
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: "INSUFFICIENT_ITEM", retryable: false },
    });

    const persisted = await infrastructure.pool.query<{
      level: number;
      experience: string;
      progressionState: string;
      version: string;
      ledgerCount: string;
    }>(
      `select
        pp.level,
        pp.exp::text as experience,
        pp.progression_state as "progressionState",
        pp.version::text as version,
        (select count(*) from asset_ledger where player_id = pp.player_id)::text as "ledgerCount"
       from player_progress pp
       where pp.player_id = $1`,
      [playerId],
    );
    expect(persisted.rows[0]).toEqual({
      level: 10,
      experience: requiredExperienceForLevel(10),
      progressionState: "breakthrough_ready",
      version: "1",
      ledgerCount: "0",
    });
  });

  it("keeps WeChat login present but unavailable until credentials are configured", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/wechat",
      headers: { "idempotency-key": randomUUID() },
      payload: { code: "placeholder-code" },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: "WECHAT_AUTH_UNAVAILABLE", retryable: true },
    });
  });
});

async function login(
  app: FastifyInstance,
  accountId: string,
  idempotencyKey: string,
  deviceKey?: string,
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/dev",
    headers: { "idempotency-key": idempotencyKey },
    payload: {
      accountId,
      ...(deviceKey ? { deviceKey } : {}),
    },
  });
}

async function cultivationMutation(
  app: FastifyInstance,
  url: string,
  accessToken: string,
  idempotencyKey: string,
  expectedPlayerVersion?: string,
) {
  return app.inject({
    method: "POST",
    url,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "idempotency-key": idempotencyKey,
      ...(expectedPlayerVersion === undefined
        ? {}
        : { "if-player-version": expectedPlayerVersion }),
    },
    payload: {},
  });
}

async function inventoryMutation(
  app: FastifyInstance,
  url: string,
  accessToken: string,
  idempotencyKey: string,
  payload: Record<string, unknown>,
  expectedPlayerVersion?: string,
) {
  return app.inject({
    method: "POST",
    url,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "idempotency-key": idempotencyKey,
      ...(expectedPlayerVersion === undefined
        ? {}
        : { "if-player-version": expectedPlayerVersion }),
    },
    payload,
  });
}

async function ensureTestDatabase(connectionString: string): Promise<void> {
  const target = new URL(connectionString);
  const databaseName = target.pathname.slice(1);
  if (
    databaseName === "cultivation_diary" ||
    !/^[A-Za-z0-9_]+$/.test(databaseName)
  ) {
    throw new Error("Integration tests require a dedicated safe database name");
  }

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";
  const pool = new Pool({ connectionString: adminUrl.toString() });

  try {
    const existing = await pool.query("select 1 from pg_database where datname = $1", [
      databaseName,
    ]);
    if (existing.rowCount === 0) {
      await pool.query(`create database "${databaseName}"`);
    }
  } finally {
    await pool.end();
  }
}
