import type { EquipmentBand } from "./assets";
import { IDLE_MATERIAL_BAND_MULTIPLIER } from "./drops";

export type SectId = "qingyun" | "danxia" | "wanxiang";

export interface SectConfig {
  readonly id: SectId;
  readonly displayName: string;
  readonly description: string;
  readonly bonusStat: "experience" | "spirit_stone" | "drop";
  readonly bonusPerLevelBp: number;
}

/** The 凡阶 cap, and the step each band adds: reachable level is `10 * band`. */
export const SECT_MAX_LEVEL = 10;

/** The highest level reputation can ever reach. Load validation uses this. */
export const SECT_ABSOLUTE_MAX_LEVEL = 40;

export const SECT_CONFIGS: readonly SectConfig[] = [
  { id: "qingyun", displayName: "青云宗", description: "御剑问道，修炼精进", bonusStat: "experience", bonusPerLevelBp: 100 },
  { id: "danxia", displayName: "丹霞谷", description: "灵田丹火，财源广进", bonusStat: "spirit_stone", bonusPerLevelBp: 120 },
  { id: "wanxiang", displayName: "万象楼", description: "博采众长，机缘更盛", bonusStat: "drop", bonusPerLevelBp: 80 },
];

export function getSectConfig(id: string): SectConfig {
  const config = SECT_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown sect: ${id}`);
  return config;
}

export function sectMaxLevelForBand(band: EquipmentBand): number {
  return SECT_MAX_LEVEL * band;
}

export function sectContributionRequirement(targetLevel: number): number {
  if (
    !Number.isInteger(targetLevel) ||
    targetLevel < 1 ||
    targetLevel > SECT_ABSOLUTE_MAX_LEVEL
  ) {
    throw new RangeError(`Sect level must be between 1 and ${SECT_ABSOLUTE_MAX_LEVEL}`);
  }
  return targetLevel * targetLevel * 100;
}

/**
 * Contribution one donation pays at `band`. Reuses the idle material multiplier
 * rather than declaring a second table, because it is cancelling out that exact
 * effect: a band scales material income by up to x10 while `100n²` only grows
 * 16x from Lv.10 to Lv.40, so without this an hour of play would buy a smaller
 * slice of a level in every band. 凡阶 returns 100, the value that used to be
 * written inline at the call site.
 */
export function sectDonationYield(band: EquipmentBand): number {
  const multiplier = IDLE_MATERIAL_BAND_MULTIPLIER[band];
  if (!multiplier) throw new RangeError(`Unknown equipment band: ${band}`);
  return 100 * multiplier;
}
