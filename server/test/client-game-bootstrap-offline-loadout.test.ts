/// <reference path="../../temp/declarations/cc.d.ts" />
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

vi.mock("cc/env", () => ({ DEV: true, WECHAT: false }));

describe("Cocos offline loadout orchestration", () => {
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
