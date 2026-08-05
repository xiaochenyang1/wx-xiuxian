import {
  type AssetQuality,
  type AvatarVariant,
  type ChosenAvatarVariant,
  type EquippedEquipmentSlot,
  type OfflineSettlementSummary,
} from "@cultivation-diary/shared";
import {
  formatLargeNumber,
  ratioOfBigNumberStrings,
  sumBigNumberStrings,
} from "../core/ClientNumber";
import type {
  AppState,
  FeaturePanel,
  MainTab,
} from "../core/ClientTypes";
import {
  Button,
  BlockInputEvents,
  Color,
  EditBox,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  tween,
  UIOpacity,
  UITransform,
  VerticalTextAlignment,
  Vec3,
} from "cc";

const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;

const QUALITY_ORDER: Readonly<Record<AssetQuality, number>> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
  primordial: 6,
};

const QUALITY_NAMES: Readonly<Record<AssetQuality, string>> = {
  common: "普通",
  uncommon: "优秀",
  rare: "稀有",
  epic: "史诗",
  legendary: "传说",
  mythic: "神话",
  primordial: "洪荒",
};

const COLORS = {
  background: color("#0c141f"),
  backgroundBlue: color("#132536"),
  inkGreen: color("#17372f"),
  inkGreenLight: color("#245247"),
  panel: color("#14212d"),
  panelStrong: color("#1b2f3b"),
  gold: color("#d6b66a"),
  goldMuted: color("#8f7a4d"),
  jade: color("#74a99c"),
  text: color("#e8e3d5"),
  textMuted: color("#9fa9aa"),
  red: color("#a9554d"),
  black: color("#080d12"),
};

interface AppViewActions {
  retry(): void;
  selectTab(tab: MainTab): void;
  openFeature(feature: FeaturePanel): void;
  closeFeature(): void;
  breakthrough(): void;
  chooseAvatar(avatarVariant: ChosenAvatarVariant): void;
  renamePlayer(displayName: string): void;
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
  feedback(): void;
}

interface ButtonStyle {
  fill: Color;
  stroke?: Color;
  text?: Color;
  fontSize?: number;
  enabled?: boolean;
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

export class AppView {
  private idleLabel: Label | null = null;
  private idleFrame = 0;
  private lastState: Readonly<AppState> | null = null;
  private profileAvatarDraft: ChosenAvatarVariant | null = null;
  private profileNameDraft: string | null = null;
  private profileNameSource: string | null = null;
  private readonly pages: Record<PagedList, number> = {
    inventoryStacks: 0,
    harvestChest: 0,
    techniques: 0,
    equipment: 0,
  };

  constructor(
    private readonly root: Node,
    private readonly actions: AppViewActions,
  ) {
    setSize(root, DESIGN_WIDTH, DESIGN_HEIGHT);
  }

  render(state: Readonly<AppState>): void {
    this.lastState = state;
    for (const child of [...this.root.children]) child.destroy();
    this.idleLabel = null;
    this.drawBackdrop();

    if (state.phase === "loading") {
      this.drawLoading(state.loadingMessage);
      return;
    }
    if (state.phase === "error" || !state.bootstrap) {
      this.drawError(state.errorMessage || "暂时无法连接仙门");
      return;
    }

    this.drawHeader(state);
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
    this.drawNavigation(state.selectedTab);
    this.drawSyncStatus(state);
    if (state.activeFeature) {
      this.drawFeaturePanel(state, state.activeFeature);
    }
    if (state.bootstrap.offlineSettlement) {
      this.drawOfflineSettlement(state.bootstrap.offlineSettlement);
    }
  }

  updateIdleAnimation(): void {
    if (!this.idleLabel?.isValid) return;
    this.idleFrame = (this.idleFrame + 1) % 4;
    this.idleLabel.string = `挂机中${".".repeat(this.idleFrame)}`;
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

  private drawBackdrop(): void {
    const graphics = graphicsNode(this.root, "Backdrop", 0, 0);
    graphics.fillColor = COLORS.background;
    graphics.rect(-DESIGN_WIDTH / 2, -DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT);
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
    tween(opacity)
      .repeatForever(
        tween<UIOpacity>()
          .to(0.75, { opacity: 90 })
          .to(0.75, { opacity: 255 }),
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
      -105,
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
    drawBand(this.root, "Header", 0, 594, 750, 122, COLORS.panelStrong, COLORS.goldMuted);

    drawAvatarPortrait(
      this.root,
      bootstrap.player.avatarVariant,
      -337,
      594,
    );

    addLabel(
      this.root,
      bootstrap.player.displayName,
      -213,
      606,
      188,
      42,
      24,
      COLORS.text,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      this.root,
      bootstrap.progress.title,
      -213,
      568,
      188,
      34,
      18,
      COLORS.jade,
      false,
      1,
      HorizontalTextAlignment.LEFT,
    );

    createButton(
      this.root,
      "档案",
      -65,
      594,
      82,
      46,
      { fill: COLORS.inkGreenLight, stroke: COLORS.goldMuted, fontSize: 16 },
      () => {
        this.actions.feedback();
        this.actions.openFeature("profile");
      },
    );

    addLabel(this.root, "总战力", 214, 616, 250, 30, 17, COLORS.textMuted);
    addLabel(
      this.root,
      formatLargeNumber(bootstrap.progress.totalPower),
      214,
      578,
      250,
      48,
      32,
      COLORS.gold,
      true,
    );

    const divider = graphicsNode(this.root, "HeaderDivider", 18, 594);
    divider.strokeColor = COLORS.goldMuted;
    divider.lineWidth = 1;
    divider.moveTo(0, -36);
    divider.lineTo(0, 36);
    divider.stroke();
  }

  private drawSyncStatus(state: Readonly<AppState>): void {
    if (state.syncStatus === "online") return;

    const reconnecting = state.syncStatus === "reconnecting";
    drawBand(
      this.root,
      "SyncStatus",
      0,
      520,
      750,
      30,
      reconnecting ? COLORS.inkGreenLight : COLORS.red,
    );
    addLabel(
      this.root,
      reconnecting
        ? "正在重连 · 当前显示上次同步数据"
        : `离线数据 · ${formatLastSync(state.lastSuccessfulSyncAt)} · 联网后自动核对`,
      0,
      520,
      710,
      24,
      15,
      COLORS.text,
      true,
    );
  }

  private drawCultivation(state: Readonly<AppState>): void {
    const data = state.bootstrap!;
    const mutationsEnabled = state.syncStatus === "online";
    this.drawCultivationScene();
    this.idleLabel = addLabel(
      this.root,
      "挂机中",
      0,
      57,
      320,
      42,
      21,
      COLORS.jade,
    );

    const expRatio = ratio(data.progress.experience, data.progress.requiredExperience);
    drawBand(this.root, "ExperienceBand", 0, -25, 686, 82, COLORS.panel, COLORS.goldMuted);
    addLabel(
      this.root,
      `修为 ${formatLargeNumber(data.progress.experience)} / ${formatLargeNumber(data.progress.requiredExperience)}`,
      0,
      -2,
      630,
      30,
      18,
      COLORS.text,
    );
    drawProgress(this.root, 0, -46, 620, 14, expRatio);

    const stats = [
      { label: "等级", value: `Lv.${data.progress.level}`, color: COLORS.text },
      {
        label: "每秒经验",
        value: `${formatLargeNumber(data.progress.experiencePerSecond)}/秒`,
        color: COLORS.jade,
      },
      {
        label: "每分钟灵石",
        value: `${formatLargeNumber(data.progress.spiritStonePerMinute)}/分`,
        color: COLORS.gold,
      },
    ];
    stats.forEach((stat, index) => {
      const x = -232 + index * 232;
      drawBand(this.root, `Stat${index}`, x, -137, 208, 102, COLORS.panelStrong);
      addLabel(this.root, stat.label, x, -116, 178, 28, 16, COLORS.textMuted);
      addLabel(this.root, stat.value, x, -157, 184, 42, 23, stat.color, true);
    });

    if (data.progress.status === "breakthrough_ready") {
      createButton(
        this.root,
        "突破至下一境界",
        0,
        -238,
        420,
        66,
        {
          fill: COLORS.red,
          stroke: COLORS.gold,
          text: COLORS.text,
          fontSize: 23,
          enabled: mutationsEnabled,
        },
        () => this.actions.breakthrough(),
      );
    } else {
      addLabel(
        this.root,
        `当前境界修炼进度 ${Math.floor(expRatio * 100)}%`,
        0,
        -238,
        520,
        36,
        18,
        COLORS.textMuted,
      );
    }

    const features: Array<{ label: string; feature: FeaturePanel }> = [
      { label: "功法", feature: "techniques" },
      { label: "法宝", feature: "equipment" },
      { label: "背包", feature: "inventory" },
      { label: "任务", feature: "tasks" },
    ];
    features.forEach((item, index) => {
      const x = -270 + index * 180;
      createFeatureButton(this.root, item.label, x, -365, index, () => {
        this.actions.feedback();
        this.actions.openFeature(item.feature);
      });
    });
  }

  private drawCultivationScene(): void {
    drawBand(this.root, "CultivationScene", 0, 292, 686, 472, COLORS.inkGreen);
    const art = graphicsNode(this.root, "CultivationArt", 0, 292);

    art.fillColor = color("#d5d0b7");
    art.circle(222, 126, 58);
    art.fill();
    art.fillColor = COLORS.inkGreenLight;
    art.circle(244, 140, 58);
    art.fill();

    drawMountainLayer(art, -180, color("#285447"), [
      [-343, 0],
      [-240, 112],
      [-155, 38],
      [-58, 150],
      [52, 45],
      [158, 123],
      [245, 30],
      [343, 82],
    ]);
    drawMountainLayer(art, -218, color("#102a27"), [
      [-343, 10],
      [-223, 75],
      [-112, 22],
      [15, 94],
      [128, 16],
      [248, 72],
      [343, 26],
    ]);

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
      this.drawLockedPage("伴侣", "筑基后开启", "修为达到 Lv.11 即可踏入此境");
      return;
    }

    drawBand(this.root, "PartnerEmpty", 0, 130, 686, 690, COLORS.inkGreen);
    addLabel(this.root, "小师妹", 0, 245, 520, 58, 35, COLORS.gold, true);
    addLabel(this.root, "亲密度 0 / 1000", 0, 145, 480, 40, 20, COLORS.text);
    drawProgress(this.root, 0, 105, 460, 14, 0);
    addLabel(this.root, "初识", 0, 45, 280, 40, 22, COLORS.jade);
  }

  private drawRanking(): void {
    const tabs = ["战力", "等级", "财富", "洞府", "伴侣"];
    tabs.forEach((tab, index) => {
      const x = -280 + index * 140;
      drawBand(
        this.root,
        `RankTab${index}`,
        x,
        474,
        124,
        54,
        index === 0 ? COLORS.inkGreenLight : COLORS.panel,
        index === 0 ? COLORS.gold : undefined,
      );
      addLabel(this.root, tab, x, 474, 112, 34, 18, index === 0 ? COLORS.gold : COLORS.textMuted);
    });

    drawBand(this.root, "RankingList", 0, 100, 686, 650, COLORS.panel);
    [1, 2, 3, 4, 5].forEach((rank, index) => {
      const y = 355 - index * 105;
      addLabel(this.root, String(rank), -285, y, 62, 38, 21, rank <= 3 ? COLORS.gold : COLORS.text);
      addLabel(this.root, "暂无道友", -90, y, 260, 38, 20, COLORS.textMuted);
      addLabel(this.root, "--", 245, y, 120, 38, 20, COLORS.textMuted);
      const line = graphicsNode(this.root, `RankLine${rank}`, 0, y - 48);
      line.strokeColor = color("#2b3c46");
      line.lineWidth = 1;
      line.moveTo(-310, 0);
      line.lineTo(310, 0);
      line.stroke();
    });
    drawBand(this.root, "MyRank", 0, -275, 686, 86, COLORS.inkGreenLight, COLORS.goldMuted);
    addLabel(this.root, "我的排名", -210, -275, 180, 40, 20, COLORS.text);
    addLabel(this.root, "--", 245, -275, 100, 40, 22, COLORS.gold, true);
  }

  private drawCave(state: Readonly<AppState>): void {
    if (!state.bootstrap!.unlocks.cave) {
      this.drawLockedPage("洞府", "筑基后开启", "修为达到 Lv.11 即可开辟洞府");
      return;
    }

    drawBand(this.root, "CaveEmpty", 0, 120, 686, 720, COLORS.inkGreen);
    addLabel(this.root, `${state.bootstrap!.player.displayName}的洞府`, 0, 420, 560, 54, 31, COLORS.gold, true);
    addLabel(this.root, "繁荣度 0", 0, 355, 340, 36, 19, COLORS.jade);
    this.drawCaveBuildings();
  }

  private drawLockedPage(title: string, condition: string, detail: string): void {
    drawBand(this.root, `${title}Locked`, 0, 115, 686, 735, COLORS.panel);
    const lock = graphicsNode(this.root, "Lock", 0, 190);
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

    addLabel(this.root, title, 0, 57, 420, 58, 34, COLORS.text, true);
    addLabel(this.root, condition, 0, -18, 520, 44, 24, COLORS.gold);
    addLabel(this.root, detail, 0, -75, 560, 40, 18, COLORS.textMuted);
  }

  private drawCaveBuildings(): void {
    const buildings = ["灵田", "炼丹房", "炼器室", "闭关室", "聚灵阵"];
    buildings.forEach((name, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = column === 0 ? -170 : 170;
      const y = 225 - row * 145;
      drawBand(this.root, `Building${name}`, x, y, 292, 112, COLORS.panelStrong, COLORS.goldMuted);
      addLabel(this.root, name, x - 54, y + 13, 160, 34, 20, COLORS.text, true);
      addLabel(this.root, "Lv.1", x - 54, y - 23, 160, 28, 16, COLORS.jade);
      addLabel(this.root, "+", x + 95, y, 42, 42, 27, COLORS.gold, true);
    });
  }

  private drawNavigation(selected: MainTab): void {
    drawBand(this.root, "Navigation", 0, -608, 750, 118, COLORS.panelStrong, COLORS.goldMuted);
    const items: Array<{ id: MainTab; label: string }> = [
      { id: "cultivation", label: "修炼" },
      { id: "partner", label: "伴侣" },
      { id: "ranking", label: "排行" },
      { id: "cave", label: "洞府" },
    ];

    items.forEach((item, index) => {
      const x = -281 + index * 187.5;
      const node = createUiNode(this.root, `Tab-${item.id}`);
      node.setPosition(x, -608);
      setSize(node, 178, 108);
      const button = node.addComponent(Button);
      button.transition = Button.Transition.SCALE;
      button.zoomScale = 0.94;
      node.on(Button.EventType.CLICK, () => {
        this.actions.feedback();
        this.actions.selectTab(item.id);
      });

      drawTabIcon(node, item.id, selected === item.id);
      addLabel(
        node,
        item.label,
        0,
        -34,
        120,
        30,
        17,
        selected === item.id ? COLORS.gold : COLORS.textMuted,
        selected === item.id,
      );
      if (selected === item.id) {
        const marker = graphicsNode(node, "Selected", 0, -52);
        marker.fillColor = COLORS.gold;
        marker.roundRect(-25, -2, 50, 4, 2);
        marker.fill();
      }
    });
  }

  private drawFeaturePanel(
    state: Readonly<AppState>,
    feature: FeaturePanel,
  ): void {
    const overlay = createUiNode(this.root, `FeaturePanel-${feature}`);
    setSize(overlay, DESIGN_WIDTH, DESIGN_HEIGHT);
    overlay.addComponent(BlockInputEvents);
    const shade = overlay.addComponent(Graphics);
    const shadeColor = color("#05080c");
    shadeColor.a = 210;
    shade.fillColor = shadeColor;
    shade.rect(
      -DESIGN_WIDTH / 2,
      -DESIGN_HEIGHT / 2,
      DESIGN_WIDTH,
      DESIGN_HEIGHT,
    );
    shade.fill();

    drawBand(overlay, "FeaturePanelBody", 0, 0, 700, 1060, COLORS.panelStrong, COLORS.goldMuted);
    const title = {
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
      468,
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
    } else if (state.syncStatus !== "online") {
      drawBand(
        overlay,
        "FeatureSyncStatus",
        0,
        -473,
        620,
        54,
        state.syncStatus === "reconnecting" ? COLORS.inkGreenLight : COLORS.red,
      );
      addLabel(
        overlay,
        state.syncStatus === "reconnecting"
          ? "正在重连 · 操作暂不可用"
          : `离线数据 · ${formatLastSync(state.lastSuccessfulSyncAt)} · 操作暂不可用`,
        0,
        -473,
        590,
        38,
        16,
        COLORS.text,
        true,
      );
    }
  }

  private drawProfilePanel(overlay: Node, state: Readonly<AppState>): void {
    const data = state.bootstrap!;
    const player = data.player;
    const mutationsEnabled = state.syncStatus === "online";

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
  }

  private drawInventoryPanel(overlay: Node, state: Readonly<AppState>): void {
    const data = state.bootstrap!;
    const mutationsEnabled = state.syncStatus === "online";
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
    const mutationsEnabled = state.syncStatus === "online";
    const techniqueWindow = this.pageWindow("techniques", techniques.length, 8);
    addLabel(
      overlay,
      `已收录 ${techniques.length} 本 · 功法/法宝战力 +${formatLargeNumber(state.bootstrap!.progress.loadoutFixedPower)} · 修炼 +${formatBasisPoints(state.bootstrap!.progress.experienceBonusBp)}`,
      0,
      393,
      590,
      40,
      19,
      COLORS.jade,
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
      drawBand(overlay, `TechniqueSlot-${slot.id}`, x, 320, 132, 64, COLORS.panel, COLORS.goldMuted);
      addLabel(
        overlay,
        `${slot.label}\n${equipped?.displayName ?? "未装备"}`,
        x,
        320,
        116,
        54,
        15,
        equipped ? qualityColor(equipped.quality) : COLORS.textMuted,
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
    const mutationsEnabled = state.syncStatus === "online";
    const equipmentWindow = this.pageWindow("equipment", equipment.length, 7);
    addLabel(
      overlay,
      `持有法宝 ${equipment.length} 件 · 法宝加成会同步影响战力与挂机效率`,
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
    const tasks = state.bootstrap!.newcomerTasks;
    drawBand(overlay, "TaskIntro", 0, 340, 600, 110, COLORS.inkGreen);
    addLabel(overlay, "新手修行录", -170, 358, 240, 38, 22, COLORS.gold, true);
    addLabel(overlay, "完成目标后奖励由服务端自动发放", 25, 319, 500, 32, 16, COLORS.textMuted);
    if (tasks.length === 0) {
      addLabel(overlay, "当前目标：修炼至 Lv.8", 0, 190, 520, 44, 21, COLORS.text);
      return;
    }
    tasks.forEach((task, index) => {
      const y = 225 - index * 82;
      drawBand(overlay, `Task-${task.taskConfigId}`, 0, y, 600, 68, COLORS.panel);
      addLabel(
        overlay,
        task.taskConfigId === "newcomer.reach_level_8" ? "修炼至 Lv.8" : task.taskConfigId,
        -160,
        y,
        300,
        34,
        18,
        COLORS.text,
        true,
        1,
        HorizontalTextAlignment.LEFT,
      );
      addLabel(
        overlay,
        task.claimedAt ? "已完成 · 突破丹已入囊" : `进度 ${task.progress}`,
        155,
        y,
        270,
        32,
        16,
        task.claimedAt ? COLORS.gold : COLORS.jade,
        false,
        1,
        HorizontalTextAlignment.RIGHT,
      );
    });
  }

  private drawOfflineSettlement(settlement: OfflineSettlementSummary): void {
    const overlay = createUiNode(this.root, "OfflineSettlementModal");
    setSize(overlay, DESIGN_WIDTH, DESIGN_HEIGHT);
    overlay.addComponent(BlockInputEvents);
    const shade = overlay.addComponent(Graphics);
    const shadeColor = color("#05080c");
    shadeColor.a = 220;
    shade.fillColor = shadeColor;
    shade.rect(
      -DESIGN_WIDTH / 2,
      -DESIGN_HEIGHT / 2,
      DESIGN_WIDTH,
      DESIGN_HEIGHT,
    );
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
      -242,
      330,
      68,
      { fill: COLORS.inkGreenLight, stroke: COLORS.gold, text: COLORS.text },
      () => {
        this.actions.feedback();
        this.actions.dismissOfflineSettlement();
      },
    );
  }
}

function addLabel(
  parent: Node,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  textColor: Color,
  bold = false,
  maxLines = 1,
  horizontalAlign = HorizontalTextAlignment.CENTER,
): Label {
  const node = createUiNode(parent, `Label-${text.slice(0, 12)}`);
  node.setPosition(x, y);
  setSize(node, width, height);
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = Math.max(fontSize + 6, Math.floor(height / maxLines));
  label.color = textColor;
  label.horizontalAlign = horizontalAlign;
  label.verticalAlign = VerticalTextAlignment.CENTER;
  label.overflow = Label.Overflow.SHRINK;
  label.isBold = bold;
  return label;
}

function createButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  style: ButtonStyle,
  onClick: () => void,
): Node {
  const enabled = style.enabled ?? true;
  const node = createUiNode(parent, `Button-${text}`);
  node.setPosition(x, y);
  setSize(node, width, height);
  const background = node.addComponent(Graphics);
  background.fillColor = enabled ? style.fill : COLORS.panel;
  background.roundRect(-width / 2, -height / 2, width, height, 6);
  background.fill();
  if (style.stroke) {
    background.strokeColor = enabled ? style.stroke : COLORS.textMuted;
    background.lineWidth = 2;
    background.roundRect(-width / 2, -height / 2, width, height, 6);
    background.stroke();
  }
  const button = node.addComponent(Button);
  button.interactable = enabled;
  button.transition = Button.Transition.SCALE;
  button.zoomScale = 0.96;
  if (enabled) node.on(Button.EventType.CLICK, onClick);
  addLabel(
    node,
    text,
    0,
    0,
    width - 20,
    height - 10,
    style.fontSize ?? 21,
    enabled ? (style.text ?? COLORS.text) : COLORS.textMuted,
    true,
  );
  return node;
}

function createTextInput(
  parent: Node,
  value: string,
  placeholder: string,
  x: number,
  y: number,
  width: number,
  height: number,
  onChange: (value: string) => void,
  onSubmit: (value: string) => void,
  enabled = true,
): EditBox {
  const node = createUiNode(parent, "ProfileNameInput");
  node.setPosition(x, y);
  setSize(node, width, height);

  const background = node.addComponent(Graphics);
  background.fillColor = enabled ? COLORS.black : COLORS.panel;
  background.roundRect(-width / 2, -height / 2, width, height, 6);
  background.fill();
  background.strokeColor = enabled ? COLORS.goldMuted : COLORS.textMuted;
  background.lineWidth = 2;
  background.roundRect(-width / 2, -height / 2, width, height, 6);
  background.stroke();

  const textLabel = addLabel(
    node,
    value,
    0,
    0,
    width - 32,
    height - 12,
    19,
    COLORS.text,
    false,
    1,
    HorizontalTextAlignment.LEFT,
  );
  const placeholderLabel = addLabel(
    node,
    placeholder,
    0,
    0,
    width - 32,
    height - 12,
    19,
    COLORS.textMuted,
    false,
    1,
    HorizontalTextAlignment.LEFT,
  );
  const editBox = node.addComponent(EditBox);
  editBox.enabled = enabled;
  editBox.textLabel = textLabel;
  editBox.placeholderLabel = placeholderLabel;
  editBox.inputMode = EditBox.InputMode.SINGLE_LINE;
  editBox.inputFlag = EditBox.InputFlag.DEFAULT;
  editBox.returnType = EditBox.KeyboardReturnType.DONE;
  editBox.maxLength = 12;
  editBox.placeholder = placeholder;
  editBox.string = value;
  node.on(EditBox.EventType.TEXT_CHANGED, (box: EditBox) => {
    onChange(box.string);
  });
  node.on(
    EditBox.EventType.EDITING_RETURN,
    (box: EditBox, finalText?: string) => {
      const value = finalText ?? box.string;
      box.string = value;
      onChange(value);
      onSubmit(value);
    },
  );
  return editBox;
}

function formatLastSync(value: string | null): string {
  if (!value) return "尚未记录同步时间";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "同步时间未知";
  const pad = (part: number): string => (part < 10 ? `0${part}` : String(part));
  return `上次同步 ${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function drawPagination(
  parent: Node,
  name: string,
  x: number,
  y: number,
  page: number,
  pageCount: number,
  onPrevious: () => void,
  onNext: () => void,
): void {
  if (pageCount <= 1) return;

  drawPageButton(parent, `${name}-Previous`, "<", x - 72, y, page > 0, onPrevious);
  addLabel(parent, `${page + 1} / ${pageCount}`, x, y, 78, 32, 16, COLORS.textMuted, true);
  drawPageButton(
    parent,
    `${name}-Next`,
    ">",
    x + 72,
    y,
    page + 1 < pageCount,
    onNext,
  );
}

function drawPageButton(
  parent: Node,
  name: string,
  text: string,
  x: number,
  y: number,
  enabled: boolean,
  onClick: () => void,
): void {
  if (enabled) {
    createButton(
      parent,
      text,
      x,
      y,
      52,
      36,
      { fill: COLORS.inkGreenLight, stroke: COLORS.goldMuted, fontSize: 18 },
      onClick,
    );
    return;
  }

  drawBand(parent, name, x, y, 52, 36, COLORS.panel);
  addLabel(parent, text, x, y, 32, 26, 18, COLORS.textMuted, true);
}

function createFeatureButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  iconIndex: number,
  onClick: () => void,
): void {
  const node = createButton(
    parent,
    text,
    x,
    y,
    150,
    94,
    { fill: COLORS.panelStrong, stroke: COLORS.goldMuted, text: COLORS.text, fontSize: 18 },
    onClick,
  );
  const icon = graphicsNode(node, "FeatureIcon", 0, 22);
  icon.strokeColor = iconIndex % 2 === 0 ? COLORS.gold : COLORS.jade;
  icon.lineWidth = 3;
  if (iconIndex === 0) {
    icon.moveTo(-17, 8);
    icon.lineTo(17, 8);
    icon.moveTo(-17, -3);
    icon.lineTo(17, -3);
    icon.moveTo(-17, -14);
    icon.lineTo(17, -14);
  } else if (iconIndex === 1) {
    icon.circle(0, -4, 18);
    icon.moveTo(-8, 13);
    icon.lineTo(0, 22);
    icon.lineTo(8, 13);
  } else if (iconIndex === 2) {
    icon.roundRect(-20, -16, 40, 34, 4);
    icon.moveTo(-10, 18);
    icon.lineTo(-6, 25);
    icon.lineTo(6, 25);
    icon.lineTo(10, 18);
  } else {
    icon.circle(0, 2, 18);
    icon.moveTo(0, 2);
    icon.lineTo(0, 14);
    icon.moveTo(0, 2);
    icon.lineTo(10, -5);
  }
  icon.stroke();

  const textNode = node.getChildByName(`Label-${text}`);
  textNode?.setPosition(0, -25);
}

function drawTabIcon(parent: Node, tab: MainTab, selected: boolean): void {
  const graphic = graphicsNode(parent, "TabIcon", 0, 20);
  graphic.strokeColor = selected ? COLORS.gold : COLORS.textMuted;
  graphic.fillColor = selected ? COLORS.gold : COLORS.textMuted;
  graphic.lineWidth = 3;

  if (tab === "cultivation") {
    graphic.moveTo(-17, -17);
    graphic.lineTo(15, 18);
    graphic.moveTo(7, 17);
    graphic.lineTo(17, 17);
    graphic.lineTo(17, 7);
    graphic.moveTo(-20, -20);
    graphic.lineTo(-9, -16);
    graphic.stroke();
    return;
  }
  if (tab === "partner") {
    graphic.circle(-10, 10, 8);
    graphic.circle(11, 10, 8);
    graphic.stroke();
    graphic.arc(-10, -13, 15, 0, Math.PI, false);
    graphic.arc(11, -13, 15, 0, Math.PI, false);
    graphic.stroke();
    return;
  }
  if (tab === "ranking") {
    graphic.moveTo(-18, 18);
    graphic.lineTo(18, 18);
    graphic.lineTo(13, -2);
    graphic.arc(0, -2, 13, 0, Math.PI, false);
    graphic.lineTo(-18, 18);
    graphic.moveTo(0, -15);
    graphic.lineTo(0, -25);
    graphic.moveTo(-12, -25);
    graphic.lineTo(12, -25);
    graphic.stroke();
    return;
  }

  graphic.moveTo(-25, -20);
  graphic.lineTo(-8, 10);
  graphic.lineTo(0, -2);
  graphic.lineTo(12, 22);
  graphic.lineTo(28, -20);
  graphic.close();
  graphic.stroke();
}

function drawBand(
  parent: Node,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: Color,
  stroke?: Color,
): void {
  const graphic = graphicsNode(parent, name, x, y);
  graphic.fillColor = fill;
  graphic.roundRect(-width / 2, -height / 2, width, height, 6);
  graphic.fill();
  if (stroke) {
    graphic.strokeColor = stroke;
    graphic.lineWidth = 1;
    graphic.roundRect(-width / 2, -height / 2, width, height, 6);
    graphic.stroke();
  }
}

function drawAvatarPortrait(
  parent: Node,
  variant: AvatarVariant,
  x: number,
  y: number,
  scale = 1,
): void {
  const portrait = graphicsNode(parent, `Avatar-${variant}`, x, y);
  portrait.node.setScale(scale, scale, 1);
  portrait.fillColor = COLORS.black;
  portrait.circle(0, 0, 31);
  portrait.fill();
  portrait.strokeColor = variant === "female" ? COLORS.gold : COLORS.jade;
  portrait.lineWidth = 2;
  portrait.circle(0, 0, 31);
  portrait.stroke();

  portrait.fillColor =
    variant === "female"
      ? COLORS.gold
      : variant === "male"
        ? COLORS.jade
        : COLORS.textMuted;
  portrait.circle(0, 9, 10);
  portrait.fill();
  portrait.arc(0, -18, 18, 0, Math.PI, false);
  portrait.lineTo(-18, -18);
  portrait.lineTo(18, -18);
  portrait.close();
  portrait.fill();

  if (variant === "female") {
    portrait.strokeColor = COLORS.gold;
    portrait.lineWidth = 3;
    portrait.arc(0, 10, 15, Math.PI * 0.05, Math.PI * 0.95, false);
    portrait.stroke();
  } else if (variant === "male") {
    portrait.strokeColor = COLORS.jade;
    portrait.lineWidth = 3;
    portrait.moveTo(-11, 19);
    portrait.lineTo(0, 24);
    portrait.lineTo(11, 19);
    portrait.stroke();
  } else {
    addLabel(portrait.node, "?", 0, 2, 30, 36, 22, COLORS.black, true);
  }
}

function avatarVariantName(variant: ChosenAvatarVariant): string {
  return variant === "male" ? "男修形象" : "女修形象";
}

function drawProgress(
  parent: Node,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
): void {
  const graphic = graphicsNode(parent, "Progress", x, y);
  graphic.fillColor = COLORS.black;
  graphic.roundRect(-width / 2, -height / 2, width, height, height / 2);
  graphic.fill();
  const fillWidth = Math.max(height, width * Math.min(1, Math.max(0, progress)));
  graphic.fillColor = COLORS.gold;
  graphic.roundRect(-width / 2, -height / 2, fillWidth, height, height / 2);
  graphic.fill();
}

function drawMountainLayer(
  graphic: Graphics,
  baseY: number,
  fill: Color,
  points: ReadonlyArray<readonly [number, number]>,
): void {
  const first = points[0];
  if (!first) return;
  graphic.fillColor = fill;
  graphic.moveTo(first[0], baseY + first[1]);
  for (const point of points.slice(1)) graphic.lineTo(point[0], baseY + point[1]);
  graphic.lineTo(points[points.length - 1]?.[0] ?? 0, baseY - 120);
  graphic.lineTo(first[0], baseY - 120);
  graphic.close();
  graphic.fill();
}

function graphicsNode(parent: Node, name: string, x: number, y: number): Graphics {
  const node = createUiNode(parent, name);
  node.setPosition(x, y);
  return node.addComponent(Graphics);
}

function createUiNode(parent: Node, name: string): Node {
  const node = new Node(name);
  node.layer = parent.layer;
  parent.addChild(node);
  return node;
}

function setSize(node: Node, width: number, height: number): UITransform {
  const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
  transform.setContentSize(width, height);
  transform.setAnchorPoint(0.5, 0.5);
  return transform;
}

function qualityRank(quality: string): number {
  return isKnownQuality(quality) ? QUALITY_ORDER[quality] : -1;
}

function qualityName(quality: string): string {
  return isKnownQuality(quality) ? QUALITY_NAMES[quality] : quality;
}

function qualityColor(quality: string): Color {
  const colors: Record<AssetQuality, Color> = {
    common: COLORS.text,
    uncommon: COLORS.jade,
    rare: color("#66aee8"),
    epic: color("#b28ae2"),
    legendary: color("#e0a35c"),
    mythic: color("#d96767"),
    primordial: COLORS.gold,
  };
  return isKnownQuality(quality) ? colors[quality] : COLORS.text;
}

function isKnownQuality(value: string): value is AssetQuality {
  return value in QUALITY_ORDER;
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

function color(hex: string): Color {
  return new Color().fromHEX(hex);
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
