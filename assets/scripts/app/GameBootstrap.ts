import { _decorator, Component, Node, ResolutionPolicy, view } from "cc";
import type {
  BootstrapSnapshot,
  ChosenAvatarVariant,
  EquippedEquipmentSlot,
  LoadoutMutationResult,
} from "@cultivation-diary/shared";
import { CLIENT_CONFIG } from "../core/ClientConfig";
import {
  canRunAuthoritativeMutation,
  createStoredBootstrapCache,
  dismissCachedOfflineSettlement,
  getRestorableBootstrapCache,
  hasSameBootstrapIdentity,
  shouldInstallDeferredIdentityPreview,
} from "../core/ClientTypes";
import type { StoredBootstrapCache } from "../core/ClientTypes";
import {
  LifecycleSyncCoordinator,
  type LifecycleRenderToken,
} from "../core/LifecycleSyncCoordinator";
import {
  ApiClient,
  ClientApiError,
  classifyAuthoritativeFailure,
  isClientTransportError,
  isTerminalAuthenticationError,
  requiresAuthoritativeRecovery,
} from "../services/ApiClient";
import { createPlatformAdapter } from "../platform/PlatformAdapter";
import { AppStore } from "../state/AppStore";
import { AppView } from "../ui/AppView";

const { ccclass } = _decorator;

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
  private readonly lifecycleSync = new LifecycleSyncCoordinator<BootstrapSnapshot>({
    intervalSeconds: CLIENT_CONFIG.heartbeatIntervalSeconds,
    schedule: (callback, intervalSeconds) => this.schedule(callback, intervalSeconds),
    unschedule: (callback) => this.unschedule(callback),
    persistCurrentSnapshot: () => this.persistCurrentBootstrap(),
    canStartSync: () =>
      !this.mutationInFlight &&
      (this.store.snapshot.phase === "ready" || this.lastAuthoritativeCache !== null),
    setSyncInFlight: (inFlight) => {
      this.mutationInFlight = inFlight;
    },
    started: (reason, allowRender) => {
      if (
        allowRender &&
        (reason === "show" || this.store.snapshot.syncStatus === "offline")
      ) {
        this.store.markReconnecting();
      }
    },
    sync: async () => (await this.apiClient.syncHeartbeat()).bootstrap,
    recover: (error) => this.recoverHeartbeat(error),
    reject: (error, allowRender) => this.handleHeartbeatFailure(error, allowRender),
    accept: (bootstrap, allowRender) =>
      this.acceptHeartbeatBootstrap(bootstrap, allowRender),
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
      openFeature: (feature) => this.store.openFeature(feature),
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
      feedback: () => this.platform.feedback(),
    });
    this.unsubscribe = this.store.subscribe((state) => this.appView?.render(state));
    this.schedule(() => this.appView?.updateIdleAnimation(), 0.5);
    this.lifecycleSync.start();
    this.unsubscribeLifecycle = this.platform.subscribeLifecycle({
      onShow: () => {
        this.lifecycleSync.handleShow();
        if (
          this.lastAuthoritativeCache === null &&
          this.store.snapshot.phase !== "ready"
        ) {
          void this.startGame();
        }
      },
      onHide: () => this.lifecycleSync.handleHide(),
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
      const allowRender = this.lifecycleSync.canRender(renderToken);
      this.persistBootstrap(bootstrap, allowRender);
      if (allowRender) {
        this.setAuthoritativeReady(bootstrap);
        settleAfterAuthentication = true;
      }
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

  private async settleGame(): Promise<void> {
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
      const result = await this.apiClient.settleCultivation();
      const allowRender = this.lifecycleSync.canRender(renderToken);
      this.persistBootstrap(result.bootstrap, allowRender);
      if (!allowRender) return;
      this.applySyncedBootstrap(result.bootstrap);
    } catch (error) {
      let recoveredBootstrap: BootstrapSnapshot | null = null;
      try {
        recoveredBootstrap = await this.recoverHeartbeat(error);
      } catch (recoveryError) {
        if (this.lifecycleSync.canRender(renderToken)) {
          this.markReadOnlyAfterAuthoritativeFailure(recoveryError, true);
        }
        return;
      }
      if (recoveredBootstrap) {
        const allowRender = this.lifecycleSync.canRender(renderToken);
        this.persistBootstrap(recoveredBootstrap, allowRender);
        if (allowRender) {
          this.applySyncedBootstrap(recoveredBootstrap);
        }
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

  private acceptHeartbeatBootstrap(
    bootstrap: BootstrapSnapshot,
    allowRender: boolean,
  ): void {
    this.persistBootstrap(bootstrap, allowRender);
    if (allowRender && !this.destroyed) this.applySyncedBootstrap(bootstrap);
  }

  private applySyncedBootstrap(bootstrap: BootstrapSnapshot): void {
    if (
      this.isProfileOpen() &&
      hasSameBootstrapIdentity(this.store.snapshot.bootstrap, bootstrap)
    ) {
      this.pendingProfileBootstrap = bootstrap;
      if (this.store.snapshot.syncStatus !== "online") {
        this.markAuthoritativeOnline();
      }
    } else {
      this.setAuthoritativeReady(bootstrap);
    }
  }

  private persistCurrentBootstrap(): void {
    if (this.lastAuthoritativeCache) {
      this.platform.save(
        CLIENT_CONFIG.bootstrapCacheStorageKey,
        this.lastAuthoritativeCache,
      );
    }
  }

  private persistBootstrap(
    bootstrap: BootstrapSnapshot,
    allowRender: boolean,
  ): void {
    if (this.destroyed) return;
    const metadata = this.apiClient.getAuthoritativeSnapshotMetadata();
    if (!metadata) return;
    const cache = createStoredBootstrapCache(
      bootstrap,
      metadata,
      this.store.snapshot.bootstrap,
    );
    if (!cache) return;

    this.lastAuthoritativeCache = cache;
    this.platform.save(CLIENT_CONFIG.bootstrapCacheStorageKey, cache);
    if (
      shouldInstallDeferredIdentityPreview(
        this.store.snapshot.bootstrap,
        bootstrap,
        allowRender,
      )
    ) {
      this.pendingProfileBootstrap = null;
      this.store.setCachedPreview(cache.bootstrap, cache.lastSuccessfulSyncAt);
    }
  }

  private applyMutationBootstrap(
    bootstrap: BootstrapSnapshot,
    renderToken: LifecycleRenderToken,
    beforeApply?: () => void,
  ): boolean {
    const allowRender = this.lifecycleSync.canRender(renderToken);
    this.persistBootstrap(bootstrap, allowRender);
    if (!allowRender) return false;

    this.pendingProfileBootstrap = null;
    beforeApply?.();
    this.setAuthoritativeReady(bootstrap);
    return true;
  }

  private async recoverHeartbeat(error: unknown): Promise<BootstrapSnapshot | null> {
    if (isTerminalAuthenticationError(error)) {
      this.apiClient.consumeRejectedStoredSession();
      this.invalidateCachedIdentity(error.message);
      return null;
    }
    if (!requiresAuthoritativeRecovery(error)) {
      return null;
    }

    try {
      return await this.authenticateAuthoritatively();
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
      this.lifecycleSync.requestForegroundSync();
    } else if (this.mutationInFlight) {
      this.startupRetryRequested = true;
    } else if (this.store.snapshot.phase === "error") {
      void this.startGame();
    }
  }

  private handleNetworkOffline(): void {
    if (this.destroyed || !this.store.snapshot.bootstrap) return;
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
    this.store.closeFeature();
    if (pendingBootstrap) this.applyDeferredProfileBootstrap(pendingBootstrap);
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
      this.applyMutationBootstrap(result.bootstrap, renderToken);
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
      if (!this.applyMutationBootstrap(result.bootstrap, renderToken)) return;
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
      "正在运转功法……",
      () => this.apiClient.equipTechnique(techniqueConfigId),
      "功法已装备",
    );
  }

  private unequipTechnique(techniqueConfigId: string): Promise<void> {
    return this.runLoadoutMutation(
      "正在卸下功法……",
      () => this.apiClient.unequipTechnique(techniqueConfigId),
      "功法已卸下",
    );
  }

  private equipEquipment(
    equipmentInstanceId: string,
    equippedSlot: EquippedEquipmentSlot,
  ): Promise<void> {
    return this.runLoadoutMutation(
      "正在祭炼法宝……",
      () => this.apiClient.equipEquipment(equipmentInstanceId, equippedSlot),
      "法宝已装备",
    );
  }

  private unequipEquipment(equipmentInstanceId: string): Promise<void> {
    return this.runLoadoutMutation(
      "正在收起法宝……",
      () => this.apiClient.unequipEquipment(equipmentInstanceId),
      "法宝已卸下",
    );
  }

  private async runLoadoutMutation(
    pendingMessage: string,
    mutation: () => Promise<LoadoutMutationResult>,
    completedMessage: string,
  ): Promise<void> {
    if (!this.canStartFeatureMutation()) return;
    const renderToken = this.lifecycleSync.captureRenderToken();
    if (!renderToken) return;
    this.mutationInFlight = true;
    this.store.setFeatureMessage(pendingMessage);
    try {
      const result = await mutation();
      if (!this.applyMutationBootstrap(result.bootstrap, renderToken)) return;
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

  private finishMutation(): void {
    this.mutationInFlight = false;
    this.lifecycleSync.notifySyncAvailable();
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

    try {
      const bootstrap = await this.authenticateAuthoritatively();
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

  private setAuthoritativeReady(bootstrap: BootstrapSnapshot): void {
    const current = this.store.snapshot.bootstrap;
    if (current && !hasSameBootstrapIdentity(current, bootstrap)) {
      this.pendingProfileBootstrap = null;
    }
    const syncAt = this.apiClient.getAuthoritativeSnapshotMetadata()?.lastSuccessfulSyncAt;
    if (syncAt) this.store.setReady(bootstrap, syncAt);
    else this.store.setReady(bootstrap);
  }

  private markAuthoritativeOnline(): void {
    const syncAt = this.apiClient.getAuthoritativeSnapshotMetadata()?.lastSuccessfulSyncAt;
    if (syncAt) this.store.markOnline(syncAt);
    else this.store.markOnline();
  }

  private markAuthoritativeOffline(): void {
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

    this.lastAuthoritativeCache = cache;
    this.store.setCachedPreview(cache.bootstrap, cache.lastSuccessfulSyncAt);
  }

  private async authenticateAuthoritatively(): Promise<BootstrapSnapshot> {
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

function describePowerDelta(powerDelta: string): string {
  const normalized = powerDelta.replace(/^\+/, "");
  if (/^-?0+$/.test(normalized)) return "战力不变";
  if (normalized.startsWith("-")) return `战力 ${normalized}`;
  if (/^[0-9]+$/.test(normalized)) return `战力 +${normalized}`;
  return "战力不变";
}
