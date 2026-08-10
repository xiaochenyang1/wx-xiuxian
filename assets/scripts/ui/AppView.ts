import {
  getNewcomerTaskConfig,
  type BootstrapSnapshot,
  type ChosenAvatarVariant,
  type DebugGrantTarget,
  type EquippedEquipmentSlot,
  type OfflineSettlementSummary,
} from "@cultivation-diary/shared";
import {
  formatLargeNumber,
  interpolateBigNumberStrings,
  ratioOfBigNumberStrings,
  sumBigNumberStrings,
} from "../core/ClientNumber";
import type {
  MainBackgroundArt,
  MainBackgroundKey,
} from "../core/AppArt";
import {
  mergeCultivationPresentationPlans,
  type CultivationPresentationPlan,
} from "../core/CultivationPresentation";
import {
  advanceLiveCultivationElapsed,
  initialLiveCultivationElapsed,
  liveCultivationSettlementKey,
  projectLiveCultivation,
} from "../core/CultivationProjection";
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
  UpcomingFeaturePanel,
} from "../core/ClientTypes";
import {
  canRunLocalMutation,
  isUpcomingFeaturePanel,
  shouldShowPartnerUnlockNotice,
} from "../core/ClientTypes";
import { color, COLORS, withAlpha } from "./primitives/Colors";
import {
  addLabel,
  createButton,
  createTextInput,
  createUiNode,
  drawBand,
  drawOrnatePanel,
  drawPagination,
  drawProgress,
  graphicsNode,
  redrawProgress,
  removeAndDestroy,
  setSize,
} from "./primitives/Draw";
import {
  avatarVariantName,
  formatSignedPowerDelta,
  QUALITY_ORDER,
  qualityColor,
  qualityName,
  qualityRank,
} from "./primitives/Format";
import {
  drawAvatarPortrait,
  drawCurrencyChip,
  drawFeatureGlyph,
  drawGoldenFormation,
  drawMountainLayer,
  drawPowerBanner,
  drawTabIcon,
  drawTribulationLightning,
} from "./primitives/Scenery";
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

const MAX_DEBUG_DROP_SEED = 0xffff_ffff;

type DebugLifecycleStatus = "foreground" | "background";

interface UpcomingFeatureCopy {
  readonly title: string;
  readonly summary: string;
  readonly detail: string;
}

const UPCOMING_FEATURE_COPY: Readonly<
  Record<UpcomingFeaturePanel, UpcomingFeatureCopy>
> = {
  alchemy: {
    title: "炼丹房",
    summary: "消耗草药与灵石炼制丹药",
    detail: "当前版本可通过挂机掉落获得突破丹，尚不能自行炼制。",
  },
  crafting: {
    title: "炼器室",
    summary: "消耗材料与强化石打造法宝",
    detail: "当前版本法宝只能通过挂机掉落获得，强化石暂无用途。",
  },
  sect: {
    title: "宗门",
    summary: "加入宗门、领取宗门任务与贡献",
    detail: "宗门需要多人数据支撑，当前单机版本尚未开放。",
  },
  expedition: {
    title: "历练",
    summary: "派遣角色外出历练换取资源",
    detail: "当前版本的资源产出集中在修炼挂机与掉落。",
  },
};

interface AppViewActions {
  retry(): void;
  resetProgress(): void;
  selectTab(tab: MainTab): void;
  openFeature(feature: FeaturePanel): void;
  closeFeature(): void;
  breakthrough(): void;
  chooseAvatar(avatarVariant: ChosenAvatarVariant): void;
  renamePlayer(displayName: string): void;
  markPartnerUnlockNoticeSeen(): void;
  expandInventory(): void;
  useInventoryItem(itemConfigId: string): void;
  transferHarvest(entryId: string): void;
  salvageHarvest(entryId: string): void;
  equipTechnique(techniqueConfigId: string): void;
  unequipTechnique(techniqueConfigId: string): void;
  equipEquipment(
    equipmentInstanceId: string,
    equippedSlot: EquippedEquipmentSlot,
  ): void;
  unequipEquipment(equipmentInstanceId: string): void;
  dismissOfflineSettlement(): void;
  simulateOffline(seconds: number, dropSeed?: number): void;
  grantDebug(target: DebugGrantTarget): void;
  resetDebugSave(playerId: string, confirmation: string): void;
  feedback(): void;
}

type PagedList =
  | "inventoryStacks"
  | "harvestChest"
  | "techniques"
  | "equipment";

interface PageWindow {
  page: number;
  pageCount: number;
  start: number;
  end: number;
}

export interface TechniqueSlotLabelLayout {
  readonly text: string;
  readonly maxLines: 2;
  readonly sizing: "fixed";
}

export function getTechniqueSlotLabelLayout(
  slotLabel: string,
  equippedName: string | null,
): TechniqueSlotLabelLayout {
  return {
    text: `${slotLabel}\n${equippedName ?? "未装备"}`,
    maxLines: 2,
    sizing: "fixed",
  };
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

export interface NewcomerTaskDisplay {
  readonly title: string;
  readonly description: string;
  readonly current: string;
  readonly target: string;
  readonly progressText: string;
  readonly statusText: string;
  readonly rewardText: string;
  readonly completed: boolean;
  readonly claimed: boolean;
}

export function getNewcomerTaskDisplay(
  task: BootstrapSnapshot["newcomerTasks"][number],
): NewcomerTaskDisplay {
  let config: ReturnType<typeof getNewcomerTaskConfig>;
  try {
    config = getNewcomerTaskConfig(task.taskConfigId);
  } catch {
    // A stale or unknown config must remain renderable until the next sync.
  }

  const current = formatLargeNumber(task.progress);
  const target = config ? String(config.targetLevel) : "?";
  const claimed = task.claimedAt !== null;
  const completed = claimed || task.completedAt !== null;
  const rewardLabel = config
    ? config.rewardLabel ?? "无额外奖励"
    : "奖励信息不可用";

  return {
    title: config?.title ?? "未知修行任务",
    description: config?.description ?? "任务配置暂不可用",
    current,
    target,
    progressText: `进度 ${current} / ${target}`,
    statusText: completed ? "已完成" : "进行中",
    rewardText: claimed
      ? `已自动发放：${rewardLabel}`
      : `奖励：${rewardLabel}`,
    completed,
    claimed,
  };
}

export interface ProfileResetControlDisplay {
  readonly description: string;
  readonly primaryLabel: string;
  readonly cancelLabel: string | null;
  readonly enabled: boolean;
}

export function getProfileResetControlDisplay(
  armed: boolean,
  enabled = true,
  pending = false,
): ProfileResetControlDisplay {
  if (pending) {
    return {
      description: "正在重置本地进度，请稍候",
      primaryLabel: "正在重置",
      cancelLabel: null,
      enabled: false,
    };
  }
  if (!enabled) {
    return {
      description: "当前状态暂时无法重置本地进度",
      primaryLabel: armed ? "确认重置" : "重置进度",
      cancelLabel: armed ? "取消" : null,
      enabled: false,
    };
  }
  return armed
    ? {
        description: "此操作会永久清除本机存档并从 Lv.1 重新开始",
        primaryLabel: "确认重置",
        cancelLabel: "取消",
        enabled: true,
      }
    : {
        description: "当前进度仅保存在本机，可在此重新开始",
        primaryLabel: "重置本地进度",
        cancelLabel: null,
        enabled: true,
      };
}

export class AppView {
  private readonly contentRoot: Node;
  private readonly presentationRoot: Node;
  private readonly debugRoot: Node | null;
  private readonly safeAreaLayout: DesignSafeAreaLayout;
  private readonly chromeGeometry: AppChromeGeometry;
  private mainBackgroundArt: MainBackgroundArt = {};
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
  private profilePlayerId: string | null = null;
  private profileAvatarDraft: ChosenAvatarVariant | null = null;
  private profileNameDraft: string | null = null;
  private profileNameSource: string | null = null;
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
    const playerId = state.bootstrap?.player.id ?? null;
    if (playerId !== this.profilePlayerId) {
      this.interruptCultivationPresentation(true);
      this.clearPlayerUiState();
      this.profilePlayerId = playerId;
    }
    const selectedTabChanged =
      this.lastState !== null && this.lastState.selectedTab !== state.selectedTab;
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

    const usesCultivationReferenceSkin =
      state.selectedTab === "cultivation" &&
      this.hasMainBackground("cultivation");
    this.drawMainPage(state);
    if (!usesCultivationReferenceSkin) {
      this.drawHeader(state);
      this.drawNavigation(state.selectedTab);
      this.drawBottomFeatureRail(
        this.contentRoot,
        this.chromeGeometry.centerX,
        this.chromeGeometry.navigationCenterY,
      );
    }
    this.drawSyncStatus(state);
    if (state.activeFeature) {
      this.drawFeaturePanel(state, state.activeFeature);
    }
    if (state.bootstrap.offlineSettlement) {
      this.drawOfflineSettlement(state.bootstrap.offlineSettlement);
    }
    if (shouldShowPartnerUnlockNotice(state)) {
      this.drawPartnerUnlockNotice(state);
    }
    this.tryStartCultivationPresentation();
    this.drawDebugPanel(state);
  }

  private drawMainPage(state: Readonly<AppState>): void {
    const pageRoot = createUiNode(this.contentRoot, "MainPageRoot");
    const usesCultivationReferenceSkin =
      state.selectedTab === "cultivation" &&
      this.hasMainBackground("cultivation");
    pageRoot.setPosition(
      this.chromeGeometry.centerX,
      usesCultivationReferenceSkin ? 0 : this.chromeGeometry.bodyOffsetY,
    );
    if (usesCultivationReferenceSkin) {
      pageRoot.setScale(
        1,
        this.safeAreaLayout.viewportHeight / DESIGN_VIEWPORT_HEIGHT,
        1,
      );
    }
    setSize(pageRoot, DESIGN_VIEWPORT_WIDTH, DESIGN_VIEWPORT_HEIGHT);
    this.mainPageRoot = pageRoot;
    try {
      this.drawMainBackground(state.selectedTab);
      switch (state.selectedTab) {
        case "cultivation":
          this.drawCultivation(state);
          break;
        case "partner":
          this.drawPartner(state);
          break;
        case "ranking":
          this.drawRanking();
          break;
        case "cave":
          this.drawCave(state);
          break;
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

  setResetInFlight(inFlight: boolean): void {
    if (this.profileResetPending === inFlight) return;
    this.profileResetPending = inFlight;
    if (inFlight) this.profileResetArmed = false;
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
    drawAvatarPortrait(
      avatarButton,
      bootstrap.player.avatarVariant,
      0,
      7,
      1.48,
    );
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
      headerCenterY + 38,
      "灵石",
      formatLargeNumber(bootstrap.wallet.spiritStone),
      COLORS.goldBright,
    );
    drawCurrencyChip(
      this.root,
      right - 72,
      headerCenterY - 25,
      "仙玉",
      formatLargeNumber(bootstrap.wallet.immortalJade),
      COLORS.cyan,
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

  private drawCultivation(state: Readonly<AppState>): void {
    const data = state.bootstrap!;
    if (this.hasMainBackground("cultivation")) {
      this.drawCultivationReferenceHotspots(state);
      return;
    }
    const mutationsEnabled = canRunLocalMutation(state);
    const projection = this.resolveCultivationProjection(state);
    const progressDisplay = getCultivationProgressDisplay(
      projection.progress,
      data.config.maxLevel,
    );
    const pendingTasks = data.newcomerTasks.filter(
      (task) => task.completedAt === null,
    ).length;
    const pendingHarvest = data.harvestChest.pendingCount;
    this.drawCultivationScene();
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
    if (mutationsEnabled && data.progress.status !== "breakthrough_ready") {
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
    if (progressDisplay.footer) {
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

  private drawCultivationReferenceHotspots(
    state: Readonly<AppState>,
  ): void {
    const openFeature = (feature: FeaturePanel): void => {
      this.actions.feedback();
      this.actions.openFeature(feature);
    };

    createHotspot(this.root, "ReferenceAvatar", -300, 591, 120, 150, () =>
      openFeature("profile"),
    );
    createHotspot(this.root, "ReferencePower", 40, 572, 330, 76, () =>
      openFeature("profile"),
    );
    createHotspot(this.root, "ReferenceBoost", 319, 573, 82, 92, () =>
      openFeature("techniques"),
    );

    drawBand(
      this.root,
      "ReferenceRightRailMask",
      319,
      268,
      112,
      440,
      COLORS.panelStrong,
      COLORS.goldMuted,
    );
    drawBand(
      this.root,
      "ReferenceBottomNavigationMask",
      0,
      -520,
      DESIGN_VIEWPORT_WIDTH,
      294,
      COLORS.panelStrong,
      COLORS.goldMuted,
    );

    const sideHotspots: ReadonlyArray<{
      readonly name: string;
      readonly x: number;
      readonly y: number;
      readonly feature: FeaturePanel;
    }> = [
      { name: "Journey", x: -315, y: 431, feature: "profile" },
      { name: "Tasks", x: -315, y: 329, feature: "tasks" },
      { name: "Achievements", x: -315, y: 226, feature: "profile" },
      { name: "Mail", x: -315, y: 123, feature: "tasks" },
    ];
    for (const hotspot of sideHotspots) {
      createHotspot(
        this.root,
        `Reference${hotspot.name}`,
        hotspot.x,
        hotspot.y,
        98,
        98,
        () => openFeature(hotspot.feature),
      );
    }

    createHotspot(this.root, "ReferenceAutoCultivation", -306, -302, 126, 130, () =>
      openFeature("profile"),
    );
    createHotspot(this.root, "ReferenceOnlineReward", 306, -302, 126, 130, () =>
      openFeature("inventory"),
    );
    createHotspot(this.root, "ReferenceBreakthrough", 0, -307, 282, 88, () => {
      if (!canRunLocalMutation(state)) return;
      this.actions.feedback();
      this.actions.breakthrough();
    });

    this.drawRightNavigation(this.root, state.selectedTab, 319, 430);
    this.drawBottomFeatureRail(this.root, 0, -580);
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

    drawBand(
      this.root,
      "PartnerEmpty",
      -56,
      130,
      566,
      690,
      this.hasMainBackground("partner")
        ? withAlpha(COLORS.inkGreen, 150)
        : COLORS.inkGreen,
    );
    addLabel(this.root, "小师妹", -56, 245, 500, 58, 35, COLORS.gold, true);
    addLabel(this.root, "亲密度 0 / 1000", -56, 145, 450, 40, 20, COLORS.text);
    drawProgress(this.root, -56, 105, 430, 14, 0);
    addLabel(this.root, "初识", -56, 45, 280, 40, 22, COLORS.jade);
  }

  private drawRanking(): void {
    const hasBackground = this.hasMainBackground("ranking");
    const tabs = ["战力", "等级", "财富", "洞府", "伴侣"];
    tabs.forEach((tab, index) => {
      const x = -280 + index * 112;
      drawBand(
        this.root,
        `RankTab${index}`,
        x,
        474,
        102,
        54,
        hasBackground
          ? withAlpha(index === 0 ? COLORS.inkGreenLight : COLORS.panel, 224)
          : index === 0 ? COLORS.inkGreenLight : COLORS.panel,
        index === 0 ? COLORS.gold : undefined,
      );
      addLabel(this.root, tab, x, 474, 94, 34, 17, index === 0 ? COLORS.gold : COLORS.textMuted);
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
    [1, 2, 3, 4, 5].forEach((rank, index) => {
      const y = 355 - index * 105;
      addLabel(this.root, String(rank), -285, y, 62, 38, 21, rank <= 3 ? COLORS.gold : COLORS.text);
      addLabel(this.root, "暂无道友", -110, y, 240, 38, 20, COLORS.textMuted);
      addLabel(this.root, "--", 180, y, 100, 38, 20, COLORS.textMuted);
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
    addLabel(this.root, "我的排名", -220, -275, 180, 40, 20, COLORS.text);
    addLabel(this.root, "--", 180, -275, 100, 40, 22, COLORS.gold, true);
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
    addLabel(this.root, "繁荣度 0", -56, 355, 340, 36, 19, COLORS.jade);
    this.drawCaveBuildings();
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

  private drawCaveBuildings(): void {
    const panelColor = this.hasMainBackground("cave")
      ? withAlpha(COLORS.panelStrong, 220)
      : COLORS.panelStrong;
    const buildings = ["灵田", "炼丹房", "炼器室", "闭关室", "聚灵阵"];
    buildings.forEach((name, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = column === 0 ? -205 : 95;
      const y = 225 - row * 145;
      drawBand(this.root, `Building${name}`, x, y, 292, 112, panelColor, COLORS.goldMuted);
      addLabel(this.root, name, x - 54, y + 13, 160, 34, 20, COLORS.text, true);
      addLabel(this.root, "Lv.1", x - 54, y - 23, 160, 28, 16, COLORS.jade);
      addLabel(this.root, "+", x + 95, y, 42, 42, 27, COLORS.gold, true);
    });
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
      // 灵宠是法宝的一个槽位（月影灵狐），直接开到法宝面板。
      { label: "灵宠", feature: "equipment" },
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
        isUpcomingFeaturePanel(item.feature),
      );
    });
  }

  private drawFeaturePanel(
    state: Readonly<AppState>,
    feature: FeaturePanel,
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
    const title = isUpcomingFeaturePanel(feature)
      ? UPCOMING_FEATURE_COPY[feature].title
      : {
          profile: "个人档案",
          techniques: "功法库",
          equipment: "法宝",
          inventory: "行囊与挂机收获",
          tasks: "修行任务",
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

    if (feature === "profile") this.drawProfilePanel(overlay, state);
    if (feature === "inventory") this.drawInventoryPanel(overlay, state);
    if (feature === "techniques") this.drawTechniquePanel(overlay, state);
    if (feature === "equipment") this.drawEquipmentPanel(overlay, state);
    if (feature === "tasks") this.drawTaskPanel(overlay, state);
    if (isUpcomingFeaturePanel(feature)) this.drawUpcomingPanel(overlay, feature);

    if (state.featureMessage) {
      drawBand(overlay, "FeatureMessage", 0, -473, 620, 54, COLORS.inkGreenLight);
      addLabel(
        overlay,
        state.featureMessage,
        0,
        -473,
        590,
        38,
        17,
        COLORS.gold,
      );
    }
  }

  private drawUpcomingPanel(
    overlay: Node,
    feature: UpcomingFeaturePanel,
  ): void {
    const copy = UPCOMING_FEATURE_COPY[feature];

    const lock = graphicsNode(overlay, "UpcomingLock", 0, 190);
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

    drawBand(overlay, "UpcomingNotice", 0, 10, 566, 96, COLORS.inkGreen, COLORS.goldMuted);
    addLabel(overlay, "尚未开放", 0, 34, 420, 44, 26, COLORS.gold, true);
    addLabel(overlay, copy.summary, 0, -16, 520, 36, 18, COLORS.jade);
    addLabel(overlay, copy.detail, 0, -104, 560, 76, 17, COLORS.textMuted, false, 2);
    addLabel(
      overlay,
      "后续版本开放后，此处会替换为真实功能。",
      0,
      -196,
      560,
      36,
      15,
      COLORS.textMuted,
    );
  }

  private drawProfilePanel(overlay: Node, state: Readonly<AppState>): void {
    const data = state.bootstrap!;
    const player = data.player;
    const mutationsEnabled = canRunLocalMutation(state);

    drawBand(overlay, "AvatarProfile", 0, 302, 620, 220, COLORS.inkGreen);
    addLabel(
      overlay,
      "角色形象",
      -25,
      376,
      430,
      38,
      22,
      COLORS.gold,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    drawAvatarPortrait(overlay, player.avatarVariant, -225, 300, 1.8);

    if (player.avatarVariant === "neutral") {
      addLabel(
        overlay,
        "首次选择后将永久确定",
        70,
        334,
        390,
        34,
        17,
        COLORS.textMuted,
      );
      createButton(
        overlay,
        this.profileAvatarDraft === "male" ? "已选男修" : "男修形象",
        5,
        278,
        150,
        58,
        {
          fill:
            this.profileAvatarDraft === "male"
              ? COLORS.inkGreen
              : COLORS.inkGreenLight,
          stroke: COLORS.jade,
          fontSize: 18,
        },
        () => this.selectAvatarDraft("male"),
      );
      createButton(
        overlay,
        this.profileAvatarDraft === "female" ? "已选女修" : "女修形象",
        190,
        278,
        150,
        58,
        {
          fill:
            this.profileAvatarDraft === "female"
              ? COLORS.inkGreen
              : COLORS.inkGreenLight,
          stroke: COLORS.gold,
          fontSize: 18,
        },
        () => this.selectAvatarDraft("female"),
      );
      if (this.profileAvatarDraft) {
        createButton(
          overlay,
          `确认${avatarVariantName(this.profileAvatarDraft)}`,
          98,
          216,
          335,
          44,
          {
            fill: COLORS.red,
            stroke: COLORS.goldMuted,
            fontSize: 16,
            enabled: mutationsEnabled,
          },
          () => this.actions.chooseAvatar(this.profileAvatarDraft!),
        );
      }
    } else {
      this.profileAvatarDraft = null;
      addLabel(
        overlay,
        `${avatarVariantName(player.avatarVariant)} · 已确定`,
        70,
        318,
        390,
        42,
        23,
        COLORS.text,
        true,
      );
      addLabel(
        overlay,
        "角色形象不可再次修改",
        70,
        274,
        390,
        32,
        17,
        COLORS.textMuted,
      );
    }

    drawBand(overlay, "RenameProfile", 0, 18, 620, 324, COLORS.panel);
    addLabel(
      overlay,
      "道号",
      -245,
      140,
      120,
      38,
      22,
      COLORS.gold,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      `当前：${player.displayName}`,
      48,
      140,
      450,
      36,
      18,
      COLORS.text,
      false,
      1,
      HorizontalTextAlignment.LEFT,
    );

    const renameCardQuantity =
      data.inventory.stacks.find((item) => item.itemConfigId === "rename_card")
        ?.quantity ?? "0";
    addLabel(
      overlay,
      player.freeRenameAvailable
        ? "可免费修改 1 次"
        : `持有改名卡 ${formatLargeNumber(renameCardQuantity)} 张`,
      -15,
      92,
      530,
      34,
      17,
      player.freeRenameAvailable ? COLORS.jade : COLORS.textMuted,
    );

    if (this.profileNameSource === null) {
      this.profileNameSource = player.displayName;
      this.profileNameDraft = player.displayName;
    } else if (this.profileNameSource !== player.displayName) {
      this.profileNameSource = player.displayName;
    }
    const nameInput = createTextInput(
      overlay,
      this.profileNameDraft ?? player.displayName,
      "输入新的道号",
      -66,
      27,
      420,
      60,
      (value) => {
        this.profileNameDraft = value;
      },
      (value) => this.actions.renamePlayer(value),
      mutationsEnabled,
    );
    createButton(
      overlay,
      "确认改名",
      226,
      27,
      126,
      60,
      {
        fill: COLORS.inkGreenLight,
        stroke: COLORS.gold,
        fontSize: 17,
        enabled: mutationsEnabled,
      },
      () => this.actions.renamePlayer(nameInput.string),
    );
    addLabel(
      overlay,
      "2 至 12 个中文、英文字母或数字",
      -65,
      -27,
      420,
      30,
      15,
      COLORS.textMuted,
    );

    const resetDisplay = getProfileResetControlDisplay(
      this.profileResetArmed,
      mutationsEnabled,
      this.profileResetPending,
    );
    drawBand(overlay, "AccountProfile", 0, -290, 620, 238, COLORS.panel);
    addLabel(
      overlay,
      "本地存档",
      -245,
      -205,
      120,
      38,
      22,
      COLORS.gold,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      `当前角色：${player.displayName} · 仅保存在本机`,
      48,
      -205,
      450,
      36,
      18,
      COLORS.text,
      false,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      resetDisplay.description,
      0,
      -274,
      540,
      56,
      16,
      this.profileResetArmed ? COLORS.gold : COLORS.textMuted,
      false,
      2,
      HorizontalTextAlignment.CENTER,
      "fixed",
    );
    if (resetDisplay.cancelLabel) {
      createButton(
        overlay,
        resetDisplay.cancelLabel,
        -150,
        -359,
        260,
        56,
        { fill: COLORS.panelStrong, stroke: COLORS.goldMuted, fontSize: 18 },
        () => this.cancelProfileReset(),
      );
      createButton(
        overlay,
        resetDisplay.primaryLabel,
        150,
        -359,
        260,
        56,
        {
          fill: COLORS.red,
          stroke: COLORS.goldMuted,
          fontSize: 18,
          enabled: resetDisplay.enabled,
        },
        () => this.confirmProfileReset(),
      );
    } else {
      createButton(
        overlay,
        resetDisplay.primaryLabel,
        0,
        -359,
        300,
        56,
        {
          fill: COLORS.red,
          stroke: COLORS.goldMuted,
          fontSize: 18,
          enabled: resetDisplay.enabled,
        },
        () => this.armProfileReset(),
      );
    }
  }

  private armProfileReset(): void {
    this.actions.feedback();
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
  }

  private clearPlayerUiState(): void {
    this.clearProfileDraft();
    this.profileResetPending = false;
    this.debugSaveResetArmed = false;
    this.pages.inventoryStacks = 0;
    this.pages.harvestChest = 0;
    this.pages.techniques = 0;
    this.pages.equipment = 0;
  }

  private drawInventoryPanel(overlay: Node, state: Readonly<AppState>): void {
    const data = state.bootstrap!;
    const mutationsEnabled = canRunLocalMutation(state);
    const usedSlots = data.inventory.stacks.length + data.equipment.length;
    const stackWindow = this.pageWindow(
      "inventoryStacks",
      data.inventory.stacks.length,
      4,
    );
    const harvestWindow = this.pageWindow(
      "harvestChest",
      data.harvestChest.entries.length,
      4,
    );
    drawBand(overlay, "BagSummary", 0, 390, 620, 92, COLORS.inkGreen);
    addLabel(
      overlay,
      `行囊 ${usedSlots} / ${data.inventory.bagCapacity}`,
      -165,
      404,
      280,
      38,
      23,
      COLORS.text,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      `灵石 ${formatLargeNumber(data.wallet.spiritStone)}`,
      -165,
      370,
      280,
      30,
      17,
      COLORS.gold,
      false,
      1,
      HorizontalTextAlignment.LEFT,
    );
    if (data.inventory.bagCapacity < 200) {
      const purchaseIndex = (data.inventory.bagCapacity - 50) / 10 + 1;
      const cost = 5_000 * purchaseIndex * purchaseIndex;
      createButton(
        overlay,
        `扩展 +10（${formatLargeNumber(String(cost))}）`,
        178,
        390,
        250,
        58,
        {
          fill: COLORS.inkGreenLight,
          stroke: COLORS.gold,
          fontSize: 17,
          enabled: mutationsEnabled,
        },
        () => this.actions.expandInventory(),
      );
    } else {
      addLabel(overlay, "容量已满", 205, 390, 190, 38, 18, COLORS.jade);
    }

    addLabel(
      overlay,
      "堆叠道具",
      -245,
      310,
      180,
      34,
      20,
      COLORS.jade,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    drawPagination(
      overlay,
      "InventoryStackPager",
      190,
      310,
      stackWindow.page,
      stackWindow.pageCount,
      () => this.showPage("inventoryStacks", stackWindow.page - 1),
      () => this.showPage("inventoryStacks", stackWindow.page + 1),
    );
    if (data.inventory.stacks.length === 0) {
      addLabel(overlay, "行囊中暂无堆叠道具", 0, 253, 540, 40, 18, COLORS.textMuted);
    } else {
      data.inventory.stacks
        .slice(stackWindow.start, stackWindow.end)
        .forEach((stack, index) => {
          const y = 258 - index * 54;
          const directlyUsable = stack.itemConfigId === "exp_pill_small";
          drawBand(overlay, `Stack-${stack.itemConfigId}`, 0, y, 600, 46, COLORS.panel);
          addLabel(
            overlay,
            stack.displayName,
            directlyUsable ? -180 : -155,
            y,
            directlyUsable ? 220 : 280,
            32,
            17,
            COLORS.text,
            false,
            1,
            HorizontalTextAlignment.LEFT,
          );
          addLabel(
            overlay,
            `× ${formatLargeNumber(stack.quantity)}`,
            directlyUsable ? 70 : 190,
            y,
            directlyUsable ? 100 : 190,
            32,
            18,
            COLORS.gold,
            true,
            1,
            HorizontalTextAlignment.RIGHT,
          );
          if (directlyUsable) {
            createButton(
              overlay,
              "使用",
              235,
              y,
              104,
              40,
              {
                fill: COLORS.inkGreenLight,
                stroke: COLORS.goldMuted,
                fontSize: 15,
                enabled: mutationsEnabled,
              },
              () => this.actions.useInventoryItem(stack.itemConfigId),
            );
          }
        });
    }

    addLabel(
      overlay,
      `挂机收获箱 ${data.harvestChest.pendingCount} / 100`,
      -205,
      35,
      270,
      36,
      20,
      COLORS.jade,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    drawPagination(
      overlay,
      "HarvestChestPager",
      190,
      35,
      harvestWindow.page,
      harvestWindow.pageCount,
      () => this.showPage("harvestChest", harvestWindow.page - 1),
      () => this.showPage("harvestChest", harvestWindow.page + 1),
    );
    if (data.harvestChest.entries.length === 0) {
      drawBand(overlay, "HarvestEmpty", 0, -70, 600, 130, COLORS.panel);
      addLabel(overlay, "暂无待处理收获", 0, -52, 480, 38, 20, COLORS.text);
      addLabel(
        overlay,
        "挂机法宝与未收录功法会在这里等待处理",
        0,
        -91,
        540,
        32,
        16,
        COLORS.textMuted,
      );
      return;
    }

    data.harvestChest.entries
      .slice(harvestWindow.start, harvestWindow.end)
      .forEach((entry, index) => {
        const y = -30 - index * 91;
        drawBand(overlay, `Harvest-${entry.id}`, 0, y, 610, 78, COLORS.panel);
        const quality = qualityName(entry.quality);
        addLabel(
          overlay,
          `${quality} · ${entry.displayName}`,
          -165,
          y + 13,
          300,
          30,
          17,
          qualityColor(entry.quality),
          true,
          1,
          HorizontalTextAlignment.LEFT,
        );
        addLabel(
          overlay,
          entry.entryType === "equipment" ? "独立法宝" : "功法本体",
          -165,
          y - 16,
          300,
          25,
          15,
          COLORS.textMuted,
          false,
          1,
          HorizontalTextAlignment.LEFT,
        );
        createButton(
          overlay,
          "收取",
          106,
          y,
          100,
          48,
          {
            fill: COLORS.inkGreenLight,
            stroke: COLORS.goldMuted,
            fontSize: 16,
            enabled: mutationsEnabled,
          },
          () => this.actions.transferHarvest(entry.id),
        );
        if (qualityRank(entry.quality) < QUALITY_ORDER.rare) {
          createButton(
            overlay,
            "分解",
            231,
            y,
            100,
            48,
            {
              fill: COLORS.red,
              stroke: COLORS.goldMuted,
              fontSize: 16,
              enabled: mutationsEnabled,
            },
            () => this.actions.salvageHarvest(entry.id),
          );
        } else {
          addLabel(overlay, "已保护", 231, y, 100, 32, 15, COLORS.gold);
        }
      });
  }

  private drawTechniquePanel(overlay: Node, state: Readonly<AppState>): void {
    const techniques = state.bootstrap!.techniques;
    const mutationsEnabled = canRunLocalMutation(state);
    const techniqueWindow = this.pageWindow("techniques", techniques.length, 8);
    addLabel(
      overlay,
      `功法 ${techniques.length} 本 · 装备战力 +${formatLargeNumber(state.bootstrap!.progress.loadoutFixedPower)} · 修炼 +${formatBasisPoints(state.bootstrap!.progress.experienceBonusBp)}`,
      0,
      393,
      590,
      50,
      17,
      COLORS.jade,
      false,
      2,
      HorizontalTextAlignment.CENTER,
      "fixed",
    );
    const slots = [
      { id: "mind", label: "心法" },
      { id: "movement", label: "身法" },
      { id: "divine", label: "神通" },
      { id: "secret", label: "秘术" },
    ];
    slots.forEach((slot, index) => {
      const x = -225 + index * 150;
      const equipped = techniques.find((technique) => technique.equippedSlot === slot.id);
      const labelLayout = getTechniqueSlotLabelLayout(
        slot.label,
        equipped?.displayName ?? null,
      );
      drawBand(overlay, `TechniqueSlot-${slot.id}`, x, 320, 132, 64, COLORS.panel, COLORS.goldMuted);
      addLabel(
        overlay,
        labelLayout.text,
        x,
        320,
        116,
        54,
        15,
        equipped ? qualityColor(equipped.quality) : COLORS.textMuted,
        false,
        labelLayout.maxLines,
        HorizontalTextAlignment.CENTER,
        labelLayout.sizing,
      );
    });
    if (techniques.length === 0) {
      addLabel(overlay, "尚未收录功法，可从挂机收获箱中收取", 0, 170, 570, 50, 20, COLORS.text);
      return;
    }
    techniques.slice(techniqueWindow.start, techniqueWindow.end).forEach((technique, index) => {
      const y = 222 - index * 75;
      drawBand(overlay, `Technique-${technique.techniqueConfigId}`, 0, y, 600, 62, COLORS.panel);
      addLabel(
        overlay,
        technique.displayName,
        -190,
        y,
        210,
        34,
        18,
        qualityColor(technique.quality),
        true,
        1,
        HorizontalTextAlignment.LEFT,
      );
      addLabel(
        overlay,
        `${technique.star}星 · 战力 +${formatLargeNumber(technique.fixedPower)}`,
        25,
        y,
        190,
        32,
        17,
        COLORS.gold,
        false,
        1,
        HorizontalTextAlignment.CENTER,
      );
      const equipped = technique.equippedSlot !== null;
      createButton(
        overlay,
        equipped
          ? "卸下"
          : techniques.some((candidate) => candidate.equippedSlot === technique.slot)
            ? "替换"
            : "装备",
        245,
        y,
        92,
        44,
        {
          fill: equipped ? COLORS.red : COLORS.inkGreenLight,
          stroke: COLORS.goldMuted,
          fontSize: 15,
          enabled: mutationsEnabled,
        },
        () =>
          equipped
            ? this.actions.unequipTechnique(technique.techniqueConfigId)
            : this.actions.equipTechnique(technique.techniqueConfigId),
      );
    });
    drawPagination(
      overlay,
      "TechniquePager",
      0,
      -382,
      techniqueWindow.page,
      techniqueWindow.pageCount,
      () => this.showPage("techniques", techniqueWindow.page - 1),
      () => this.showPage("techniques", techniqueWindow.page + 1),
    );
  }

  private drawEquipmentPanel(overlay: Node, state: Readonly<AppState>): void {
    const equipment = state.bootstrap!.equipment;
    const mutationsEnabled = canRunLocalMutation(state);
    const equipmentWindow = this.pageWindow("equipment", equipment.length, 7);
    addLabel(
      overlay,
      `法宝 ${equipment.length} 件 · 装备影响战力与挂机效率`,
      0,
      393,
      590,
      40,
      19,
      COLORS.jade,
    );
    const slots: Array<{ id: EquippedEquipmentSlot; label: string }> = [
      { id: "weapon", label: "武器" },
      { id: "armor", label: "防具" },
      { id: "accessory_left", label: "饰品·左" },
      { id: "accessory_right", label: "饰品·右" },
      { id: "mount", label: "坐骑" },
      { id: "pet", label: "灵宠" },
    ];
    slots.forEach((slot, index) => {
      const x = -205 + (index % 3) * 205;
      const y = index < 3 ? 326 : 260;
      const equipped = equipment.find((item) => item.equippedSlot === slot.id);
      drawBand(overlay, `EquipmentSlot-${slot.id}`, x, y, 188, 54, COLORS.panel, COLORS.goldMuted);
      addLabel(
        overlay,
        `${slot.label} · ${equipped?.displayName ?? "未装备"}`,
        x,
        y,
        170,
        36,
        14,
        equipped ? qualityColor(equipped.quality) : COLORS.textMuted,
      );
    });
    if (equipment.length === 0) {
      addLabel(overlay, "尚无法宝入囊，可先处理挂机收获", 0, 135, 560, 48, 20, COLORS.text);
      return;
    }
    equipment.slice(equipmentWindow.start, equipmentWindow.end).forEach((item, index) => {
      const y = 180 - index * 72;
      drawBand(overlay, `Equipment-${item.id}`, 0, y, 600, 60, COLORS.panel);
      addLabel(
        overlay,
        item.displayName,
        -190,
        y,
        205,
        34,
        18,
        qualityColor(item.quality),
        true,
        1,
        HorizontalTextAlignment.LEFT,
      );
      addLabel(
        overlay,
        `战力 +${formatLargeNumber(item.fixedPower)} · +${item.enhanceLevel}`,
        25,
        y,
        170,
        32,
        17,
        COLORS.gold,
        false,
        1,
        HorizontalTextAlignment.CENTER,
      );
      if (item.equippedSlot) {
        createButton(
          overlay,
          "卸下",
          245,
          y,
          92,
          44,
          {
            fill: COLORS.red,
            stroke: COLORS.goldMuted,
            fontSize: 15,
            enabled: mutationsEnabled,
          },
          () => this.actions.unequipEquipment(item.id),
        );
      } else if (item.slot === "accessory") {
        createButton(
          overlay,
          "装左",
          211,
          y,
          58,
          42,
          {
            fill: COLORS.inkGreenLight,
            stroke: COLORS.goldMuted,
            fontSize: 14,
            enabled: mutationsEnabled,
          },
          () => this.actions.equipEquipment(item.id, "accessory_left"),
        );
        createButton(
          overlay,
          "装右",
          273,
          y,
          58,
          42,
          {
            fill: COLORS.inkGreenLight,
            stroke: COLORS.goldMuted,
            fontSize: 14,
            enabled: mutationsEnabled,
          },
          () => this.actions.equipEquipment(item.id, "accessory_right"),
        );
      } else {
        const equippedSlot = regularEquipmentSlot(item.slot);
        if (equippedSlot) {
          createButton(
            overlay,
            equipment.some((candidate) => candidate.equippedSlot === equippedSlot)
              ? "替换"
              : "装备",
            245,
            y,
            92,
            44,
            {
              fill: COLORS.inkGreenLight,
              stroke: COLORS.goldMuted,
              fontSize: 15,
              enabled: mutationsEnabled,
            },
            () => this.actions.equipEquipment(item.id, equippedSlot),
          );
        }
      }
    });
    drawPagination(
      overlay,
      "EquipmentPager",
      0,
      -330,
      equipmentWindow.page,
      equipmentWindow.pageCount,
      () => this.showPage("equipment", equipmentWindow.page - 1),
      () => this.showPage("equipment", equipmentWindow.page + 1),
    );
  }

  private drawTaskPanel(overlay: Node, state: Readonly<AppState>): void {
    const tasks = state.bootstrap!.newcomerTasks.slice(0, 3);
    drawBand(overlay, "TaskIntro", 0, 340, 600, 110, COLORS.inkGreen);
    addLabel(overlay, "新手修行录", -170, 358, 240, 38, 22, COLORS.gold, true);
    addLabel(overlay, "里程碑与奖励会自动写入本地存档", 25, 319, 500, 32, 16, COLORS.textMuted);
    if (tasks.length === 0) {
      addLabel(overlay, "暂无修行任务", 0, 190, 520, 44, 21, COLORS.text);
      return;
    }
    tasks.forEach((task, index) => {
      const display = getNewcomerTaskDisplay(task);
      const y = 205 - index * 166;
      drawBand(overlay, `Task-${index}`, 0, y, 600, 148, COLORS.panel);
      addLabel(
        overlay,
        display.title,
        -145,
        y + 46,
        280,
        32,
        18,
        COLORS.text,
        true,
        1,
        HorizontalTextAlignment.LEFT,
      );
      addLabel(
        overlay,
        display.statusText,
        205,
        y + 46,
        130,
        32,
        16,
        display.completed ? COLORS.gold : COLORS.jade,
        true,
        1,
        HorizontalTextAlignment.RIGHT,
        "fixed",
      );
      addLabel(
        overlay,
        display.description,
        0,
        y + 9,
        540,
        30,
        15,
        COLORS.textMuted,
        false,
        1,
        HorizontalTextAlignment.LEFT,
        "fixed",
      );
      addLabel(
        overlay,
        display.progressText,
        -165,
        y - 38,
        210,
        30,
        15,
        display.completed ? COLORS.textMuted : COLORS.jade,
        true,
        1,
        HorizontalTextAlignment.LEFT,
        "fixed",
      );
      addLabel(
        overlay,
        display.rewardText,
        112,
        y - 38,
        316,
        30,
        15,
        display.claimed ? COLORS.gold : COLORS.textMuted,
        false,
        1,
        HorizontalTextAlignment.RIGHT,
        "fixed",
      );
    });
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

  private drawPartnerUnlockNotice(state: Readonly<AppState>): void {
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
    if (state.featureMessage) {
      addLabel(
        overlay,
        state.featureMessage,
        0,
        -62,
        500,
        34,
        16,
        COLORS.textMuted,
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

function snapshotMatchesPresentationTarget(
  state: Readonly<AppState>,
  plan: CultivationPresentationPlan,
): boolean {
  const bootstrap = state.bootstrap;
  return (
    bootstrap !== null &&
    bootstrap.account.id === plan.accountId &&
    bootstrap.player.id === plan.playerId &&
    bootstrap.progress.level === plan.toLevel &&
    bootstrap.progress.realmName === plan.toRealmName &&
    bootstrap.progress.totalPower === plan.toPower
  );
}

function snapshotMatchesPresentationSource(
  state: Readonly<AppState>,
  plan: CultivationPresentationPlan,
): boolean {
  const bootstrap = state.bootstrap;
  return (
    bootstrap !== null &&
    bootstrap.account.id === plan.accountId &&
    bootstrap.player.id === plan.playerId &&
    bootstrap.progress.level === plan.fromLevel &&
    bootstrap.progress.realmName === plan.fromRealmName &&
    bootstrap.progress.totalPower === plan.fromPower
  );
}

function parseDebugDropSeed(value: string): number | null {
  if (!/^\d{1,10}$/.test(value)) return null;
  const seed = Number(value);
  return Number.isSafeInteger(seed) && seed <= MAX_DEBUG_DROP_SEED ? seed : null;
}

function formatDebugTimestamp(value: string | null): string {
  if (!value) return "尚未保存";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "时间未知";
  return value.replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function presentationKindName(kind: CultivationPresentationPlan["kind"]): string {
  if (kind === "level_up") return "升级";
  if (kind === "breakthrough") return "突破";
  return "战力";
}

function createFeatureButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  iconIndex: number,
  onClick: () => void,
): void {
  const node = createUiNode(parent, `Feature-${text}`);
  node.setPosition(x, y);
  setSize(node, 138, 100);
  const background = node.addComponent(Graphics);
  background.fillColor = withAlpha(COLORS.panel, 238);
  background.roundRect(-67, -48, 134, 96, 5);
  background.fill();
  background.strokeColor = COLORS.goldMuted;
  background.lineWidth = 1;
  background.roundRect(-67, -48, 134, 96, 5);
  background.stroke();
  const button = node.addComponent(Button);
  button.transition = Button.Transition.SCALE;
  button.zoomScale = 0.95;
  node.on(Button.EventType.CLICK, onClick);

  const medallion = graphicsNode(node, "FeatureMedallion", 0, 17);
  medallion.fillColor = COLORS.black;
  medallion.circle(0, 0, 27);
  medallion.fill();
  medallion.strokeColor = iconIndex % 2 === 0 ? COLORS.gold : COLORS.cyan;
  medallion.lineWidth = 2;
  medallion.circle(0, 0, 27);
  medallion.stroke();
  drawFeatureGlyph(medallion, iconIndex, 0.76);
  addLabel(
    node,
    text,
    0,
    -31,
    116,
    30,
    18,
    COLORS.text,
    true,
    1,
    HorizontalTextAlignment.CENTER,
    "fixed",
  );
}

function createHotspot(
  parent: Node,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  onClick: () => void,
): Node {
  const node = createUiNode(parent, name);
  node.setPosition(x, y);
  setSize(node, width, height);
  const button = node.addComponent(Button);
  button.transition = Button.Transition.NONE;
  node.on(Button.EventType.CLICK, onClick);
  return node;
}

function createMainTabButton(
  parent: Node,
  tab: MainTab,
  text: string,
  x: number,
  y: number,
  selected: boolean,
  onClick: () => void,
): void {
  const node = createUiNode(parent, `RightTab-${tab}`);
  node.setPosition(x, y);
  setSize(node, 104, 102);
  const plate = node.addComponent(Graphics);
  plate.fillColor = selected ? COLORS.goldMuted : COLORS.panel;
  plate.roundRect(-50, -49, 100, 98, 6);
  plate.fill();
  plate.strokeColor = selected ? COLORS.goldBright : COLORS.goldMuted;
  plate.lineWidth = selected ? 2 : 1;
  plate.roundRect(-50, -49, 100, 98, 6);
  plate.stroke();
  const button = node.addComponent(Button);
  button.transition = Button.Transition.SCALE;
  button.zoomScale = 0.93;
  node.on(Button.EventType.CLICK, onClick);

  const icon = drawTabIcon(node, tab, selected);
  icon.node.setPosition(0, 17);
  icon.node.setScale(0.78, 0.78, 1);
  addLabel(
    node,
    text,
    0,
    -31,
    90,
    26,
    18,
    selected ? COLORS.goldBright : COLORS.text,
    true,
    1,
    HorizontalTextAlignment.CENTER,
    "fixed",
  );
}

function createBottomFeatureButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  iconIndex: number,
  onClick: () => void,
  upcoming = false,
): void {
  const node = createUiNode(parent, `BottomFeature-${text}`);
  node.setPosition(x, y);
  setSize(node, 104, 166);
  const plate = node.addComponent(Graphics);
  plate.fillColor = COLORS.panel;
  plate.roundRect(-50, -79, 100, 158, 5);
  plate.fill();
  plate.strokeColor = upcoming ? withAlpha(COLORS.goldMuted, 110) : COLORS.goldMuted;
  plate.lineWidth = 1;
  plate.roundRect(-50, -79, 100, 158, 5);
  plate.stroke();
  const button = node.addComponent(Button);
  button.transition = Button.Transition.SCALE;
  button.zoomScale = 0.94;
  node.on(Button.EventType.CLICK, onClick);

  const medallion = graphicsNode(node, "BottomFeatureMedallion", 0, 27);
  medallion.fillColor = COLORS.black;
  medallion.circle(0, 0, 34);
  medallion.fill();
  const accent = iconIndex % 2 === 0 ? COLORS.gold : COLORS.cyan;
  medallion.strokeColor = upcoming ? withAlpha(accent, 110) : accent;
  medallion.lineWidth = 2;
  medallion.circle(0, 0, 34);
  medallion.stroke();
  drawFeatureGlyph(medallion, iconIndex, 0.82);
  addLabel(
    node,
    text,
    0,
    -43,
    92,
    32,
    19,
    upcoming ? COLORS.textMuted : COLORS.text,
    true,
    1,
    HorizontalTextAlignment.CENTER,
    "fixed",
  );
}

function createSideFeatureButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  iconIndex: number,
  badge: number,
  onClick: () => void,
): void {
  const node = createUiNode(parent, `SideFeature-${text}`);
  node.setPosition(x, y);
  setSize(node, 86, 96);
  const plate = node.addComponent(Graphics);
  plate.fillColor = withAlpha(COLORS.panelStrong, 246);
  plate.circle(0, 12, 35);
  plate.fill();
  plate.strokeColor = COLORS.goldMuted;
  plate.lineWidth = 2;
  plate.circle(0, 12, 37);
  plate.stroke();
  const button = node.addComponent(Button);
  button.transition = Button.Transition.SCALE;
  button.zoomScale = 0.92;
  node.on(Button.EventType.CLICK, onClick);
  const glyph = graphicsNode(node, "SideFeatureGlyph", 0, 14);
  drawFeatureGlyph(glyph, iconIndex, 0.95);
  addLabel(
    node,
    text,
    0,
    -34,
    84,
    28,
    17,
    COLORS.goldBright,
    true,
    1,
    HorizontalTextAlignment.CENTER,
    "fixed",
  );
  if (badge > 0) {
    const marker = graphicsNode(node, "Badge", 29, 39);
    marker.fillColor = COLORS.red;
    marker.circle(0, 0, 11);
    marker.fill();
    marker.strokeColor = COLORS.goldBright;
    marker.lineWidth = 1;
    marker.circle(0, 0, 11);
    marker.stroke();
    addLabel(
      node,
      badge > 9 ? "9+" : String(badge),
      29,
      39,
      22,
      20,
      11,
      COLORS.text,
      true,
      1,
      HorizontalTextAlignment.CENTER,
      "fixed",
    );
  }
}

function liveCultivationGainText(
  status: BootstrapSnapshot["progress"]["status"],
  gainedSinceAnchor: string,
): string {
  return `${status === "version_cap" ? "本轮积蓄" : "本轮修炼"} +${formatLargeNumber(gainedSinceAnchor)}`;
}

function regularEquipmentSlot(value: string): EquippedEquipmentSlot | null {
  if (
    value === "weapon" ||
    value === "armor" ||
    value === "mount" ||
    value === "pet"
  ) {
    return value;
  }
  return null;
}

function formatBasisPoints(value: number): string {
  const percent = value / 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`;
}

function ratio(value: string, total: string): number {
  return ratioOfBigNumberStrings(value, total);
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`;
  return `${Math.max(1, minutes)}分钟`;
}
