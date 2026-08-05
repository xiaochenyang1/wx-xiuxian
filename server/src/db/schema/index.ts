import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const auditTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
};

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    wxOpenid: varchar("wx_openid", { length: 128 }).notNull(),
    wxUnionid: varchar("wx_unionid", { length: 128 }),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("accounts_wx_openid_uq").on(table.wxOpenid),
    uniqueIndex("accounts_wx_unionid_uq").on(table.wxUnionid),
    check("accounts_status_ck", sql`${table.status} in ('active', 'banned', 'deleted')`),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    refreshTokenHash: varchar("refresh_token_hash", { length: 64 }).notNull(),
    deviceKeyHash: varchar("device_key_hash", { length: 128 }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("auth_sessions_refresh_hash_uq").on(table.refreshTokenHash),
    index("auth_sessions_account_expires_idx").on(table.accountId, table.expiresAt),
  ],
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 48 }).notNull(),
    displayNameKey: varchar("display_name_key", { length: 64 }).notNull(),
    avatarVariant: varchar("avatar_variant", { length: 20 }).default("neutral").notNull(),
    freeRenameAvailable: boolean("free_rename_available").default(true).notNull(),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    ...auditTimestamps,
  },
  (table) => [
    uniqueIndex("players_account_uq").on(table.accountId),
    uniqueIndex("players_display_name_key_uq").on(table.displayNameKey),
    check("players_avatar_variant_ck", sql`${table.avatarVariant} in ('neutral', 'male', 'female')`),
    check("players_status_ck", sql`${table.status} in ('active', 'banned', 'deleted')`),
  ],
);

export const reservedPlayerNames = pgTable(
  "reserved_player_names",
  {
    displayNameKey: varchar("display_name_key", { length: 64 }).primaryKey(),
    previousPlayerId: uuid("previous_player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    releaseAt: timestamp("release_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("reserved_player_names_release_idx").on(table.releaseAt)],
);

export const playerProgress = pgTable(
  "player_progress",
  {
    playerId: uuid("player_id")
      .primaryKey()
      .references(() => players.id, { onDelete: "cascade" }),
    level: integer("level").default(1).notNull(),
    realmKey: varchar("realm_key", { length: 64 }).default("qi_refining").notNull(),
    exp: numeric("exp", { precision: 78, scale: 0 }).default("0").notNull(),
    expRemainderMicros: bigint("exp_remainder_micros", { mode: "number" }).default(0).notNull(),
    progressionState: varchar("progression_state", { length: 32 }).default("gaining").notNull(),
    totalPower: numeric("total_power", { precision: 78, scale: 0 }).default("100").notNull(),
    cultivationReserve: numeric("cultivation_reserve", { precision: 78, scale: 0 })
      .default("0")
      .notNull(),
    lastSettledAt: timestamp("last_settled_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true, mode: "date" }),
    dropClockRemainderMicros: bigint("drop_clock_remainder_micros", { mode: "number" })
      .default(0)
      .notNull(),
    version: bigint("version", { mode: "bigint" }).default(sql`1`).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("player_progress_power_idx").on(table.totalPower),
    index("player_progress_level_exp_idx").on(table.level, table.exp),
    check("player_progress_level_ck", sql`${table.level} >= 1`),
    check("player_progress_exp_ck", sql`${table.exp} >= 0`),
    check(
      "player_progress_state_ck",
      sql`${table.progressionState} in ('gaining', 'breakthrough_ready', 'version_cap')`,
    ),
    check(
      "player_progress_exp_remainder_ck",
      sql`${table.expRemainderMicros} >= 0 and ${table.expRemainderMicros} < 1000000`,
    ),
    check(
      "player_progress_drop_remainder_ck",
      sql`${table.dropClockRemainderMicros} >= 0 and ${table.dropClockRemainderMicros} < 60000000`,
    ),
  ],
);

export const playerWallets = pgTable(
  "player_wallets",
  {
    playerId: uuid("player_id")
      .primaryKey()
      .references(() => players.id, { onDelete: "cascade" }),
    spiritStone: numeric("spirit_stone", { precision: 78, scale: 0 }).default("0").notNull(),
    immortalJade: numeric("immortal_jade", { precision: 78, scale: 0 }).default("0").notNull(),
    lifetimeSpiritStoneEarned: numeric("lifetime_spirit_stone_earned", {
      precision: 78,
      scale: 0,
    })
      .default("0")
      .notNull(),
    stoneRemainderMicros: bigint("stone_remainder_micros", { mode: "number" }).default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    check("player_wallets_spirit_stone_ck", sql`${table.spiritStone} >= 0`),
    check("player_wallets_immortal_jade_ck", sql`${table.immortalJade} >= 0`),
    check(
      "player_wallets_stone_remainder_ck",
      sql`${table.stoneRemainderMicros} >= 0 and ${table.stoneRemainderMicros} < 1000000`,
    ),
  ],
);

export const playerSettings = pgTable(
  "player_settings",
  {
    playerId: uuid("player_id")
      .primaryKey()
      .references(() => players.id, { onDelete: "cascade" }),
    bagCapacity: smallint("bag_capacity").default(50).notNull(),
    autoSalvageCommon: boolean("auto_salvage_common").default(true).notNull(),
    autoSalvageUncommon: boolean("auto_salvage_uncommon").default(true).notNull(),
    partnerUnlockNoticeSeen: boolean("partner_unlock_notice_seen").default(false).notNull(),
    selectedTab: varchar("selected_tab", { length: 20 }).default("cultivation").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "player_settings_bag_capacity_ck",
      sql`${table.bagCapacity} between 50 and 200 and (${table.bagCapacity} - 50) % 10 = 0`,
    ),
  ],
);

export const inventoryStacks = pgTable(
  "inventory_stacks",
  {
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    itemConfigId: varchar("item_config_id", { length: 64 }).notNull(),
    quantity: numeric("quantity", { precision: 78, scale: 0 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.playerId, table.itemConfigId] }),
    check("inventory_stacks_quantity_ck", sql`${table.quantity} > 0`),
  ],
);

export const equipmentInstances = pgTable(
  "equipment_instances",
  {
    id: uuid("id").primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    equipmentConfigId: varchar("equipment_config_id", { length: 64 }).notNull(),
    quality: varchar("quality", { length: 20 }).notNull(),
    enhanceLevel: smallint("enhance_level").default(0).notNull(),
    rolledAffixes: jsonb("rolled_affixes").default([]).notNull(),
    location: varchar("location", { length: 20 }).default("bag").notNull(),
    equippedSlot: varchar("equipped_slot", { length: 32 }),
    isLocked: boolean("is_locked").default(false).notNull(),
    configVersion: varchar("config_version", { length: 64 }).notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("equipment_instances_player_location_idx").on(table.playerId, table.location),
    uniqueIndex("equipment_instances_player_slot_uq")
      .on(table.playerId, table.equippedSlot)
      .where(sql`${table.location} = 'equipped' and ${table.equippedSlot} is not null`),
    check("equipment_instances_enhance_level_ck", sql`${table.enhanceLevel} between 0 and 20`),
    check(
      "equipment_instances_location_ck",
      sql`${table.location} in ('bag', 'equipped', 'harvest', 'mail', 'consumed')`,
    ),
  ],
);

export const techniqueProgress = pgTable(
  "technique_progress",
  {
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    techniqueConfigId: varchar("technique_config_id", { length: 64 }).notNull(),
    star: smallint("star").default(1).notNull(),
    duplicateCount: integer("duplicate_count").default(0).notNull(),
    equippedSlot: varchar("equipped_slot", { length: 20 }),
    configVersion: varchar("config_version", { length: 64 }).notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.playerId, table.techniqueConfigId] }),
    uniqueIndex("technique_progress_player_slot_uq")
      .on(table.playerId, table.equippedSlot)
      .where(sql`${table.equippedSlot} is not null`),
    check("technique_progress_star_ck", sql`${table.star} between 1 and 10`),
    check("technique_progress_duplicate_count_ck", sql`${table.duplicateCount} >= 0`),
  ],
);

export const harvestChestEntries = pgTable(
  "harvest_chest_entries",
  {
    id: uuid("id").primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    entryType: varchar("entry_type", { length: 20 }).notNull(),
    equipmentInstanceId: uuid("equipment_instance_id").references(() => equipmentInstances.id),
    techniqueConfigId: varchar("technique_config_id", { length: 64 }),
    quality: varchar("quality", { length: 20 }).notNull(),
    valueScore: numeric("value_score", { precision: 78, scale: 0 }).default("0").notNull(),
    configVersion: varchar("config_version", { length: 64 }).notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("harvest_chest_player_pending_idx").on(table.playerId, table.status, table.acquiredAt),
    check("harvest_chest_entry_type_ck", sql`${table.entryType} in ('equipment', 'technique')`),
    check(
      "harvest_chest_exactly_one_asset_ck",
      sql`(case when ${table.equipmentInstanceId} is null then 0 else 1 end) + (case when ${table.techniqueConfigId} is null then 0 else 1 end) = 1`,
    ),
    check(
      "harvest_chest_status_ck",
      sql`${table.status} in ('pending', 'transferred', 'salvaged', 'mailed')`,
    ),
  ],
);

export const newcomerTaskProgress = pgTable(
  "newcomer_task_progress",
  {
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    taskConfigId: varchar("task_config_id", { length: 64 }).notNull(),
    progress: numeric("progress", { precision: 78, scale: 0 }).default("0").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.playerId, table.taskConfigId] }),
    check("newcomer_task_progress_ck", sql`${table.progress} >= 0`),
  ],
);

export const offlineSettlements = pgTable(
  "offline_settlements",
  {
    id: uuid("id").primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    fromTime: timestamp("from_time", { withTimezone: true, mode: "date" }).notNull(),
    toTime: timestamp("to_time", { withTimezone: true, mode: "date" }).notNull(),
    effectiveSeconds: integer("effective_seconds").notNull(),
    offlineEfficiencyBp: integer("offline_efficiency_bp").notNull(),
    rewardSnapshot: jsonb("reward_snapshot").notNull(),
    configVersions: jsonb("config_versions").notNull(),
    baseCreditedAt: timestamp("base_credited_at", { withTimezone: true, mode: "date" }).notNull(),
    adBonusClaimedAt: timestamp("ad_bonus_claimed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("offline_settlements_player_window_uq").on(
      table.playerId,
      table.fromTime,
      table.toTime,
    ),
    index("offline_settlements_player_created_idx").on(table.playerId, table.createdAt),
    check(
      "offline_settlements_effective_seconds_ck",
      sql`${table.effectiveSeconds} between 0 and 86400`,
    ),
    check("offline_settlements_window_ck", sql`${table.toTime} >= ${table.fromTime}`),
    check("offline_settlements_efficiency_ck", sql`${table.offlineEfficiencyBp} >= 0`),
  ],
);

export const assetLedger = pgTable(
  "asset_ledger",
  {
    id: uuid("id").primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    assetType: varchar("asset_type", { length: 32 }).notNull(),
    assetKey: varchar("asset_key", { length: 128 }).notNull(),
    delta: numeric("delta", { precision: 78, scale: 0 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 78, scale: 0 }),
    reason: varchar("reason", { length: 64 }).notNull(),
    referenceType: varchar("reference_type", { length: 32 }).notNull(),
    referenceId: uuid("reference_id").notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("asset_ledger_player_created_idx").on(table.playerId, table.createdAt),
    index("asset_ledger_reference_idx").on(table.referenceType, table.referenceId),
    check(
      "asset_ledger_asset_type_ck",
      sql`${table.assetType} in ('currency', 'item', 'equipment', 'technique')`,
    ),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    statusCode: integer("status_code").notNull(),
    responseBody: jsonb("response_body").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.scope, table.idempotencyKey] }),
    index("idempotency_records_expires_idx").on(table.expiresAt),
  ],
);
