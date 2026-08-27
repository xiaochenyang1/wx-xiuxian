import {
  PARTNER_CONFIGS,
  PARTNER_MAX_LEVEL,
  type AutoSalvageQuality,
  type BootstrapSnapshot,
  type ChosenAvatarVariant,
  type DebugGrantTarget,
  type EquippedEquipmentSlot,
  type OfflineSettlementSummary,
  type PartnerId,
  type SectId,
} from "@cultivation-diary/shared";
import {
  partnerProgressText,
  selectedPartner,
  socialBonusText,
} from "../core/SocialDisplay";
import {
  countPendingProgressionTasks,
  VISIBLE_PROGRESSION_TASK_COUNT,
} from "../core/ProgressionTaskDisplay";
import {
  buildLocalRanking,
  type RankingCategory,
} from "../core/RankingDisplay";
import {
  formatLargeNumber,
  interpolateBigNumberStrings,
  sumBigNumberStrings,
} from "../core/ClientNumber";
import type {
  MainBackgroundArt,
  MainBackgroundKey,
  SupplementalArt,
} from "../core/AppArt";
import {
  mergeCultivationPresentationPlans,
  type CultivationPresentationPlan,
} from "../core/CultivationPresentation";
import {
  getFeatureMessageDisplay,
  getMainFeatureMessageGeometry,
  type FeatureMessageDisplay,
} from "../core/FeatureMessageDisplay";
import { getDaoDisplay } from "../core/DaoDisplay";
import {
  advanceLiveCultivationElapsed,
  initialLiveCultivationElapsed,
  liveCultivationSettlementKey,
  projectLiveCultivation,
} from "../core/CultivationProjection";
import {
  EMPTY_SOCIAL_CONFIRMATION_STATE,
  getPartnerConfirmationDisplay,
  getSectConfirmationDisplay,
  reconcileSocialConfirmationState,
  type SocialConfirmationState,
} from "../core/SocialConfirmationDisplay";
import {
  clampModalButtonCenterY,
  DEFAULT_DESIGN_SAFE_AREA_LAYOUT,
  DESIGN_VIEWPORT_HEIGHT,
  DESIGN_VIEWPORT_WIDTH,
  resolveAppChromeGeometry,
  type AppChromeGeometry,
  type DesignSafeAreaLayout,
} from "../core/SafeArea";
import type {
  AppState,
  FeaturePanel,
  MainTab,
} from "../core/ClientTypes";
import { canRunLocalMutation, shouldShowPartnerUnlockNotice } from "../core/ClientTypes";
import { color, COLORS, withAlpha } from "./primitives/Colors";
import {
  addLabel,
  createButton,
  createTextInput,
  createUiNode,
  drawBand,
  drawOrnatePanel,
  drawProgress,
  graphicsNode,
  redrawProgress,
  removeAndDestroy,
  setSize,
} from "./primitives/Draw";
import { formatSignedPowerDelta } from "./primitives/Format";
import {
  createBottomFeatureButton,
  createFeatureButton,
  createMainTabButton,
  createSideFeatureButton,
  drawContainedSprite,
  formatDebugTimestamp,
  formatDuration,
  liveCultivationGainText,
  parseDebugDropSeed,
  presentationKindName,
  ratio,
  shortId,
  snapshotMatchesPresentationSource,
  snapshotMatchesPresentationTarget,
} from "./AppViewHelpers";
import {
  drawAvatarPortrait,
  drawCultivatorFigure,
  drawCurrencyChip,
  drawGoldenFormation,
  drawMountainLayer,
  drawPowerBanner,
  drawTribulationLightning,
} from "./primitives/Scenery";
import { drawEquipmentPanel } from "./panels/EquipmentPanel";
import { drawExpeditionPanel } from "./panels/ExpeditionPanel";
import { drawInventoryPanel } from "./panels/InventoryPanel";
import {
  drawProfilePanel,
  type ProfileBackupAction,
  type ProfileBackupControls,
  type ProfileDraftState,
  type ProfileResetControls,
} from "./panels/ProfilePanel";
import { drawTaskPanel } from "./panels/TaskPanel";
import { drawTechniquePanel } from "./panels/TechniquePanel";
import { drawAlchemyPanel } from "./panels/AlchemyPanel";
import { drawCraftingPanel } from "./panels/CraftingPanel";
import { drawSectPanel } from "./panels/SectPanel";
import { drawCavePanel } from "./panels/CavePanel";
import { drawTrialTowerPanel } from "./panels/TrialTowerPanel";
import {
  Button,
  BlockInputEvents,
  Color,
  EditBox,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  Sprite,
  tween,
  type Tween,
  UIOpacity,
  Vec3,
} from "cc";
import { DEBUG } from "cc/env";

type DebugLifecycleStatus = "foreground" | "background";

export interface AppViewActions {
  retry(): void;
  resetProgress(): void;
  exportProgressBackup(): void;
  importProgressBackup(): void;
  restoreImportRecovery(): void;
  hasImportRecovery(): boolean;
  selectTab(tab: MainTab): void;
  openFeature(feature: FeaturePanel): void;
  closeFeature(): void;
  breakthrough(): void;
  cultivateDao(times: number): void;
  chooseAvatar(avatarVariant: ChosenAvatarVariant): void;
  renamePlayer(displayName: string): void;
  markPartnerUnlockNoticeSeen(): void;
  expandInventory(): void;
  upgradeCaveBuilding(buildingConfigId: string): void;
  challengeExpedition(stageConfigId: string): void;
  sweepExpedition(stageConfigId: string): void;
  challengeTrialTower(floor: number): void;
  huntTreasure(): void;
  brewAlchemy(recipeId: string): void;
  brewAlchemyBatch(recipeId: string): void;
  craftEquipment(recipeId: string): void;
  craftEquipmentBatch(recipeId: string): void;
  choosePartner(partnerId: string): void;
  cultivateWithPartner(): void;
  joinSect(sectId: string): void;
  donateToSect(): void;
  upgradeTechnique(techniqueConfigId: string): void;
  useInventoryItem(itemConfigId: string): void;
  useAllInventoryItems(itemConfigId: string): void;
  transferHarvest(entryId: string): void;
  collectAllHarvest(): void;
  salvageHarvest(entryId: string): void;
  salvageLowQualityHarvest(): void;
  toggleAutoSalvage(quality: AutoSalvageQuality): void;
  equipTechnique(techniqueConfigId: string): void;
  unequipTechnique(techniqueConfigId: string): void;
  equipEquipment(
    equipmentInstanceId: string,
    equippedSlot: EquippedEquipmentSlot,
  ): void;
  unequipEquipment(equipmentInstanceId: string): void;
  enhanceEquipment(equipmentInstanceId: string): void;
  rerollEquipmentAffixes(equipmentInstanceId: string): void;
  ascendEquipment(equipmentInstanceId: string): void;
  toggleEquipmentLock(equipmentInstanceId: string): void;
  salvageEquipment(equipmentInstanceId: string): void;
  dismissOfflineSettlement(): void;
  simulateOffline(seconds: number, dropSeed?: number): void;
  grantDebug(target: DebugGrantTarget): void;
  resetDebugSave(playerId: string, confirmation: string): void;
  feedback(): void;
}

export type PagedList =
  | "inventoryStacks"
  | "harvestChest"
  | "techniques"
  | "equipment";

export interface PageWindow {
  page: number;
  pageCount: number;
  start: number;
  end: number;
}

export interface PanelPaging {
  window(list: PagedList, itemCount: number, pageSize: number): PageWindow;
  show(list: PagedList, page: number): void;
}

export interface CultivationProgressDisplay {
  readonly isVersionCap: boolean;
  readonly idleMessage: string;
  readonly experienceLine: string;
  readonly reserveLine: string | null;
  readonly rateLabel: string;
  readonly progressRatio: number | null;
  readonly footer: string | null;
}

export function getCultivationProgressDisplay(
  progress: BootstrapSnapshot["progress"],
  maxLevel: number,
): CultivationProgressDisplay {
  if (progress.status === "version_cap") {
    return {
      isVersionCap: true,
      idleMessage: "积蓄修为中",
      experienceLine: "当前版本修为圆满",
      reserveLine: `修为储备 ${formatLargeNumber(progress.cultivationReserve)}`,
      rateLabel: "每秒储备",
      progressRatio: null,
      footer: `当前版本上限 Lv.${maxLevel}`,
    };
  }

  const progressRatio = ratio(
    progress.experience,
    progress.requiredExperience,
  );
  return {
    isVersionCap: false,
    idleMessage: "挂机中",
    experienceLine: `修为 ${formatLargeNumber(progress.experience)} / ${formatLargeNumber(progress.requiredExperience)}`,
    reserveLine: null,
    rateLabel: "每秒经验",
    progressRatio,
    footer:
      progress.status === "breakthrough_ready"
        ? null
        : `当前境界修炼进度 ${Math.floor(progressRatio * 100)}%`,
  };
}

export class AppView {
  private readonly contentRoot: Node;
  private readonly presentationRoot: Node;
  private readonly debugRoot: Node | null;
  private readonly safeAreaLayout: DesignSafeAreaLayout;
  private readonly chromeGeometry: AppChromeGeometry;
  private mainBackgroundArt: MainBackgroundArt = {};
  private supplementalArt: SupplementalArt = {
    cultivators: {},
    playerAvatars: {},
  };
  private destroyed = false;
  private mainPageRoot: Node | null = null;
  private idleLabel: Label | null = null;
  private cultivationExperienceLabel: Label | null = null;
  private cultivationReserveLabel: Label | null = null;
  private cultivationGrowthLabel: Label | null = null;
  private cultivationFooterLabel: Label | null = null;
  private cultivationProgressGraphic: Graphics | null = null;
  private cultivationProjectionAnchor: {
    readonly accountId: string;
    readonly playerId: string;
    readonly key: string;
    readonly settlementKey: string;
    readonly progress: BootstrapSnapshot["progress"];
    elapsedMilliseconds: number;
  } | null = null;
  private cultivationGrowthTween: Tween<Node> | null = null;
  private lastCultivationProjectionSecond = -1;
  private lastCultivationProjectionGain = "0";
  private idleMessage = "挂机中";
  private idleFrame = 0;
  private lastState: Readonly<AppState> | null = null;
  private debugPanelVisible = false;
  private debugLifecycleStatus: DebugLifecycleStatus = "foreground";
  private debugDropSeed: number | null = null;
  private debugDropSeedDraft = "";
  private debugDropSeedError: string | null = null;
  private debugSaveResetArmed = false;
  private profileResetArmed = false;
  private profileResetPending = false;
  private profileBackupArmed: ProfileBackupAction | null = null;
  private profileBackupPending = false;
  private profilePlayerId: string | null = null;
  private profileAvatarDraft: ChosenAvatarVariant | null = null;
  private profileNameDraft: string | null = null;
  private profileNameSource: string | null = null;
  private socialConfirmationState: SocialConfirmationState =
    EMPTY_SOCIAL_CONFIRMATION_STATE;
  private rankingCategory: RankingCategory = "power";
  private pendingPresentation: CultivationPresentationPlan | null = null;
  private activePresentation: CultivationPresentationPlan | null = null;
  private activePresentationTween: Tween<Node> | null = null;
  private loadingTween: Tween<Node> | null = null;
  private readonly pages: Record<PagedList, number> = {
    inventoryStacks: 0,
    harvestChest: 0,
    techniques: 0,
    equipment: 0,
  };
  private readonly panelPaging: PanelPaging = {
    window: (list, itemCount, pageSize) => this.pageWindow(list, itemCount, pageSize),
    show: (list, page) => this.showPage(list, page),
  };
  private readonly profileDrafts: ProfileDraftState = {
    avatar: () => this.profileAvatarDraft,
    name: () => this.profileNameDraft,
    nameSource: () => this.profileNameSource,
    setAvatar: (value) => {
      this.profileAvatarDraft = value;
    },
    setName: (value) => {
      this.profileNameDraft = value;
    },
    setNameSource: (value) => {
      this.profileNameSource = value;
    },
    selectAvatar: (value) => this.selectAvatarDraft(value),
  };
  private readonly profileResetControls: ProfileResetControls = {
    armed: () => this.profileResetArmed,
    pending: () => this.profileResetPending,
    arm: () => this.armProfileReset(),
    cancel: () => this.cancelProfileReset(),
    confirm: () => this.confirmProfileReset(),
  };
  private readonly profileBackupControls: ProfileBackupControls = {
    armed: () => this.profileBackupArmed,
    pending: () => this.profileBackupPending,
    recoveryAvailable: () => this.actions.hasImportRecovery(),
    copy: () => this.copyProfileBackup(),
    arm: (action) => this.armProfileBackup(action),
    cancel: () => this.cancelProfileBackup(),
    confirm: () => this.confirmProfileBackup(),
  };

  constructor(
    private readonly containerRoot: Node,
    private readonly actions: AppViewActions,
    safeAreaLayout: DesignSafeAreaLayout = DEFAULT_DESIGN_SAFE_AREA_LAYOUT,
  ) {
    this.safeAreaLayout = safeAreaLayout;
    this.chromeGeometry = resolveAppChromeGeometry(safeAreaLayout);
    setSize(
      containerRoot,
      safeAreaLayout.viewportWidth,
      safeAreaLayout.viewportHeight,
    );
    this.contentRoot = createUiNode(containerRoot, "ContentRoot");
    this.presentationRoot = createUiNode(containerRoot, "PresentationRoot");
    // Cocos replaces DEBUG at build time; release builds never create this root.
    this.debugRoot = DEBUG ? createUiNode(containerRoot, "DebugRoot") : null;
    setSize(
      this.contentRoot,
      safeAreaLayout.viewportWidth,
      safeAreaLayout.viewportHeight,
    );
    setSize(
      this.presentationRoot,
      safeAreaLayout.viewportWidth,
      safeAreaLayout.viewportHeight,
    );
    if (this.debugRoot) {
      setSize(
        this.debugRoot,
        safeAreaLayout.viewportWidth,
        safeAreaLayout.viewportHeight,
      );
    }
  }

  private get root(): Node {
    return this.mainPageRoot ?? this.contentRoot;
  }

  private setFullscreenSize(node: Node): void {
    setSize(
      node,
      this.safeAreaLayout.viewportWidth,
      this.safeAreaLayout.viewportHeight,
    );
  }

  private drawFullscreenRect(graphics: Graphics): void {
    graphics.rect(
      -this.safeAreaLayout.viewportWidth / 2,
      -this.safeAreaLayout.viewportHeight / 2,
      this.safeAreaLayout.viewportWidth,
      this.safeAreaLayout.viewportHeight,
    );
  }

  private safeModalButtonY(preferredY: number, height: number): number {
    return clampModalButtonCenterY(
      preferredY,
      height,
      this.safeAreaLayout,
    );
  }

  render(state: Readonly<AppState>): void {
    this.updateCultivationProjectionAnchor(state);
    const previousState = this.lastState;
    const playerId = state.bootstrap?.player.id ?? null;
    const playerIdentityChanged = playerId !== this.profilePlayerId;
    if (playerIdentityChanged) {
      this.interruptCultivationPresentation(true);
      this.clearPlayerUiState();
      this.profilePlayerId = playerId;
    }
    const selectedTabChanged =
      previousState !== null && previousState.selectedTab !== state.selectedTab;
    const activeFeatureChanged =
      previousState !== null && previousState.activeFeature !== state.activeFeature;
    this.socialConfirmationState = reconcileSocialConfirmationState(
      this.socialConfirmationState,
      {
        selectedTab: state.selectedTab,
        activeFeature: state.activeFeature,
        viewChanged:
          playerIdentityChanged || selectedTabChanged || activeFeatureChanged,
        partnerAlreadySelected: Boolean(state.bootstrap?.partner.partnerId),
        sectAlreadySelected: Boolean(state.bootstrap?.sect.sectId),
      },
    );
    this.lastState = state;
    if (selectedTabChanged) this.interruptCultivationPresentation(true);
    if (
      this.activePresentation &&
      !snapshotMatchesPresentationTarget(state, this.activePresentation)
    ) {
      this.interruptCultivationPresentation();
    } else if (
      this.activePresentation &&
      shouldShowPartnerUnlockNotice(state)
    ) {
      this.deferActivePresentation();
    } else if (this.activePresentation && state.activeFeature !== null) {
      this.deferActivePresentation();
    } else if (this.activePresentation && state.bootstrap?.offlineSettlement) {
      this.deferActivePresentation();
    }
    this.loadingTween?.stop();
    this.loadingTween = null;
    this.cultivationGrowthTween?.stop();
    this.cultivationGrowthTween = null;
    for (const child of [...this.contentRoot.children]) child.destroy();
    this.idleLabel = null;
    this.cultivationExperienceLabel = null;
    this.cultivationReserveLabel = null;
    this.cultivationGrowthLabel = null;
    this.cultivationFooterLabel = null;
    this.cultivationProgressGraphic = null;
    this.lastCultivationProjectionSecond = -1;
    this.lastCultivationProjectionGain = "0";
    this.drawBackdrop();

    if (state.phase === "loading") {
      this.drawLoading(state.loadingMessage);
      this.drawDebugPanel(state);
      return;
    }
    if (state.phase === "error" || !state.bootstrap) {
      this.drawError(state.errorMessage || "暂时无法连接仙门");
      this.drawDebugPanel(state);
      return;
    }

    const partnerUnlockNoticeOpen = shouldShowPartnerUnlockNotice(state);
    const featureMessageDisplay = getFeatureMessageDisplay({
      message: state.featureMessage,
      selectedTab: state.selectedTab,
      activeFeatureOpen: state.activeFeature !== null,
      offlineSettlementOpen: state.bootstrap.offlineSettlement !== null,
      partnerUnlockNoticeOpen,
    });

    this.drawMainPage(state, featureMessageDisplay);
    this.drawHeader(state);
    this.drawNavigation(state.selectedTab);
    this.drawBottomFeatureRail(
      this.contentRoot,
      this.chromeGeometry.centerX,
      this.chromeGeometry.navigationCenterY,
    );
    this.drawSyncStatus(state);
    if (state.activeFeature) {
      this.drawFeaturePanel(state, state.activeFeature, featureMessageDisplay);
    }
    if (state.bootstrap.offlineSettlement) {
      this.drawOfflineSettlement(state.bootstrap.offlineSettlement);
    }
    if (partnerUnlockNoticeOpen) {
      this.drawPartnerUnlockNotice(featureMessageDisplay);
    }
    this.tryStartCultivationPresentation();
    this.drawDebugPanel(state);
  }

  private drawMainPage(
    state: Readonly<AppState>,
    featureMessageDisplay: FeatureMessageDisplay | null,
  ): void {
    const pageRoot = createUiNode(this.contentRoot, "MainPageRoot");
    pageRoot.setPosition(
      this.chromeGeometry.centerX,
      this.chromeGeometry.bodyOffsetY,
    );
    setSize(pageRoot, DESIGN_VIEWPORT_WIDTH, DESIGN_VIEWPORT_HEIGHT);
    this.mainPageRoot = pageRoot;
    try {
      this.drawMainBackground(state.selectedTab);
      switch (state.selectedTab) {
        case "cultivation":
          this.drawCultivation(state, featureMessageDisplay);
          break;
        case "partner":
          this.drawPartner(state);
          break;
        case "ranking":
          this.drawRanking(state, featureMessageDisplay);
          break;
        case "cave":
          this.drawCave(state);
          break;
      }
      if (featureMessageDisplay?.surface === "main") {
        this.drawMainFeatureMessage(featureMessageDisplay);
      }
    } finally {
      this.mainPageRoot = null;
    }
  }

  private drawMainBackground(tab: MainBackgroundKey): void {
    const spriteFrame = this.mainBackgroundArt[tab];
    if (!spriteFrame) return;

    const background = createUiNode(this.root, `MainBackground-${tab}`);
    setSize(background, DESIGN_VIEWPORT_WIDTH, DESIGN_VIEWPORT_HEIGHT);
    const originalSize = spriteFrame.originalSize;
    const sourceWidth = Math.max(1, originalSize.width);
    const sourceHeight = Math.max(1, originalSize.height);
    const coverScale = Math.max(
      DESIGN_VIEWPORT_WIDTH / sourceWidth,
      DESIGN_VIEWPORT_HEIGHT / sourceHeight,
    );
    const image = createUiNode(background, "MainBackgroundImage");
    setSize(
      image,
      Math.ceil(sourceWidth * coverScale),
      Math.ceil(sourceHeight * coverScale),
    );
    const sprite = image.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.trim = false;
    sprite.spriteFrame = spriteFrame;
    image.addComponent(UIOpacity).opacity = tab === "cultivation" ? 255 : 224;

    if (tab !== "cultivation") {
      const wash = graphicsNode(background, "MainBackgroundWash", 0, 0);
      wash.fillColor = withAlpha(COLORS.black, 54);
      wash.rect(
        -DESIGN_VIEWPORT_WIDTH / 2,
        -DESIGN_VIEWPORT_HEIGHT / 2,
        DESIGN_VIEWPORT_WIDTH,
        DESIGN_VIEWPORT_HEIGHT,
      );
      wash.fill();
    }
  }

  private hasMainBackground(key: MainBackgroundKey): boolean {
    return this.mainBackgroundArt[key] !== undefined;
  }

  setDebugLifecycleStatus(status: DebugLifecycleStatus): void {
    if (this.debugLifecycleStatus === status) return;
    this.debugLifecycleStatus = status;
    if (DEBUG) this.refreshDebugPanel();
  }

  setMainBackgroundArt(art: MainBackgroundArt): void {
    if (this.destroyed || this.mainBackgroundArt === art) return;
    this.mainBackgroundArt = art;
    if (this.lastState) this.render(this.lastState);
  }

  setSupplementalArt(art: SupplementalArt): void {
    if (this.destroyed || this.supplementalArt === art) return;
    this.supplementalArt = art;
    if (this.lastState) this.render(this.lastState);
  }

  setResetInFlight(inFlight: boolean): void {
    if (this.profileResetPending === inFlight) return;
    this.profileResetPending = inFlight;
    if (inFlight) this.profileResetArmed = false;
    if (this.lastState) this.render(this.lastState);
  }

  setBackupInFlight(inFlight: boolean): void {
    if (this.profileBackupPending === inFlight) return;
    this.profileBackupPending = inFlight;
    if (inFlight) this.profileBackupArmed = null;
    if (this.lastState) this.render(this.lastState);
  }

  private refreshDebugPanel(): void {
    if (!DEBUG || !this.debugRoot || !this.lastState) return;
    this.drawDebugPanel(this.lastState);
  }

  private drawDebugPanel(state: Readonly<AppState>): void {
    if (!DEBUG || !this.debugRoot) return;
    for (const child of [...this.debugRoot.children]) child.destroy();
    if (shouldShowPartnerUnlockNotice(state)) return;

    if (!this.debugPanelVisible) {
      createButton(
        this.debugRoot,
        "调试",
        316,
        474,
        78,
        36,
        { fill: COLORS.inkGreenLight, stroke: COLORS.goldMuted, fontSize: 16 },
        () => {
          this.debugPanelVisible = true;
          this.refreshDebugPanel();
        },
      );
      return;
    }

    const panel = createUiNode(this.debugRoot, "DebugPanel");
    panel.setPosition(180, 50);
    setSize(panel, 338, 1_100);
    panel.addComponent(UIOpacity).opacity = 238;
    drawBand(panel, "DebugPanelBackground", 0, 0, 338, 1_100, COLORS.panelStrong, COLORS.goldMuted);

    addLabel(panel, "开发调试", -78, 418, 190, 34, 19, COLORS.gold, true, 1, HorizontalTextAlignment.LEFT);
    addLabel(panel, "DEV", 123, 418, 62, 28, 14, COLORS.jade, true, 1, HorizontalTextAlignment.RIGHT);
    createButton(
      panel,
      "关闭",
      124,
      417,
      68,
      32,
      { fill: COLORS.inkGreen, stroke: COLORS.goldMuted, fontSize: 14 },
      () => {
        this.debugPanelVisible = false;
        this.refreshDebugPanel();
      },
    );

    const bootstrap = state.bootstrap;
    const identity = bootstrap
      ? `${bootstrap.player.displayName} · ${shortId(bootstrap.player.id)}`
      : "尚未建立角色";
    const version = bootstrap?.config.version ?? "未知";
    const storage = `${state.storageStatus === "saved" ? "已保存" : "仅本次会话"} · ${formatDebugTimestamp(state.lastSavedAt)}`;
    const lifecycle = this.debugLifecycleStatus === "foreground" ? "前台" : "后台";
    const presentation = this.activePresentation
      ? `播放 ${presentationKindName(this.activePresentation.kind)}`
      : this.pendingPresentation
        ? `排队 ${presentationKindName(this.pendingPresentation.kind)}`
        : "空闲";
    const progress = bootstrap
      ? `Lv.${bootstrap.progress.level} · ${bootstrap.progress.realmName}`
      : "-";
    const experience = bootstrap
      ? `${formatLargeNumber(bootstrap.progress.experience)} / ${formatLargeNumber(bootstrap.progress.requiredExperience)}`
      : "-";
    const power = bootstrap ? formatLargeNumber(bootstrap.progress.totalPower) : "-";

    const rows: ReadonlyArray<readonly [string, string, Color]> = [
      ["存档", storage, state.storageStatus === "saved" ? COLORS.jade : COLORS.red],
      ["生命周期", lifecycle, this.debugLifecycleStatus === "foreground" ? COLORS.jade : COLORS.red],
      ["版本", version, COLORS.text],
      ["离线收益", bootstrap?.offlineSettlement ? "待确认" : "已处理", COLORS.textMuted],
      ["表现", presentation, this.activePresentation ? COLORS.gold : COLORS.textMuted],
      ["角色", identity, COLORS.text],
      ["修为", progress, COLORS.jade],
      ["经验", experience, COLORS.text],
      ["战力", power, COLORS.gold],
      ["页面", `${state.selectedTab}${state.activeFeature ? ` · ${state.activeFeature}` : ""}`, COLORS.textMuted],
    ];
    rows.forEach(([label, value, valueColor], index) => {
      const y = 372 - index * 40;
      addLabel(panel, label, -141, y, 72, 30, 14, COLORS.textMuted, false, 1, HorizontalTextAlignment.LEFT);
      addLabel(panel, value, 30, y, 218, 30, 14, valueColor, true, 1, HorizontalTextAlignment.RIGHT);
    });
    const canUseDebugMutation =
      canRunLocalMutation(state) &&
      state.activeFeature === null &&
      state.bootstrap?.offlineSettlement === null;
    addLabel(panel, "资源注入", -141, -33, 72, 30, 14, COLORS.textMuted, false, 1, HorizontalTextAlignment.LEFT);
    for (const [target, x, text] of [
      ["fill_experience", -102, "修满本级"],
      ["spirit_stone", 0, "灵石 +1万"],
      ["breakthrough_pill", 102, "突破丹 +1"],
    ] as const) {
      createButton(
        panel,
        text,
        x,
        -81,
        94,
        36,
        {
          fill: COLORS.inkGreenLight,
          stroke: COLORS.goldMuted,
          fontSize: 14,
          enabled:
            canUseDebugMutation &&
            (target !== "fill_experience" ||
              state.bootstrap?.progress.status === "gaining"),
        },
        () => {
          this.actions.feedback();
          this.actions.grantDebug(target);
        },
      );
    }
    addLabel(
      panel,
      `离线模拟 · 种子：${this.debugDropSeed === null ? "随机" : `固定 ${this.debugDropSeed}`}`,
      -141,
      -129,
      280,
      30,
      14,
      COLORS.textMuted,
      false,
      1,
      HorizontalTextAlignment.LEFT,
    );
    const seedInput = createTextInput(
      panel,
      this.debugDropSeedDraft,
      "0-4294967295",
      -75,
      -177,
      120,
      36,
      (value) => {
        this.debugDropSeedDraft = value;
        this.debugDropSeedError = null;
      },
      (value) => this.useFixedDebugDropSeed(value),
      true,
      {
        name: "DebugDropSeedInput",
        fontSize: 14,
        inputMode: EditBox.InputMode.NUMERIC,
        maxLength: 10,
      },
    );
    createButton(
      panel,
      "固定",
      30,
      -177,
      66,
      36,
      {
        fill: this.debugDropSeed === null ? COLORS.inkGreenLight : COLORS.inkGreen,
        stroke: COLORS.goldMuted,
        fontSize: 14,
      },
      () => {
        this.actions.feedback();
        this.useFixedDebugDropSeed(seedInput.string);
      },
    );
    createButton(
      panel,
      "随机",
      108,
      -177,
      66,
      36,
      {
        fill: this.debugDropSeed === null ? COLORS.inkGreen : COLORS.inkGreenLight,
        stroke: COLORS.goldMuted,
        fontSize: 14,
      },
      () => {
        this.actions.feedback();
        this.debugDropSeed = null;
        this.debugDropSeedError = null;
        this.refreshDebugPanel();
      },
    );
    for (const [seconds, x, text] of [
      [3_600, -102, "离线 1h"],
      [28_800, 0, "离线 8h"],
      [86_400, 102, "离线 24h"],
    ] as const) {
      createButton(
        panel,
        text,
        x,
        -225,
        94,
        36,
        {
          fill: COLORS.inkGreenLight,
          stroke: COLORS.goldMuted,
          fontSize: 14,
          enabled: canUseDebugMutation,
        },
        () => {
          this.actions.feedback();
          this.actions.simulateOffline(
            seconds,
            this.debugDropSeed ?? undefined,
          );
        },
      );
    }
    addLabel(
      panel,
      this.debugSaveResetArmed
        ? "再次确认后将永久清除本地存档"
        : "本地存档重置",
      -141,
      -273,
      280,
      30,
      13,
      COLORS.textMuted,
      false,
      1,
      HorizontalTextAlignment.LEFT,
    );
    createButton(
      panel,
      this.debugSaveResetArmed ? "再次确认" : "重置本地存档",
      0,
      -321,
      150,
      36,
      {
        fill: this.debugSaveResetArmed ? COLORS.red : COLORS.inkGreenLight,
        stroke: COLORS.goldMuted,
        fontSize: 14,
        enabled: canUseDebugMutation && state.bootstrap !== null,
      },
      () => {
        this.actions.feedback();
        const playerId = this.lastState?.bootstrap?.player.id;
        if (!playerId) return;
        if (!this.debugSaveResetArmed) {
          this.debugSaveResetArmed = true;
          this.refreshDebugPanel();
          return;
        }
        this.debugSaveResetArmed = false;
        this.actions.resetDebugSave(playerId, playerId);
      },
    );
    const debugMessage =
      state.errorMessage ?? this.debugDropSeedError ?? state.featureMessage;
    if (debugMessage) {
      addLabel(
        panel,
        debugMessage,
        0,
        -377,
        300,
        32,
        13,
        state.errorMessage || this.debugDropSeedError ? COLORS.red : COLORS.jade,
        false,
        1,
      );
    }
  }

  private useFixedDebugDropSeed(value: string): void {
    if (!DEBUG) return;
    this.debugDropSeedDraft = value;
    const seed = parseDebugDropSeed(value);
    if (seed === null) {
      this.debugDropSeedError = "掉落种子需为 0 至 4294967295 的整数";
      this.refreshDebugPanel();
      return;
    }
    this.debugDropSeed = seed;
    this.debugDropSeedDraft = String(seed);
    this.debugDropSeedError = null;
    this.refreshDebugPanel();
  }

  enqueueCultivationPresentation(plan: CultivationPresentationPlan): void {
    const queued = this.pendingPresentation;
    if (queued) {
      this.pendingPresentation =
        mergeCultivationPresentationPlans(queued, plan) ?? plan;
    } else if (this.activePresentation) {
      // The active effect already represents the prior snapshot. Keep only the
      // next authoritative hop; the next render will interrupt the old effect
      // and start from that hop without replaying the first segment.
      this.pendingPresentation = plan;
    } else {
      this.pendingPresentation = plan;
    }
    this.refreshDebugPanel();
  }

  interruptCultivationPresentation(clearQueue = false): void {
    this.activePresentationTween?.stop();
    this.activePresentationTween = null;
    this.activePresentation = null;
    for (const child of [...this.presentationRoot.children]) removeAndDestroy(child);
    if (clearQueue) this.pendingPresentation = null;
    this.refreshDebugPanel();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.interruptCultivationPresentation(true);
    this.loadingTween?.stop();
    this.loadingTween = null;
    this.cultivationGrowthTween?.stop();
    this.cultivationGrowthTween = null;
    this.containerRoot.destroy();
  }

  updateIdleAnimation(deltaSeconds = 0.5): void {
    if (this.idleLabel?.isValid) {
      this.idleFrame = (this.idleFrame + 1) % 4;
      this.idleLabel.string = `${this.idleMessage}${".".repeat(this.idleFrame)}`;
    }
    this.updateCultivationProjection(deltaSeconds);
  }

  acceptProfileName(displayName: string): void {
    this.profileNameSource = displayName;
    this.profileNameDraft = displayName;
  }

  preserveProfileNameDraft(displayName: string): void {
    this.profileNameDraft = displayName;
    if (this.profileNameSource === null) {
      this.profileNameSource =
        this.lastState?.bootstrap?.player.displayName ?? displayName;
    }
  }

  private pageWindow(
    list: PagedList,
    itemCount: number,
    pageSize: number,
  ): PageWindow {
    const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
    const page = Math.min(Math.max(0, this.pages[list]), pageCount - 1);
    this.pages[list] = page;
    return {
      page,
      pageCount,
      start: page * pageSize,
      end: Math.min(itemCount, (page + 1) * pageSize),
    };
  }

  private showPage(list: PagedList, page: number): void {
    this.actions.feedback();
    this.pages[list] = Math.max(0, page);
    if (this.lastState) this.render(this.lastState);
  }

  private tryStartCultivationPresentation(): void {
    const plan = this.pendingPresentation;
    const state = this.lastState;
    if (!plan || !state || this.activePresentation) return;
    if (
      shouldShowPartnerUnlockNotice(state) ||
      state.activeFeature !== null ||
      state.bootstrap?.offlineSettlement !== null ||
      state.selectedTab !== "cultivation"
    ) {
      return;
    }
    if (!snapshotMatchesPresentationTarget(state, plan)) {
      if (!snapshotMatchesPresentationSource(state, plan)) {
        this.pendingPresentation = null;
      }
      return;
    }
    if (state.phase !== "ready") return;

    this.pendingPresentation = null;
    this.activePresentation = plan;
    try {
      if (plan.kind === "breakthrough") {
        this.playBreakthroughPresentation(plan);
      } else if (plan.kind === "level_up") {
        this.playLevelUpPresentation(plan);
      } else {
        this.playPowerChangePresentation(plan);
      }
    } catch {
      this.activePresentationTween?.stop();
      this.activePresentationTween = null;
      this.activePresentation = null;
      for (const child of [...this.presentationRoot.children]) removeAndDestroy(child);
    }
    this.refreshDebugPanel();
  }

  private deferActivePresentation(): void {
    const active = this.activePresentation;
    if (!active) return;
    this.pendingPresentation = this.pendingPresentation
      ? mergeCultivationPresentationPlans(active, this.pendingPresentation) ??
        this.pendingPresentation
      : active;
    this.interruptCultivationPresentation();
  }

  private playPowerChangePresentation(plan: CultivationPresentationPlan): void {
    const overlay = createUiNode(this.presentationRoot, "PowerChangePresentation");
    setSize(overlay, 330, 112);
    overlay.setPosition(190, 440);
    const opacity = overlay.addComponent(UIOpacity);
    opacity.opacity = 0;
    drawBand(
      overlay,
      "PowerChangeBand",
      0,
      0,
      318,
      100,
      COLORS.panelStrong,
      plan.powerDirection === "decrease" ? COLORS.red : COLORS.gold,
    );
    addLabel(overlay, "总战力", -88, 22, 112, 28, 15, COLORS.textMuted);
    const powerLabel = addLabel(
      overlay,
      formatLargeNumber(plan.fromPower),
      48,
      22,
      176,
      36,
      23,
      COLORS.text,
      true,
    );
    const deltaPrefix = plan.powerDirection === "increase" ? "+" : "";
    addLabel(
      overlay,
      `战力 ${deltaPrefix}${formatLargeNumber(plan.powerDelta)}`,
      0,
      -25,
      280,
      30,
      17,
      plan.powerDirection === "decrease" ? COLORS.red : COLORS.jade,
      true,
    );

    this.activePresentationTween = tween(overlay)
      .update(0.22, (_target, progress) => {
        opacity.opacity = Math.round(255 * progress);
        overlay.setPosition(190, 422 + 18 * progress);
      })
      .update(0.78, (_target, progress) => {
        powerLabel.string = formatLargeNumber(
          interpolateBigNumberStrings(plan.fromPower, plan.toPower, progress),
        );
      })
      .delay(0.45)
      .update(0.25, (_target, progress) => {
        opacity.opacity = Math.round(255 * (1 - progress));
      })
      .call(() => this.completeCultivationPresentation(overlay))
      .start();
  }

  private playLevelUpPresentation(plan: CultivationPresentationPlan): void {
    const overlay = this.createBlockingPresentationOverlay(
      "LevelUpPresentation",
      150,
    );
    const opacity = overlay.getComponent(UIOpacity)!;
    opacity.opacity = 0;
    const formation = createUiNode(overlay, "GoldenFormation");
    formation.setPosition(0, 70);
    formation.setScale(0.72, 0.72, 1);
    drawGoldenFormation(formation);
    addLabel(overlay, "修为精进", 0, 272, 520, 62, 34, COLORS.gold, true);
    const levelLabel = addLabel(
      overlay,
      `Lv.${plan.fromLevel}`,
      0,
      83,
      520,
      96,
      58,
      COLORS.text,
      true,
    );
    addLabel(
      overlay,
      plan.levelGain > 1
        ? `${plan.fromRealmName} · 连升 ${plan.levelGain} 级`
        : plan.toRealmName,
      0,
      -6,
      570,
      42,
      22,
      COLORS.jade,
      true,
    );
    const powerLabel = addLabel(
      overlay,
      `战力 ${formatLargeNumber(plan.fromPower)}`,
      0,
      -82,
      590,
      48,
      25,
      COLORS.text,
      true,
    );
    addLabel(
      overlay,
      formatSignedPowerDelta(plan.powerDelta),
      0,
      -126,
      420,
      36,
      19,
      COLORS.gold,
      true,
    );

    this.activePresentationTween = tween(overlay)
      .update(0.3, (_target, progress) => {
        opacity.opacity = Math.round(255 * progress);
        formation.setScale(0.72 + 0.28 * progress, 0.72 + 0.28 * progress, 1);
      })
      .update(1.2, (_target, progress) => {
        formation.angle = progress * 54;
        const level = Math.min(
          plan.toLevel,
          plan.fromLevel + Math.max(1, Math.ceil(plan.levelGain * progress)),
        );
        levelLabel.string = `Lv.${level}`;
        powerLabel.string = `战力 ${formatLargeNumber(
          interpolateBigNumberStrings(plan.fromPower, plan.toPower, progress),
        )}`;
      })
      .delay(0.65)
      .update(0.35, (_target, progress) => {
        opacity.opacity = Math.round(255 * (1 - progress));
        formation.setScale(1 + 0.12 * progress, 1 + 0.12 * progress, 1);
      })
      .call(() => this.completeCultivationPresentation(overlay))
      .start();
  }

  private playBreakthroughPresentation(plan: CultivationPresentationPlan): void {
    const overlay = this.createBlockingPresentationOverlay(
      "BreakthroughPresentation",
      242,
    );
    const opacity = overlay.getComponent(UIOpacity)!;
    opacity.opacity = 0;
    const storm = createUiNode(overlay, "TribulationStorm");
    drawTribulationLightning(storm);
    const stormOpacity = storm.addComponent(UIOpacity);
    stormOpacity.opacity = 0;
    const oldRealm = addLabel(
      overlay,
      plan.fromRealmName,
      0,
      168,
      560,
      52,
      25,
      COLORS.textMuted,
      true,
    );
    const divider = addLabel(overlay, "破", 0, 82, 120, 70, 42, COLORS.red, true);
    const realmLabel = addLabel(
      overlay,
      plan.toRealmName,
      0,
      -5,
      620,
      90,
      52,
      COLORS.gold,
      true,
    );
    realmLabel.node.setScale(0.62, 0.62, 1);
    const levelLabel = addLabel(
      overlay,
      `Lv.${plan.toLevel}`,
      0,
      -84,
      340,
      52,
      27,
      COLORS.jade,
      true,
    );
    const powerLabel = addLabel(
      overlay,
      `战力 ${formatLargeNumber(plan.fromPower)}`,
      0,
      -159,
      590,
      44,
      22,
      COLORS.text,
      true,
    );
    oldRealm.node.active = false;
    divider.node.active = false;
    realmLabel.node.active = false;
    levelLabel.node.active = false;
    powerLabel.node.active = false;

    this.activePresentationTween = tween(overlay)
      .update(0.38, (_target, progress) => {
        opacity.opacity = Math.round(255 * progress);
      })
      .update(0.7, (_target, progress) => {
        stormOpacity.opacity = Math.round(
          255 * (Math.sin(progress * Math.PI * 7) > 0.1 ? 1 : 0.18),
        );
        storm.setPosition(
          Math.sin(progress * Math.PI * 18) * 8,
          Math.cos(progress * Math.PI * 14) * 5,
        );
      })
      .call(() => {
        stormOpacity.opacity = 115;
        oldRealm.node.active = true;
        divider.node.active = true;
        realmLabel.node.active = true;
        levelLabel.node.active = true;
        powerLabel.node.active = true;
      })
      .update(0.75, (_target, progress) => {
        realmLabel.node.setScale(0.62 + 0.38 * progress, 0.62 + 0.38 * progress, 1);
        powerLabel.string = `战力 ${formatLargeNumber(
          interpolateBigNumberStrings(plan.fromPower, plan.toPower, progress),
        )}`;
      })
      .delay(0.85)
      .update(0.45, (_target, progress) => {
        opacity.opacity = Math.round(255 * (1 - progress));
      })
      .call(() => this.completeCultivationPresentation(overlay))
      .start();
  }

  private createBlockingPresentationOverlay(name: string, shadeAlpha: number): Node {
    const overlay = createUiNode(this.presentationRoot, name);
    this.setFullscreenSize(overlay);
    overlay.addComponent(BlockInputEvents);
    overlay.addComponent(UIOpacity);
    const shade = overlay.addComponent(Graphics);
    const shadeColor = color("#030609");
    shadeColor.a = shadeAlpha;
    shade.fillColor = shadeColor;
    this.drawFullscreenRect(shade);
    shade.fill();
    return overlay;
  }

  private completeCultivationPresentation(overlay: Node): void {
    if (this.activePresentationTween?.getTarget() !== overlay) return;
    this.activePresentationTween = null;
    this.activePresentation = null;
    removeAndDestroy(overlay);
    this.tryStartCultivationPresentation();
    this.refreshDebugPanel();
  }

  private drawBackdrop(): void {
    const graphics = graphicsNode(this.root, "Backdrop", 0, 0);
    graphics.fillColor = COLORS.background;
    this.drawFullscreenRect(graphics);
    graphics.fill();

    graphics.fillColor = COLORS.backgroundBlue;
    graphics.circle(265, 470, 108);
    graphics.fill();
    graphics.strokeColor = COLORS.goldMuted;
    graphics.lineWidth = 2;
    graphics.circle(265, 470, 83);
    graphics.stroke();

    drawMountainLayer(graphics, -520, COLORS.inkGreen, [
      [-375, 0],
      [-260, 105],
      [-178, 28],
      [-60, 145],
      [52, 32],
      [180, 118],
      [290, 22],
      [375, 82],
    ]);
    drawMountainLayer(graphics, -585, COLORS.black, [
      [-375, 0],
      [-240, 76],
      [-130, 22],
      [-12, 94],
      [122, 18],
      [236, 62],
      [375, 10],
    ]);

    graphics.strokeColor = COLORS.goldMuted;
    graphics.lineWidth = 1;
    for (const [x, y] of [
      [-305, 440],
      [-255, 360],
      [190, 350],
      [305, 285],
      [-190, -425],
    ] as const) {
      graphics.moveTo(x - 8, y);
      graphics.lineTo(x + 8, y);
      graphics.moveTo(x, y - 8);
      graphics.lineTo(x, y + 8);
    }
    graphics.stroke();
  }

  private drawLoading(message: string): void {
    addLabel(this.root, "我的修仙日记", 0, 170, 570, 74, 46, COLORS.gold, true);
    addLabel(this.root, message, 0, 72, 560, 48, 25, COLORS.text);
    addLabel(
      this.root,
      "筑基，是修行途中的第一道门槛",
      0,
      -230,
      610,
      42,
      20,
      COLORS.textMuted,
    );

    const seal = createUiNode(this.root, "LoadingSeal");
    seal.setPosition(0, -38);
    setSize(seal, 108, 108);
    const graphic = seal.addComponent(Graphics);
    graphic.strokeColor = COLORS.gold;
    graphic.lineWidth = 4;
    graphic.circle(0, 0, 46);
    graphic.stroke();
    graphic.strokeColor = COLORS.jade;
    graphic.lineWidth = 2;
    graphic.moveTo(-25, 0);
    graphic.lineTo(25, 0);
    graphic.moveTo(0, -25);
    graphic.lineTo(0, 25);
    graphic.stroke();
    const opacity = seal.addComponent(UIOpacity);
    this.loadingTween = tween(seal)
      .repeatForever(
        tween(seal)
          .update(0.75, (_target, progress) => {
            opacity.opacity = Math.round(255 - 165 * progress);
          })
          .update(0.75, (_target, progress) => {
            opacity.opacity = Math.round(90 + 165 * progress);
          }),
      )
      .start();
  }

  private drawError(message: string): void {
    addLabel(this.root, "问道未成", 0, 110, 560, 68, 38, COLORS.gold, true);
    addLabel(this.root, message, 0, 18, 590, 100, 23, COLORS.text, false, 2);
    createButton(
      this.root,
      "重新连接",
      0,
      this.safeModalButtonY(-105, 72),
      248,
      72,
      { fill: COLORS.inkGreenLight, stroke: COLORS.gold, text: COLORS.text },
      () => {
        this.actions.feedback();
        this.actions.retry();
      },
    );
  }

  private drawHeader(state: Readonly<AppState>): void {
    const bootstrap = state.bootstrap!;
    const { centerX, width, headerCenterY } = this.chromeGeometry;
    const left = centerX - width / 2;
    const right = centerX + width / 2;
    drawBand(
      this.root,
      "Header",
      centerX,
      headerCenterY,
      width,
      154,
      COLORS.panelStrong,
      COLORS.goldMuted,
    );

    const avatarButton = createUiNode(this.root, "HeaderAvatarButton");
    avatarButton.setPosition(left + 58, headerCenterY + 3);
    setSize(avatarButton, 108, 142);
    const avatarFrame = avatarButton.addComponent(Graphics);
    avatarFrame.fillColor = COLORS.black;
    avatarFrame.circle(0, 7, 50);
    avatarFrame.fill();
    avatarFrame.strokeColor = COLORS.gold;
    avatarFrame.lineWidth = 3;
    avatarFrame.circle(0, 7, 52);
    avatarFrame.stroke();
    const playerAvatarArt =
      bootstrap.player.avatarVariant === "neutral"
        ? undefined
        : this.supplementalArt.playerAvatars[bootstrap.player.avatarVariant];
    if (playerAvatarArt) {
      drawContainedSprite(
        avatarButton,
        "PlayerAvatarArt",
        playerAvatarArt,
        0,
        7,
        88,
        88,
      );
    } else {
      drawAvatarPortrait(
        avatarButton,
        bootstrap.player.avatarVariant,
        0,
        7,
        1.48,
      );
    }
    const avatarClick = avatarButton.addComponent(Button);
    avatarClick.transition = Button.Transition.SCALE;
    avatarClick.zoomScale = 0.95;
    avatarButton.on(Button.EventType.CLICK, () => {
      this.actions.feedback();
      this.actions.openFeature("profile");
    });
    addLabel(
      avatarButton,
      "档案",
      0,
      -55,
      92,
      24,
      14,
      COLORS.goldBright,
      true,
      1,
      HorizontalTextAlignment.CENTER,
      "fixed",
    );

    const profileX = left + 184;

    addLabel(
      this.root,
      bootstrap.player.displayName,
      profileX,
      headerCenterY + 42,
      150,
      34,
      22,
      COLORS.text,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      this.root,
      bootstrap.progress.title,
      profileX,
      headerCenterY + 8,
      150,
      28,
      17,
      COLORS.goldBright,
      false,
      1,
      HorizontalTextAlignment.LEFT,
    );

    addLabel(
      this.root,
      `Lv.${bootstrap.progress.level}`,
      profileX,
      headerCenterY - 24,
      150,
      26,
      16,
      COLORS.text,
      true,
      1,
      HorizontalTextAlignment.LEFT,
      "fixed",
    );
    drawProgress(
      this.root,
      profileX,
      headerCenterY - 52,
      148,
      8,
      ratio(bootstrap.progress.experience, bootstrap.progress.requiredExperience),
    );

    drawPowerBanner(
      this.root,
      centerX + 54,
      headerCenterY - 17,
      formatLargeNumber(bootstrap.progress.totalPower),
    );
    drawCurrencyChip(
      this.root,
      right - 72,
      headerCenterY + 7,
      "灵石",
      formatLargeNumber(bootstrap.wallet.spiritStone),
      COLORS.goldBright,
    );

    const divider = graphicsNode(
      this.root,
      "HeaderDivider",
      centerX,
      headerCenterY - 76,
    );
    divider.strokeColor = COLORS.goldMuted;
    divider.lineWidth = 1;
    divider.moveTo(-width / 2, 0);
    divider.lineTo(width / 2, 0);
    divider.stroke();
  }

  private drawSyncStatus(state: Readonly<AppState>): void {
    if (state.storageStatus === "saved") return;
    drawBand(
      this.root,
      "SyncStatus",
      this.chromeGeometry.centerX,
      this.chromeGeometry.statusBannerCenterY,
      this.chromeGeometry.width,
      30,
      COLORS.red,
    );
    addLabel(
      this.root,
      "本地存档不可用，本次进度仅保留到退出游戏",
      this.chromeGeometry.centerX,
      this.chromeGeometry.statusBannerCenterY,
      Math.max(120, this.chromeGeometry.width - 40),
      24,
      15,
      COLORS.text,
      true,
      1,
      HorizontalTextAlignment.CENTER,
      "fixed",
    );
  }

  private drawMainFeatureMessage(
    display: Extract<FeatureMessageDisplay, { readonly surface: "main" }>,
  ): void {
    const geometry = getMainFeatureMessageGeometry(display.tab);
    drawBand(
      this.root,
      "MainFeatureMessage",
      geometry.x,
      geometry.y,
      geometry.width,
      geometry.height,
      withAlpha(COLORS.inkGreenLight, 246),
      COLORS.goldMuted,
    );
    addLabel(
      this.root,
      display.text,
      geometry.x,
      geometry.y,
      geometry.labelWidth,
      geometry.labelHeight,
      display.tab === "cultivation" ? 15 : 16,
      COLORS.goldBright,
      true,
      display.maxLines,
      HorizontalTextAlignment.CENTER,
      "fixed",
    );
  }

  private drawCultivation(
    state: Readonly<AppState>,
    featureMessageDisplay: FeatureMessageDisplay | null,
  ): void {
    const data = state.bootstrap!;
    const featureMessageOpen =
      featureMessageDisplay?.surface === "main" &&
      featureMessageDisplay.tab === "cultivation";
    const hasBackground = this.hasMainBackground("cultivation");
    const mutationsEnabled = canRunLocalMutation(state);
    const projection = this.resolveCultivationProjection(state);
    const progressDisplay = getCultivationProgressDisplay(
      projection.progress,
      data.config.maxLevel,
    );
    // Built from the projected progress so the affordable count matches the
    // reserve the line above it is currently showing.
    const daoDisplay = getDaoDisplay({ ...data, progress: projection.progress });
    const pendingTasks = countPendingProgressionTasks(
      data.progressionTasks,
      VISIBLE_PROGRESSION_TASK_COUNT,
    );
    const pendingHarvest = data.harvestChest.pendingCount;
    if (!hasBackground) this.drawCultivationScene();
    if (hasBackground) {
      const cultivatorArt =
        data.player.avatarVariant === "neutral"
          ? undefined
          : this.supplementalArt.cultivators[data.player.avatarVariant];
      if (cultivatorArt) {
        drawContainedSprite(
          this.root,
          "CultivatorArt",
          cultivatorArt,
          0,
          42,
          520,
          730,
        );
      } else {
        drawCultivatorFigure(this.root, data.player.avatarVariant, 0, 54);
      }
    }
    drawOrnatePanel(this.root, "RealmBanner", 0, 452, 408, 78);
    addLabel(
      this.root,
      `当前境界 · ${data.progress.title}`,
      0,
      468,
      372,
      32,
      21,
      COLORS.text,
      true,
      1,
      HorizontalTextAlignment.CENTER,
      "fixed",
    );
    addLabel(
      this.root,
      `修炼效率 ${formatLargeNumber(data.progress.experiencePerSecond)}/秒`,
      0,
      438,
      372,
      26,
      16,
      COLORS.green,
      true,
      1,
      HorizontalTextAlignment.CENTER,
      "fixed",
    );

    const sideActions: ReadonlyArray<{
      readonly label: string;
      readonly x: number;
      readonly y: number;
      readonly icon: number;
      readonly badge: number;
      readonly feature: FeaturePanel;
    }> = [
      { label: "仙途", x: -322, y: 360, icon: 4, badge: 0, feature: "profile" },
      { label: "任务", x: -322, y: 255, icon: 3, badge: pendingTasks, feature: "tasks" },
      { label: "行囊", x: -322, y: 150, icon: 2, badge: 0, feature: "inventory" },
      { label: "功法", x: 322, y: 360, icon: 0, badge: 0, feature: "techniques" },
      { label: "法宝", x: 322, y: 255, icon: 1, badge: 0, feature: "equipment" },
      { label: "收获", x: 322, y: 150, icon: 5, badge: pendingHarvest, feature: "inventory" },
    ];
    for (const action of sideActions) {
      // The right-side main navigation occupies this space when a full-screen
      // background is present. All three features remain reachable from the
      // two bottom rails, so keep only the unobstructed left-side shortcuts.
      if (hasBackground && action.x > 0) continue;
      createSideFeatureButton(
        this.root,
        action.label,
        action.x,
        action.y,
        action.icon,
        action.badge,
        () => {
          this.actions.feedback();
          this.actions.openFeature(action.feature);
        },
      );
    }

    this.idleMessage = progressDisplay.idleMessage;
    this.idleLabel = addLabel(
      this.root,
      this.idleMessage,
      0,
      310,
      330,
      48,
      27,
      COLORS.goldBright,
      true,
      1,
      HorizontalTextAlignment.CENTER,
      "fixed",
    );

    drawOrnatePanel(this.root, "CultivationStatus", 0, -172, 422, 286);
    addLabel(
      this.root,
      `${progressDisplay.rateLabel} · ${formatLargeNumber(data.progress.experiencePerSecond)}/秒`,
      0,
      -58,
      376,
      34,
      20,
      COLORS.goldBright,
      true,
      1,
      HorizontalTextAlignment.CENTER,
      "fixed",
    );
    this.cultivationExperienceLabel = addLabel(
      this.root,
      progressDisplay.experienceLine,
      0,
      -108,
      374,
      30,
      18,
      progressDisplay.isVersionCap ? COLORS.gold : COLORS.text,
      progressDisplay.isVersionCap,
      1,
      HorizontalTextAlignment.CENTER,
      "fixed",
    );
    if (progressDisplay.reserveLine) {
      this.cultivationReserveLabel = addLabel(
        this.root,
        progressDisplay.reserveLine,
        0,
        -146,
        370,
        28,
        16,
        COLORS.jade,
        true,
        1,
        HorizontalTextAlignment.CENTER,
        "fixed",
      );
    } else {
      this.cultivationProgressGraphic = drawProgress(
        this.root,
        0,
        -145,
        354,
        11,
        progressDisplay.progressRatio ?? 0,
      );
    }
    if (
      !featureMessageOpen &&
      mutationsEnabled &&
      data.progress.status !== "breakthrough_ready"
    ) {
      this.cultivationGrowthLabel = addLabel(
        this.root,
        liveCultivationGainText(
          data.progress.status,
          projection.gainedSinceAnchor,
        ),
        0,
        -174,
        370,
        26,
        14,
        COLORS.green,
        true,
        1,
        HorizontalTextAlignment.CENTER,
        "fixed",
      );
    }
    this.lastCultivationProjectionSecond = projection.elapsedWholeSeconds;
    this.lastCultivationProjectionGain = projection.gainedSinceAnchor;

    if (!featureMessageOpen) {
      addLabel(
        this.root,
        `灵石收益  ${formatLargeNumber(data.progress.spiritStonePerMinute)}/分`,
        0,
        -205,
        372,
        30,
        18,
        COLORS.cyan,
        true,
        1,
        HorizontalTextAlignment.CENTER,
        "fixed",
      );
    }

    if (data.progress.status === "breakthrough_ready") {
      createButton(
        this.root,
        "突破境界",
        0,
        -267,
        286,
        62,
        {
          fill: COLORS.goldMuted,
          stroke: COLORS.gold,
          text: COLORS.black,
          fontSize: 25,
          enabled: mutationsEnabled,
        },
        () => this.actions.breakthrough(),
      );
    } else if (daoDisplay.visible) {
      // At the cap "修炼进行中" says nothing — the level cannot move again. The
      // slot goes to 悟道 instead, the one place the reserve on the line above
      // can be spent.
      addLabel(
        this.root,
        daoDisplay.titleText,
        0,
        -248,
        374,
        26,
        18,
        COLORS.gold,
        true,
        1,
        HorizontalTextAlignment.CENTER,
        "fixed",
      );
      addLabel(
        this.root,
        daoDisplay.bonusText,
        0,
        -274,
        374,
        24,
        14,
        COLORS.green,
        false,
        1,
        HorizontalTextAlignment.CENTER,
        "fixed",
      );
      addLabel(
        this.root,
        daoDisplay.costText,
        0,
        -296,
        374,
        22,
        13,
        COLORS.textMuted,
        false,
        1,
        HorizontalTextAlignment.CENTER,
        "fixed",
      );
      const daoEnabled = mutationsEnabled && daoDisplay.actionEnabled;
      createButton(
        this.root,
        daoDisplay.actionText,
        -78,
        -338,
        148,
        52,
        {
          fill: daoEnabled ? COLORS.goldMuted : COLORS.panel,
          stroke: COLORS.gold,
          text: daoEnabled ? COLORS.black : COLORS.textMuted,
          fontSize: 22,
          enabled: daoEnabled,
        },
        () => this.actions.cultivateDao(1),
      );
      createButton(
        this.root,
        daoDisplay.batchActionText,
        78,
        -338,
        148,
        52,
        {
          fill: COLORS.panel,
          stroke: daoEnabled ? COLORS.gold : COLORS.goldMuted,
          text: daoEnabled ? COLORS.gold : COLORS.textMuted,
          fontSize: 18,
          enabled: daoEnabled,
        },
        () => this.actions.cultivateDao(daoDisplay.affordableLevels),
      );
    } else {
      createButton(
        this.root,
        "修炼进行中",
        0,
        -267,
        286,
        62,
        {
          fill: COLORS.panel,
          stroke: COLORS.goldMuted,
          text: COLORS.textMuted,
          fontSize: 23,
          enabled: false,
        },
        () => undefined,
      );
    }
    if (!featureMessageOpen && progressDisplay.footer) {
      this.cultivationFooterLabel = addLabel(
        this.root,
        progressDisplay.footer,
        0,
        -224,
        374,
        28,
        15,
        COLORS.textMuted,
        false,
        1,
        HorizontalTextAlignment.CENTER,
        "fixed",
      );
    }

    const featureY =
      this.chromeGeometry.navigationCenterY -
      this.chromeGeometry.bodyOffsetY +
      140;
    drawBand(
      this.root,
      "FeatureRail",
      0,
      featureY,
      750,
      106,
      withAlpha(COLORS.panelStrong, 246),
      COLORS.goldMuted,
    );
    const features: Array<{ label: string; feature: FeaturePanel }> = [
      { label: "功法", feature: "techniques" },
      { label: "法宝", feature: "equipment" },
      { label: "行囊", feature: "inventory" },
      { label: "任务", feature: "tasks" },
      { label: "档案", feature: "profile" },
    ];
    features.forEach((item, index) => {
      const x = -292 + index * 146;
      createFeatureButton(this.root, item.label, x, featureY, index, () => {
        this.actions.feedback();
        this.actions.openFeature(item.feature);
      });
    });
  }

  private updateCultivationProjectionAnchor(
    state: Readonly<AppState>,
  ): void {
    const data = state.bootstrap;
    if (state.phase !== "ready" || !data) {
      this.cultivationProjectionAnchor = null;
      return;
    }

    const progress = data.progress;
    const settlementKey = liveCultivationSettlementKey(progress);
    const key = [
      data.account.id,
      data.player.id,
      state.lastSavedAt ?? "",
      settlementKey,
      progress.experiencePerSecond,
      progress.experienceBonusBp,
    ].join(":");
    if (this.cultivationProjectionAnchor?.key === key) return;
    const elapsedMilliseconds = initialLiveCultivationElapsed(
      state.lastSavedAt,
      progress.settledAt,
      true,
    );
    if (elapsedMilliseconds === null) {
      this.cultivationProjectionAnchor = null;
      return;
    }
    this.cultivationProjectionAnchor = {
      accountId: data.account.id,
      playerId: data.player.id,
      key,
      settlementKey,
      progress: { ...progress },
      elapsedMilliseconds,
    };
  }

  private resolveCultivationProjection(
    state: Readonly<AppState>,
  ) {
    const data = state.bootstrap!;
    const anchor = this.cultivationProjectionAnchor;
    return projectLiveCultivation({
      progress: anchor?.progress ?? data.progress,
      elapsedMilliseconds: anchor?.elapsedMilliseconds ?? 0,
      online: anchor !== null,
    });
  }

  private updateCultivationProjection(deltaSeconds: number): void {
    const state = this.lastState;
    if (
      !state?.bootstrap ||
      state.phase !== "ready" ||
      !this.cultivationProjectionAnchor
    ) {
      return;
    }

    this.cultivationProjectionAnchor.elapsedMilliseconds =
      advanceLiveCultivationElapsed(
        this.cultivationProjectionAnchor.elapsedMilliseconds,
        deltaSeconds,
        this.debugLifecycleStatus === "foreground",
      );
    if (state.selectedTab !== "cultivation") return;

    const projection = this.resolveCultivationProjection(state);
    if (projection.elapsedWholeSeconds === this.lastCultivationProjectionSecond) {
      return;
    }
    this.lastCultivationProjectionSecond = projection.elapsedWholeSeconds;
    const gainChanged =
      projection.gainedSinceAnchor !== this.lastCultivationProjectionGain;
    this.lastCultivationProjectionGain = projection.gainedSinceAnchor;
    const display = getCultivationProgressDisplay(
      projection.progress,
      state.bootstrap.config.maxLevel,
    );
    if (this.cultivationExperienceLabel?.isValid) {
      this.cultivationExperienceLabel.string = display.experienceLine;
    }
    if (this.cultivationReserveLabel?.isValid && display.reserveLine) {
      this.cultivationReserveLabel.string = display.reserveLine;
    }
    if (this.cultivationGrowthLabel?.isValid) {
      this.cultivationGrowthLabel.string = liveCultivationGainText(
        state.bootstrap.progress.status,
        projection.gainedSinceAnchor,
      );
      if (gainChanged && projection.gainedSinceAnchor !== "0") {
        this.pulseCultivationGrowth();
      }
    }
    if (this.cultivationProgressGraphic?.isValid && display.progressRatio !== null) {
      redrawProgress(this.cultivationProgressGraphic, 620, 10, display.progressRatio);
    }
    if (this.cultivationFooterLabel?.isValid && display.footer) {
      this.cultivationFooterLabel.string = display.footer;
    }
  }

  private pulseCultivationGrowth(): void {
    const node = this.cultivationGrowthLabel?.node;
    if (!node?.isValid) return;

    this.cultivationGrowthTween?.stop();
    node.setScale(1.08, 1.08, 1);
    const activeTween = tween(node)
      .update(0.24, (_target, progress) => {
        const scale = 1.08 - 0.08 * progress;
        node.setScale(scale, scale, 1);
      })
      .call(() => {
        node.setScale(1, 1, 1);
        this.cultivationGrowthTween = null;
      });
    this.cultivationGrowthTween = activeTween;
    activeTween.start();
  }

  private drawCultivationScene(): void {
    const hasBackground = this.hasMainBackground("cultivation");
    if (hasBackground) return;
    drawBand(
      this.root,
      "CultivationScene",
      0,
      292,
      686,
      472,
      hasBackground ? withAlpha(COLORS.inkGreen, 138) : COLORS.inkGreen,
    );
    const art = graphicsNode(this.root, "CultivationArt", 0, 292);

    art.fillColor = hasBackground
      ? withAlpha(color("#d5d0b7"), 170)
      : color("#d5d0b7");
    art.circle(222, 126, 58);
    art.fill();
    art.fillColor = hasBackground
      ? withAlpha(COLORS.inkGreenLight, 160)
      : COLORS.inkGreenLight;
    art.circle(244, 140, 58);
    art.fill();

    drawMountainLayer(
      art,
      -180,
      hasBackground
        ? withAlpha(color("#285447"), 136)
        : color("#285447"),
      [
        [-343, 0],
        [-240, 112],
        [-155, 38],
        [-58, 150],
        [52, 45],
        [158, 123],
        [245, 30],
        [343, 82],
      ],
    );
    drawMountainLayer(
      art,
      -218,
      hasBackground
        ? withAlpha(color("#102a27"), 168)
        : color("#102a27"),
      [
        [-343, 10],
        [-223, 75],
        [-112, 22],
        [15, 94],
        [128, 16],
        [248, 72],
        [343, 26],
      ],
    );

    art.fillColor = COLORS.black;
    art.circle(0, 88, 38);
    art.fill();
    art.moveTo(-38, 56);
    art.lineTo(-92, -122);
    art.lineTo(0, -172);
    art.lineTo(92, -122);
    art.lineTo(38, 56);
    art.close();
    art.fill();

    art.fillColor = COLORS.panelStrong;
    art.moveTo(-20, 53);
    art.lineTo(-48, -112);
    art.lineTo(0, -144);
    art.lineTo(48, -112);
    art.lineTo(20, 53);
    art.close();
    art.fill();

    art.strokeColor = COLORS.gold;
    art.lineWidth = 5;
    art.moveTo(-50, -62);
    art.lineTo(50, -62);
    art.stroke();
    art.strokeColor = COLORS.goldMuted;
    art.lineWidth = 4;
    art.moveTo(52, 48);
    art.lineTo(116, -142);
    art.stroke();

    art.strokeColor = COLORS.jade;
    art.lineWidth = 2;
    art.circle(0, -18, 128);
    art.stroke();
    art.lineWidth = 1;
    art.circle(0, -18, 146);
    art.stroke();
  }

  private drawPartner(state: Readonly<AppState>): void {
    if (!state.bootstrap!.unlocks.partner) {
      this.drawLockedPage(
        "伴侣",
        "筑基后开启",
        "修为达到 Lv.11 即可踏入此境",
        "partner",
      );
      return;
    }

    const snapshot = state.bootstrap!;
    const partner = selectedPartner(snapshot);
    const confirmation = getPartnerConfirmationDisplay(
      this.socialConfirmationState.partnerId,
    );
    drawBand(
      this.root,
      "PartnerPanel",
      -56,
      130,
      566,
      720,
      this.hasMainBackground("partner")
        ? withAlpha(COLORS.inkGreen, 150)
        : COLORS.inkGreen,
    );
    if (!partner) {
      if (confirmation) {
        this.drawPartnerConfirmation(confirmation);
        return;
      }
      addLabel(this.root, "选择道侣", -56, 410, 500, 50, 30, COLORS.gold, true);
      addLabel(this.root, "结缘后不可更换，请确认你的修行方向", -56, 355, 500, 34, 17, COLORS.textMuted);
      PARTNER_CONFIGS.forEach((candidate, index) => {
        const y = 230 - index * 145;
        drawBand(this.root, `PartnerCandidate-${candidate.id}`, -56, y, 500, 112, COLORS.panel, COLORS.goldMuted);
        addLabel(this.root, candidate.displayName, -238, y + 27, 180, 32, 20, COLORS.gold, true);
        addLabel(this.root, `${candidate.epithet}　${socialBonusText(candidate, 1)}`, -48, y + 27, 270, 30, 15, COLORS.jade);
        createButton(
          this.root,
          "结缘",
          186,
          y,
          88,
          44,
          { fill: COLORS.inkGreen, stroke: COLORS.goldMuted, fontSize: 15 },
          () => this.beginPartnerConfirmation(candidate.id),
        );
      });
      return;
    }
    addLabel(this.root, partner.displayName, -56, 370, 500, 54, 32, COLORS.gold, true);
    addLabel(this.root, partner.epithet, -56, 322, 500, 32, 18, COLORS.text);
    addLabel(
      this.root,
      `亲密等级 Lv.${snapshot.partner.level}　${socialBonusText(partner, snapshot.partner.level)}`,
      -56,
      260,
      500,
      34,
      18,
      COLORS.jade,
    );
    addLabel(this.root, partnerProgressText(snapshot), -56, 205, 500, 34, 18, COLORS.textMuted);
    drawProgress(
      this.root,
      -56,
      160,
      430,
      14,
      snapshot.partner.level >= PARTNER_MAX_LEVEL
        ? 1
        : snapshot.partner.bond / ((snapshot.partner.level + 1) * 100),
    );
    createButton(
      this.root,
      snapshot.partner.level >= PARTNER_MAX_LEVEL ? "已圆满" : "双修",
      -56,
      75,
      170,
      58,
      {
        fill: COLORS.inkGreen,
        stroke: COLORS.gold,
        text: COLORS.gold,
        fontSize: 19,
        enabled: snapshot.partner.level < PARTNER_MAX_LEVEL,
      },
      () => this.actions.cultivateWithPartner(),
    );
    addLabel(
      this.root,
      `双修丹 ${snapshot.inventory.stacks.find((stack) => stack.itemConfigId === "dual_cultivation_pill")?.quantity ?? "0"}`,
      -56,
      15,
      300,
      32,
      16,
      COLORS.textMuted,
    );
  }

  private drawPartnerConfirmation(
    confirmation: NonNullable<
      ReturnType<typeof getPartnerConfirmationDisplay>
    >,
  ): void {
    addLabel(
      this.root,
      confirmation.title,
      -56,
      400,
      500,
      50,
      29,
      COLORS.gold,
      true,
    );
    addLabel(
      this.root,
      confirmation.displayName,
      -56,
      298,
      500,
      54,
      34,
      COLORS.text,
      true,
    );
    addLabel(this.root, confirmation.detailText, -56, 246, 500, 34, 18, COLORS.textMuted);
    addLabel(this.root, confirmation.bonusText, -56, 174, 500, 40, 20, COLORS.jade, true);
    addLabel(this.root, confirmation.irreversibleText, -56, 96, 500, 38, 19, COLORS.gold, true);
    addLabel(this.root, confirmation.persistenceText, -56, 56, 500, 30, 15, COLORS.textMuted);
    createButton(
      this.root,
      confirmation.cancelLabel,
      -161,
      -22,
      190,
      58,
      { fill: COLORS.panel, stroke: COLORS.goldMuted, fontSize: 18 },
      () => this.cancelSocialConfirmation(),
    );
    createButton(
      this.root,
      confirmation.confirmLabel,
      49,
      -22,
      190,
      58,
      { fill: COLORS.red, stroke: COLORS.gold, fontSize: 18 },
      () => this.confirmPartnerSelection(),
    );
  }

  private drawRanking(
    state: Readonly<AppState>,
    featureMessageDisplay: FeatureMessageDisplay | null,
  ): void {
    const hasBackground = this.hasMainBackground("ranking");
    const tabEntries: ReadonlyArray<{ label: string; category: RankingCategory }> = [
      { label: "战力", category: "power" },
      { label: "等级", category: "level" },
      { label: "财富", category: "wealth" },
      { label: "洞府", category: "cave" },
      { label: "伴侣", category: "partner" },
    ];
    const entries = buildLocalRanking(state.bootstrap!, this.rankingCategory);
    tabEntries.forEach((tab, index) => {
      const x = -280 + index * 112;
      drawBand(
        this.root,
        `RankTab${index}`,
        x,
        474,
        102,
        54,
        hasBackground
          ? withAlpha(tab.category === this.rankingCategory ? COLORS.inkGreenLight : COLORS.panel, 224)
          : tab.category === this.rankingCategory ? COLORS.inkGreenLight : COLORS.panel,
        tab.category === this.rankingCategory ? COLORS.gold : undefined,
      );
      addLabel(this.root, tab.label, x, 474, 94, 34, 17, tab.category === this.rankingCategory ? COLORS.gold : COLORS.textMuted);
      createButton(this.root, "", x, 474, 102, 54, { fill: withAlpha(COLORS.black, 0), stroke: withAlpha(COLORS.black, 0), fontSize: 1 }, () => {
        this.rankingCategory = tab.category;
        if (this.lastState) this.render(this.lastState);
      });
    });

    drawBand(
      this.root,
      "RankingList",
      -56,
      100,
      566,
      650,
      hasBackground ? withAlpha(COLORS.panel, 208) : COLORS.panel,
    );
    entries.slice(0, 5).forEach((entry, index) => {
      const rank = index + 1;
      const y = 355 - index * 105;
      addLabel(this.root, String(rank), -285, y, 62, 38, 21, rank <= 3 ? COLORS.gold : COLORS.text);
      addLabel(this.root, entry.displayName, -110, y, 240, 38, 20, entry.player ? COLORS.gold : COLORS.text);
      addLabel(this.root, formatLargeNumber(entry.value), 180, y, 120, 38, 19, entry.player ? COLORS.jade : COLORS.textMuted);
      const line = graphicsNode(this.root, `RankLine${rank}`, -56, y - 48);
      line.strokeColor = color("#2b3c46");
      line.lineWidth = 1;
      line.moveTo(-255, 0);
      line.lineTo(255, 0);
      line.stroke();
    });
    drawBand(
      this.root,
      "MyRank",
      -56,
      -275,
      566,
      86,
      hasBackground ? withAlpha(COLORS.inkGreenLight, 228) : COLORS.inkGreenLight,
      COLORS.goldMuted,
    );
    const playerRank = entries.findIndex((entry) => entry.player) + 1;
    addLabel(this.root, "我的排名", -220, -275, 180, 40, 20, COLORS.text);
    addLabel(this.root, `${playerRank} / ${entries.length}`, 150, -275, 150, 40, 20, COLORS.gold, true);
    if (
      featureMessageDisplay?.surface !== "main" ||
      featureMessageDisplay.tab !== "ranking"
    ) {
      addLabel(this.root, "本地试炼榜 · NPC 标杆固定，玩家数据来自本地存档", 0, -350, 580, 32, 14, COLORS.textMuted);
    }
  }

  private drawCave(state: Readonly<AppState>): void {
    if (!state.bootstrap!.unlocks.cave) {
      this.drawLockedPage(
        "洞府",
        "筑基后开启",
        "修为达到 Lv.11 即可开辟洞府",
        "cave",
      );
      return;
    }

    drawBand(
      this.root,
      "CaveEmpty",
      -56,
      120,
      566,
      720,
      this.hasMainBackground("cave")
        ? withAlpha(COLORS.inkGreen, 142)
        : COLORS.inkGreen,
    );
    addLabel(this.root, `${state.bootstrap!.player.displayName}的洞府`, -56, 420, 500, 54, 31, COLORS.gold, true);
    drawCavePanel(
      this.root,
      state,
      this.actions,
      this.hasMainBackground("cave")
        ? withAlpha(COLORS.panelStrong, 220)
        : COLORS.panelStrong,
    );
  }

  private drawLockedPage(
    title: string,
    condition: string,
    detail: string,
    backgroundKey: MainBackgroundKey,
  ): void {
    drawBand(
      this.root,
      `${title}Locked`,
      -56,
      115,
      566,
      735,
      this.hasMainBackground(backgroundKey)
        ? withAlpha(COLORS.panel, 218)
        : COLORS.panel,
    );
    const lock = graphicsNode(this.root, "Lock", -56, 190);
    lock.strokeColor = COLORS.goldMuted;
    lock.lineWidth = 8;
    lock.arc(0, 30, 58, Math.PI, 0, false);
    lock.stroke();
    lock.fillColor = COLORS.inkGreenLight;
    lock.roundRect(-78, -84, 156, 122, 12);
    lock.fill();
    lock.fillColor = COLORS.gold;
    lock.circle(0, -22, 12);
    lock.fill();
    lock.rect(-5, -55, 10, 35);
    lock.fill();

    addLabel(this.root, title, -56, 57, 420, 58, 34, COLORS.text, true);
    addLabel(this.root, condition, -56, -18, 500, 44, 24, COLORS.gold);
    addLabel(this.root, detail, -56, -75, 520, 40, 18, COLORS.textMuted);
  }

  private drawNavigation(selected: MainTab): void {
    const { centerX, width, headerCenterY } = this.chromeGeometry;
    this.drawRightNavigation(
      this.contentRoot,
      selected,
      centerX + width / 2 - 56,
      headerCenterY - 160,
    );
  }

  private drawRightNavigation(
    parent: Node,
    selected: MainTab,
    x: number,
    topY: number,
  ): void {
    const items: ReadonlyArray<{ readonly id: MainTab; readonly label: string }> = [
      { id: "cultivation", label: "修炼" },
      { id: "partner", label: "伴侣" },
      { id: "ranking", label: "排行" },
      { id: "cave", label: "洞府" },
    ];
    drawBand(
      parent,
      "RightNavigation",
      x,
      topY - 162,
      112,
      438,
      COLORS.panelStrong,
      COLORS.goldMuted,
    );
    items.forEach((item, index) => {
      createMainTabButton(
        parent,
        item.id,
        item.label,
        x,
        topY - index * 108,
        selected === item.id,
        () => {
          this.actions.feedback();
          this.actions.selectTab(item.id);
        },
      );
    });
  }

  private drawBottomFeatureRail(
    parent: Node,
    centerX: number,
    y: number,
  ): void {
    drawBand(
      parent,
      "BottomFeatureRail",
      centerX,
      y,
      DESIGN_VIEWPORT_WIDTH,
      174,
      COLORS.panelStrong,
      COLORS.goldMuted,
    );
    const features: ReadonlyArray<{
      readonly label: string;
      readonly feature: FeaturePanel;
    }> = [
      { label: "功法", feature: "techniques" },
      { label: "法宝", feature: "equipment" },
      { label: "炼丹", feature: "alchemy" },
      { label: "炼器", feature: "crafting" },
      // 灵宠是法宝的一个槽位（月影灵狐），法宝面板已经管着它，这一格留给试炼塔。
      { label: "试炼塔", feature: "trialTower" },
      { label: "宗门", feature: "sect" },
      { label: "历练", feature: "expedition" },
    ];
    features.forEach((item, index) => {
      createBottomFeatureButton(
        parent,
        item.label,
        centerX - 321 + index * 107,
        y,
        index,
        () => {
          this.actions.feedback();
          this.actions.openFeature(item.feature);
        },
      );
    });
  }

  private drawFeaturePanel(
    state: Readonly<AppState>,
    feature: FeaturePanel,
    featureMessageDisplay: FeatureMessageDisplay | null,
  ): void {
    const overlay = createUiNode(this.root, `FeaturePanel-${feature}`);
    this.setFullscreenSize(overlay);
    overlay.addComponent(BlockInputEvents);
    const shade = overlay.addComponent(Graphics);
    const shadeColor = color("#05080c");
    shadeColor.a = 210;
    shade.fillColor = shadeColor;
    this.drawFullscreenRect(shade);
    shade.fill();

    drawBand(overlay, "FeaturePanelBody", 0, 0, 700, 1060, COLORS.panelStrong, COLORS.goldMuted);
    const title = {
      profile: "个人档案",
      techniques: "功法库",
      equipment: "法宝",
      inventory: "行囊与挂机收获",
      tasks: "修行任务",
      alchemy: "炼丹房",
      crafting: "炼器室",
      sect: "宗门",
      expedition: "历练",
      trialTower: "试炼塔",
    }[feature];
    addLabel(overlay, title, 0, 466, 420, 54, 31, COLORS.gold, true);
    createButton(
      overlay,
      "返回",
      276,
      this.safeModalButtonY(468, 54),
      112,
      54,
      { fill: COLORS.panel, stroke: COLORS.goldMuted, fontSize: 18 },
      () => {
        if (feature === "profile") this.clearProfileDraft();
        this.actions.closeFeature();
      },
    );

    if (feature === "profile")
      drawProfilePanel(
        overlay,
        state,
        this.actions,
        this.profileDrafts,
        this.profileBackupControls,
        this.profileResetControls,
      );
    if (feature === "inventory")
      drawInventoryPanel(overlay, state, this.actions, this.panelPaging);
    if (feature === "techniques")
      drawTechniquePanel(overlay, state, this.actions, this.panelPaging);
    if (feature === "equipment")
      drawEquipmentPanel(overlay, state, this.actions, this.panelPaging);
    if (feature === "tasks") drawTaskPanel(overlay, state);
    if (feature === "alchemy") drawAlchemyPanel(overlay, state, this.actions);
    if (feature === "crafting") drawCraftingPanel(overlay, state, this.actions);
    if (feature === "sect") {
      drawSectPanel(overlay, state, this.actions, {
        display: getSectConfirmationDisplay(
          this.socialConfirmationState.sectId,
        ),
        begin: (sectId) => this.beginSectConfirmation(sectId),
        cancel: () => this.cancelSocialConfirmation(),
        confirm: () => this.confirmSectSelection(),
      });
    }
    if (feature === "expedition")
      drawExpeditionPanel(overlay, state, this.actions);
    if (feature === "trialTower")
      drawTrialTowerPanel(overlay, state, this.actions);

    if (featureMessageDisplay?.surface === "feature-panel") {
      drawBand(overlay, "FeatureMessage", 0, -473, 620, 68, COLORS.inkGreenLight);
      addLabel(
        overlay,
        featureMessageDisplay.text,
        0,
        -473,
        590,
        52,
        16,
        COLORS.gold,
        false,
        featureMessageDisplay.maxLines,
        HorizontalTextAlignment.CENTER,
        "fixed",
      );
    }
  }

  private armProfileReset(): void {
    this.actions.feedback();
    this.profileBackupArmed = null;
    this.profileResetArmed = true;
    if (this.lastState) this.render(this.lastState);
  }

  private cancelProfileReset(): void {
    this.actions.feedback();
    this.profileResetArmed = false;
    if (this.lastState) this.render(this.lastState);
  }

  private confirmProfileReset(): void {
    this.profileResetArmed = false;
    this.actions.feedback();
    this.actions.resetProgress();
  }

  private copyProfileBackup(): void {
    this.actions.feedback();
    this.actions.exportProgressBackup();
  }

  private armProfileBackup(action: ProfileBackupAction): void {
    this.actions.feedback();
    this.profileResetArmed = false;
    this.profileBackupArmed = action;
    if (this.lastState) this.render(this.lastState);
  }

  private cancelProfileBackup(): void {
    this.actions.feedback();
    this.profileBackupArmed = null;
    if (this.lastState) this.render(this.lastState);
  }

  private confirmProfileBackup(): void {
    const action = this.profileBackupArmed;
    this.profileBackupArmed = null;
    this.actions.feedback();
    if (action === "import") this.actions.importProgressBackup();
    if (action === "recovery") this.actions.restoreImportRecovery();
  }

  private selectAvatarDraft(avatarVariant: ChosenAvatarVariant): void {
    this.actions.feedback();
    this.profileAvatarDraft = avatarVariant;
    if (this.lastState) this.render(this.lastState);
  }

  private clearProfileDraft(): void {
    this.profileAvatarDraft = null;
    this.profileNameDraft = null;
    this.profileNameSource = null;
    this.profileResetArmed = false;
    this.profileBackupArmed = null;
  }

  private beginPartnerConfirmation(partnerId: PartnerId): void {
    this.actions.feedback();
    this.socialConfirmationState = { partnerId, sectId: null };
    if (this.lastState) this.render(this.lastState);
  }

  private beginSectConfirmation(sectId: SectId): void {
    this.actions.feedback();
    this.socialConfirmationState = { partnerId: null, sectId };
    if (this.lastState) this.render(this.lastState);
  }

  private cancelSocialConfirmation(): void {
    this.actions.feedback();
    this.socialConfirmationState = EMPTY_SOCIAL_CONFIRMATION_STATE;
    if (this.lastState) this.render(this.lastState);
  }

  private confirmPartnerSelection(): void {
    const partnerId = this.socialConfirmationState.partnerId;
    if (partnerId === null) return;
    this.socialConfirmationState = EMPTY_SOCIAL_CONFIRMATION_STATE;
    this.actions.feedback();
    this.actions.choosePartner(partnerId);
  }

  private confirmSectSelection(): void {
    const sectId = this.socialConfirmationState.sectId;
    if (sectId === null) return;
    this.socialConfirmationState = EMPTY_SOCIAL_CONFIRMATION_STATE;
    this.actions.feedback();
    this.actions.joinSect(sectId);
  }

  private clearPlayerUiState(): void {
    this.clearProfileDraft();
    this.socialConfirmationState = EMPTY_SOCIAL_CONFIRMATION_STATE;
    this.profileResetPending = false;
    this.profileBackupPending = false;
    this.debugSaveResetArmed = false;
    this.pages.inventoryStacks = 0;
    this.pages.harvestChest = 0;
    this.pages.techniques = 0;
    this.pages.equipment = 0;
    this.rankingCategory = "power";
  }

  private drawOfflineSettlement(settlement: OfflineSettlementSummary): void {
    const overlay = createUiNode(this.root, "OfflineSettlementModal");
    this.setFullscreenSize(overlay);
    overlay.addComponent(BlockInputEvents);
    const shade = overlay.addComponent(Graphics);
    const shadeColor = color("#05080c");
    shadeColor.a = 220;
    shade.fillColor = shadeColor;
    this.drawFullscreenRect(shade);
    shade.fill();

    drawBand(overlay, "OfflinePanel", 0, 15, 626, 630, COLORS.panelStrong, COLORS.gold);
    addLabel(overlay, "闭关归来", 0, 250, 500, 58, 36, COLORS.gold, true);
    addLabel(
      overlay,
      `离线 ${formatDuration(settlement.effectiveSeconds)} · ${Math.floor(settlement.efficiencyBp / 100)}% 效率`,
      0,
      199,
      540,
      36,
      18,
      COLORS.textMuted,
    );
    addLabel(overlay, "奖励已自动存入行囊", 0, 156, 500, 34, 18, COLORS.jade);

    const rewards = [
      ["修为", `+${formatLargeNumber(settlement.experienceGained)}`],
      ["灵石", `+${formatLargeNumber(settlement.spiritStoneGained)}`],
      ["掉落尝试", `${settlement.dropAttempts} 次`],
    ] as const;
    rewards.forEach(([label, value], index) => {
      const y = 89 - index * 78;
      drawBand(overlay, `OfflineReward${index}`, 0, y, 520, 62, COLORS.panel);
      addLabel(
        overlay,
        label,
        -170,
        y,
        170,
        38,
        19,
        COLORS.textMuted,
        false,
        1,
        HorizontalTextAlignment.LEFT,
      );
      addLabel(
        overlay,
        value,
        145,
        y,
        210,
        40,
        23,
        index === 1 ? COLORS.gold : COLORS.text,
        true,
        1,
        HorizontalTextAlignment.RIGHT,
      );
    });

    const stackedDropQuantity = sumBigNumberStrings(
      settlement.drops.stackItems.map((item) => item.quantity),
    );
    const dropLine = `实物入账 ${formatLargeNumber(stackedDropQuantity)} · 收获箱 +${settlement.drops.harvestChestAdded}`;
    addLabel(overlay, dropLine, 0, -130, 530, 30, 16, COLORS.jade);
    if (settlement.drops.autoSalvagedCount > 0) {
      addLabel(
        overlay,
        `自动分解 ${settlement.drops.autoSalvagedCount} 件：灵石 +${settlement.drops.autoSalvageSpiritStone}，强化石 +${settlement.drops.autoSalvageEnhanceStone}`,
        0,
        -158,
        550,
        28,
        15,
        COLORS.gold,
      );
    }

    if (settlement.newcomerRewardGranted) {
      addLabel(
        overlay,
        "新手任务完成：突破丹 ×1",
        0,
        settlement.drops.autoSalvagedCount > 0 ? -184 : -163,
        520,
        34,
        18,
        COLORS.gold,
      );
    }

    createButton(
      overlay,
      "收下奖励",
      0,
      this.safeModalButtonY(-242, 68),
      330,
      68,
      { fill: COLORS.inkGreenLight, stroke: COLORS.gold, text: COLORS.text },
      () => {
        this.actions.feedback();
        this.actions.dismissOfflineSettlement();
      },
    );
  }

  private drawPartnerUnlockNotice(
    featureMessageDisplay: FeatureMessageDisplay | null,
  ): void {
    const overlay = createUiNode(this.root, "PartnerUnlockNoticeModal");
    this.setFullscreenSize(overlay);
    overlay.addComponent(BlockInputEvents);
    const shade = overlay.addComponent(Graphics);
    const shadeColor = color("#05080c");
    shadeColor.a = 220;
    shade.fillColor = shadeColor;
    this.drawFullscreenRect(shade);
    shade.fill();

    drawBand(
      overlay,
      "PartnerUnlockPanel",
      0,
      40,
      626,
      520,
      COLORS.panelStrong,
      COLORS.gold,
    );
    addLabel(overlay, "红尘缘启", 0, 205, 500, 62, 36, COLORS.gold, true);
    addLabel(
      overlay,
      "道友修为已达筑基，可寻觅道侣共修仙途！",
      0,
      112,
      520,
      78,
      21,
      COLORS.text,
      true,
      2,
    );
    drawBand(
      overlay,
      "PartnerUnlocked",
      0,
      18,
      470,
      72,
      COLORS.inkGreen,
      COLORS.goldMuted,
    );
    addLabel(overlay, "伴侣入口已开启", 0, 18, 420, 38, 20, COLORS.jade, true);
    if (featureMessageDisplay?.surface === "partner-unlock") {
      addLabel(
        overlay,
        featureMessageDisplay.text,
        0,
        -62,
        500,
        34,
        16,
        COLORS.textMuted,
        false,
        featureMessageDisplay.maxLines,
        HorizontalTextAlignment.CENTER,
        "fixed",
      );
    }
    createButton(
      overlay,
      "知晓",
      0,
      this.safeModalButtonY(-145, 68),
      330,
      68,
      { fill: COLORS.inkGreenLight, stroke: COLORS.gold, text: COLORS.text },
      () => this.actions.markPartnerUnlockNoticeSeen(),
    );
  }
}
