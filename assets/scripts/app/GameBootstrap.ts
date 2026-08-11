import { _decorator, Component, Node, ResolutionPolicy, view } from "cc";
import { DEBUG } from "cc/env";
import type {
  BootstrapSnapshot,
  ChosenAvatarVariant,
  DebugGrantTarget,
  EquippedEquipmentSlot,
  ProgressionEvent,
} from "@cultivation-diary/shared";
import { loadMainBackgroundArt } from "../core/AppArt";
import { CLIENT_CONFIG } from "../core/ClientConfig";
import {
  planCultivationPresentation,
  type CultivationPresentationTrigger,
} from "../core/CultivationPresentation";
import {
  DEFAULT_DESIGN_SAFE_AREA_LAYOUT,
  DESIGN_VIEWPORT_HEIGHT,
  DESIGN_VIEWPORT_WIDTH,
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
    view.setDesignResolutionSize(
      DESIGN_VIEWPORT_WIDTH,
      DESIGN_VIEWPORT_HEIGHT,
      ResolutionPolicy.FIXED_WIDTH,
    );

    const appRoot = new Node("AppRoot");
    appRoot.layer = this.node.layer;
    this.node.addChild(appRoot);
    const appView = new AppView(
      appRoot,
      {
        retry: () => this.startGame(),
        resetProgress: () => this.resetProgress(),
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
        useInventoryItem: (itemConfigId) =>
          this.runMutation(() => this.localGame.useInventoryItem(itemConfigId)),
        transferHarvest: (entryId) =>
          this.runMutation(() => this.localGame.transferHarvest(entryId)),
        salvageHarvest: (entryId) =>
          this.runMutation(() => this.localGame.salvageHarvest(entryId)),
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
        dismissOfflineSettlement: () => this.dismissOfflineSettlement(),
        simulateOffline: (seconds, seed) => this.debugSimulateOffline(seconds, seed),
        grantDebug: (target) => this.debugGrant(target),
        resetDebugSave: (playerId, confirmation) =>
          this.debugResetSave(playerId, confirmation),
        feedback: () => this.platform.feedback(),
      },
      this.platform.getSafeAreaLayout?.() ?? DEFAULT_DESIGN_SAFE_AREA_LAYOUT,
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
