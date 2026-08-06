/// <reference types="@cocos/creator-types/engine" />
/// <reference path="../../temp/declarations/cc.env.d.ts" />

import { describe, expect, it, vi } from "vitest";
import { bootstrapFixture } from "./fixtures/bootstrap";
import {
  acceptOfflineLoadoutSettlement,
  beginOfflineLoadoutSettlement,
  createStoredOfflineLoadoutQueue,
  type StoredOfflineLoadoutQueue,
} from "../../assets/scripts/core/OfflineLoadoutQueue";
import { ClientApiError } from "../../assets/scripts/services/ApiClient";

vi.mock("cc", () => {
  class Color {
    fromHEX(): this {
      return this;
    }
  }
  class Component {}
  class Node {}
  class EmptyComponent {}
  class EditBox {
    static readonly EventType = {
      TEXT_CHANGED: "text-changed",
      EDITING_RETURN: "editing-return",
    };
  }

  return {
    _decorator: { ccclass: () => (target: unknown) => target },
    Component,
    Node,
    ResolutionPolicy: { SHOW_ALL: 0 },
    view: { setDesignResolutionSize: vi.fn() },
    Button: EmptyComponent,
    BlockInputEvents: EmptyComponent,
    Color,
    EditBox,
    Graphics: EmptyComponent,
    HorizontalTextAlignment: { CENTER: 0, LEFT: 1 },
    Label: EmptyComponent,
    tween: vi.fn(),
    UIOpacity: EmptyComponent,
    UITransform: EmptyComponent,
    VerticalTextAlignment: { CENTER: 0 },
    Vec3: EmptyComponent,
  };
});

vi.mock("cc/env", () => ({ DEBUG: true, DEV: true, WECHAT: false }));

describe("Cocos offline loadout orchestration", () => {
  it("starts bounded offline simulations only from an authoritative idle state", async () => {
    const { GameBootstrap } = await import(
      "../../assets/scripts/app/GameBootstrap"
    );
    const target = Object.create(GameBootstrap.prototype) as Record<
      string,
      unknown
    >;
    const settleGame = vi.fn();
    const state = {
      phase: "ready",
      syncStatus: "online",
      bootstrap: bootstrapFixture(),
      activeFeature: null as null | "inventory",
      pendingLoadoutOperationCount: 0,
    };
    Object.assign(target, {
      mutationInFlight: false,
      store: { snapshot: state },
      settleGame,
    });
    const harness = target as unknown as {
      debugSimulateOffline(seconds: number): void;
      mutationInFlight: boolean;
    };

    harness.debugSimulateOffline(3_600);
    harness.debugSimulateOffline(100_000);
    harness.mutationInFlight = true;
    harness.debugSimulateOffline(28_800);
    harness.mutationInFlight = false;
    state.activeFeature = "inventory";
    harness.debugSimulateOffline(28_800);
    state.activeFeature = null;
    state.pendingLoadoutOperationCount = 1;
    harness.debugSimulateOffline(28_800);
    state.pendingLoadoutOperationCount = 0;
    state.syncStatus = "offline";
    harness.debugSimulateOffline(28_800);

    expect(settleGame).toHaveBeenCalledTimes(1);
    expect(settleGame).toHaveBeenCalledWith(3_600);
  });

  it("starts fixed debug grants only from an authoritative idle state", async () => {
    const { GameBootstrap } = await import(
      "../../assets/scripts/app/GameBootstrap"
    );
    const target = Object.create(GameBootstrap.prototype) as Record<
      string,
      unknown
    >;
    const runDebugGrant = vi.fn();
    const state = {
      phase: "ready",
      syncStatus: "online",
      bootstrap: bootstrapFixture(),
      activeFeature: null as null | "inventory",
      pendingLoadoutOperationCount: 0,
    };
    Object.assign(target, {
      mutationInFlight: false,
      store: { snapshot: state },
      runDebugGrant,
    });
    const harness = target as unknown as {
      debugGrant(target: string): void;
      mutationInFlight: boolean;
    };

    harness.debugGrant("fill_experience");
    harness.debugGrant("spirit_stone");
    harness.debugGrant("breakthrough_pill");
    harness.debugGrant("unknown");
    state.activeFeature = "inventory";
    harness.debugGrant("spirit_stone");
    state.activeFeature = null;
    state.pendingLoadoutOperationCount = 1;
    harness.debugGrant("spirit_stone");
    state.pendingLoadoutOperationCount = 0;
    state.syncStatus = "offline";
    harness.debugGrant("spirit_stone");
    state.syncStatus = "online";
    Object.assign(state.bootstrap, { offlineSettlement: { id: "pending" } });
    harness.debugGrant("spirit_stone");
    state.bootstrap.progress.status = "breakthrough_ready";
    Object.assign(state.bootstrap, { offlineSettlement: null });
    harness.debugGrant("fill_experience");
    state.bootstrap.progress.status = "gaining";
    harness.mutationInFlight = true;
    harness.debugGrant("spirit_stone");

    expect(runDebugGrant).toHaveBeenCalledTimes(3);
    expect(runDebugGrant).toHaveBeenNthCalledWith(1, "fill_experience");
    expect(runDebugGrant).toHaveBeenNthCalledWith(2, "spirit_stone");
    expect(runDebugGrant).toHaveBeenNthCalledWith(3, "breakthrough_pill");
  });

  it("applies debug grant snapshots and only presents server-evidenced level ups", async () => {
    const { GameBootstrap } = await import(
      "../../assets/scripts/app/GameBootstrap"
    );
    const target = Object.create(GameBootstrap.prototype) as Record<
      string,
      unknown
    >;
    const renderToken = { revision: 3 };
    const levelBootstrap = bootstrapFixture();
    levelBootstrap.progress.level = 2;
    const stoneBootstrap = bootstrapFixture();
    stoneBootstrap.wallet.spiritStone = "10000";
    stoneBootstrap.wallet.lifetimeSpiritStoneEarned = "10000";
    const debugGrant = vi
      .fn()
      .mockResolvedValueOnce({
        operationId: "00000000-0000-4000-8000-000000000811",
        target: "fill_experience",
        grantedAmount: "107",
        balanceAfter: "0",
        fromLevel: 1,
        toLevel: 2,
        reachedBreakthrough: false,
        newcomerRewardGranted: false,
        events: [{ type: "level_up", fromLevel: 1, toLevel: 2 }],
        bootstrap: levelBootstrap,
      })
      .mockResolvedValueOnce({
        operationId: "00000000-0000-4000-8000-000000000812",
        target: "spirit_stone",
        grantedAmount: "10000",
        balanceAfter: "10000",
        fromLevel: 2,
        toLevel: 2,
        reachedBreakthrough: false,
        newcomerRewardGranted: false,
        events: [],
        bootstrap: stoneBootstrap,
      });
    const setFeatureMessage = vi.fn();
    const applyMutationBootstrap = vi.fn(() => true);
    const finishMutation = vi.fn();
    Object.assign(target, {
      mutationInFlight: false,
      lifecycleSync: { captureRenderToken: vi.fn(() => renderToken) },
      apiClient: { debugGrant },
      store: { setFeatureMessage },
      applyMutationBootstrap,
      finishMutation,
    });
    const harness = target as unknown as {
      runDebugGrant(target: "fill_experience" | "spirit_stone"): Promise<void>;
    };

    await harness.runDebugGrant("fill_experience");
    await harness.runDebugGrant("spirit_stone");

    expect(applyMutationBootstrap).toHaveBeenNthCalledWith(
      1,
      levelBootstrap,
      renderToken,
      undefined,
      {
        trigger: "level_up",
        sourceId: "00000000-0000-4000-8000-000000000811",
      },
    );
    expect(applyMutationBootstrap).toHaveBeenNthCalledWith(
      2,
      stoneBootstrap,
      renderToken,
      undefined,
      undefined,
    );
    expect(setFeatureMessage).toHaveBeenNthCalledWith(
      2,
      "修为注入完成：+107，Lv.1 → Lv.2",
    );
    expect(setFeatureMessage).toHaveBeenNthCalledWith(
      4,
      "灵石注入完成：+10000，当前 10000",
    );
    expect(finishMutation).toHaveBeenCalledTimes(2);
  });

  it("waits for the backoff timer instead of draining again from finishMutation", async () => {
    const { GameBootstrap } = await import(
      "../../assets/scripts/app/GameBootstrap"
    );
    const queue = acceptOfflineLoadoutSettlement(
      createStoredOfflineLoadoutQueue(
        {
          accountId: "bc830a7d-c6b7-4918-883e-f1b835c8100e",
          playerId: "9430bd13-5c38-43ef-8ff6-43aac1a17e33",
        },
        "7",
        "00000000-0000-4000-8000-000000000701",
        {
          operationId: "00000000-0000-4000-8000-000000000702",
          sequence: 1,
          kind: "technique.equip",
          techniqueConfigId: "quiet_breathing_art",
        },
      )!,
      "8",
    )!;
    const scheduled: Array<{ callback: () => void; delaySeconds: number }> = [];
    const requestOfflineLoadoutDrain = vi.fn();
    const lifecycleSync = {
      canRender: vi.fn(() => true),
      captureRenderToken: vi.fn(() => ({ revision: 0 })),
      notifySyncAvailable: vi.fn(),
    };
    const bootstrap = Object.create(GameBootstrap.prototype) as Record<
      string,
      unknown
    >;

    Object.assign(bootstrap, {
      mutationInFlight: true,
      destroyed: false,
      pendingLoadoutQueue: queue,
      loadoutDrainRequested: true,
      queueSettlementRetryRequested: false,
      loadoutDrainRetryScheduled: false,
      loadoutDrainRetryAttempt: 0,
      foregroundSyncRetryScheduled: false,
      pendingLoadoutRollbackMessage: null,
      requiresFreshAuthoritativeBaseline: false,
      lifecycleSync,
      authenticateAuthoritatively: vi.fn().mockResolvedValue(bootstrapFixture()),
      reconcileOfflineLoadoutQueue: vi.fn(),
      canInstallBootstrapForPendingQueue: vi.fn(() => true),
      persistBootstrap: vi.fn(() => false),
      showQueuedLoadoutPreview: vi.fn(() => true),
      requestOfflineLoadoutDrain,
      scheduleOnce: vi.fn((callback: () => void, delaySeconds: number) => {
        scheduled.push({ callback, delaySeconds });
      }),
    });

    const harness = bootstrap as {
      recoverOfflineLoadoutAuthentication(
        error: ClientApiError,
        renderToken: { revision: number },
      ): Promise<void>;
      finishMutation(): void;
      loadoutDrainRequested: boolean;
    };
    await harness.recoverOfflineLoadoutAuthentication(
      new ClientApiError("UNAUTHENTICATED", "登录状态已失效", false),
      { revision: 0 },
    );

    expect(harness.loadoutDrainRequested).toBe(false);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.delaySeconds).toBe(1);

    harness.finishMutation();

    expect(requestOfflineLoadoutDrain).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    expect(lifecycleSync.notifySyncAvailable).toHaveBeenCalledTimes(1);

    scheduled[0]?.callback();
    expect(requestOfflineLoadoutDrain).toHaveBeenCalledTimes(1);
  });

  it("confirms a previously attempted settlement with the old key before issuing a new one", async () => {
    const { GameBootstrap } = await import(
      "../../assets/scripts/app/GameBootstrap"
    );
    const original = beginOfflineLoadoutSettlement(createQueue())!;
    const { harness, setPlayerVersion, persistOfflineLoadoutQueue } =
      createSettlementHarness(GameBootstrap.prototype, original);

    const request = harness.prepareOfflineLoadoutSettlement();

    expect(request).toEqual({
      idempotencyKey: original.settlementIdempotencyKey,
      expectedPlayerVersion: "7",
    });
    expect(persistOfflineLoadoutQueue).not.toHaveBeenCalled();

    setPlayerVersion("8");
    harness.acceptSettledBootstrap(bootstrapFixture(), true);

    expect(harness.pendingLoadoutQueue).toMatchObject({
      phase: "needs_settlement",
      expectedPlayerVersion: "8",
      settlementRequestPending: false,
    });
    expect(harness.pendingLoadoutQueue?.settlementIdempotencyKey).not.toBe(
      original.settlementIdempotencyKey,
    );
    expect(harness.queueSettlementRetryRequested).toBe(true);
    expect(harness.loadoutDrainRequested).toBe(false);
  });

  it("moves a freshly persisted settlement request into replaying after confirmation", async () => {
    const { GameBootstrap } = await import(
      "../../assets/scripts/app/GameBootstrap"
    );
    const original = createQueue();
    const { harness, setPlayerVersion, persistOfflineLoadoutQueue } =
      createSettlementHarness(GameBootstrap.prototype, original);

    const request = harness.prepareOfflineLoadoutSettlement();

    expect(request).toEqual({
      idempotencyKey: original.settlementIdempotencyKey,
      expectedPlayerVersion: "7",
    });
    expect(persistOfflineLoadoutQueue).toHaveBeenCalledTimes(1);
    expect(harness.pendingLoadoutQueue?.settlementRequestPending).toBe(true);

    setPlayerVersion("8");
    harness.acceptSettledBootstrap(bootstrapFixture(), true);

    expect(harness.pendingLoadoutQueue).toMatchObject({
      phase: "replaying",
      expectedPlayerVersion: "8",
      settlementRequestPending: false,
      settlementIdempotencyKey: null,
    });
    expect(harness.queueSettlementRetryRequested).toBe(false);
    expect(harness.loadoutDrainRequested).toBe(true);
    expect(harness.canReplayFreshlySettledLoadout).toBe(true);
  });

  it("settles a restored replaying queue again before sending its head", async () => {
    const { GameBootstrap } = await import(
      "../../assets/scripts/app/GameBootstrap"
    );
    const target = Object.create(GameBootstrap.prototype) as Record<
      string,
      unknown
    >;
    const replaying = acceptOfflineLoadoutSettlement(createQueue(), "8")!;
    const submitPendingLoadoutOperation = vi.fn();
    const scheduleForegroundSyncRetry = vi.fn();
    const lifecycleSync = {
      captureRenderToken: vi.fn(() => ({ revision: 0 })),
      canRender: vi.fn(() => true),
      notifySyncAvailable: vi.fn(),
    };

    Object.assign(target, {
      mutationInFlight: false,
      destroyed: false,
      pendingLoadoutQueue: replaying,
      pendingLoadoutRollbackMessage: null,
      canReplayFreshlySettledLoadout: false,
      loadoutDrainRequested: false,
      queueSettlementRetryRequested: false,
      foregroundSyncRetryAttempt: 4,
      lifecycleSync,
      persistOfflineLoadoutQueue: vi.fn((queue: StoredOfflineLoadoutQueue) => {
        target.pendingLoadoutQueue = queue;
        return true;
      }),
      submitPendingLoadoutOperation,
      scheduleForegroundSyncRetry,
    });

    await (target as unknown as { drainOfflineLoadoutQueue(): Promise<void> })
      .drainOfflineLoadoutQueue();

    expect(target.pendingLoadoutQueue).toMatchObject({
      phase: "needs_settlement",
      expectedPlayerVersion: "8",
      settlementRequestPending: false,
    });
    expect(target.queueSettlementRetryRequested).toBe(true);
    expect(target.foregroundSyncRetryAttempt).toBe(0);
    expect(submitPendingLoadoutOperation).not.toHaveBeenCalled();
    expect(scheduleForegroundSyncRetry).toHaveBeenCalledTimes(1);
    expect(lifecycleSync.notifySyncAvailable).toHaveBeenCalledTimes(1);
  });

  it("settles again after persisting the awaiting-confirmation state fails", async () => {
    const { GameBootstrap } = await import(
      "../../assets/scripts/app/GameBootstrap"
    );
    const target = Object.create(GameBootstrap.prototype) as Record<
      string,
      unknown
    >;
    const replaying = acceptOfflineLoadoutSettlement(createQueue(), "8")!;
    const submitPendingLoadoutOperation = vi.fn();
    const scheduleForegroundSyncRetry = vi.fn();
    const scheduleOfflineLoadoutDrainRetry = vi.fn();
    const persistOfflineLoadoutQueue = vi
      .fn<(queue: StoredOfflineLoadoutQueue) => boolean>()
      .mockReturnValueOnce(false)
      .mockImplementation((queue) => {
        target.pendingLoadoutQueue = queue;
        return true;
      });
    const lifecycleSync = {
      captureRenderToken: vi.fn(() => ({ revision: 0 })),
      canRender: vi.fn(() => true),
      notifySyncAvailable: vi.fn(),
    };

    Object.assign(target, {
      mutationInFlight: false,
      destroyed: false,
      pendingLoadoutQueue: replaying,
      pendingLoadoutRollbackMessage: null,
      canReplayFreshlySettledLoadout: true,
      loadoutDrainRequested: false,
      queueSettlementRetryRequested: false,
      foregroundSyncRetryAttempt: 4,
      lifecycleSync,
      store: { setFeatureMessage: vi.fn() },
      persistOfflineLoadoutQueue,
      submitPendingLoadoutOperation,
      scheduleForegroundSyncRetry,
      scheduleOfflineLoadoutDrainRetry,
    });

    const harness = target as unknown as {
      drainOfflineLoadoutQueue(): Promise<void>;
      pendingLoadoutQueue: StoredOfflineLoadoutQueue;
    };
    await harness.drainOfflineLoadoutQueue();

    expect(harness.pendingLoadoutQueue).toBe(replaying);
    expect(target.canReplayFreshlySettledLoadout).toBe(false);
    expect(scheduleOfflineLoadoutDrainRetry).toHaveBeenCalledTimes(1);
    expect(submitPendingLoadoutOperation).not.toHaveBeenCalled();

    await harness.drainOfflineLoadoutQueue();

    expect(harness.pendingLoadoutQueue).toMatchObject({
      phase: "needs_settlement",
      expectedPlayerVersion: "8",
      settlementRequestPending: false,
    });
    expect(harness.pendingLoadoutQueue.settlementIdempotencyKey).not.toBe(
      replaying.settlementIdempotencyKey,
    );
    expect(target.queueSettlementRetryRequested).toBe(true);
    expect(submitPendingLoadoutOperation).not.toHaveBeenCalled();
  });

  it("freezes offline queuing before recovering a stale loadout response", async () => {
    const { GameBootstrap } = await import(
      "../../assets/scripts/app/GameBootstrap"
    );
    const target = Object.create(GameBootstrap.prototype) as Record<
      string,
      unknown
    >;
    const recoverOfflineLoadoutAuthentication = vi.fn().mockResolvedValue(undefined);
    const error = new ClientApiError(
      "STALE_PLAYER_RESPONSE",
      "已忽略过期的角色数据，请重试",
      true,
    );
    Object.assign(target, {
      requiresFreshAuthoritativeBaseline: false,
      recoverOfflineLoadoutAuthentication,
    });

    await (
      target as unknown as {
        resolveOfflineLoadoutFailure(
          error: ClientApiError,
          renderToken: { revision: number },
        ): Promise<void>;
      }
    ).resolveOfflineLoadoutFailure(error, { revision: 0 });

    expect(target.requiresFreshAuthoritativeBaseline).toBe(true);
    expect(recoverOfflineLoadoutAuthentication).toHaveBeenCalledWith(error, {
      revision: 0,
    });
  });
});

interface SettlementHarness {
  prepareOfflineLoadoutSettlement(): {
    idempotencyKey: string;
    expectedPlayerVersion: string;
  } | undefined;
  acceptSettledBootstrap(
    bootstrap: ReturnType<typeof bootstrapFixture>,
    allowRender: boolean,
  ): void;
  pendingLoadoutQueue: StoredOfflineLoadoutQueue | null;
  queueSettlementRetryRequested: boolean;
  loadoutDrainRequested: boolean;
  canReplayFreshlySettledLoadout: boolean;
}

function createQueue(): NonNullable<
  ReturnType<typeof createStoredOfflineLoadoutQueue>
> {
  const queue = createStoredOfflineLoadoutQueue(
    {
      accountId: "bc830a7d-c6b7-4918-883e-f1b835c8100e",
      playerId: "9430bd13-5c38-43ef-8ff6-43aac1a17e33",
    },
    "7",
    "00000000-0000-4000-8000-000000000701",
    {
      operationId: "00000000-0000-4000-8000-000000000702",
      sequence: 1,
      kind: "technique.equip",
      techniqueConfigId: "quiet_breathing_art",
    },
  );
  if (!queue) throw new Error("Invalid offline loadout queue fixture");
  return queue;
}

function createSettlementHarness(
  prototype: object,
  queue: StoredOfflineLoadoutQueue,
): {
  harness: SettlementHarness;
  setPlayerVersion(version: string): void;
  persistOfflineLoadoutQueue: ReturnType<typeof vi.fn>;
} {
  let playerVersion = "7";
  const target = Object.create(prototype) as Record<string, unknown>;
  const persistOfflineLoadoutQueue = vi.fn(
    (nextQueue: StoredOfflineLoadoutQueue) => {
      target.pendingLoadoutQueue = nextQueue;
      return true;
    },
  );
  const persistBootstrapWithOfflineLoadoutQueue = vi.fn(
    (
      _bootstrap: ReturnType<typeof bootstrapFixture>,
      nextQueue: StoredOfflineLoadoutQueue,
    ) => {
      target.pendingLoadoutQueue = nextQueue;
      return true;
    },
  );
  Object.assign(target, {
    destroyed: false,
    pendingLoadoutQueue: queue,
    loadoutDrainRequested: false,
    queueSettlementRetryRequested: false,
    foregroundSyncRetryAttempt: 3,
    confirmingPreviouslyAttemptedSettlement: false,
    pendingLoadoutRollbackMessage: null,
    apiClient: {
      getAuthoritativeSnapshotMetadata: () => ({
        playerVersion,
        lastSuccessfulSyncAt: "2026-08-05T08:00:00.000Z",
      }),
    },
    finalizePendingLoadoutRollback: vi.fn(() => true),
    persistOfflineLoadoutQueue,
    persistBootstrapWithOfflineLoadoutQueue,
    showQueuedLoadoutPreview: vi.fn(() => true),
  });

  return {
    harness: target as unknown as SettlementHarness,
    setPlayerVersion(version: string): void {
      playerVersion = version;
    },
    persistOfflineLoadoutQueue,
  };
}
