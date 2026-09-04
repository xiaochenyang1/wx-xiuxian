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

/**
 * One outline per navigation button, picked by the index the button's table row
 * declares. Ten buttons carry a glyph, so ten indices are drawn here: before the
 * bottom rail declared its own, the index was the rail position and four pairs
 * collided — 宗门/历练 both fell through to `else`, 炼丹 wore 行囊's bag and 炼器
 * wore 任务's clock.
 *
 * The accent alternates on parity because the rail reads as a gold/cyan rhythm
 * left to right, which pins each rail slot's index to its position's parity.
 * `AppNavigation` keeps the assignment; `test/app-navigation.test.ts` holds both
 * invariants.
 */
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
  } else if (iconIndex === 5) {
    graphic.roundRect(point(-20), point(6), point(40), point(15), point(3));
    graphic.moveTo(0, point(6));
    graphic.lineTo(0, point(-22));
    graphic.moveTo(point(-11), point(-22));
    graphic.lineTo(point(11), point(-22));
  } else if (iconIndex === 6) {
    graphic.moveTo(point(-16), point(11));
    graphic.lineTo(point(-20), point(-14));
    graphic.lineTo(point(20), point(-14));
    graphic.lineTo(point(16), point(11));
    graphic.close();
    graphic.moveTo(point(-22), point(11));
    graphic.lineTo(point(22), point(11));
    graphic.moveTo(point(-7), point(21));
    graphic.lineTo(point(7), point(21));
    graphic.circle(0, point(-2), point(6));
  } else if (iconIndex === 7) {
    graphic.moveTo(point(-22), point(19));
    graphic.lineTo(point(22), point(19));
    graphic.moveTo(point(-16), point(11));
    graphic.lineTo(point(16), point(11));
    graphic.moveTo(point(-13), point(11));
    graphic.lineTo(point(-13), point(-21));
    graphic.moveTo(point(13), point(11));
    graphic.lineTo(point(13), point(-21));
    graphic.moveTo(point(-20), point(-21));
    graphic.lineTo(point(20), point(-21));
  } else if (iconIndex === 8) {
    graphic.moveTo(point(-22), point(-18));
    graphic.lineTo(point(-8), point(14));
    graphic.lineTo(0, point(-1));
    graphic.lineTo(point(9), point(21));
    graphic.lineTo(point(22), point(-18));
    graphic.close();
    graphic.moveTo(point(3), point(9));
    graphic.lineTo(point(15), point(9));
  } else if (iconIndex === 9) {
    graphic.circle(0, point(2), point(11));
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = (Math.PI * 2 * ray) / 8;
      graphic.moveTo(
        Math.cos(angle) * point(16),
        point(2) + Math.sin(angle) * point(16),
      );
      graphic.lineTo(
        Math.cos(angle) * point(23),
        point(2) + Math.sin(angle) * point(23),
      );
    }
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

export function drawCultivatorFigure(
  parent: Node,
  variant: AvatarVariant,
  x: number,
  y: number,
  scale = 1,
): void {
  const aura = graphicsNode(parent, `CultivatorAura-${variant}`, x, y);
  aura.node.setScale(scale, scale, 1);
  aura.strokeColor = withAlpha(COLORS.gold, 116);
  aura.lineWidth = 2;
  aura.circle(0, 12, 184);
  aura.circle(0, 12, 161);
  aura.stroke();
  aura.strokeColor = withAlpha(COLORS.jade, 132);
  aura.lineWidth = 1;
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI * 2 * index) / 8;
    aura.moveTo(Math.cos(angle) * 166, 12 + Math.sin(angle) * 166);
    aura.lineTo(Math.cos(angle) * 179, 12 + Math.sin(angle) * 179);
  }
  aura.stroke();

  const weapon = graphicsNode(parent, `CultivatorWeapon-${variant}`, x, y);
  weapon.node.setScale(scale, scale, 1);
  weapon.strokeColor = color("#b8c9c4");
  weapon.lineWidth = 7;
  weapon.moveTo(92, -166);
  weapon.lineTo(128, 151);
  weapon.stroke();
  weapon.strokeColor = COLORS.goldMuted;
  weapon.lineWidth = 10;
  weapon.moveTo(111, -2);
  weapon.lineTo(143, -6);
  weapon.stroke();
  weapon.fillColor = COLORS.goldBright;
  weapon.moveTo(128, 151);
  weapon.lineTo(116, 126);
  weapon.lineTo(135, 124);
  weapon.close();
  weapon.fill();

  const figure = graphicsNode(parent, `CultivatorFigure-${variant}`, x, y);
  figure.node.setScale(scale, scale, 1);
  const robeColor =
    variant === "female"
      ? color("#6f3140")
      : variant === "male"
        ? color("#245f5a")
        : color("#35434b");
  const robeShadow =
    variant === "female"
      ? color("#341c2a")
      : variant === "male"
        ? color("#132f32")
        : color("#1a252c");
  const accent =
    variant === "female"
      ? COLORS.goldBright
      : variant === "male"
        ? COLORS.jade
        : COLORS.textMuted;
  const skin = variant === "neutral" ? COLORS.black : color("#d8c3a9");

  figure.fillColor = withAlpha(COLORS.black, 156);
  figure.roundRect(-132, -227, 264, 34, 17);
  figure.fill();

  if (variant === "female") {
    figure.fillColor = COLORS.black;
    figure.circle(-25, 139, 44);
    figure.circle(25, 139, 44);
    figure.moveTo(-50, 132);
    figure.lineTo(-42, 35);
    figure.lineTo(-8, 72);
    figure.lineTo(8, 72);
    figure.lineTo(42, 35);
    figure.lineTo(50, 132);
    figure.close();
    figure.fill();
  }

  figure.fillColor = robeColor;
  figure.moveTo(-42, 92);
  figure.lineTo(-106, 40);
  figure.lineTo(-78, -57);
  figure.lineTo(-126, -145);
  figure.lineTo(-82, -200);
  figure.lineTo(0, -229);
  figure.lineTo(82, -200);
  figure.lineTo(126, -145);
  figure.lineTo(78, -57);
  figure.lineTo(106, 40);
  figure.lineTo(42, 92);
  figure.close();
  figure.fill();

  figure.fillColor = robeShadow;
  figure.moveTo(-27, 91);
  figure.lineTo(-46, -154);
  figure.lineTo(0, -205);
  figure.lineTo(46, -154);
  figure.lineTo(27, 91);
  figure.close();
  figure.fill();

  figure.fillColor = robeColor;
  figure.moveTo(-43, 62);
  figure.lineTo(-122, 18);
  figure.lineTo(-91, -68);
  figure.lineTo(-24, -17);
  figure.close();
  figure.fill();
  figure.moveTo(43, 62);
  figure.lineTo(122, 18);
  figure.lineTo(91, -68);
  figure.lineTo(24, -17);
  figure.close();
  figure.fill();

  figure.fillColor = skin;
  figure.circle(-65, -40, 14);
  figure.circle(65, -40, 14);
  figure.fill();
  figure.strokeColor = accent;
  figure.lineWidth = 4;
  figure.moveTo(-68, -39);
  figure.lineTo(-8, -54);
  figure.lineTo(8, -54);
  figure.lineTo(68, -39);
  figure.stroke();

  figure.fillColor = COLORS.black;
  figure.circle(0, 151, variant === "neutral" ? 51 : 43);
  figure.fill();
  if (variant === "neutral") {
    figure.fillColor = robeColor;
    figure.circle(0, 150, 48);
    figure.fill();
    figure.fillColor = COLORS.black;
    figure.circle(0, 145, 31);
    figure.fill();
  } else {
    figure.fillColor = skin;
    figure.circle(0, 148, 32);
    figure.fill();
    figure.fillColor = COLORS.black;
    figure.moveTo(-34, 151);
    figure.lineTo(-25, 178);
    figure.lineTo(0, 187);
    figure.lineTo(27, 177);
    figure.lineTo(34, 151);
    figure.lineTo(18, 161);
    figure.lineTo(0, 158);
    figure.lineTo(-18, 161);
    figure.close();
    figure.fill();
    figure.strokeColor = color("#433a35");
    figure.lineWidth = 2;
    figure.moveTo(-17, 145);
    figure.lineTo(-7, 145);
    figure.moveTo(7, 145);
    figure.lineTo(17, 145);
    figure.stroke();
  }

  figure.fillColor = COLORS.black;
  if (variant === "male") {
    figure.circle(0, 202, 18);
    figure.fill();
    figure.strokeColor = COLORS.gold;
    figure.lineWidth = 4;
    figure.moveTo(-29, 199);
    figure.lineTo(29, 199);
    figure.stroke();
  } else if (variant === "female") {
    figure.circle(-35, 186, 13);
    figure.circle(35, 186, 13);
    figure.fill();
    figure.fillColor = COLORS.goldBright;
    figure.circle(-35, 188, 4);
    figure.circle(35, 188, 4);
    figure.fill();
  }

  figure.strokeColor = accent;
  figure.lineWidth = 5;
  figure.moveTo(-29, 84);
  figure.lineTo(0, 49);
  figure.lineTo(29, 84);
  figure.moveTo(-66, -101);
  figure.lineTo(66, -101);
  figure.stroke();
  figure.fillColor = COLORS.gold;
  figure.roundRect(-7, -112, 14, 22, 5);
  figure.fill();
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
