import type {
  AssetQuality,
  ChosenAvatarVariant,
} from "@cultivation-diary/shared";
import { formatLargeNumber } from "../../core/ClientNumber";
import type { Color } from "cc";
import { color, COLORS } from "./Colors";

export const QUALITY_ORDER: Readonly<Record<AssetQuality, number>> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
  primordial: 6,
};

export const QUALITY_NAMES: Readonly<Record<AssetQuality, string>> = {
  common: "普通",
  uncommon: "优秀",
  rare: "稀有",
  epic: "史诗",
  legendary: "传说",
  mythic: "神话",
  primordial: "洪荒",
};

export function formatSignedPowerDelta(value: string): string {
  return value.startsWith("-")
    ? formatLargeNumber(value)
    : `+${formatLargeNumber(value)}`;
}

export function avatarVariantName(variant: ChosenAvatarVariant): string {
  return variant === "male" ? "男修形象" : "女修形象";
}

export function qualityRank(quality: string): number {
  return isKnownQuality(quality) ? QUALITY_ORDER[quality] : -1;
}

export function qualityName(quality: string): string {
  return isKnownQuality(quality) ? QUALITY_NAMES[quality] : quality;
}

export function qualityColor(quality: string): Color {
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
