import type { OfflineSettlementSummary } from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { AppStore } from "../../assets/scripts/state/AppStore";
import {
  canRunAuthoritativeMutation,
  canRunLoadoutMutation,
} from "../../assets/scripts/core/ClientTypes";
import { bootstrapFixture } from "./fixtures/bootstrap";

describe("Cocos app store", () => {
  it("installs a cached snapshot atomically as a reconnecting read-only preview", () => {
    const store = new AppStore();
    const bootstrap = bootstrapFixture();
    const states: Array<{ phase: string; syncStatus: string; hasBootstrap: boolean }> = [];
    const unsubscribe = store.subscribe((state) => {
      states.push({
        phase: state.phase,
        syncStatus: state.syncStatus,
        hasBootstrap: state.bootstrap !== null,
      });
    });

    store.setCachedPreview(bootstrap, "2026-08-05T07:59:00.000Z");
    unsubscribe();

    expect(states).toEqual([
      { phase: "loading", syncStatus: "reconnecting", hasBootstrap: false },
      { phase: "ready", syncStatus: "reconnecting", hasBootstrap: true },
    ]);
    expect(store.snapshot.bootstrap).toBe(bootstrap);
    expect(store.snapshot.lastSuccessfulSyncAt).toBe("2026-08-05T07:59:00.000Z");
    expect(canRunAuthoritativeMutation(store.snapshot)).toBe(false);
    expect(canRunLoadoutMutation(store.snapshot)).toBe(false);
  });

  it("preserves the exact cached snapshot and sync time when reconnecting becomes offline", () => {
    const store = new AppStore();
    const bootstrap = bootstrapFixture();
    const syncedAt = "2026-08-05T07:59:00.000Z";

    store.setCachedPreview(bootstrap, syncedAt);
    store.markOffline();

    expect(store.snapshot).toMatchObject({
      phase: "ready",
      syncStatus: "offline",
      lastSuccessfulSyncAt: syncedAt,
    });
    expect(store.snapshot.bootstrap).toBe(bootstrap);
    expect(canRunAuthoritativeMutation(store.snapshot)).toBe(false);
    expect(canRunLoadoutMutation(store.snapshot)).toBe(true);
  });

  it("keeps the selected feature panel open while authoritative snapshots refresh", () => {
    const store = new AppStore();
    store.setReady(bootstrapFixture());
    store.openFeature("inventory");
    store.setFeatureMessage("正在处理");
    store.setReady({
      ...bootstrapFixture(),
      inventory: { bagCapacity: 60, stacks: [] },
    });

    expect(store.snapshot.activeFeature).toBe("inventory");
    expect(store.snapshot.featureMessage).toBe("正在处理");
    expect(store.snapshot.bootstrap?.inventory.bagCapacity).toBe(60);

    store.closeFeature();
    expect(store.snapshot.activeFeature).toBeNull();
    expect(store.snapshot.featureMessage).toBeNull();
  });

  it("dismisses the credited offline summary without changing the player snapshot", () => {
    const store = new AppStore();
    const offlineSettlement = offlineSettlementFixture();
    const bootstrap = { ...bootstrapFixture(), offlineSettlement };

    store.setReady(bootstrap);
    store.dismissOfflineSettlement();

    expect(store.snapshot.phase).toBe("ready");
    expect(store.snapshot.bootstrap?.offlineSettlement).toBeNull();
    expect(store.snapshot.bootstrap?.player).toEqual(bootstrap.player);
    expect(bootstrap.offlineSettlement).toBe(offlineSettlement);
  });

  it("keeps an unconfirmed offline summary across later online heartbeats", () => {
    const store = new AppStore();
    const offlineSettlement = offlineSettlementFixture();

    store.setReady({ ...bootstrapFixture(), offlineSettlement });
    store.setReady({
      ...bootstrapFixture(),
      progress: { ...bootstrapFixture().progress, experience: "12" },
      offlineSettlement: null,
    });

    expect(store.snapshot.bootstrap?.offlineSettlement).toBe(offlineSettlement);
    expect(store.snapshot.bootstrap?.progress.experience).toBe("12");

    store.dismissOfflineSettlement();
    store.setReady({
      ...bootstrapFixture(),
      progress: { ...bootstrapFixture().progress, experience: "18" },
      offlineSettlement: null,
    });

    expect(store.snapshot.bootstrap?.offlineSettlement).toBeNull();
    expect(store.snapshot.bootstrap?.progress.experience).toBe("18");
  });

  it("keeps cached UI context and an unconfirmed settlement for the same identity", () => {
    const store = new AppStore();
    const offlineSettlement = offlineSettlementFixture();
    const cached = { ...bootstrapFixture(), offlineSettlement };
    store.setCachedPreview(cached, "2026-08-05T07:59:00.000Z");
    store.selectTab("cave");
    store.openFeature("inventory");
    store.setFeatureMessage("待恢复的操作提示");

    const authoritative = {
      ...bootstrapFixture(),
      progress: { ...bootstrapFixture().progress, experience: "25" },
      offlineSettlement: null,
    };
    store.setReady(authoritative, "2026-08-05T08:00:00.000Z");

    expect(store.snapshot).toMatchObject({
      phase: "ready",
      syncStatus: "online",
      lastSuccessfulSyncAt: "2026-08-05T08:00:00.000Z",
      selectedTab: "cave",
      activeFeature: "inventory",
      featureMessage: "待恢复的操作提示",
    });
    expect(store.snapshot.bootstrap?.progress.experience).toBe("25");
    expect(store.snapshot.bootstrap?.offlineSettlement).toBe(offlineSettlement);
    expect(canRunAuthoritativeMutation(store.snapshot)).toBe(true);
  });

  it("does not carry cached settlement or UI context across player identities", () => {
    const store = new AppStore();
    store.setCachedPreview(
      { ...bootstrapFixture(), offlineSettlement: offlineSettlementFixture() },
      "2026-08-05T07:59:00.000Z",
    );
    store.selectTab("cave");
    store.openFeature("inventory");
    store.setFeatureMessage("旧角色提示");

    const authoritative = bootstrapFixture();
    authoritative.account.id = "00000000-0000-4000-8000-000000000101";
    authoritative.player.id = "00000000-0000-4000-8000-000000000102";
    authoritative.player.displayName = "新角色";
    authoritative.offlineSettlement = null;
    store.setReady(authoritative, "2026-08-05T08:00:00.000Z");

    expect(store.snapshot).toMatchObject({
      phase: "ready",
      syncStatus: "online",
      lastSuccessfulSyncAt: "2026-08-05T08:00:00.000Z",
      selectedTab: "cultivation",
      activeFeature: null,
      featureMessage: null,
    });
    expect(store.snapshot.bootstrap).toBe(authoritative);
    expect(store.snapshot.bootstrap?.offlineSettlement).toBeNull();
    expect(canRunAuthoritativeMutation(store.snapshot)).toBe(true);
  });

  it("isolates a cross-identity snapshot replacement while preserving read-only status", () => {
    const store = new AppStore();
    store.setCachedPreview(
      { ...bootstrapFixture(), offlineSettlement: offlineSettlementFixture() },
      "2026-08-05T07:59:00.000Z",
    );
    store.markOffline();
    store.selectTab("cave");
    store.openFeature("profile");
    store.setFeatureMessage("旧角色档案提示");

    const replacement = bootstrapFixture();
    replacement.account.id = "00000000-0000-4000-8000-000000000201";
    replacement.player.id = "00000000-0000-4000-8000-000000000202";
    replacement.offlineSettlement = null;
    store.replaceSnapshot(replacement);

    expect(store.snapshot).toMatchObject({
      phase: "ready",
      syncStatus: "offline",
      lastSuccessfulSyncAt: "2026-08-05T07:59:00.000Z",
      selectedTab: "cultivation",
      activeFeature: null,
      featureMessage: null,
    });
    expect(store.snapshot.bootstrap).toBe(replacement);
    expect(store.snapshot.bootstrap?.offlineSettlement).toBeNull();
    expect(canRunAuthoritativeMutation(store.snapshot)).toBe(false);
  });

  it("clears cached identity and UI state when authentication is invalidated", () => {
    const store = new AppStore();
    store.setCachedPreview(bootstrapFixture(), "2026-08-05T07:59:00.000Z");
    store.selectTab("cave");
    store.openFeature("inventory");
    store.setFeatureMessage("旧角色提示");

    store.setAuthenticationError("登录状态已失效");

    expect(store.snapshot).toMatchObject({
      phase: "error",
      syncStatus: "reconnecting",
      lastSuccessfulSyncAt: null,
      bootstrap: null,
      errorMessage: "登录状态已失效",
      selectedTab: "cultivation",
      activeFeature: null,
      featureMessage: null,
    });
    expect(canRunAuthoritativeMutation(store.snapshot)).toBe(false);
  });

  it("keeps the current view read-only while offline and restores it after sync", () => {
    const store = new AppStore();
    const bootstrap = { ...bootstrapFixture(), offlineSettlement: offlineSettlementFixture() };
    store.setReady(bootstrap, "2026-08-05T07:59:00.000Z");
    store.selectTab("cave");
    store.openFeature("inventory");
    store.setFeatureMessage("保留中的提示");

    store.markOffline("2026-08-05T08:00:00.000Z");

    expect(store.snapshot).toMatchObject({
      phase: "ready",
      syncStatus: "offline",
      lastSuccessfulSyncAt: "2026-08-05T08:00:00.000Z",
      selectedTab: "cave",
      activeFeature: "inventory",
      featureMessage: null,
    });
    expect(store.snapshot.bootstrap?.offlineSettlement).toEqual(bootstrap.offlineSettlement);
    expect(canRunAuthoritativeMutation(store.snapshot)).toBe(false);

    store.replaceSnapshot({
      ...bootstrapFixture(),
      progress: { ...bootstrapFixture().progress, experience: "99" },
    });
    expect(store.snapshot.syncStatus).toBe("offline");
    expect(store.snapshot.bootstrap?.progress.experience).toBe("99");
    expect(canRunAuthoritativeMutation(store.snapshot)).toBe(false);

    store.setLoading("正在叩开境界之门");
    expect(store.snapshot.phase).toBe("loading");
    store.markReconnecting();
    expect(store.snapshot.phase).toBe("ready");
    expect(store.snapshot.syncStatus).toBe("reconnecting");
    expect(canRunAuthoritativeMutation(store.snapshot)).toBe(false);

    store.markOnline("2026-08-05T08:01:00.000Z");
    expect(store.snapshot.syncStatus).toBe("online");
    expect(store.snapshot.lastSuccessfulSyncAt).toBe("2026-08-05T08:01:00.000Z");
    expect(store.snapshot.selectedTab).toBe("cave");
    expect(store.snapshot.activeFeature).toBe("inventory");
    expect(canRunAuthoritativeMutation(store.snapshot)).toBe(true);
  });

  it("does not fabricate an offline preview without an authoritative snapshot", () => {
    const store = new AppStore();

    store.markOffline();

    expect(store.snapshot.phase).toBe("loading");
    expect(store.snapshot.bootstrap).toBeNull();
    expect(store.snapshot.syncStatus).toBe("reconnecting");
    expect(canRunAuthoritativeMutation(store.snapshot)).toBe(false);
  });

});

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
