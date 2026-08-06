import { _decorator, Component, Node, ResolutionPolicy, view } from "cc";
import { DEBUG } from "cc/env";
import type {
  BootstrapSnapshot,
  ChosenAvatarVariant,
  DebugGrantResult,
  DebugGrantTarget,
  EquippedEquipmentSlot,
  LoadoutMutationResult,
  ProgressionEvent,
} from "@cultivation-diary/shared";
import { CLIENT_CONFIG } from "../core/ClientConfig";
import {
  canRunAuthoritativeMutation,
  canRunLoadoutMutation,
  createStoredBootstrapCache,
  dismissCachedOfflineSettlement,
  getRestorableBootstrapCache,
  hasSameBootstrapIdentity,
  isStoredBootstrapCacheEnvelope,
  shouldInstallDeferredIdentityPreview,
} from "../core/ClientTypes";
import type { StoredBootstrapCache } from "../core/ClientTypes";
import {
  acceptOfflineLoadoutHead,
  acceptOfflineLoadoutSettlement,
  appendOfflineLoadoutOperation,
  applyOfflineLoadoutOperations,
  beginOfflineLoadoutHead,
  beginOfflineLoadoutSettlement,
  classifyOfflineLoadoutResume,
  createStoredOfflineLoadoutQueue,
  restartOfflineLoadoutSettlement,
  type PendingLoadoutOperation,
  type StoredOfflineLoadoutQueue,
} from "../core/OfflineLoadoutQueue";
import {
  LifecycleSyncCoordinator,
  type LifecycleRenderToken,
} from "../core/LifecycleSyncCoordinator";
import {
  planCultivationPresentation,
  type CultivationPresentationTrigger,
} from "../core/CultivationPresentation";
import {
  ApiClient,
  ClientApiError,
  classifyAuthoritativeFailure,
  createClientUuid,
  isClientTransportError,
  isTerminalAuthenticationError,
  requiresAuthoritativeRecovery,
} from "../services/ApiClient";
import type { AuthoritativeMutationOptions } from "../services/ApiClient";
import { createPlatformAdapter } from "../platform/PlatformAdapter";
import { AppStore } from "../state/AppStore";
import { AppView } from "../ui/AppView";

const { ccclass } = _decorator;

interface AuthoritativeSyncResult {
  bootstrap: BootstrapSnapshot;
  completedSettlement: boolean;
  settlementEvents?: readonly ProgressionEvent[];
  settlementId?: string;
}

interface CultivationPresentationEvidence {
  trigger: CultivationPresentationTrigger;
  previous?: BootstrapSnapshot | null;
  sourceId?: string;
}

type OfflineLoadoutIntent =
  | { kind: "technique.equip"; techniqueConfigId: string }
  | { kind: "technique.unequip"; techniqueConfigId: string }
  | {
      kind: "equipment.equip";
      equipmentInstanceId: string;
      equippedSlot: EquippedEquipmentSlot;
    }
  | { kind: "equipment.unequip"; equipmentInstanceId: string };

@ccclass("GameBootstrap")
export class GameBootstrap extends Component {
  private readonly store = new AppStore();
  private readonly platform = createPlatformAdapter();
  private readonly apiClient = new ApiClient(this.platform);
  private appView: AppView | null = null;
  private unsubscribe: (() => void) | null = null;
  private unsubscribeLifecycle: (() => void) | null = null;
  private unsubscribeNetworkStatus: (() => void) | null = null;
  private mutationInFlight = false;
  private startupAuthenticationInFlight = false;
  private startupRetryRequested = false;
  private destroyed = false;
  private offlineDismissPending = false;
  private modalInputLockedUntil = 0;
  private pendingProfileBootstrap: BootstrapSnapshot | null = null;
  private lastAuthoritativeCache: StoredBootstrapCache | null = null;
  private pendingLoadoutQueue: StoredOfflineLoadoutQueue | null = null;
  private loadoutDrainRequested = false;
  private queueSettlementRetryRequested = false;
  private loadoutDrainRetryScheduled = false;
  private loadoutDrainRetryAttempt = 0;
  private foregroundSyncRetryScheduled = false;
  private foregroundSyncRetryAttempt = 0;
  private confirmingPreviouslyAttemptedSettlement = false;
  private canReplayFreshlySettledLoadout = false;
  private pendingLoadoutRollbackMessage: string | null = null;
  private requiresFreshAuthoritativeBaseline = false;
  private queuedLoadoutNotice: string | null = null;
  private readonly presentedCultivationSources = new Set<string>();
  private readonly lifecycleSync = new LifecycleSyncCoordinator<AuthoritativeSyncResult>({
    intervalSeconds: CLIENT_CONFIG.heartbeatIntervalSeconds,
    schedule: (callback, intervalSeconds) => this.schedule(callback, intervalSeconds),
    unschedule: (callback) => this.unschedule(callback),
    persistCurrentSnapshot: () => this.persistCurrentBootstrap(),
    canStartSync: () =>
      !this.mutationInFlight &&
      !this.hasLoadoutHeadToDrain() &&
      (this.store.snapshot.phase === "ready" || this.lastAuthoritativeCache !== null),
    setSyncInFlight: (inFlight) => {
      if (inFlight) this.mutationInFlight = true;
      else this.finishMutation();
    },
    started: (reason, allowRender) => {
      if (
        allowRender &&
        (reason === "show" || this.store.snapshot.syncStatus === "offline")
      ) {
        this.store.markReconnecting();
      }
    },
    sync: async () => {
      const result = await this.apiClient.syncHeartbeat(
        this.prepareOfflineLoadoutSettlement(),
      );
      return {
        bootstrap: result.bootstrap,
        completedSettlement: true,
        settlementEvents: result.settlement.events,
        settlementId: result.settlement.settlementId,
      };
    },
    recover: (error) => this.recoverHeartbeat(error),
    reject: (error, allowRender) => this.handleHeartbeatFailure(error, allowRender),
    accept: (result, allowRender) =>
      this.acceptHeartbeatBootstrap(result, allowRender),
  });

  onLoad(): void {
    view.setDesignResolutionSize(750, 1334, ResolutionPolicy.SHOW_ALL);
    this.restoreCachedPreview();

    const appRoot = new Node("AppRoot");
    appRoot.layer = this.node.layer;
    this.node.addChild(appRoot);
    this.appView = new AppView(appRoot, {
      retry: () => void this.startGame(),
      selectTab: (tab) => this.store.selectTab(tab),
      openFeature: (feature) => {
        this.store.openFeature(feature);
        this.showQueuedLoadoutNotice();
      },
      closeFeature: () => this.closeFeature(),
      breakthrough: () => void this.breakthrough(),
      chooseAvatar: (avatarVariant) => void this.chooseAvatar(avatarVariant),
      renamePlayer: (displayName) => void this.renamePlayer(displayName),
      expandInventory: () => void this.expandInventory(),
      useInventoryItem: (itemConfigId) =>
        void this.useInventoryItem(itemConfigId),
      transferHarvest: (entryId) => void this.transferHarvest(entryId),
      salvageHarvest: (entryId) => void this.salvageHarvest(entryId),
      equipTechnique: (techniqueConfigId) =>
        void this.equipTechnique(techniqueConfigId),
      unequipTechnique: (techniqueConfigId) =>
        void this.unequipTechnique(techniqueConfigId),
      equipEquipment: (equipmentInstanceId, equippedSlot) =>
        void this.equipEquipment(equipmentInstanceId, equippedSlot),
      unequipEquipment: (equipmentInstanceId) =>
        void this.unequipEquipment(equipmentInstanceId),
      dismissOfflineSettlement: () => this.dismissOfflineSettlement(),
      simulateOffline: (seconds) => this.debugSimulateOffline(seconds),
      grantDebug: (target) => this.debugGrant(target),
      feedback: () => this.platform.feedback(),
    });
    this.unsubscribe = this.store.subscribe((state) => this.appView?.render(state));
    this.schedule(() => this.appView?.updateIdleAnimation(), 0.5);
    this.lifecycleSync.start();
    this.unsubscribeLifecycle = this.platform.subscribeLifecycle({
      onShow: () => {
        this.appView?.setDebugLifecycleStatus("foreground");
        this.lifecycleSync.handleShow();
        this.resumeOfflineLoadoutWork();
        if (
          this.lastAuthoritativeCache === null &&
          this.store.snapshot.phase !== "ready"
        ) {
          void this.startGame();
        }
      },
      onHide: () => {
        this.canReplayFreshlySettledLoadout = false;
        this.appView?.interruptCultivationPresentation(true);
        this.appView?.setDebugLifecycleStatus("background");
        this.lifecycleSync.handleHide();
      },
    });
    this.unsubscribeNetworkStatus = this.platform.subscribeNetworkStatus({
      onOnline: () => this.handleNetworkOnline(),
      onOffline: () => this.handleNetworkOffline(),
    });
    void this.startGame();
  }

  onDestroy(): void {
    this.destroyed = true;
    this.unsubscribeLifecycle?.();
    this.unsubscribeLifecycle = null;
    this.unsubscribeNetworkStatus?.();
    this.unsubscribeNetworkStatus = null;
    this.lifecycleSync.destroy();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.appView?.destroy();
    this.appView = null;
  }

  private async startGame(): Promise<void> {
    if (this.mutationInFlight || this.destroyed) return;
    const renderToken = this.lifecycleSync.captureRenderToken();
    if (!renderToken) return;

    this.mutationInFlight = true;
    this.startupAuthenticationInFlight = true;
    if (this.store.snapshot.bootstrap) this.store.markReconnecting();
    else this.store.setLoading("正在同步修为");
    let settleAfterAuthentication = false;
    let retryAfterLifecycleChange = false;
    let retryAfterConnectivityHint = false;
    try {
      const bootstrap = await this.authenticateAuthoritatively();
      this.reconcileOfflineLoadoutQueue(bootstrap);
      const allowRender = this.lifecycleSync.canRender(renderToken);
      const canInstallBootstrap = this.canInstallBootstrapForPendingQueue();
      if (canInstallBootstrap) this.persistBootstrap(bootstrap, allowRender);
      if (allowRender && canInstallBootstrap) {
        if (!this.showQueuedLoadoutPreview(bootstrap)) {
          this.setAuthoritativeReady(bootstrap);
          this.showQueuedLoadoutNotice();
        }
      } else if (allowRender) {
        this.store.markReconnecting();
      }
      const hasHeadToDrain = this.hasLoadoutHeadToDrain();
      this.requiresFreshAuthoritativeBaseline =
        this.pendingLoadoutRollbackMessage !== null;
      this.loadoutDrainRequested = hasHeadToDrain;
      if (this.pendingLoadoutRollbackMessage) {
        this.queueSettlementRetryRequested = true;
      }
      settleAfterAuthentication =
        allowRender &&
        !hasHeadToDrain &&
        this.pendingLoadoutRollbackMessage === null;
    } catch (error) {
      if (this.lifecycleSync.canRender(renderToken)) {
        if (this.store.snapshot.bootstrap) {
          if (isClientTransportError(error)) this.markAuthoritativeOffline();
          else this.store.markReconnecting();
          return;
        }
        const message =
          error instanceof ClientApiError || error instanceof Error
            ? error.message
            : "暂时无法连接仙门";
        this.store.setError(message);
      } else {
        retryAfterLifecycleChange =
          !this.destroyed &&
          this.lastAuthoritativeCache === null &&
          this.lifecycleSync.captureRenderToken() !== null;
      }
    } finally {
      retryAfterConnectivityHint =
        this.startupRetryRequested && !settleAfterAuthentication;
      this.startupRetryRequested = false;
      this.startupAuthenticationInFlight = false;
      this.finishMutation();
    }

    if (settleAfterAuthentication) await this.settleGame();
    else if (retryAfterLifecycleChange || retryAfterConnectivityHint) {
      void this.startGame();
    }
  }

  private async settleGame(debugElapsedSeconds?: number): Promise<void> {
    if (
      this.mutationInFlight ||
      this.store.snapshot.phase !== "ready" ||
      this.isProfileOpen()
    ) {
      return;
    }

    const renderToken = this.lifecycleSync.captureRenderToken();
    this.mutationInFlight = true;
    try {
      const result =
        debugElapsedSeconds === undefined
          ? (() => {
              const settlementOptions = this.prepareOfflineLoadoutSettlement();
              return settlementOptions
                ? this.apiClient.syncHeartbeat(settlementOptions)
                : this.apiClient.settleCultivation();
            })()
          : this.apiClient.debugSettleCultivation(debugElapsedSeconds);
      const settled = await result;
      const allowRender = this.lifecycleSync.canRender(renderToken);
      this.acceptSettledBootstrap(
        settled.bootstrap,
        allowRender,
        settled.settlement.events,
        settled.settlement.settlementId,
      );
    } catch (error) {
      let recoveredResult: AuthoritativeSyncResult | null = null;
      try {
        recoveredResult = await this.recoverHeartbeat(error);
      } catch (recoveryError) {
        if (this.lifecycleSync.canRender(renderToken)) {
          this.markReadOnlyAfterAuthoritativeFailure(recoveryError, true);
        }
        return;
      }
      if (recoveredResult) {
        const allowRender = this.lifecycleSync.canRender(renderToken);
        this.acceptRecoveredBootstrap(recoveredResult.bootstrap, allowRender);
        return;
      }
      if (this.lifecycleSync.canRender(renderToken)) {
        this.markReadOnlyAfterAuthoritativeFailure(error);
      }
      // Keep the last authoritative snapshot visible; the next scheduled sync retries.
    } finally {
      this.finishMutation();
    }
  }

  private debugSimulateOffline(seconds: number): void {
    if (
      !Number.isSafeInteger(seconds) ||
      seconds < 1 ||
      seconds > 86_400 ||
      !this.canStartDebugMutation()
    ) {
      return;
    }
    void this.settleGame(seconds);
  }

  private debugGrant(target: DebugGrantTarget): void {
    if (
      !isDebugGrantTarget(target) ||
      !this.canStartDebugMutation() ||
      (target === "fill_experience" &&
        this.store.snapshot.bootstrap?.progress.status !== "gaining")
    ) {
      return;
    }
    void this.runDebugGrant(target);
  }

  private canStartDebugMutation(): boolean {
    return (
      DEBUG &&
      !this.mutationInFlight &&
      canRunAuthoritativeMutation(this.store.snapshot) &&
      this.store.snapshot.activeFeature === null &&
      this.store.snapshot.bootstrap?.offlineSettlement === null &&
      this.store.snapshot.pendingLoadoutOperationCount === 0
    );
  }

  private async runDebugGrant(target: DebugGrantTarget): Promise<void> {
    const renderToken = this.lifecycleSync.captureRenderToken();
    if (!renderToken) return;
    this.mutationInFlight = true;
    this.store.setFeatureMessage("正在注入开发测试资源……");
    try {
      const result = await this.apiClient.debugGrant(target);
      const presentation = hasLevelUpEvent(result.events)
        ? ({
            trigger: "level_up",
            sourceId: result.operationId,
          } satisfies CultivationPresentationEvidence)
        : undefined;
      if (
        !this.applyMutationBootstrap(
          result.bootstrap,
          renderToken,
          undefined,
          presentation,
        )
      ) {
        return;
      }
      this.store.setFeatureMessage(debugGrantSuccessMessage(result));
    } catch (error) {
      if (!(await this.recoverPlayerVersionConflict(error, renderToken))) {
        this.handleFeatureMutationFailure(error, "调试资源注入失败", renderToken);
      }
    } finally {
      this.finishMutation();
    }
  }

  private acceptHeartbeatBootstrap(
    result: AuthoritativeSyncResult,
    allowRender: boolean,
  ): void {
    if (result.completedSettlement) {
      this.acceptSettledBootstrap(
        result.bootstrap,
        allowRender,
        result.settlementEvents,
        result.settlementId,
      );
    } else {
      this.acceptRecoveredBootstrap(result.bootstrap, allowRender);
    }
  }

  private applySyncedBootstrap(
    bootstrap: BootstrapSnapshot,
    presentation?: CultivationPresentationEvidence,
  ): void {
    if (
      this.isProfileOpen() &&
      hasSameBootstrapIdentity(this.store.snapshot.bootstrap, bootstrap)
    ) {
      this.enqueueCultivationPresentation(bootstrap, presentation);
      this.pendingProfileBootstrap = bootstrap;
      if (this.store.snapshot.syncStatus !== "online") {
        this.markAuthoritativeOnline();
      }
    } else {
      this.setAuthoritativeReady(bootstrap, presentation);
    }
  }

  private persistCurrentBootstrap(): boolean {
    if (this.lastAuthoritativeCache) {
      return this.platform.save(
        CLIENT_CONFIG.bootstrapCacheStorageKey,
        this.lastAuthoritativeCache,
      );
    }
    return false;
  }

  private persistBootstrap(
    bootstrap: BootstrapSnapshot,
    allowRender: boolean,
  ): boolean {
    if (this.pendingLoadoutQueue) {
      return this.persistBootstrapWithOfflineLoadoutQueue(
        bootstrap,
        this.pendingLoadoutQueue,
        allowRender,
      );
    }
    if (this.destroyed) return false;
    const metadata = this.apiClient.getAuthoritativeSnapshotMetadata();
    if (!metadata) return false;
    const cache = createStoredBootstrapCache(
      bootstrap,
      metadata,
      this.store.snapshot.bootstrap,
      this.pendingLoadoutQueue,
    );
    if (!cache) return false;

    this.lastAuthoritativeCache = cache;
    const persisted = this.platform.save(CLIENT_CONFIG.bootstrapCacheStorageKey, cache);
    if (
      shouldInstallDeferredIdentityPreview(
        this.store.snapshot.bootstrap,
        bootstrap,
        allowRender,
      )
    ) {
      this.pendingProfileBootstrap = null;
      this.store.setCachedPreview(
        cache.bootstrap,
        cache.lastSuccessfulSyncAt,
        0,
      );
    }
    return persisted;
  }

  private persistBootstrapWithOfflineLoadoutQueue(
    bootstrap: BootstrapSnapshot,
    queue: StoredOfflineLoadoutQueue | null,
    allowRender: boolean,
  ): boolean {
    if (this.destroyed || this.pendingLoadoutRollbackMessage) return false;
    const metadata = this.apiClient.getAuthoritativeSnapshotMetadata();
    if (!metadata) return false;
    const cache = createStoredBootstrapCache(
      bootstrap,
      metadata,
      this.store.snapshot.bootstrap,
      queue,
    );
    if (
      !cache ||
      !this.platform.save(CLIENT_CONFIG.bootstrapCacheStorageKey, cache)
    ) {
      return false;
    }

    this.pendingLoadoutQueue = queue;
    this.lastAuthoritativeCache = cache;
    if (
      shouldInstallDeferredIdentityPreview(
        this.store.snapshot.bootstrap,
        bootstrap,
        allowRender,
      )
    ) {
      this.pendingProfileBootstrap = null;
      const preview = queue
        ? applyOfflineLoadoutOperations(cache.bootstrap, queue.operations)
        : null;
      this.store.setCachedPreview(
        preview ?? cache.bootstrap,
        cache.lastSuccessfulSyncAt,
        preview ? queue?.operations.length ?? 0 : 0,
      );
    }
    return true;
  }

  private prepareOfflineLoadoutSettlement():
    | AuthoritativeMutationOptions
    | undefined {
    this.confirmingPreviouslyAttemptedSettlement = false;
    if (!this.finalizePendingLoadoutRollback()) {
      throw new ClientApiError(
        "LOCAL_STORAGE_UNAVAILABLE",
        "无法清理离线装备队列，请稍后重试",
        true,
      );
    }
    const queue = this.pendingLoadoutQueue;
    if (!queue) return undefined;
    if (queue.phase !== "needs_settlement") {
      throw new ClientApiError(
        "OFFLINE_LOADOUT_REPLAY_PENDING",
        "正在确认离线装备操作，请稍后重试",
        true,
      );
    }
    const authoritativeVersion =
      this.apiClient.getAuthoritativeSnapshotMetadata()?.playerVersion;
    const confirmsPreviousAttempt =
      queue.settlementRequestPending ||
      (authoritativeVersion !== undefined &&
        authoritativeVersion !== queue.expectedPlayerVersion);
    const pending = beginOfflineLoadoutSettlement(queue);
    if (!pending || (pending !== queue && !this.persistOfflineLoadoutQueue(pending))) {
      throw new ClientApiError(
        "LOCAL_STORAGE_UNAVAILABLE",
        "无法保存离线结算请求，请稍后重试",
        true,
      );
    }
    this.confirmingPreviouslyAttemptedSettlement = confirmsPreviousAttempt;
    return {
      idempotencyKey: pending.settlementIdempotencyKey,
      expectedPlayerVersion: pending.expectedPlayerVersion,
    };
  }

  private acceptSettledBootstrap(
    bootstrap: BootstrapSnapshot,
    allowRender: boolean,
    settlementEvents: readonly ProgressionEvent[] = [],
    settlementId?: string,
  ): void {
    const presentation = hasLevelUpEvent(settlementEvents)
      ? ({
          trigger: "level_up",
          ...(settlementId ? { sourceId: settlementId } : {}),
        } satisfies CultivationPresentationEvidence)
      : undefined;
    const queue = this.pendingLoadoutQueue;
    const requiresFreshSettlement =
      this.confirmingPreviouslyAttemptedSettlement || !allowRender;
    this.confirmingPreviouslyAttemptedSettlement = false;
    if (queue?.phase === "needs_settlement") {
      const version = this.apiClient.getAuthoritativeSnapshotMetadata()?.playerVersion;
      const replaying = version
        ? acceptOfflineLoadoutSettlement(queue, version)
        : null;
      if (!replaying) {
        this.rollbackOfflineLoadoutQueue(
          "离线装备队列版本异常，已按服务器状态回滚",
        );
        this.persistBootstrap(bootstrap, allowRender);
        if (allowRender) {
          this.applySyncedBootstrap(bootstrap, presentation);
          this.showQueuedLoadoutNotice();
        }
        return;
      }

      const nextQueue = requiresFreshSettlement
        ? restartOfflineLoadoutSettlement(replaying, createClientUuid())
        : replaying;
      if (
        !nextQueue ||
        !this.persistBootstrapWithOfflineLoadoutQueue(
          bootstrap,
          nextQueue,
          allowRender,
        )
      ) {
        this.queueSettlementRetryRequested = true;
        if (allowRender) {
          this.store.setFeatureMessage("正在保存离线结算结果，请稍后重试");
        }
        return;
      }
      this.foregroundSyncRetryAttempt = 0;
      this.queueSettlementRetryRequested = requiresFreshSettlement;
      this.loadoutDrainRequested = !requiresFreshSettlement;
      this.canReplayFreshlySettledLoadout = !requiresFreshSettlement;
      if (allowRender && presentation) {
        const queuedPreview = applyOfflineLoadoutOperations(
          bootstrap,
          queue.operations,
        );
        if (queuedPreview) {
          this.enqueueCultivationPresentation(queuedPreview, presentation);
        }
      }
      if (allowRender && !this.showQueuedLoadoutPreview(bootstrap)) {
        this.applySyncedBootstrap(bootstrap, presentation);
        this.showQueuedLoadoutNotice();
      }
      return;
    }

    if (this.persistBootstrap(bootstrap, allowRender)) {
      this.foregroundSyncRetryAttempt = 0;
      this.queueSettlementRetryRequested = false;
    }
    if (allowRender && !this.destroyed) {
      this.applySyncedBootstrap(bootstrap, presentation);
      this.showQueuedLoadoutNotice();
    }
  }

  private acceptRecoveredBootstrap(
    bootstrap: BootstrapSnapshot,
    allowRender: boolean,
  ): void {
    this.reconcileOfflineLoadoutQueue(bootstrap);
    const canInstallBootstrap = this.canInstallBootstrapForPendingQueue();
    if (canInstallBootstrap) this.persistBootstrap(bootstrap, allowRender);
    this.requiresFreshAuthoritativeBaseline =
      this.pendingLoadoutRollbackMessage !== null;
    if (this.hasLoadoutHeadToDrain()) this.loadoutDrainRequested = true;
    this.queueSettlementRetryRequested = !this.hasLoadoutHeadToDrain();
    if (!allowRender || this.destroyed) {
      return;
    }
    if (!canInstallBootstrap) {
      this.store.markReconnecting();
    } else if (this.showQueuedLoadoutPreview(bootstrap)) {
      this.store.markReconnecting();
    } else {
      this.pendingProfileBootstrap = null;
      this.store.replaceSnapshot(bootstrap, 0);
      this.store.markReconnecting();
      this.showQueuedLoadoutNotice();
    }
  }

  private reconcileOfflineLoadoutQueue(bootstrap: BootstrapSnapshot): void {
    const queue = this.pendingLoadoutQueue;
    if (!queue || this.pendingLoadoutRollbackMessage) return;
    const version = this.apiClient.getAuthoritativeSnapshotMetadata()?.playerVersion;
    const action = version
      ? classifyOfflineLoadoutResume(
          queue,
          { accountId: bootstrap.account.id, playerId: bootstrap.player.id },
          version,
        )
      : "rollback";
    if (action === "rollback") {
      this.requiresFreshAuthoritativeBaseline = true;
      this.rollbackOfflineLoadoutQueue(
        "服务器数据已更新，离线装备操作已回滚",
      );
    }
  }

  private canInstallBootstrapForPendingQueue(): boolean {
    if (this.pendingLoadoutRollbackMessage) return false;
    const queue = this.pendingLoadoutQueue;
    if (!queue) return true;
    return (
      this.apiClient.getAuthoritativeSnapshotMetadata()?.playerVersion ===
      queue.expectedPlayerVersion
    );
  }

  private showQueuedLoadoutPreview(bootstrap: BootstrapSnapshot): boolean {
    const queue = this.pendingLoadoutQueue;
    if (!queue || this.pendingLoadoutRollbackMessage) return false;
    const preview = applyOfflineLoadoutOperations(bootstrap, queue.operations);
    const syncAt = this.apiClient.getAuthoritativeSnapshotMetadata()?.lastSuccessfulSyncAt ??
      this.lastAuthoritativeCache?.lastSuccessfulSyncAt;
    if (!preview || !syncAt) {
      this.rollbackOfflineLoadoutQueue(
        "离线装备操作已失效，当前显示服务器状态",
      );
      return false;
    }
    this.store.setQueuedLoadoutPreview(
      preview,
      syncAt,
      queue.operations.length,
    );
    return true;
  }

  private persistOfflineLoadoutQueue(
    queue: StoredOfflineLoadoutQueue,
  ): boolean {
    const cache = this.lastAuthoritativeCache;
    if (!cache || this.pendingLoadoutRollbackMessage) return false;
    const nextCache: StoredBootstrapCache = {
      ...cache,
      pendingLoadoutQueue: queue,
    };
    if (!isStoredBootstrapCacheEnvelope(nextCache)) return false;
    if (!this.platform.save(CLIENT_CONFIG.bootstrapCacheStorageKey, nextCache)) {
      return false;
    }
    this.pendingLoadoutQueue = queue;
    this.lastAuthoritativeCache = nextCache;
    return true;
  }

  private rollbackOfflineLoadoutQueue(message: string): boolean {
    this.loadoutDrainRequested = false;
    this.queueSettlementRetryRequested = false;
    this.foregroundSyncRetryAttempt = 0;
    this.confirmingPreviouslyAttemptedSettlement = false;
    this.canReplayFreshlySettledLoadout = false;
    const cache = this.lastAuthoritativeCache;
    if (cache) {
      const nextCache: StoredBootstrapCache = {
        ...cache,
        pendingLoadoutQueue: null,
      };
      if (isStoredBootstrapCacheEnvelope(nextCache)) {
        if (!this.platform.save(CLIENT_CONFIG.bootstrapCacheStorageKey, nextCache)) {
          this.pendingLoadoutRollbackMessage = message;
          this.queuedLoadoutNotice =
            "设备存储暂不可用，离线装备队列已停止并等待清理";
          if (
            hasSameBootstrapIdentity(
              this.store.snapshot.bootstrap,
              nextCache.bootstrap,
            )
          ) {
            this.store.replaceSnapshot(nextCache.bootstrap, 0);
            this.store.markReconnecting();
          }
          this.showQueuedLoadoutNotice();
          return false;
        }
        this.lastAuthoritativeCache = nextCache;
        if (
          hasSameBootstrapIdentity(this.store.snapshot.bootstrap, nextCache.bootstrap)
        ) {
          this.store.replaceSnapshot(nextCache.bootstrap, 0);
        }
      }
    }
    this.pendingLoadoutQueue = null;
    this.pendingLoadoutRollbackMessage = null;
    this.loadoutDrainRetryAttempt = 0;
    this.queuedLoadoutNotice = message;
    this.showQueuedLoadoutNotice();
    return true;
  }

  private finalizePendingLoadoutRollback(): boolean {
    const message = this.pendingLoadoutRollbackMessage;
    return message ? this.rollbackOfflineLoadoutQueue(message) : true;
  }

  private showQueuedLoadoutNotice(): void {
    if (
      !this.queuedLoadoutNotice ||
      (this.store.snapshot.activeFeature !== "techniques" &&
        this.store.snapshot.activeFeature !== "equipment")
    ) {
      return;
    }
    const message = this.queuedLoadoutNotice;
    this.queuedLoadoutNotice = null;
    this.store.setFeatureMessage(message);
  }

  private applyMutationBootstrap(
    bootstrap: BootstrapSnapshot,
    renderToken: LifecycleRenderToken,
    beforeApply?: () => void,
    presentation?: CultivationPresentationEvidence,
  ): boolean {
    const allowRender = this.lifecycleSync.canRender(renderToken);
    this.persistBootstrap(bootstrap, allowRender);
    if (!allowRender) return false;

    this.pendingProfileBootstrap = null;
    beforeApply?.();
    this.setAuthoritativeReady(bootstrap, presentation);
    return true;
  }

  private async recoverHeartbeat(
    error: unknown,
  ): Promise<AuthoritativeSyncResult | null> {
    if (isTerminalAuthenticationError(error)) {
      this.apiClient.consumeRejectedStoredSession();
      this.invalidateCachedIdentity(error.message);
      return null;
    }
    if (!requiresAuthoritativeRecovery(error)) {
      return null;
    }

    if (isPlayerVersionConflict(error) || isStalePlayerResponse(error)) {
      this.requiresFreshAuthoritativeBaseline = true;
    }
    if (isPlayerVersionConflict(error)) {
      if (this.pendingLoadoutQueue) {
        this.rollbackOfflineLoadoutQueue(
          "离线装备操作与服务器数据冲突，已按服务器状态回滚",
        );
      }
    }

    try {
      const bootstrap = await this.authenticateAuthoritatively();
      this.reconcileOfflineLoadoutQueue(bootstrap);
      this.requiresFreshAuthoritativeBaseline =
        this.pendingLoadoutRollbackMessage !== null;
      return { bootstrap, completedSettlement: false };
    } catch (recoveryError) {
      if (isClientTransportError(recoveryError)) throw recoveryError;
      return null;
    }
  }

  private handleHeartbeatFailure(error: unknown, allowRender: boolean): void {
    if (allowRender) this.markReadOnlyAfterAuthoritativeFailure(error);
  }

  private handleNetworkOnline(): void {
    if (this.destroyed) return;
    if (this.store.snapshot.bootstrap) {
      this.store.markReconnecting();
      if (this.startupAuthenticationInFlight) {
        this.startupRetryRequested = true;
      }
      if (this.hasLoadoutHeadToDrain()) {
        this.loadoutDrainRetryAttempt = 0;
        this.requestOfflineLoadoutDrain();
      } else {
        this.lifecycleSync.requestForegroundSync();
      }
    } else if (this.mutationInFlight) {
      this.startupRetryRequested = true;
    } else if (this.store.snapshot.phase === "error") {
      void this.startGame();
    }
  }

  private handleNetworkOffline(): void {
    if (this.destroyed || !this.store.snapshot.bootstrap) return;
    this.canReplayFreshlySettledLoadout = false;
    this.persistCurrentBootstrap();
    this.markAuthoritativeOffline();
  }

  private dismissOfflineSettlement(): void {
    const bootstrap = this.store.snapshot.bootstrap;
    const settlement = bootstrap?.offlineSettlement;
    if (this.offlineDismissPending || !bootstrap || !settlement) {
      return;
    }
    const identity = {
      accountId: bootstrap.account.id,
      playerId: bootstrap.player.id,
      settlementId: settlement.id,
    };

    // Rebuilding the view inside the current pointer dispatch can expose an
    // underlying button to the browser's follow-up click event. Keep the modal
    // in place briefly and lock mutations until that input sequence has ended.
    this.offlineDismissPending = true;
    this.modalInputLockedUntil = Date.now() + 500;
    this.scheduleOnce(() => {
      const current = this.store.snapshot.bootstrap;
      if (
        current?.account.id === identity.accountId &&
        current.player.id === identity.playerId &&
        current.offlineSettlement?.id === identity.settlementId
      ) {
        this.store.dismissOfflineSettlement();
        this.persistOfflineSettlementDismissal(identity);
      }
      this.offlineDismissPending = false;
    }, 0.1);
  }

  private closeFeature(): void {
    const pendingBootstrap = this.pendingProfileBootstrap;
    this.pendingProfileBootstrap = null;
    if (pendingBootstrap) this.applyDeferredProfileBootstrap(pendingBootstrap);
    this.store.closeFeature();
  }

  private isProfileOpen(): boolean {
    return this.store.snapshot.activeFeature === "profile";
  }

  private async breakthrough(): Promise<void> {
    if (!this.canStartFeatureMutation()) return;

    const renderToken = this.lifecycleSync.captureRenderToken();
    if (!renderToken) return;
    this.platform.feedback();
    this.mutationInFlight = true;
    this.store.setLoading("正在叩开境界之门");
    try {
      const result = await this.apiClient.breakthrough();
      const previousBootstrap = this.store.snapshot.bootstrap;
      const breakthroughConfirmed =
        result.toLevel > result.fromLevel &&
        previousBootstrap?.progress.level === result.fromLevel &&
        result.bootstrap.progress.level === result.toLevel;
      this.applyMutationBootstrap(
        result.bootstrap,
        renderToken,
        undefined,
        breakthroughConfirmed
          ? { trigger: "breakthrough", sourceId: result.breakthroughId }
          : undefined,
      );
    } catch (error) {
      if (await this.recoverPlayerVersionConflict(error, renderToken)) return;
      if (!this.lifecycleSync.canRender(renderToken)) return;
      if (isClientTransportError(error)) {
        this.markAuthoritativeOffline();
        return;
      }
      const message =
        error instanceof ClientApiError || error instanceof Error
          ? error.message
          : "突破暂未成功";
      this.store.setError(message);
    } finally {
      this.finishMutation();
    }
  }

  private async expandInventory(): Promise<void> {
    if (!this.canStartFeatureMutation()) return;
    const renderToken = this.lifecycleSync.captureRenderToken();
    if (!renderToken) return;
    this.mutationInFlight = true;
    this.store.setFeatureMessage("正在扩展行囊……");
    try {
      const result = await this.apiClient.expandInventory();
      if (!this.applyMutationBootstrap(result.bootstrap, renderToken)) return;
      this.store.setFeatureMessage(
        result.nextCost === null
          ? "行囊已扩展至最大容量"
          : `行囊扩展成功，消耗灵石 ${result.cost}`,
      );
    } catch (error) {
      if (!(await this.recoverPlayerVersionConflict(error, renderToken))) {
        this.handleFeatureMutationFailure(error, "行囊扩展失败", renderToken);
      }
    } finally {
      this.finishMutation();
    }
  }

  private async chooseAvatar(
    avatarVariant: ChosenAvatarVariant,
  ): Promise<void> {
    if (!this.canStartFeatureMutation()) return;
    const renderToken = this.lifecycleSync.captureRenderToken();
    if (!renderToken) return;
    if (this.pendingProfileBootstrap) {
      const pendingBootstrap = this.pendingProfileBootstrap;
      this.applyPendingProfileBootstrap();
      this.store.setFeatureMessage(
        pendingBootstrap.player.avatarVariant === "neutral"
          ? "档案状态已同步，请重新确认"
          : "角色形象已由其他操作确定，档案状态已同步",
      );
      return;
    }
    this.mutationInFlight = true;
    this.store.setFeatureMessage("正在确认角色形象……");
    try {
      const result = await this.apiClient.chooseAvatar(avatarVariant);
      if (!this.applyMutationBootstrap(result.bootstrap, renderToken)) return;
      this.store.setFeatureMessage("角色形象已确定，此后不可再次修改");
    } catch (error) {
      if (await this.recoverPlayerVersionConflict(error, renderToken)) {
        if (!this.lifecycleSync.canRender(renderToken)) return;
        if (this.store.snapshot.syncStatus !== "online") return;
        this.store.setFeatureMessage(
          this.store.snapshot.bootstrap?.player.avatarVariant === "neutral"
            ? "档案状态已同步，请重新确认"
            : "角色形象已由其他操作确定，档案状态已同步",
        );
      } else if (this.lifecycleSync.canRender(renderToken)) {
        this.handleFeatureMutationFailure(error, "角色形象确认失败", renderToken);
      }
    } finally {
      this.finishMutation();
    }
  }

  private async renamePlayer(displayName: string): Promise<void> {
    if (!this.canStartFeatureMutation()) return;
    const renderToken = this.lifecycleSync.captureRenderToken();
    if (!renderToken) return;
    if (this.pendingProfileBootstrap) {
      this.appView?.preserveProfileNameDraft(displayName);
      this.applyPendingProfileBootstrap();
      this.store.setFeatureMessage(
        "档案状态已同步，原输入已保留，请核对后重新提交",
      );
      return;
    }
    if (!displayName.trim()) {
      this.store.setFeatureMessage("请输入新的道号");
      return;
    }

    this.mutationInFlight = true;
    this.store.setFeatureMessage("正在呈递新道号……");
    try {
      const result = await this.apiClient.renamePlayer(displayName);
      if (
        !this.applyMutationBootstrap(result.bootstrap, renderToken, () =>
          this.appView?.acceptProfileName(result.displayName),
        )
      ) {
        return;
      }
      this.store.setFeatureMessage(
        result.usedFreeRename
          ? `道号已改为「${result.displayName}」，本次使用免费机会`
          : `道号已改为「${result.displayName}」，消耗改名卡 1 张`,
      );
    } catch (error) {
      if (await this.recoverPlayerVersionConflict(error, renderToken)) {
        if (!this.lifecycleSync.canRender(renderToken)) return;
        if (this.store.snapshot.syncStatus !== "online") return;
        this.store.setFeatureMessage(
          "档案状态已同步，原输入已保留，请核对后重新提交",
        );
      } else if (this.lifecycleSync.canRender(renderToken)) {
        this.handleFeatureMutationFailure(error, "修改道号失败", renderToken);
      }
    } finally {
      this.finishMutation();
    }
  }

  private async useInventoryItem(itemConfigId: string): Promise<void> {
    if (!this.canStartFeatureMutation()) return;
    const renderToken = this.lifecycleSync.captureRenderToken();
    if (!renderToken) return;
    this.mutationInFlight = true;
    this.store.setFeatureMessage("正在炼化经验丹……");
    try {
      const result = await this.apiClient.useInventoryItem(itemConfigId);
      const presentation = hasLevelUpEvent(result.events)
        ? ({
            trigger: "level_up",
            sourceId: result.operationId,
          } satisfies CultivationPresentationEvidence)
        : undefined;
      if (!this.applyMutationBootstrap(result.bootstrap, renderToken, undefined, presentation)) {
        return;
      }
      this.store.setFeatureMessage(
        result.reachedBreakthrough
          ? `炼化完成：修为 +${result.experienceGained}，已到达突破瓶颈`
          : `炼化完成：修为 +${result.experienceGained}`,
      );
    } catch (error) {
      if (!(await this.recoverPlayerVersionConflict(error, renderToken))) {
        this.handleFeatureMutationFailure(error, "道具使用失败", renderToken);
      }
    } finally {
      this.finishMutation();
    }
  }

  private async transferHarvest(entryId: string): Promise<void> {
    if (!this.canStartFeatureMutation()) return;
    const renderToken = this.lifecycleSync.captureRenderToken();
    if (!renderToken) return;
    this.mutationInFlight = true;
    this.store.setFeatureMessage("正在收入行囊……");
    try {
      const result = await this.apiClient.transferHarvest([entryId]);
      if (!this.applyMutationBootstrap(result.bootstrap, renderToken)) return;
      this.store.setFeatureMessage("收获已安全收入行囊或功法库");
    } catch (error) {
      if (!(await this.recoverPlayerVersionConflict(error, renderToken))) {
        this.handleFeatureMutationFailure(error, "收取失败", renderToken);
      }
    } finally {
      this.finishMutation();
    }
  }

  private async salvageHarvest(entryId: string): Promise<void> {
    if (!this.canStartFeatureMutation()) return;
    const renderToken = this.lifecycleSync.captureRenderToken();
    if (!renderToken) return;
    this.mutationInFlight = true;
    this.store.setFeatureMessage("正在分解收获……");
    try {
      const result = await this.apiClient.salvageHarvest([entryId]);
      if (!this.applyMutationBootstrap(result.bootstrap, renderToken)) return;
      this.store.setFeatureMessage(
        `分解完成：灵石 +${result.spiritStoneGained}，强化石 +${result.enhanceStoneGained}`,
      );
    } catch (error) {
      if (!(await this.recoverPlayerVersionConflict(error, renderToken))) {
        this.handleFeatureMutationFailure(error, "分解失败", renderToken);
      }
    } finally {
      this.finishMutation();
    }
  }

  private equipTechnique(techniqueConfigId: string): Promise<void> {
    return this.runLoadoutMutation(
      { kind: "technique.equip", techniqueConfigId },
      "正在运转功法……",
      (options) => this.apiClient.equipTechnique(techniqueConfigId, options),
      "功法已装备",
    );
  }

  private unequipTechnique(techniqueConfigId: string): Promise<void> {
    return this.runLoadoutMutation(
      { kind: "technique.unequip", techniqueConfigId },
      "正在卸下功法……",
      (options) => this.apiClient.unequipTechnique(techniqueConfigId, options),
      "功法已卸下",
    );
  }

  private equipEquipment(
    equipmentInstanceId: string,
    equippedSlot: EquippedEquipmentSlot,
  ): Promise<void> {
    return this.runLoadoutMutation(
      { kind: "equipment.equip", equipmentInstanceId, equippedSlot },
      "正在祭炼法宝……",
      (options) =>
        this.apiClient.equipEquipment(equipmentInstanceId, equippedSlot, options),
      "法宝已装备",
    );
  }

  private unequipEquipment(equipmentInstanceId: string): Promise<void> {
    return this.runLoadoutMutation(
      { kind: "equipment.unequip", equipmentInstanceId },
      "正在收起法宝……",
      (options) => this.apiClient.unequipEquipment(equipmentInstanceId, options),
      "法宝已卸下",
    );
  }

  private async runLoadoutMutation(
    intent: OfflineLoadoutIntent,
    pendingMessage: string,
    mutation: (
      options?: AuthoritativeMutationOptions,
    ) => Promise<LoadoutMutationResult>,
    completedMessage: string,
  ): Promise<void> {
    const mode = this.loadoutMutationMode();
    if (!mode) return;
    if (mode === "offline") {
      this.enqueueOfflineLoadoutOperation(intent);
      return;
    }
    const renderToken = this.lifecycleSync.captureRenderToken();
    if (!renderToken) return;
    this.mutationInFlight = true;
    this.store.setFeatureMessage(pendingMessage);
    try {
      const result = await mutation();
      const previousBootstrap = this.store.snapshot.bootstrap;
      const presentation =
        result.previousTotalPower !== result.totalPower && previousBootstrap
          ? {
            trigger: "power_change" as const,
            sourceId: result.operationId,
            previous: {
              ...previousBootstrap,
              progress: {
                ...previousBootstrap.progress,
                totalPower: result.previousTotalPower,
              },
            },
          }
        : undefined;
      if (
        !this.applyMutationBootstrap(
          result.bootstrap,
          renderToken,
          undefined,
          presentation,
        )
      ) {
        return;
      }
      this.store.setFeatureMessage(
        `${completedMessage}，${describePowerDelta(result.powerDelta)}`,
      );
    } catch (error) {
      if (!(await this.recoverPlayerVersionConflict(error, renderToken))) {
        this.handleFeatureMutationFailure(error, "装备操作失败", renderToken);
      }
    } finally {
      this.finishMutation();
    }
  }

  private enqueueOfflineLoadoutOperation(intent: OfflineLoadoutIntent): void {
    const cache = this.lastAuthoritativeCache;
    const bootstrap = this.store.snapshot.bootstrap;
    if (!cache || !bootstrap) return;

    const queue = this.pendingLoadoutQueue;
    const sequence = queue?.nextSequence ?? 1;
    const operation = createPendingLoadoutOperation(
      intent,
      createClientUuid(),
      sequence,
    );
    const nextQueue = queue
      ? appendOfflineLoadoutOperation(queue, operation)
      : createStoredOfflineLoadoutQueue(
          { accountId: cache.accountId, playerId: cache.playerId },
          cache.playerVersion,
          createClientUuid(),
          operation,
        );
    if (!nextQueue) {
      this.store.setFeatureMessage("离线装备队列已满或操作无效");
      return;
    }

    const preview = applyOfflineLoadoutOperations(
      cache.bootstrap,
      nextQueue.operations,
    );
    const nextCache: StoredBootstrapCache = {
      ...cache,
      pendingLoadoutQueue: nextQueue,
    };
    if (!preview || !isStoredBootstrapCacheEnvelope(nextCache)) {
      this.store.setFeatureMessage("当前装备状态不支持这项离线操作");
      return;
    }
    if (!this.platform.save(CLIENT_CONFIG.bootstrapCacheStorageKey, nextCache)) {
      this.store.setFeatureMessage("设备存储不可用，离线操作未保存");
      return;
    }

    this.pendingLoadoutQueue = nextQueue;
    this.lastAuthoritativeCache = nextCache;
    if (!queue) {
      this.loadoutDrainRetryAttempt = 0;
      this.foregroundSyncRetryAttempt = 0;
    }
    this.store.replaceSnapshot(preview, nextQueue.operations.length);
    this.store.setFeatureMessage(
      `已加入离线装备队列，待同步 ${nextQueue.operations.length} 项`,
    );
  }

  private async drainOfflineLoadoutQueue(): Promise<void> {
    if (this.mutationInFlight || this.destroyed) return;
    const renderToken = this.lifecycleSync.captureRenderToken();
    if (!renderToken || !this.hasLoadoutHeadToDrain()) return;

    this.mutationInFlight = true;
    let synchronizedCount = 0;
    try {
      while (this.hasLoadoutHeadToDrain()) {
        let queue: StoredOfflineLoadoutQueue = this.pendingLoadoutQueue!;
        const resumedAwaitingConfirmation =
          queue.phase === "awaiting_confirmation";
        if (queue.phase === "replaying") {
          if (!this.canReplayFreshlySettledLoadout) {
            const restarted = restartOfflineLoadoutSettlement(
              queue,
              createClientUuid(),
            );
            if (!restarted || !this.persistOfflineLoadoutQueue(restarted)) {
              this.scheduleOfflineLoadoutDrainRetry();
              if (this.lifecycleSync.canRender(renderToken)) {
                this.store.setFeatureMessage(
                  "设备存储不可用，装备操作尚未发送",
                );
              }
              return;
            }
            this.foregroundSyncRetryAttempt = 0;
            this.queueSettlementRetryRequested = true;
            return;
          }
          this.canReplayFreshlySettledLoadout = false;
          const awaiting = beginOfflineLoadoutHead(queue);
          if (!awaiting || !this.persistOfflineLoadoutQueue(awaiting)) {
            this.scheduleOfflineLoadoutDrainRetry();
            if (this.lifecycleSync.canRender(renderToken)) {
              this.store.setFeatureMessage(
                "设备存储不可用，装备操作尚未发送",
              );
            }
            return;
          }
          queue = awaiting;
        }
        if (queue.phase !== "awaiting_confirmation") return;
        const operation: PendingLoadoutOperation | undefined = queue.operations[0];
        if (!operation) {
          this.rollbackOfflineLoadoutQueue("离线装备队列为空，已恢复服务器状态");
          return;
        }
        const result = await this.submitPendingLoadoutOperation(operation, {
          idempotencyKey: operation.operationId,
          expectedPlayerVersion: queue.expectedPlayerVersion,
        });
        const version = this.apiClient.getAuthoritativeSnapshotMetadata()?.playerVersion;
        const isLastOperation = queue.operations.length === 1;
        const remaining: StoredOfflineLoadoutQueue | null = version
          ? acceptOfflineLoadoutHead(queue, operation.operationId, version)
          : null;
        const allowRender = this.lifecycleSync.canRender(renderToken);
        if (!isLastOperation && !remaining) {
          const rolledBack = this.rollbackOfflineLoadoutQueue(
            "离线装备队列响应异常，已恢复服务器状态",
          );
          if (rolledBack) {
            this.persistBootstrap(result.bootstrap, allowRender);
            if (allowRender) {
              this.applySyncedBootstrap(result.bootstrap);
              this.showQueuedLoadoutNotice();
            }
          }
          return;
        }

        const requiresSettlementBeforeTail =
          remaining !== null &&
          (!allowRender || resumedAwaitingConfirmation);
        const nextQueue =
          requiresSettlementBeforeTail
            ? restartOfflineLoadoutSettlement(remaining, createClientUuid())
            : remaining;
        if (
          (remaining && !nextQueue) ||
          !this.persistBootstrapWithOfflineLoadoutQueue(
            result.bootstrap,
            nextQueue,
            allowRender,
          )
        ) {
          this.scheduleOfflineLoadoutDrainRetry();
          if (allowRender) {
            this.store.setFeatureMessage(
              "正在保存同步结果，将使用相同操作编号重试",
            );
          }
          return;
        }
        this.loadoutDrainRetryAttempt = 0;
        synchronizedCount += 1;
        this.canReplayFreshlySettledLoadout =
          allowRender && remaining !== null && !requiresSettlementBeforeTail;
        if (requiresSettlementBeforeTail) {
          this.foregroundSyncRetryAttempt = 0;
          this.queueSettlementRetryRequested = true;
          if (allowRender && !this.showQueuedLoadoutPreview(result.bootstrap)) {
            this.applySyncedBootstrap(result.bootstrap);
            this.showQueuedLoadoutNotice();
          }
          return;
        }
        if (!allowRender) return;
        if (remaining) {
          if (!this.showQueuedLoadoutPreview(result.bootstrap)) {
            this.applySyncedBootstrap(result.bootstrap);
            this.showQueuedLoadoutNotice();
            return;
          }
          continue;
        }

        this.setAuthoritativeReady(result.bootstrap);
        this.requiresFreshAuthoritativeBaseline = false;
        this.store.setFeatureMessage(
          `离线装备操作已同步 ${synchronizedCount} 项`,
        );
        return;
      }
    } catch (error) {
      await this.resolveOfflineLoadoutFailure(error, renderToken);
    } finally {
      this.finishMutation();
    }
  }

  private submitPendingLoadoutOperation(
    operation: PendingLoadoutOperation,
    options: AuthoritativeMutationOptions,
  ): Promise<LoadoutMutationResult> {
    if (operation.kind === "technique.equip") {
      return this.apiClient.equipTechnique(operation.techniqueConfigId, options);
    }
    if (operation.kind === "technique.unequip") {
      return this.apiClient.unequipTechnique(operation.techniqueConfigId, options);
    }
    if (operation.kind === "equipment.equip") {
      return this.apiClient.equipEquipment(
        operation.equipmentInstanceId,
        operation.equippedSlot,
        options,
      );
    }
    return this.apiClient.unequipEquipment(
      operation.equipmentInstanceId,
      options,
    );
  }

  private async resolveOfflineLoadoutFailure(
    error: unknown,
    renderToken: LifecycleRenderToken,
  ): Promise<void> {
    if (isTerminalAuthenticationError(error)) {
      this.apiClient.consumeRejectedStoredSession();
      this.invalidateCachedIdentity(error.message);
      return;
    }
    if (requiresOfflineLoadoutAuthenticationRecovery(error)) {
      if (isStalePlayerResponse(error)) {
        this.requiresFreshAuthoritativeBaseline = true;
      }
      await this.recoverOfflineLoadoutAuthentication(error, renderToken);
      return;
    }
    if (error instanceof ClientApiError && error.retryable) {
      this.retainOfflineLoadoutForRetry(error, renderToken);
      return;
    }

    this.requiresFreshAuthoritativeBaseline = true;
    const message = `${errorMessage(error, "装备操作未通过服务器校验")}，离线队列已回滚`;
    this.rollbackOfflineLoadoutQueue(message);
    try {
      const bootstrap = await this.authenticateAuthoritatively();
      const allowRender = this.lifecycleSync.canRender(renderToken);
      this.requiresFreshAuthoritativeBaseline =
        this.pendingLoadoutRollbackMessage !== null;
      if (!this.pendingLoadoutRollbackMessage) {
        this.persistBootstrap(bootstrap, allowRender);
      }
      if (allowRender) {
        this.store.replaceSnapshot(bootstrap, 0);
        this.store.markReconnecting();
        this.showQueuedLoadoutNotice();
      }
      this.queueSettlementRetryRequested = true;
    } catch (recoveryError) {
      if (this.lifecycleSync.canRender(renderToken)) {
        this.markReadOnlyAfterAuthoritativeFailure(recoveryError, true);
        this.showQueuedLoadoutNotice();
      }
    }
  }

  private async recoverOfflineLoadoutAuthentication(
    error: ClientApiError,
    renderToken: LifecycleRenderToken,
  ): Promise<void> {
    try {
      const bootstrap = await this.authenticateAuthoritatively();
      this.reconcileOfflineLoadoutQueue(bootstrap);
      const allowRender = this.lifecycleSync.canRender(renderToken);
      const canInstallBootstrap = this.canInstallBootstrapForPendingQueue();
      if (canInstallBootstrap) this.persistBootstrap(bootstrap, allowRender);
      this.requiresFreshAuthoritativeBaseline =
        this.pendingLoadoutRollbackMessage !== null;
      if (allowRender) {
        if (!canInstallBootstrap) {
          this.store.markReconnecting();
        } else if (!this.showQueuedLoadoutPreview(bootstrap)) {
          this.store.replaceSnapshot(bootstrap, 0);
          this.store.markReconnecting();
          this.showQueuedLoadoutNotice();
        }
      }
      if (this.hasLoadoutHeadToDrain()) {
        this.loadoutDrainRequested = false;
        this.scheduleOfflineLoadoutDrainRetry();
      } else {
        this.queueSettlementRetryRequested = true;
      }
    } catch (recoveryError) {
      if (isTerminalAuthenticationError(recoveryError)) {
        this.apiClient.consumeRejectedStoredSession();
        this.invalidateCachedIdentity(recoveryError.message);
        return;
      }
      this.retainOfflineLoadoutForRetry(
        recoveryError instanceof ClientApiError ? recoveryError : error,
        renderToken,
      );
    }
  }

  private retainOfflineLoadoutForRetry(
    error: ClientApiError,
    renderToken: LifecycleRenderToken,
  ): void {
    this.loadoutDrainRequested = false;
    this.scheduleOfflineLoadoutDrainRetry();
    if (!this.lifecycleSync.canRender(renderToken)) return;
    if (isClientTransportError(error)) this.markAuthoritativeOffline();
    else this.store.markReconnecting();
    const pendingCount = this.pendingLoadoutQueue?.operations.length ?? 0;
    this.store.setFeatureMessage(
      `${error.message}，仍有 ${pendingCount} 项装备操作待同步`,
    );
  }

  private finishMutation(): void {
    this.mutationInFlight = false;
    if (
      this.pendingLoadoutRollbackMessage &&
      this.finalizePendingLoadoutRollback()
    ) {
      this.queueSettlementRetryRequested = true;
    }
    if (this.loadoutDrainRequested && this.hasLoadoutHeadToDrain()) {
      this.requestOfflineLoadoutDrain();
      return;
    }
    if (this.queueSettlementRetryRequested) {
      this.scheduleForegroundSyncRetry();
    }
    this.lifecycleSync.notifySyncAvailable();
  }

  private hasLoadoutHeadToDrain(): boolean {
    const phase = this.pendingLoadoutQueue?.phase;
    return (
      !this.pendingLoadoutRollbackMessage &&
      (phase === "replaying" || phase === "awaiting_confirmation")
    );
  }

  private requestOfflineLoadoutDrain(): void {
    if (!this.hasLoadoutHeadToDrain() || this.destroyed) return;
    if (this.mutationInFlight || !this.lifecycleSync.captureRenderToken()) {
      this.loadoutDrainRequested = true;
      return;
    }
    this.loadoutDrainRequested = false;
    void this.drainOfflineLoadoutQueue();
  }

  private resumeOfflineLoadoutWork(): void {
    if (this.hasLoadoutHeadToDrain()) {
      this.requestOfflineLoadoutDrain();
    } else if (this.queueSettlementRetryRequested) {
      this.scheduleForegroundSyncRetry();
    }
  }

  private scheduleOfflineLoadoutDrainRetry(): void {
    if (this.loadoutDrainRetryScheduled || this.destroyed) return;
    const delaySeconds = Math.min(
      30,
      2 ** Math.min(this.loadoutDrainRetryAttempt, 5),
    );
    this.loadoutDrainRetryAttempt += 1;
    this.loadoutDrainRetryScheduled = true;
    this.scheduleOnce(() => {
      this.loadoutDrainRetryScheduled = false;
      this.requestOfflineLoadoutDrain();
    }, delaySeconds);
  }

  private scheduleForegroundSyncRetry(): void {
    if (
      this.foregroundSyncRetryScheduled ||
      this.destroyed ||
      !this.lifecycleSync.captureRenderToken()
    ) {
      return;
    }
    const delaySeconds = Math.min(
      30,
      2 ** Math.min(this.foregroundSyncRetryAttempt, 5),
    );
    this.foregroundSyncRetryAttempt += 1;
    this.foregroundSyncRetryScheduled = true;
    this.scheduleOnce(() => {
      this.foregroundSyncRetryScheduled = false;
      if (
        !this.queueSettlementRetryRequested ||
        !this.lifecycleSync.captureRenderToken()
      ) {
        return;
      }
      this.queueSettlementRetryRequested = false;
      this.lifecycleSync.requestForegroundSync();
    }, delaySeconds);
  }

  private handleFeatureMutationFailure(
    error: unknown,
    fallback: string,
    renderToken: LifecycleRenderToken,
  ): void {
    if (!this.lifecycleSync.canRender(renderToken)) return;
    if (isClientTransportError(error)) {
      this.markAuthoritativeOffline();
      return;
    }
    this.store.setFeatureMessage(errorMessage(error, fallback));
  }

  private canStartFeatureMutation(): boolean {
    if (!canRunAuthoritativeMutation(this.store.snapshot)) {
      if (this.store.snapshot.bootstrap) {
        this.store.setFeatureMessage("当前为离线数据，联网同步后可继续操作");
      }
      return false;
    }
    return (
      !this.mutationInFlight &&
      !this.offlineDismissPending &&
      Date.now() >= this.modalInputLockedUntil &&
      !this.store.snapshot.bootstrap?.offlineSettlement
    );
  }

  private loadoutMutationMode(): "online" | "offline" | null {
    if (
      this.requiresFreshAuthoritativeBaseline ||
      this.pendingLoadoutRollbackMessage
    ) {
      this.store.setFeatureMessage("服务器数据尚未核对完成，请稍后再试");
      return null;
    }
    if (!canRunLoadoutMutation(this.store.snapshot)) {
      if (this.store.snapshot.bootstrap) {
        this.store.setFeatureMessage("正在核对服务器状态，请稍后再试");
      }
      return null;
    }
    if (
      this.mutationInFlight ||
      this.offlineDismissPending ||
      Date.now() < this.modalInputLockedUntil ||
      this.store.snapshot.bootstrap?.offlineSettlement
    ) {
      return null;
    }
    if (this.store.snapshot.syncStatus === "online") return "online";

    const cache = this.lastAuthoritativeCache;
    const bootstrap = this.store.snapshot.bootstrap;
    if (
      !cache ||
      !bootstrap ||
      cache.accountId !== bootstrap.account.id ||
      cache.playerId !== bootstrap.player.id
    ) {
      this.store.setFeatureMessage("本地权威基线不可用，联网核对后再试");
      return null;
    }
    return "offline";
  }

  private applyPendingProfileBootstrap(): void {
    const pendingBootstrap = this.pendingProfileBootstrap;
    this.pendingProfileBootstrap = null;
    if (pendingBootstrap) this.applyDeferredProfileBootstrap(pendingBootstrap);
  }

  private applyDeferredProfileBootstrap(bootstrap: BootstrapSnapshot): void {
    if (this.store.snapshot.syncStatus === "online") {
      this.setAuthoritativeReady(bootstrap);
    } else {
      this.store.replaceSnapshot(bootstrap);
    }
  }

  private async recoverPlayerVersionConflict(
    error: unknown,
    renderToken: LifecycleRenderToken,
    deferWhileProfileOpen = false,
  ): Promise<boolean> {
    if (isTerminalAuthenticationError(error)) {
      this.apiClient.consumeRejectedStoredSession();
      this.invalidateCachedIdentity(error.message);
      return true;
    }
    if (!requiresAuthoritativeRecovery(error)) {
      return false;
    }
    if (isPlayerVersionConflict(error)) {
      this.requiresFreshAuthoritativeBaseline = true;
    }

    try {
      const bootstrap = await this.authenticateAuthoritatively();
      this.requiresFreshAuthoritativeBaseline = false;
      const allowRender = this.lifecycleSync.canRender(renderToken);
      this.persistBootstrap(bootstrap, allowRender);
      if (!allowRender) return true;
      if (
        deferWhileProfileOpen &&
        this.isProfileOpen() &&
        hasSameBootstrapIdentity(this.store.snapshot.bootstrap, bootstrap)
      ) {
        this.pendingProfileBootstrap = bootstrap;
        return true;
      }
      this.pendingProfileBootstrap = null;
      this.setAuthoritativeReady(bootstrap);
      return true;
    } catch (recoveryError) {
      if (this.lifecycleSync.canRender(renderToken)) {
        this.markReadOnlyAfterAuthoritativeFailure(recoveryError, true);
      }
      return true;
    }
  }

  private setAuthoritativeReady(
    bootstrap: BootstrapSnapshot,
    presentation?: CultivationPresentationEvidence,
  ): void {
    if (this.pendingLoadoutRollbackMessage) {
      this.store.replaceSnapshot(bootstrap, 0);
      this.store.markReconnecting();
      return;
    }
    this.requiresFreshAuthoritativeBaseline = false;
    const current = this.store.snapshot.bootstrap;
    if (current && !hasSameBootstrapIdentity(current, bootstrap)) {
      this.pendingProfileBootstrap = null;
    }
    this.enqueueCultivationPresentation(bootstrap, presentation);
    const syncAt = this.apiClient.getAuthoritativeSnapshotMetadata()?.lastSuccessfulSyncAt;
    if (syncAt) this.store.setReady(bootstrap, syncAt);
    else this.store.setReady(bootstrap);
  }

  private enqueueCultivationPresentation(
    bootstrap: BootstrapSnapshot,
    presentation?: CultivationPresentationEvidence,
  ): void {
    if (!presentation || !this.appView) return;
    const sourceKey = presentation.sourceId
      ? `${bootstrap.account.id}:${bootstrap.player.id}:${presentation.trigger}:${presentation.sourceId}`
      : null;
    if (sourceKey && this.presentedCultivationSources.has(sourceKey)) return;
    const plan = planCultivationPresentation(
      presentation.previous ?? this.store.snapshot.bootstrap,
      bootstrap,
      presentation.trigger,
    );
    if (!plan) return;
    if (sourceKey) {
      if (this.presentedCultivationSources.size >= 64) {
        const oldest = this.presentedCultivationSources.values().next().value;
        if (oldest) this.presentedCultivationSources.delete(oldest);
      }
      this.presentedCultivationSources.add(sourceKey);
    }
    this.appView.enqueueCultivationPresentation(plan);
  }

  private markAuthoritativeOnline(): void {
    if (this.pendingLoadoutRollbackMessage) {
      this.store.markReconnecting();
      return;
    }
    const syncAt = this.apiClient.getAuthoritativeSnapshotMetadata()?.lastSuccessfulSyncAt;
    if (syncAt) this.store.markOnline(syncAt);
    else this.store.markOnline();
  }

  private markAuthoritativeOffline(): void {
    if (this.requiresFreshAuthoritativeBaseline) {
      this.store.markReconnecting();
      return;
    }
    const syncAt = this.apiClient.getAuthoritativeSnapshotMetadata()?.lastSuccessfulSyncAt;
    if (syncAt) this.store.markOffline(syncAt);
    else this.store.markOffline();
  }

  private markReadOnlyAfterAuthoritativeFailure(
    error: unknown,
    authoritativeRecoveryFailed = false,
  ): boolean {
    const status = classifyAuthoritativeFailure(error, authoritativeRecoveryFailed);
    if (!status || !this.store.snapshot.bootstrap) return false;
    if (status === "offline") this.markAuthoritativeOffline();
    else this.store.markReconnecting();
    return true;
  }

  private restoreCachedPreview(): void {
    const cache = getRestorableBootstrapCache(
      this.platform.load<unknown>(CLIENT_CONFIG.sessionStorageKey),
      this.platform.load<unknown>(CLIENT_CONFIG.bootstrapCacheStorageKey),
    );
    if (!cache) return;

    this.pendingLoadoutQueue = cache.pendingLoadoutQueue;
    this.lastAuthoritativeCache = cache;
    let preview = this.pendingLoadoutQueue
      ? applyOfflineLoadoutOperations(
          cache.bootstrap,
          this.pendingLoadoutQueue.operations,
        )
      : cache.bootstrap;
    if (!preview) {
      this.rollbackOfflineLoadoutQueue(
        "离线装备操作已失效，当前显示服务器状态",
      );
      preview = this.lastAuthoritativeCache?.bootstrap ?? cache.bootstrap;
    }

    this.store.setCachedPreview(
      preview,
      this.lastAuthoritativeCache?.lastSuccessfulSyncAt ??
        cache.lastSuccessfulSyncAt,
      this.pendingLoadoutRollbackMessage
        ? 0
        : this.pendingLoadoutQueue?.operations.length ?? 0,
    );
  }

  private async authenticateAuthoritatively(): Promise<BootstrapSnapshot> {
    this.canReplayFreshlySettledLoadout = false;
    try {
      const bootstrap = await this.apiClient.authenticate();
      this.apiClient.consumeRejectedStoredSession();
      return bootstrap;
    } catch (error) {
      if (this.apiClient.consumeRejectedStoredSession()) {
        this.invalidateCachedIdentity(errorMessage(error, "登录状态已失效"));
      }
      throw error;
    }
  }

  private invalidateCachedIdentity(message: string): void {
    this.lastAuthoritativeCache = null;
    this.pendingProfileBootstrap = null;
    this.pendingLoadoutQueue = null;
    this.loadoutDrainRequested = false;
    this.queueSettlementRetryRequested = false;
    this.loadoutDrainRetryAttempt = 0;
    this.foregroundSyncRetryAttempt = 0;
    this.confirmingPreviouslyAttemptedSettlement = false;
    this.canReplayFreshlySettledLoadout = false;
    this.pendingLoadoutRollbackMessage = null;
    this.requiresFreshAuthoritativeBaseline = false;
    this.queuedLoadoutNotice = null;
    this.presentedCultivationSources.clear();
    this.platform.remove(CLIENT_CONFIG.sessionStorageKey);
    this.platform.remove(CLIENT_CONFIG.bootstrapCacheStorageKey);
    this.store.setAuthenticationError(message);
  }

  private persistOfflineSettlementDismissal(identity: {
    accountId: string;
    playerId: string;
    settlementId: string;
  }): void {
    const cache = this.lastAuthoritativeCache;
    if (!cache) return;
    const dismissed = dismissCachedOfflineSettlement(cache, identity);
    if (dismissed === cache) return;
    this.lastAuthoritativeCache = dismissed;
    this.platform.save(CLIENT_CONFIG.bootstrapCacheStorageKey, dismissed);
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ClientApiError || error instanceof Error
    ? error.message
    : fallback;
}

function isPlayerVersionConflict(error: unknown): boolean {
  return error instanceof ClientApiError && error.code === "PLAYER_VERSION_CONFLICT";
}

function isStalePlayerResponse(error: unknown): boolean {
  return error instanceof ClientApiError && error.code === "STALE_PLAYER_RESPONSE";
}

function requiresOfflineLoadoutAuthenticationRecovery(
  error: unknown,
): error is ClientApiError {
  return (
    error instanceof ClientApiError &&
    (error.code === "UNAUTHENTICATED" ||
      error.code === "SESSION_EXPIRED" ||
      error.code === "STALE_PLAYER_RESPONSE")
  );
}

function createPendingLoadoutOperation(
  intent: OfflineLoadoutIntent,
  operationId: string,
  sequence: number,
): PendingLoadoutOperation {
  return { ...intent, operationId, sequence };
}

function describePowerDelta(powerDelta: string): string {
  const normalized = powerDelta.replace(/^\+/, "");
  if (/^-?0+$/.test(normalized)) return "战力不变";
  if (normalized.startsWith("-")) return `战力 ${normalized}`;
  if (/^[0-9]+$/.test(normalized)) return `战力 +${normalized}`;
  return "战力不变";
}

function isDebugGrantTarget(value: unknown): value is DebugGrantTarget {
  return (
    value === "fill_experience" ||
    value === "spirit_stone" ||
    value === "breakthrough_pill"
  );
}

function debugGrantSuccessMessage(result: DebugGrantResult): string {
  if (result.target === "spirit_stone") {
    return `灵石注入完成：+${result.grantedAmount}，当前 ${result.balanceAfter}`;
  }
  if (result.target === "breakthrough_pill") {
    return `突破丹注入完成：+${result.grantedAmount}，当前 ${result.balanceAfter}`;
  }
  if (result.reachedBreakthrough) {
    return `修为注入完成：+${result.grantedAmount}，已到达突破瓶颈`;
  }
  return `修为注入完成：+${result.grantedAmount}，Lv.${result.fromLevel} → Lv.${result.toLevel}`;
}

function hasLevelUpEvent(events: readonly ProgressionEvent[]): boolean {
  return events.some((event) => event.type === "level_up");
}
