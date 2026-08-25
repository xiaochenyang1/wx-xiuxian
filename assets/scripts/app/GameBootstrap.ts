import { _decorator, Component, Node, ResolutionPolicy, view } from "cc";
import { DEBUG } from "cc/env";
import type {
  AutoSalvageQuality,
  BootstrapSnapshot,
  ChosenAvatarVariant,
  DebugGrantTarget,
  EquippedEquipmentSlot,
  ProgressionEvent,
} from "@cultivation-diary/shared";
import { loadMainBackgroundArt, loadSupplementalArt } from "../core/AppArt";
import { CLIENT_CONFIG } from "../core/ClientConfig";
import {
  planCultivationPresentation,
  type CultivationPresentationTrigger,
} from "../core/CultivationPresentation";
import {
  DEFAULT_DESIGN_SAFE_AREA_LAYOUT,
  DESIGN_VIEWPORT_HEIGHT,
  DESIGN_VIEWPORT_WIDTH,
  resolveDesignResolutionMode,
} from "../core/SafeArea";
import { createPlatformAdapter } from "../platform/PlatformAdapter";
import {
  LocalGameError,
  LocalGameService,
  type LocalMutationResult,
} from "../services/LocalGameService";
import { AppStore } from "../state/AppStore";
import { AppView } from "../ui/AppView";

const { ccclass } = _decorator;

@ccclass("GameBootstrap")
export class GameBootstrap extends Component {
  private readonly store = new AppStore();
  private readonly platform = createPlatformAdapter();
  private readonly localGame = new LocalGameService(this.platform);
  private appView: AppView | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private unsubscribeLifecycle: (() => void) | null = null;
  private mutationInFlight = false;
  private foreground = true;
  private destroyed = false;

  onLoad(): void {
    const safeAreaLayout =
      this.platform.getSafeAreaLayout?.() ?? DEFAULT_DESIGN_SAFE_AREA_LAYOUT;
    view.setDesignResolutionSize(
      DESIGN_VIEWPORT_WIDTH,
      DESIGN_VIEWPORT_HEIGHT,
      resolveDesignResolutionMode(safeAreaLayout) === "fixed-height"
        ? ResolutionPolicy.FIXED_HEIGHT
        : ResolutionPolicy.FIXED_WIDTH,
    );

    const appRoot = new Node("AppRoot");
    appRoot.layer = this.node.layer;
    this.node.addChild(appRoot);
    const appView = new AppView(
      appRoot,
      {
        retry: () => this.startGame(),
        resetProgress: () => this.resetProgress(),
        exportProgressBackup: () => void this.exportProgressBackup(),
        importProgressBackup: () => void this.importProgressBackup(),
        restoreImportRecovery: () => this.restoreImportRecovery(),
        hasImportRecovery: () => this.localGame.hasImportRecovery(),
        selectTab: (tab) => this.store.selectTab(tab),
        openFeature: (feature) => this.store.openFeature(feature),
        closeFeature: () => this.store.closeFeature(),
        breakthrough: () =>
          this.runMutation(() => this.localGame.breakthrough(), "breakthrough"),
        chooseAvatar: (avatarVariant) => this.chooseAvatar(avatarVariant),
        renamePlayer: (displayName) => this.renamePlayer(displayName),
        markPartnerUnlockNoticeSeen: () =>
          this.runMutation(() => this.localGame.markPartnerUnlockNoticeSeen()),
        expandInventory: () =>
          this.runMutation(() => this.localGame.expandInventory()),
        upgradeCaveBuilding: (buildingConfigId) =>
          this.runMutation(
            () => this.localGame.upgradeCaveBuilding(buildingConfigId),
            "power_change",
          ),
        challengeExpedition: (stageConfigId) =>
          this.runMutation(() => this.localGame.challengeExpedition(stageConfigId)),
        sweepExpedition: (stageConfigId) =>
          this.runMutation(() => this.localGame.sweepExpedition(stageConfigId)),
        challengeTrialTower: (floor) =>
          this.runMutation(() => this.localGame.challengeTrialTower(floor)),
        huntTreasure: () =>
          this.runMutation(() => this.localGame.huntTreasure()),
        brewAlchemy: (recipeId) =>
          this.runMutation(() => this.localGame.brewAlchemy(recipeId)),
        brewAlchemyBatch: (recipeId) =>
          this.runMutation(() => this.localGame.brewAlchemyBatch(recipeId)),
        craftEquipment: (recipeId) =>
          this.runMutation(() => this.localGame.craftEquipment(recipeId)),
        craftEquipmentBatch: (recipeId) =>
          this.runMutation(() => this.localGame.craftEquipmentBatch(recipeId)),
        choosePartner: (partnerId) =>
          this.runMutation(
            () => this.localGame.choosePartner(partnerId),
            "power_change",
          ),
        cultivateWithPartner: () =>
          this.runMutation(
            () => this.localGame.cultivateWithPartner(),
            "power_change",
          ),
        joinSect: (sectId) =>
          this.runMutation(() => this.localGame.joinSect(sectId), "power_change"),
        donateToSect: () =>
          this.runMutation(() => this.localGame.donateToSect(), "power_change"),
        upgradeTechnique: (techniqueConfigId) =>
          this.runMutation(
            () => this.localGame.upgradeTechnique(techniqueConfigId),
            "power_change",
          ),
        useInventoryItem: (itemConfigId) =>
          this.runMutation(() => this.localGame.useInventoryItem(itemConfigId)),
        useAllInventoryItems: (itemConfigId) =>
          this.runMutation(() => this.localGame.useAllInventoryItems(itemConfigId)),
        transferHarvest: (entryId) =>
          this.runMutation(() => this.localGame.transferHarvest(entryId)),
        collectAllHarvest: () =>
          this.runMutation(() => this.localGame.collectAllHarvest()),
        salvageHarvest: (entryId) =>
          this.runMutation(() => this.localGame.salvageHarvest(entryId)),
        salvageLowQualityHarvest: () =>
          this.runMutation(() => this.localGame.salvageLowQualityHarvest()),
        toggleAutoSalvage: (quality: AutoSalvageQuality) =>
          this.runMutation(() => this.localGame.toggleAutoSalvage(quality)),
        equipTechnique: (techniqueConfigId) =>
          this.runMutation(
            () => this.localGame.equipTechnique(techniqueConfigId),
            "power_change",
          ),
        unequipTechnique: (techniqueConfigId) =>
          this.runMutation(
            () => this.localGame.unequipTechnique(techniqueConfigId),
            "power_change",
          ),
        equipEquipment: (equipmentInstanceId, equippedSlot) =>
          this.equipEquipment(equipmentInstanceId, equippedSlot),
        unequipEquipment: (equipmentInstanceId) =>
          this.runMutation(
            () => this.localGame.unequipEquipment(equipmentInstanceId),
            "power_change",
          ),
        enhanceEquipment: (equipmentInstanceId) =>
          this.runMutation(
            () => this.localGame.enhanceEquipment(equipmentInstanceId),
            "power_change",
          ),
        // Rerolling never touches power, so it takes the default trigger: the
        // affix line and the toast carry the whole result.
        rerollEquipmentAffixes: (equipmentInstanceId) =>
          this.runMutation(() =>
            this.localGame.rerollEquipmentAffixes(equipmentInstanceId),
          ),
        ascendEquipment: (equipmentInstanceId) =>
          this.runMutation(
            () => this.localGame.ascendEquipment(equipmentInstanceId),
            "power_change",
          ),
        toggleEquipmentLock: (equipmentInstanceId) =>
          this.runMutation(() =>
            this.localGame.toggleEquipmentLock(equipmentInstanceId),
          ),
        salvageEquipment: (equipmentInstanceId) =>
          this.runMutation(() =>
            this.localGame.salvageEquipment(equipmentInstanceId),
          ),
        dismissOfflineSettlement: () => this.dismissOfflineSettlement(),
        simulateOffline: (seconds, seed) => this.debugSimulateOffline(seconds, seed),
        grantDebug: (target) => this.debugGrant(target),
        resetDebugSave: (playerId, confirmation) =>
          this.debugResetSave(playerId, confirmation),
        feedback: () => this.platform.feedback(),
      },
      safeAreaLayout,
    );
    this.appView = appView;
    this.unsubscribeStore = this.store.subscribe((state) => appView.render(state));

    void loadMainBackgroundArt()
      .then((art) => {
        if (!this.destroyed && this.appView === appView) appView.setMainBackgroundArt(art);
      })
      .catch((error: unknown) => {
        if (DEBUG) console.warn("Main background art unavailable", error);
      });

    void loadSupplementalArt().then((art) => {
      if (!this.destroyed && this.appView === appView) appView.setSupplementalArt(art);
    });

    this.schedule(
      (deltaSeconds: number) => this.appView?.updateIdleAnimation(deltaSeconds),
      0.5,
    );
    this.schedule(() => this.checkpoint(), CLIENT_CONFIG.autoSaveIntervalSeconds);
    this.unsubscribeLifecycle = this.platform.subscribeLifecycle({
      onHide: () => {
        if (!this.foreground) return;
        this.appView?.setDebugLifecycleStatus("background");
        this.checkpoint();
        this.foreground = false;
      },
      onShow: () => {
        if (this.foreground) return;
        this.foreground = true;
        this.appView?.setDebugLifecycleStatus("foreground");
        this.resumeFromBackground();
      },
    });
    this.startGame();
  }

  onDestroy(): void {
    if (this.destroyed) return;
    if (this.foreground && this.store.snapshot.phase === "ready") {
      this.checkpoint(true);
    }
    this.destroyed = true;
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.unsubscribeLifecycle?.();
    this.unsubscribeLifecycle = null;
    this.appView?.destroy();
    this.appView = null;
  }

  private startGame(): void {
    if (this.destroyed || this.mutationInFlight) return;
    this.mutationInFlight = true;
    this.store.setLoading("正在展开本地仙卷");
    try {
      const result = this.localGame.initialize();
      this.store.setReady(
        result.snapshot,
        result.savedAt,
        result.persisted ? "saved" : "volatile",
      );
      this.enqueuePresentation(
        result.snapshot,
        result.events,
        result.previous,
      );
    } catch (error) {
      this.store.setError(localErrorMessage(error, "本地存档读取失败，请重试"));
    } finally {
      this.mutationInFlight = false;
    }
  }

  private checkpoint(force = false): void {
    if (
      this.destroyed ||
      (!force && !this.foreground) ||
      this.mutationInFlight ||
      this.store.snapshot.phase !== "ready"
    ) {
      return;
    }
    if (!this.store.snapshot.bootstrap) return;
    try {
      const result = this.localGame.checkpoint();
      this.store.replaceSnapshot(
        result.snapshot,
        result.savedAt,
        result.persisted ? "saved" : "volatile",
      );
      this.enqueuePresentation(
        result.snapshot,
        result.events,
        result.previous,
      );
    } catch (error) {
      if (DEBUG) console.warn("Local checkpoint failed", error);
      this.store.setStorageStatus("volatile");
    }
  }

  private resumeFromBackground(): void {
    if (
      this.destroyed ||
      this.mutationInFlight ||
      this.store.snapshot.phase !== "ready"
    ) {
      return;
    }
    if (!this.store.snapshot.bootstrap) return;
    try {
      const result = this.localGame.resume();
      this.store.replaceSnapshot(
        result.snapshot,
        result.savedAt,
        result.persisted ? "saved" : "volatile",
      );
      this.enqueuePresentation(
        result.snapshot,
        result.events,
        result.previous,
      );
    } catch (error) {
      if (DEBUG) console.warn("Local resume settlement failed", error);
      this.store.setStorageStatus("volatile");
    }
  }

  private runMutation(
    operation: () => LocalMutationResult,
    requestedTrigger?: CultivationPresentationTrigger,
  ): void {
    if (
      this.destroyed ||
      this.mutationInFlight ||
      this.store.snapshot.phase !== "ready"
    ) {
      return;
    }
    this.mutationInFlight = true;
    this.store.setFeatureMessage(null);
    try {
      const result = operation();
      const trigger = requestedTrigger ?? presentationTrigger(result.events);
      if (trigger) {
        const plan = planCultivationPresentation(
          result.previous,
          result.snapshot,
          trigger,
        );
        if (plan) this.appView?.enqueueCultivationPresentation(plan);
      }
      this.store.replaceSnapshot(
        result.snapshot,
        this.localGame.savedAt,
        this.localGame.persistenceAvailable ? "saved" : "volatile",
      );
      if (result.message) this.store.setFeatureMessage(result.message);
    } catch (error) {
      this.store.replaceSnapshot(
        this.localGame.snapshot,
        this.localGame.savedAt,
        this.localGame.persistenceAvailable ? "saved" : "volatile",
      );
      this.store.setFeatureMessage(localErrorMessage(error, "本地操作未完成"));
    } finally {
      this.mutationInFlight = false;
    }
  }

  private chooseAvatar(avatarVariant: ChosenAvatarVariant): void {
    this.runMutation(() => this.localGame.chooseAvatar(avatarVariant));
  }

  private renamePlayer(displayName: string): void {
    this.appView?.preserveProfileNameDraft(displayName);
    const previousName = this.store.snapshot.bootstrap?.player.displayName;
    this.runMutation(() => this.localGame.renamePlayer(displayName));
    const currentName = this.store.snapshot.bootstrap?.player.displayName;
    if (currentName && currentName !== previousName) {
      this.appView?.acceptProfileName(currentName);
    }
  }

  private async exportProgressBackup(): Promise<void> {
    if (
      this.destroyed ||
      this.mutationInFlight ||
      this.store.snapshot.phase !== "ready"
    ) {
      return;
    }
    this.mutationInFlight = true;
    this.appView?.setBackupInFlight(true);
    this.store.setFeatureMessage(null);
    try {
      const result = this.localGame.exportBackup();
      this.store.replaceSnapshot(
        result.snapshot,
        result.savedAt,
        result.persisted ? "saved" : "volatile",
      );
      const copied = await this.platform.writeClipboard(result.backupCode);
      if (this.destroyed) return;
      if (!copied) {
        throw new LocalGameError("无法写入剪贴板，请检查剪贴板权限");
      }
      this.store.setFeatureMessage("存档备份已复制到剪贴板");
    } catch (error) {
      if (!this.destroyed) {
        this.store.replaceSnapshot(
          this.localGame.snapshot,
          this.localGame.savedAt,
          this.localGame.persistenceAvailable ? "saved" : "volatile",
        );
        this.store.setFeatureMessage(
          localErrorMessage(error, "存档备份复制失败"),
        );
      }
    } finally {
      this.mutationInFlight = false;
      this.appView?.setBackupInFlight(false);
    }
  }

  private async importProgressBackup(): Promise<void> {
    if (
      this.destroyed ||
      this.mutationInFlight ||
      this.store.snapshot.phase !== "ready"
    ) {
      return;
    }
    this.mutationInFlight = true;
    this.appView?.setBackupInFlight(true);
    this.store.setFeatureMessage(null);
    try {
      const backupCode = await this.platform.readClipboard();
      if (this.destroyed) return;
      if (backupCode === null || backupCode.trim() === "") {
        throw new LocalGameError("无法读取剪贴板，请检查剪贴板权限和内容");
      }
      const result = this.localGame.importBackup(backupCode);
      this.applyProgressReplacement(
        result,
        "存档已恢复，原进度可通过“恢复导入前”找回",
      );
    } catch (error) {
      if (!this.destroyed) {
        this.store.replaceSnapshot(
          this.localGame.snapshot,
          this.localGame.savedAt,
          this.localGame.persistenceAvailable ? "saved" : "volatile",
        );
        this.store.setFeatureMessage(
          localErrorMessage(error, "剪贴板存档导入失败"),
        );
      }
    } finally {
      this.mutationInFlight = false;
      this.appView?.setBackupInFlight(false);
    }
  }

  private restoreImportRecovery(): void {
    if (
      this.destroyed ||
      this.mutationInFlight ||
      this.store.snapshot.phase !== "ready"
    ) {
      return;
    }
    this.mutationInFlight = true;
    this.appView?.setBackupInFlight(true);
    this.store.setFeatureMessage(null);
    try {
      const result = this.localGame.restoreImportRecovery();
      this.applyProgressReplacement(result, "已恢复上次导入前的本地进度");
    } catch (error) {
      this.store.replaceSnapshot(
        this.localGame.snapshot,
        this.localGame.savedAt,
        this.localGame.persistenceAvailable ? "saved" : "volatile",
      );
      this.store.setFeatureMessage(
        localErrorMessage(error, "导入前存档恢复失败"),
      );
    } finally {
      this.mutationInFlight = false;
      this.appView?.setBackupInFlight(false);
    }
  }

  private applyProgressReplacement(
    result: ReturnType<LocalGameService["importBackup"]>,
    message: string,
  ): void {
    this.appView?.interruptCultivationPresentation(true);
    this.store.setReady(
      result.snapshot,
      result.savedAt,
      result.persisted ? "saved" : "volatile",
    );
    this.appView?.acceptProfileName(result.snapshot.player.displayName);
    this.store.openFeature("profile");
    this.store.setFeatureMessage(message);
  }

  private equipEquipment(
    equipmentInstanceId: string,
    equippedSlot: EquippedEquipmentSlot,
  ): void {
    this.runMutation(
      () => this.localGame.equipEquipment(equipmentInstanceId, equippedSlot),
      "power_change",
    );
  }

  private dismissOfflineSettlement(): void {
    this.runMutation(() => this.localGame.dismissOfflineSettlement());
  }

  private debugGrant(target: DebugGrantTarget): void {
    if (!DEBUG) return;
    this.runMutation(() => this.localGame.debugGrant(target));
  }

  private debugSimulateOffline(seconds: number, seed?: number): void {
    if (!DEBUG) return;
    this.runMutation(() => this.localGame.debugSimulateOffline(seconds, seed));
  }

  private resetProgress(): void {
    if (this.destroyed || this.mutationInFlight) return;
    this.mutationInFlight = true;
    this.appView?.setResetInFlight(true);
    try {
      this.appView?.interruptCultivationPresentation(true);
      const result = this.localGame.reset();
      this.store.setReady(
        result.snapshot,
        result.savedAt,
        result.persisted ? "saved" : "volatile",
      );
      this.store.closeFeature();
    } catch (error) {
      this.store.setFeatureMessage(localErrorMessage(error, "本地进度重置失败"));
    } finally {
      this.mutationInFlight = false;
      this.appView?.setResetInFlight(false);
    }
  }

  private debugResetSave(playerId: string, confirmation: string): void {
    if (
      !DEBUG ||
      this.store.snapshot.bootstrap?.player.id !== playerId ||
      confirmation !== playerId
    ) {
      return;
    }
    this.resetProgress();
  }

  private enqueuePresentation(
    current: BootstrapSnapshot,
    events: readonly ProgressionEvent[],
    previous: BootstrapSnapshot,
  ): void {
    const trigger = presentationTrigger(events);
    if (!trigger) return;
    const plan = planCultivationPresentation(previous, current, trigger);
    if (plan) this.appView?.enqueueCultivationPresentation(plan);
  }
}

function presentationTrigger(
  events: readonly ProgressionEvent[],
): CultivationPresentationTrigger | null {
  return events.some((event) => event.type === "level_up") ? "level_up" : null;
}

function localErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof LocalGameError) return error.message;
  if (DEBUG && error instanceof Error) return `${fallback}：${error.message}`;
  return fallback;
}
