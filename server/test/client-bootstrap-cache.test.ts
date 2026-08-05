import type { OfflineSettlementSummary } from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_CACHE_SCHEMA_VERSION,
  createStoredBootstrapCache,
  dismissCachedOfflineSettlement,
  getRestorableBootstrapCache,
  isStoredBootstrapCacheEnvelope,
  isStoredSession,
  shouldInstallDeferredIdentityPreview,
  type StoredBootstrapCache,
  type StoredSession,
} from "../../assets/scripts/core/ClientTypes";
import {
  createStoredOfflineLoadoutQueue,
  type StoredOfflineLoadoutQueue,
} from "../../assets/scripts/core/OfflineLoadoutQueue";
import { bootstrapFixture } from "./fixtures/bootstrap";

const TEST_NOW = Date.parse("2026-08-05T08:05:00.000Z");

describe("Cocos bootstrap cache", () => {
  it("restores a deeply valid cache only for its bound session identity", () => {
    const cache = cacheFixture();
    const session = sessionFixture();

    expect(isStoredSession(session)).toBe(true);
    expect(isStoredBootstrapCacheEnvelope(cache)).toBe(true);
    expect(getRestorableBootstrapCache(session, cache, TEST_NOW)).toBe(cache);
  });

  it("rejects missing identity, identity mismatches, and obsolete schemas", () => {
    const cache = cacheFixture();
    const session = sessionFixture();

    expect(getRestorableBootstrapCache(null, cache, TEST_NOW)).toBeNull();
    expect(
      getRestorableBootstrapCache(
        { ...session, accountId: undefined, playerId: undefined },
        cache,
        TEST_NOW,
      ),
    ).toBeNull();
    expect(
      getRestorableBootstrapCache(
        { ...session, accountId: "00000000-0000-4000-8000-000000000201" },
        cache,
        TEST_NOW,
      ),
    ).toBeNull();
    expect(
      getRestorableBootstrapCache(
        { ...session, playerId: "00000000-0000-4000-8000-000000000202" },
        cache,
        TEST_NOW,
      ),
    ).toBeNull();
    expect(
      getRestorableBootstrapCache(
        session,
        { ...cache, schemaVersion: 1 },
        TEST_NOW,
      ),
    ).toBeNull();
    expect(
      isStoredBootstrapCacheEnvelope({
        ...cache,
        accountId: "other-account",
      }),
    ).toBe(false);
  });

  it("rejects a structurally valid session after its refresh credential expires", () => {
    const session = {
      ...sessionFixture(),
      refreshTokenExpiresAt: "2026-08-05T08:05:00.000Z",
    };

    expect(isStoredSession(session)).toBe(true);
    expect(
      getRestorableBootstrapCache(session, cacheFixture(), TEST_NOW),
    ).toBeNull();
  });

  it("restores after access expiry while the refresh credential is still valid", () => {
    const session = {
      ...sessionFixture(),
      accessTokenExpiresAt: "2026-08-05T08:00:00.000Z",
      refreshTokenExpiresAt: "2026-08-05T08:05:00.001Z",
    };

    expect(
      getRestorableBootstrapCache(session, cacheFixture(), TEST_NOW),
    ).not.toBeNull();
  });

  it("rejects malformed nested collections and required progress fields", () => {
    const cache = cacheFixture();
    const { requiredExperience: _requiredExperience, ...incompleteProgress } =
      cache.bootstrap.progress;

    expect(
      isStoredBootstrapCacheEnvelope({
        ...cache,
        bootstrap: { ...cache.bootstrap, techniques: [null] },
      }),
    ).toBe(false);
    expect(
      isStoredBootstrapCacheEnvelope({
        ...cache,
        bootstrap: { ...cache.bootstrap, progress: incompleteProgress },
      }),
    ).toBe(false);
    expect(
      isStoredBootstrapCacheEnvelope({
        ...cache,
        bootstrap: {
          ...cache.bootstrap,
          offlineSettlement: { id: "incomplete-settlement" },
        },
      }),
    ).toBe(false);
    expect(
      isStoredBootstrapCacheEnvelope({
        ...cache,
        bootstrap: {
          ...cache.bootstrap,
          activeEffects: Array.from({ length: 513 }, () => null),
        },
      }),
    ).toBe(false);
  });

  it("restores a pending loadout queue only for the cache identity and player version", () => {
    const cache = cacheFixture();
    const queue = pendingLoadoutQueueFixture(cache);
    const queuedCache = { ...cache, pendingLoadoutQueue: queue };

    expect(isStoredBootstrapCacheEnvelope(queuedCache)).toBe(true);
    expect(
      getRestorableBootstrapCache(sessionFixture(), queuedCache, TEST_NOW),
    ).toBe(queuedCache);
    expect(
      isStoredBootstrapCacheEnvelope({
        ...queuedCache,
        pendingLoadoutQueue: {
          ...queue,
          accountId: "00000000-0000-4000-8000-000000000401",
        },
      }),
    ).toBe(false);
    expect(
      isStoredBootstrapCacheEnvelope({
        ...queuedCache,
        pendingLoadoutQueue: {
          ...queue,
          playerId: "00000000-0000-4000-8000-000000000402",
        },
      }),
    ).toBe(false);
    expect(
      isStoredBootstrapCacheEnvelope({
        ...queuedCache,
        pendingLoadoutQueue: { ...queue, expectedPlayerVersion: "19" },
      }),
    ).toBe(false);
  });

  it("rejects cache envelopes with a missing or malformed pending loadout queue", () => {
    const cache = cacheFixture();
    const queue = pendingLoadoutQueueFixture(cache);
    const { pendingLoadoutQueue: _pendingLoadoutQueue, ...missingQueue } = cache;

    expect(isStoredBootstrapCacheEnvelope(missingQueue)).toBe(false);
    expect(
      isStoredBootstrapCacheEnvelope({ ...cache, pendingLoadoutQueue: {} }),
    ).toBe(false);
    expect(
      isStoredBootstrapCacheEnvelope({
        ...cache,
        pendingLoadoutQueue: { ...queue, operations: [null] },
      }),
    ).toBe(false);
  });

  it("accepts bounded non-negative scientific notation from the decimal engine", () => {
    const cache = cacheFixture();
    const exponential = {
      ...cache,
      bootstrap: {
        ...cache.bootstrap,
        progress: {
          ...cache.bootstrap.progress,
          experiencePerSecond: "1.25e+21",
        },
      },
    };

    expect(isStoredBootstrapCacheEnvelope(exponential)).toBe(true);
  });

  it("accepts a complete snapshot containing each currently rendered asset type", () => {
    const cache = cacheFixture(offlineSettlementFixture());
    const equipmentId = "00000000-0000-4000-8000-000000000301";
    cache.bootstrap.techniques = [
      {
        techniqueConfigId: "technique.sword.001",
        displayName: "青锋诀",
        quality: "common",
        slot: "attack",
        star: 1,
        duplicateCount: 0,
        equippedSlot: "attack",
        fixedPower: "40",
        experienceBonusBp: 100,
        spiritStoneBonusBp: 0,
        dropBonusBp: 0,
        configVersion: "assets-2026-08-05-v1",
      },
    ];
    cache.bootstrap.equipment = [
      {
        id: equipmentId,
        equipmentConfigId: "equipment.weapon.001",
        displayName: "青木剑",
        quality: "uncommon",
        slot: "weapon",
        fixedPower: "45",
        enhanceLevel: 1,
        rolledAffixes: [{ stat: "power", valueBp: 100 }],
        location: "bag",
        equippedSlot: null,
        isLocked: false,
        configVersion: "assets-2026-08-05-v1",
      },
    ];
    cache.bootstrap.harvestChest = {
      pendingCount: 1,
      entries: [
        {
          id: "00000000-0000-4000-8000-000000000302",
          entryType: "equipment",
          equipmentInstanceId: equipmentId,
          techniqueConfigId: null,
          assetConfigId: "equipment.weapon.001",
          displayName: "青木剑",
          quality: "uncommon",
          valueScore: "45",
          acquiredAt: "2026-08-05T08:00:00.000Z",
        },
      ],
    };
    cache.bootstrap.newcomerTasks = [
      {
        taskConfigId: "newcomer.level.8",
        progress: "1",
        completedAt: "2026-08-05T08:00:00.000Z",
        claimedAt: null,
      },
    ];
    cache.bootstrap.activeEffects = [{ effectConfigId: "effect.test.001" }];
    cache.bootstrap.offlineSettlement!.drops.stackItems = [
      { itemConfigId: "material.wood.001", quantity: "3" },
    ];
    cache.bootstrap.offlineSettlement!.events = [
      { type: "level_up", fromLevel: 1, toLevel: 2 },
    ];

    expect(isStoredBootstrapCacheEnvelope(cache)).toBe(true);
    expect(
      getRestorableBootstrapCache(sessionFixture(), cache, TEST_NOW),
    ).toBe(cache);
  });

  it("preserves only same-player pending settlements in new authoritative caches", () => {
    const cache = cacheFixture(offlineSettlementFixture());
    const authoritative = bootstrapFixture();
    const samePlayer = createStoredBootstrapCache(
      authoritative,
      {
        playerVersion: "19",
        lastSuccessfulSyncAt: "2026-08-05T08:01:00.000Z",
      },
      cache.bootstrap,
    );
    const differentPlayer = bootstrapFixture();
    differentPlayer.account.id = "00000000-0000-4000-8000-000000000101";
    differentPlayer.player.id = "00000000-0000-4000-8000-000000000102";
    const switched = createStoredBootstrapCache(
      differentPlayer,
      {
        playerVersion: "1",
        lastSuccessfulSyncAt: "2026-08-05T08:01:00.000Z",
      },
      cache.bootstrap,
    );

    expect(samePlayer?.bootstrap.offlineSettlement).toEqual(
      cache.bootstrap.offlineSettlement,
    );
    expect(switched?.bootstrap.offlineSettlement).toBeNull();
    expect(
      shouldInstallDeferredIdentityPreview(cache.bootstrap, authoritative, false),
    ).toBe(false);
    expect(
      shouldInstallDeferredIdentityPreview(cache.bootstrap, differentPlayer, false),
    ).toBe(true);
    expect(
      shouldInstallDeferredIdentityPreview(cache.bootstrap, differentPlayer, true),
    ).toBe(false);
    expect(shouldInstallDeferredIdentityPreview(null, authoritative, false)).toBe(true);
  });

  it("does not replay a settlement after its cached display copy is dismissed", () => {
    const cache = cacheFixture(offlineSettlementFixture());
    const dismissed = dismissCachedOfflineSettlement(cache, {
      accountId: cache.accountId,
      playerId: cache.playerId,
      settlementId: cache.bootstrap.offlineSettlement!.id,
    });

    const restored = getRestorableBootstrapCache(
      sessionFixture(),
      dismissed,
      TEST_NOW,
    );

    expect(dismissed).not.toBe(cache);
    expect(restored?.bootstrap.offlineSettlement).toBeNull();
    expect(isStoredBootstrapCacheEnvelope(dismissed)).toBe(true);
  });

  it("does not dismiss a cached settlement for a stale identity or settlement", () => {
    const cache = cacheFixture(offlineSettlementFixture());

    expect(
      dismissCachedOfflineSettlement(cache, {
        accountId: cache.accountId,
        playerId: cache.playerId,
        settlementId: "different-settlement",
      }),
    ).toBe(cache);
    expect(
      dismissCachedOfflineSettlement(cache, {
        accountId: "different-account",
        playerId: cache.playerId,
        settlementId: cache.bootstrap.offlineSettlement!.id,
      }),
    ).toBe(cache);
  });
});

function cacheFixture(
  offlineSettlement: OfflineSettlementSummary | null = null,
): StoredBootstrapCache {
  const bootstrap = { ...bootstrapFixture(), offlineSettlement };
  return {
    schemaVersion: BOOTSTRAP_CACHE_SCHEMA_VERSION,
    accountId: bootstrap.account.id,
    playerId: bootstrap.player.id,
    playerVersion: "18",
    lastSuccessfulSyncAt: "2026-08-05T08:00:00.000Z",
    bootstrap,
    pendingLoadoutQueue: null,
  };
}

function sessionFixture(): StoredSession {
  const bootstrap = bootstrapFixture();
  return {
    accessToken: "access-token",
    accessTokenExpiresAt: "2026-08-05T08:15:00.000Z",
    refreshToken: "refresh-token",
    refreshTokenExpiresAt: "2026-09-04T08:00:00.000Z",
    accountId: bootstrap.account.id,
    playerId: bootstrap.player.id,
  };
}

function pendingLoadoutQueueFixture(
  cache: StoredBootstrapCache,
): StoredOfflineLoadoutQueue {
  const queue = createStoredOfflineLoadoutQueue(
    { accountId: cache.accountId, playerId: cache.playerId },
    cache.playerVersion,
    "00000000-0000-4000-8000-000000000403",
    {
      operationId: "00000000-0000-4000-8000-000000000404",
      sequence: 1,
      kind: "technique.equip",
      techniqueConfigId: "quiet_breathing_art",
    },
  );
  if (!queue) throw new Error("Invalid pending loadout queue fixture");
  return queue;
}

function offlineSettlementFixture(): OfflineSettlementSummary {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    fromTime: "2026-08-04T00:00:00.000Z",
    toTime: "2026-08-04T01:00:00.000Z",
    effectiveSeconds: 3_600,
    efficiencyBp: 7_000,
    experienceGained: "2520",
    experienceDiscarded: "0",
    spiritStoneGained: "42",
    dropAttempts: 42,
    drops: {
      configVersion: "idle-drop-2026-08-05-v1",
      stackItems: [],
      equipmentCount: 0,
      techniqueCount: 0,
      harvestChestAdded: 0,
      techniqueDuplicates: 0,
      autoSalvagedCount: 0,
      mailedCount: 0,
      autoSalvageSpiritStone: "0",
      autoSalvageEnhanceStone: "0",
    },
    events: [],
    newcomerRewardGranted: false,
  };
}
