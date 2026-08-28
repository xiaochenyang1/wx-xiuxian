import type {
  BootstrapSnapshot,
} from "@cultivation-diary/shared";
import { ratioOfBigNumberStrings, formatLargeNumber } from "../core/ClientNumber";
import type { AppState, MainTab } from "../core/ClientTypes";
import type { CultivationPresentationPlan } from "../core/CultivationPresentation";
import { COLORS, withAlpha } from "./primitives/Colors";
import {
  addLabel,
  createUiNode,
  graphicsNode,
  setSize,
} from "./primitives/Draw";
import { drawFeatureGlyph, drawTabIcon } from "./primitives/Scenery";
import {
  Button,
  Graphics,
  HorizontalTextAlignment,
  Node,
  Sprite,
  SpriteFrame,
} from "cc";

const MAX_DEBUG_DROP_SEED = 0xffff_ffff;

export function snapshotMatchesPresentationTarget(
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

export function snapshotMatchesPresentationSource(
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

export function parseDebugDropSeed(value: string): number | null {
  if (!/^\d{1,10}$/.test(value)) return null;
  const seed = Number(value);
  return Number.isSafeInteger(seed) && seed <= MAX_DEBUG_DROP_SEED ? seed : null;
}

export function formatDebugTimestamp(value: string | null): string {
  if (!value) return "尚未保存";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "时间未知";
  return value.replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

export function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

export function presentationKindName(
  kind: CultivationPresentationPlan["kind"],
): string {
  if (kind === "level_up") return "升级";
  if (kind === "breakthrough") return "突破";
  return "战力";
}

export function drawContainedSprite(
  parent: Node,
  name: string,
  spriteFrame: SpriteFrame,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
): Node {
  const originalSize = spriteFrame.originalSize;
  const scale = Math.min(
    maxWidth / Math.max(1, originalSize.width),
    maxHeight / Math.max(1, originalSize.height),
  );
  const node = createUiNode(parent, name);
  node.setPosition(x, y);
  setSize(
    node,
    Math.max(1, Math.round(originalSize.width * scale)),
    Math.max(1, Math.round(originalSize.height * scale)),
  );
  const sprite = node.addComponent(Sprite);
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.type = Sprite.Type.SIMPLE;
  sprite.trim = false;
  sprite.spriteFrame = spriteFrame;
  return node;
}

export function createFeatureButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  iconIndex: number,
  onClick: () => void,
  art?: SpriteFrame,
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
  if (art) {
    drawContainedSprite(node, "FeatureIconArt", art, 0, 17, 52, 52);
  } else {
    drawFeatureGlyph(medallion, iconIndex, 0.76);
  }
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

export function createMainTabButton(
  parent: Node,
  tab: MainTab,
  text: string,
  x: number,
  y: number,
  selected: boolean,
  onClick: () => void,
  art?: SpriteFrame,
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

  if (art) {
    drawContainedSprite(node, "TabIconArt", art, 0, 17, 58, 58);
  } else {
    const icon = drawTabIcon(node, tab, selected);
    icon.node.setPosition(0, 17);
    icon.node.setScale(0.78, 0.78, 1);
  }
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

export function createBottomFeatureButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  iconIndex: number,
  onClick: () => void,
  art?: SpriteFrame,
): void {
  const node = createUiNode(parent, `BottomFeature-${text}`);
  node.setPosition(x, y);
  setSize(node, 104, 166);
  const plate = node.addComponent(Graphics);
  plate.fillColor = COLORS.panel;
  plate.roundRect(-50, -79, 100, 158, 5);
  plate.fill();
  plate.strokeColor = COLORS.goldMuted;
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
  medallion.strokeColor = accent;
  medallion.lineWidth = 2;
  medallion.circle(0, 0, 34);
  medallion.stroke();
  if (art) {
    drawContainedSprite(node, "BottomFeatureIconArt", art, 0, 27, 66, 66);
  } else {
    drawFeatureGlyph(medallion, iconIndex, 0.82);
  }
  addLabel(
    node,
    text,
    0,
    -43,
    92,
    32,
    19,
    COLORS.text,
    true,
    1,
    HorizontalTextAlignment.CENTER,
    "fixed",
  );
}

export function createSideFeatureButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  iconIndex: number,
  badge: number,
  onClick: () => void,
  art?: SpriteFrame,
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
  if (art) {
    drawContainedSprite(node, "SideFeatureIconArt", art, 0, 14, 58, 58);
  } else {
    const glyph = graphicsNode(node, "SideFeatureGlyph", 0, 14);
    drawFeatureGlyph(glyph, iconIndex, 0.95);
  }
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

export function liveCultivationGainText(
  status: BootstrapSnapshot["progress"]["status"],
  gainedSinceAnchor: string,
): string {
  return `${status === "version_cap" ? "本轮积蓄" : "本轮修炼"} +${formatLargeNumber(gainedSinceAnchor)}`;
}

export function ratio(value: string, total: string): number {
  return ratioOfBigNumberStrings(value, total);
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`;
  return `${Math.max(1, minutes)}分钟`;
}
