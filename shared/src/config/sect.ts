export type SectId = "qingyun" | "danxia" | "wanxiang";

export interface SectConfig {
  readonly id: SectId;
  readonly displayName: string;
  readonly description: string;
  readonly bonusStat: "experience" | "spirit_stone" | "drop";
  readonly bonusPerLevelBp: number;
}

export const SECT_MAX_LEVEL = 10;
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

export function sectContributionRequirement(targetLevel: number): number {
  if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > SECT_MAX_LEVEL) {
    throw new RangeError(`Sect level must be between 1 and ${SECT_MAX_LEVEL}`);
  }
  return targetLevel * targetLevel * 100;
}
