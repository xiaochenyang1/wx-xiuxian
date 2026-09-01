import type { EquipmentBand } from "./assets";

export type PartnerId = "jun_rulan" | "su_wanqing" | "lu_xinghe";

export interface PartnerConfig {
  readonly id: PartnerId;
  readonly displayName: string;
  readonly epithet: string;
  readonly bonusStat: "experience" | "spirit_stone" | "drop";
  readonly bonusPerLevelBp: number;
}

/** The 凡阶 cap, and the step each band adds: reachable level is `10 * band`. */
export const PARTNER_MAX_LEVEL = 10;

/** The highest level a bond can ever reach. Load validation uses this. */
export const PARTNER_ABSOLUTE_MAX_LEVEL = 40;

/**
 * Moved out from the cave's Lv.11 so the opening does not hand the player two
 * large systems at once. See `CAVE_UNLOCK_LEVEL` and `TRIAL_TOWER_UNLOCK_LEVEL`.
 */
export const PARTNER_UNLOCK_LEVEL = 20;

export const PARTNER_CONFIGS: readonly PartnerConfig[] = [
  { id: "jun_rulan", displayName: "君如兰", epithet: "青云剑侍", bonusStat: "experience", bonusPerLevelBp: 120 },
  { id: "su_wanqing", displayName: "苏晚晴", epithet: "丹霞医仙", bonusStat: "spirit_stone", bonusPerLevelBp: 140 },
  { id: "lu_xinghe", displayName: "陆星河", epithet: "观星散人", bonusStat: "drop", bonusPerLevelBp: 100 },
];

export function getPartnerConfig(id: string): PartnerConfig {
  const config = PARTNER_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown partner: ${id}`);
  return config;
}

export function partnerMaxLevelForBand(band: EquipmentBand): number {
  return PARTNER_MAX_LEVEL * band;
}

export function partnerBondRequirement(targetLevel: number): number {
  if (
    !Number.isInteger(targetLevel) ||
    targetLevel < 1 ||
    targetLevel > PARTNER_ABSOLUTE_MAX_LEVEL
  ) {
    throw new RangeError(`Partner level must be between 1 and ${PARTNER_ABSOLUTE_MAX_LEVEL}`);
  }
  return targetLevel * 100;
}
