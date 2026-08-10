import { Color } from "cc";

export const COLORS = {
  background: color("#0c141f"),
  backgroundBlue: color("#132536"),
  inkGreen: color("#17372f"),
  inkGreenLight: color("#245247"),
  panel: color("#14212d"),
  panelStrong: color("#1b2f3b"),
  gold: color("#d6b66a"),
  goldBright: color("#f2d58a"),
  goldMuted: color("#8f7a4d"),
  jade: color("#74a99c"),
  cyan: color("#62c9cf"),
  green: color("#58cf72"),
  text: color("#e8e3d5"),
  textMuted: color("#9fa9aa"),
  red: color("#a9554d"),
  black: color("#080d12"),
};

export function color(hex: string): Color {
  return new Color().fromHEX(hex);
}

export function withAlpha(source: Color, alpha: number): Color {
  return new Color(source.r, source.g, source.b, alpha);
}
