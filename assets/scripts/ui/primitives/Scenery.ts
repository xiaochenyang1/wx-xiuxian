import type { AvatarVariant } from "@cultivation-diary/shared";
import type { MainTab } from "../../core/ClientTypes";
import {
  type Color,
  type Graphics,
  HorizontalTextAlignment,
  type Node,
} from "cc";
import { color, COLORS, withAlpha } from "./Colors";
import { addLabel, drawBand, graphicsNode } from "./Draw";

export function drawGoldenFormation(parent: Node): void {
  const graphic = graphicsNode(parent, "FormationLines", 0, 0);
  graphic.strokeColor = COLORS.gold;
  graphic.lineWidth = 3;
  graphic.circle(0, 0, 118);
  graphic.circle(0, 0, 84);
  graphic.circle(0, 0, 42);
  for (let index = 0; index < 12; index += 1) {
    const angle = (Math.PI * 2 * index) / 12;
    const inner = 45;
    const outer = index % 2 === 0 ? 148 : 126;
    graphic.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    graphic.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
  }
  graphic.stroke();
  graphic.fillColor = COLORS.gold;
  graphic.circle(0, 0, 8);
  graphic.fill();
}

export function drawTribulationLightning(parent: Node): void {
  const graphic = graphicsNode(parent, "Lightning", 0, 94);
  graphic.strokeColor = color("#b8d7e5");
  graphic.lineWidth = 4;
  const bolts: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    [
      [-220, 260],
      [-164, 176],
      [-192, 176],
      [-98, 54],
      [-126, 54],
      [-38, -110],
    ],
    [
      [220, 260],
      [164, 176],
      [192, 176],
      [98, 54],
      [126, 54],
      [38, -110],
    ],
    [
      [-38, 320],
      [-14, 215],
      [-38, 215],
      [0, 92],
      [38, 215],
      [14, 215],
      [38, 320],
    ],
  ];
  for (const bolt of bolts) {
    const first = bolt[0];
    if (!first) continue;
    graphic.moveTo(first[0], first[1]);
    for (const point of bolt.slice(1)) graphic.lineTo(point[0], point[1]);
  }
  graphic.stroke();
  graphic.strokeColor = COLORS.gold;
  graphic.lineWidth = 1;
  graphic.circle(0, 94, 138);
  graphic.circle(0, 94, 182);
  graphic.stroke();
}

export function drawFeatureGlyph(
  graphic: Graphics,
  iconIndex: number,
  scale: number,
): void {
  graphic.strokeColor = iconIndex % 2 === 0 ? COLORS.goldBright : COLORS.cyan;
  graphic.fillColor = iconIndex % 2 === 0 ? COLORS.goldBright : COLORS.cyan;
  graphic.lineWidth = 3;
  const point = (value: number): number => value * scale;
  if (iconIndex === 0) {
    graphic.moveTo(point(-18), point(10));
    graphic.lineTo(point(18), point(10));
    graphic.moveTo(point(-18), point(-2));
    graphic.lineTo(point(18), point(-2));
    graphic.moveTo(point(-18), point(-14));
    graphic.lineTo(point(18), point(-14));
  } else if (iconIndex === 1) {
    graphic.circle(0, point(-3), point(18));
    graphic.moveTo(point(-9), point(14));
    graphic.lineTo(0, point(24));
    graphic.lineTo(point(9), point(14));
  } else if (iconIndex === 2) {
    graphic.roundRect(point(-20), point(-16), point(40), point(34), point(4));
    graphic.moveTo(point(-10), point(18));
    graphic.lineTo(point(-6), point(25));
    graphic.lineTo(point(6), point(25));
    graphic.lineTo(point(10), point(18));
  } else if (iconIndex === 3) {
    graphic.circle(0, point(2), point(18));
    graphic.moveTo(0, point(2));
    graphic.lineTo(0, point(14));
    graphic.moveTo(0, point(2));
    graphic.lineTo(point(10), point(-5));
  } else if (iconIndex === 4) {
    graphic.moveTo(point(-20), point(-16));
    graphic.lineTo(0, point(22));
    graphic.lineTo(point(20), point(-16));
    graphic.moveTo(point(-13), point(-4));
    graphic.lineTo(point(13), point(-4));
  } else {
    graphic.moveTo(point(-18), point(12));
    graphic.lineTo(point(-8), point(-15));
    graphic.lineTo(point(8), point(-15));
    graphic.lineTo(point(18), point(12));
    graphic.close();
    graphic.moveTo(point(-12), point(3));
    graphic.lineTo(point(12), point(3));
  }
  graphic.stroke();
}

export function drawTabIcon(parent: Node, tab: MainTab, selected: boolean): Graphics {
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
    return graphic;
  }
  if (tab === "partner") {
    graphic.circle(-10, 10, 8);
    graphic.circle(11, 10, 8);
    graphic.stroke();
    graphic.arc(-10, -13, 15, 0, Math.PI, false);
    graphic.arc(11, -13, 15, 0, Math.PI, false);
    graphic.stroke();
    return graphic;
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
    return graphic;
  }

  graphic.moveTo(-25, -20);
  graphic.lineTo(-8, 10);
  graphic.lineTo(0, -2);
  graphic.lineTo(12, 22);
  graphic.lineTo(28, -20);
  graphic.close();
  graphic.stroke();
  return graphic;
}

export function drawPowerBanner(
  parent: Node,
  x: number,
  y: number,
  value: string,
): void {
  const banner = graphicsNode(parent, "PowerBanner", x, y);
  banner.fillColor = withAlpha(COLORS.red, 238);
  banner.moveTo(-150, 0);
  banner.lineTo(-128, 31);
  banner.lineTo(118, 31);
  banner.lineTo(150, 0);
  banner.lineTo(118, -31);
  banner.lineTo(-128, -31);
  banner.close();
  banner.fill();
  banner.strokeColor = COLORS.goldBright;
  banner.lineWidth = 2;
  banner.moveTo(-142, 0);
  banner.lineTo(-121, 25);
  banner.lineTo(112, 25);
  banner.lineTo(140, 0);
  banner.lineTo(112, -25);
  banner.lineTo(-121, -25);
  banner.close();
  banner.stroke();
  addLabel(
    parent,
    `战力 ${value}`,
    x,
    y,
    258,
    48,
    29,
    COLORS.goldBright,
    true,
    1,
    HorizontalTextAlignment.CENTER,
    "fixed",
  );
}

export function drawCurrencyChip(
  parent: Node,
  x: number,
  y: number,
  label: string,
  value: string,
  accent: Color,
): void {
  drawBand(
    parent,
    `Currency-${label}`,
    x,
    y,
    138,
    44,
    COLORS.black,
    COLORS.goldMuted,
  );
  const icon = graphicsNode(parent, `CurrencyIcon-${label}`, x - 47, y);
  icon.fillColor = accent;
  icon.circle(0, 0, 11);
  icon.fill();
  icon.strokeColor = COLORS.text;
  icon.lineWidth = 1;
  icon.circle(0, 0, 11);
  icon.stroke();
  addLabel(
    parent,
    value,
    x + 17,
    y,
    82,
    30,
    17,
    COLORS.text,
    true,
    1,
    HorizontalTextAlignment.RIGHT,
    "fixed",
  );
}

export function drawAvatarPortrait(
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

export function drawMountainLayer(
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
