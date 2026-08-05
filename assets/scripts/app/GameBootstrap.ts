import { _decorator, Component, Node, ResolutionPolicy, view } from "cc";
import type {
  BootstrapSnapshot,
  ChosenAvatarVariant,
  EquippedEquipmentSlot,
  LoadoutMutationResult,
} from "@cultivation-diary/shared";
import { ApiClient, ClientApiError } from "../services/ApiClient";
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
  private mutationInFlight = false;
  private offlineDismissPending = false;
  private modalInputLockedUntil = 0;
  private pendingProfileBootstrap: BootstrapSnapshot | null = null;

  onLoad(): void {
    view.setDesignResolutionSize(750, 1334, ResolutionPolicy.SHOW_ALL);

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
    this.schedule(() => void this.settleGame(), 30);
    void this.startGame();
  }

  onDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private async startGame(): Promise<void> {
    this.store.setLoading("正在同步修为");
    try {
      const bootstrap = await this.apiClient.authenticate();
      this.store.setReady(bootstrap);
      await this.settleGame();
    } catch (error) {
      const message =
        error instanceof ClientApiError || error instanceof Error
          ? error.message
          : "暂时无法连接仙门";
      this.store.setError(message);
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

    this.mutationInFlight = true;
    try {
      const result = await this.apiClient.settleCultivation();
      if (this.isProfileOpen()) {
        this.pendingProfileBootstrap = result.bootstrap;
      } else {
        this.store.setReady(result.bootstrap);
      }
    } catch (error) {
      if (await this.recoverPlayerVersionConflict(error, true)) return;
      // Keep the last authoritative snapshot visible; the next scheduled sync retries.
    } finally {
      this.mutationInFlight = false;
    }
  }

  private dismissOfflineSettlement(): void {
    if (this.offlineDismissPending || !this.store.snapshot.bootstrap?.offlineSettlement) {
      return;
    }

    // Rebuilding the view inside the current pointer dispatch can expose an
    // underlying button to the browser's follow-up click event. Keep the modal
    // in place briefly and lock mutations until that input sequence has ended.
    this.offlineDismissPending = true;
    this.modalInputLockedUntil = Date.now() + 500;
    this.scheduleOnce(() => {
      this.store.dismissOfflineSettlement();
      this.offlineDismissPending = false;
    }, 0.1);
  }

  private closeFeature(): void {
    const pendingBootstrap = this.pendingProfileBootstrap;
    this.pendingProfileBootstrap = null;
    this.store.closeFeature();
    if (pendingBootstrap) this.store.setReady(pendingBootstrap);
  }

  private isProfileOpen(): boolean {
    return this.store.snapshot.activeFeature === "profile";
  }

  private async breakthrough(): Promise<void> {
    if (
      this.mutationInFlight ||
      this.offlineDismissPending ||
      Date.now() < this.modalInputLockedUntil ||
      Boolean(this.store.snapshot.bootstrap?.offlineSettlement)
    ) {
      return;
    }

    this.platform.feedback();
    this.mutationInFlight = true;
    this.store.setLoading("正在叩开境界之门");
    try {
      const result = await this.apiClient.breakthrough();
      this.store.setReady(result.bootstrap);
    } catch (error) {
      if (await this.recoverPlayerVersionConflict(error)) return;
      const message =
        error instanceof ClientApiError || error instanceof Error
          ? error.message
          : "突破暂未成功";
      this.store.setError(message);
    } finally {
      this.mutationInFlight = false;
    }
  }

  private async expandInventory(): Promise<void> {
    if (!this.canStartFeatureMutation()) return;
    this.mutationInFlight = true;
    this.store.setFeatureMessage("正在扩展行囊……");
    try {
      const result = await this.apiClient.expandInventory();
      this.store.setReady(result.bootstrap);
      this.store.setFeatureMessage(
        result.nextCost === null
          ? "行囊已扩展至最大容量"
          : `行囊扩展成功，消耗灵石 ${result.cost}`,
      );
    } catch (error) {
      if (!(await this.recoverPlayerVersionConflict(error))) {
        this.store.setFeatureMessage(errorMessage(error, "行囊扩展失败"));
      }
    } finally {
      this.mutationInFlight = false;
    }
  }

  private async chooseAvatar(
    avatarVariant: ChosenAvatarVariant,
  ): Promise<void> {
    if (!this.canStartFeatureMutation()) return;
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
      this.pendingProfileBootstrap = null;
      this.store.setReady(result.bootstrap);
      this.store.setFeatureMessage("角色形象已确定，此后不可再次修改");
    } catch (error) {
      if (await this.recoverPlayerVersionConflict(error)) {
        this.store.setFeatureMessage(
          this.store.snapshot.bootstrap?.player.avatarVariant === "neutral"
            ? "档案状态已同步，请重新确认"
            : "角色形象已由其他操作确定，档案状态已同步",
        );
      } else {
        this.store.setFeatureMessage(errorMessage(error, "角色形象确认失败"));
      }
    } finally {
      this.mutationInFlight = false;
    }
  }

  private async renamePlayer(displayName: string): Promise<void> {
    if (!this.canStartFeatureMutation()) return;
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
      this.pendingProfileBootstrap = null;
      this.appView?.acceptProfileName(result.displayName);
      this.store.setReady(result.bootstrap);
      this.store.setFeatureMessage(
        result.usedFreeRename
          ? `道号已改为「${result.displayName}」，本次使用免费机会`
          : `道号已改为「${result.displayName}」，消耗改名卡 1 张`,
      );
    } catch (error) {
      if (await this.recoverPlayerVersionConflict(error)) {
        this.store.setFeatureMessage(
          "档案状态已同步，原输入已保留，请核对后重新提交",
        );
      } else {
        this.store.setFeatureMessage(errorMessage(error, "修改道号失败"));
      }
    } finally {
      this.mutationInFlight = false;
    }
  }

  private async useInventoryItem(itemConfigId: string): Promise<void> {
    if (!this.canStartFeatureMutation()) return;
    this.mutationInFlight = true;
    this.store.setFeatureMessage("正在炼化经验丹……");
    try {
      const result = await this.apiClient.useInventoryItem(itemConfigId);
      this.store.setReady(result.bootstrap);
      this.store.setFeatureMessage(
        result.reachedBreakthrough
          ? `炼化完成：修为 +${result.experienceGained}，已到达突破瓶颈`
          : `炼化完成：修为 +${result.experienceGained}`,
      );
    } catch (error) {
      if (!(await this.recoverPlayerVersionConflict(error))) {
        this.store.setFeatureMessage(errorMessage(error, "道具使用失败"));
      }
    } finally {
      this.mutationInFlight = false;
    }
  }

  private async transferHarvest(entryId: string): Promise<void> {
    if (!this.canStartFeatureMutation()) return;
    this.mutationInFlight = true;
    this.store.setFeatureMessage("正在收入行囊……");
    try {
      const result = await this.apiClient.transferHarvest([entryId]);
      this.store.setReady(result.bootstrap);
      this.store.setFeatureMessage("收获已安全收入行囊或功法库");
    } catch (error) {
      if (!(await this.recoverPlayerVersionConflict(error))) {
        this.store.setFeatureMessage(errorMessage(error, "收取失败"));
      }
    } finally {
      this.mutationInFlight = false;
    }
  }

  private async salvageHarvest(entryId: string): Promise<void> {
    if (!this.canStartFeatureMutation()) return;
    this.mutationInFlight = true;
    this.store.setFeatureMessage("正在分解收获……");
    try {
      const result = await this.apiClient.salvageHarvest([entryId]);
      this.store.setReady(result.bootstrap);
      this.store.setFeatureMessage(
        `分解完成：灵石 +${result.spiritStoneGained}，强化石 +${result.enhanceStoneGained}`,
      );
    } catch (error) {
      if (!(await this.recoverPlayerVersionConflict(error))) {
        this.store.setFeatureMessage(errorMessage(error, "分解失败"));
      }
    } finally {
      this.mutationInFlight = false;
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
    this.mutationInFlight = true;
    this.store.setFeatureMessage(pendingMessage);
    try {
      const result = await mutation();
      this.store.setReady(result.bootstrap);
      this.store.setFeatureMessage(
        `${completedMessage}，${describePowerDelta(result.powerDelta)}`,
      );
    } catch (error) {
      if (!(await this.recoverPlayerVersionConflict(error))) {
        this.store.setFeatureMessage(errorMessage(error, "装备操作失败"));
      }
    } finally {
      this.mutationInFlight = false;
    }
  }

  private canStartFeatureMutation(): boolean {
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
    if (pendingBootstrap) this.store.setReady(pendingBootstrap);
  }

  private async recoverPlayerVersionConflict(
    error: unknown,
    deferWhileProfileOpen = false,
  ): Promise<boolean> {
    if (!(error instanceof ClientApiError) || error.code !== "PLAYER_VERSION_CONFLICT") {
      return false;
    }

    try {
      const bootstrap = await this.apiClient.authenticate();
      if (deferWhileProfileOpen && this.isProfileOpen()) {
        this.pendingProfileBootstrap = bootstrap;
        return true;
      }
      this.pendingProfileBootstrap = null;
      this.store.setReady(bootstrap);
      return true;
    } catch {
      return false;
    }
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
