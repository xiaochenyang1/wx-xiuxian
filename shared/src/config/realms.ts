import type { BigNumberString } from "../types";

export type RealmId =
  | "qi_refining"
  | "foundation_establishment"
  | "golden_core"
  | "nascent_soul"
  | "spirit_transformation"
  | "void_refinement"
  | "body_integration"
  | "mahayana"
  | "tribulation"
  | "true_immortal"
  | "golden_immortal"
  | "taiyi"
  | "daluo"
  | "daozu";

export type RealmStage = "early" | "middle" | "late" | "perfect";

export interface RealmConfig {
  id: RealmId;
  displayName: string;
  minLevel: number;
  maxLevel: number;
  expMultiplier: number;
  powerMultiplier: BigNumberString;
  expRequirementCoefficientBp: number;
  breakthroughPillCost: number | null;
  nextRealmId: RealmId | null;
}

export const REALM_STAGE_DISPLAY_NAMES: Readonly<Record<RealmStage, string>> = {
  early: "初期",
  middle: "中期",
  late: "后期",
  perfect: "圆满",
};

export const REALM_CONFIGS: readonly RealmConfig[] = [
  {
    id: "qi_refining",
    displayName: "练气期",
    minLevel: 1,
    maxLevel: 10,
    expMultiplier: 1,
    powerMultiplier: "1",
    expRequirementCoefficientBp: 10_700,
    breakthroughPillCost: 1,
    nextRealmId: "foundation_establishment",
  },
  {
    id: "foundation_establishment",
    displayName: "筑基期",
    minLevel: 11,
    maxLevel: 30,
    expMultiplier: 2,
    powerMultiplier: "2",
    expRequirementCoefficientBp: 135_000,
    breakthroughPillCost: 3,
    nextRealmId: "golden_core",
  },
  {
    id: "golden_core",
    displayName: "金丹期",
    minLevel: 31,
    maxLevel: 60,
    expMultiplier: 3,
    powerMultiplier: "5",
    expRequirementCoefficientBp: 185_000,
    breakthroughPillCost: 8,
    nextRealmId: "nascent_soul",
  },
  {
    id: "nascent_soul",
    displayName: "元婴期",
    minLevel: 61,
    maxLevel: 100,
    expMultiplier: 5,
    powerMultiplier: "10",
    expRequirementCoefficientBp: 350_000,
    breakthroughPillCost: 15,
    nextRealmId: "spirit_transformation",
  },
  {
    id: "spirit_transformation",
    displayName: "化神期",
    minLevel: 101,
    maxLevel: 150,
    expMultiplier: 8,
    powerMultiplier: "30",
    expRequirementCoefficientBp: 700_000,
    breakthroughPillCost: 30,
    nextRealmId: "void_refinement",
  },
  {
    id: "void_refinement",
    displayName: "炼虚期",
    minLevel: 151,
    maxLevel: 220,
    expMultiplier: 12,
    powerMultiplier: "100",
    expRequirementCoefficientBp: 1_150_000,
    breakthroughPillCost: 60,
    nextRealmId: "body_integration",
  },
  {
    id: "body_integration",
    displayName: "合体期",
    minLevel: 221,
    maxLevel: 300,
    expMultiplier: 18,
    powerMultiplier: "300",
    expRequirementCoefficientBp: 2_550_000,
    breakthroughPillCost: 120,
    nextRealmId: "mahayana",
  },
  {
    id: "mahayana",
    displayName: "大乘期",
    minLevel: 301,
    maxLevel: 400,
    expMultiplier: 27,
    powerMultiplier: "1000",
    expRequirementCoefficientBp: 2_650_000,
    breakthroughPillCost: 240,
    nextRealmId: "tribulation",
  },
  {
    id: "tribulation",
    displayName: "渡劫期",
    minLevel: 401,
    maxLevel: 500,
    expMultiplier: 40,
    powerMultiplier: "3000",
    expRequirementCoefficientBp: 5_200_000,
    breakthroughPillCost: 500,
    nextRealmId: "true_immortal",
  },
  {
    id: "true_immortal",
    displayName: "真仙期",
    minLevel: 501,
    maxLevel: 600,
    expMultiplier: 60,
    powerMultiplier: "10000",
    expRequirementCoefficientBp: 6_200_000,
    breakthroughPillCost: 700,
    nextRealmId: "golden_immortal",
  },
  /**
   * The last five realms deliberately share 真仙期's three numeric knobs. They
   * exist to put a breakthrough back into Lv.501-1000 — one realm there covered
   * 63% of the game's idle hours and half its levels with no breakthrough at
   * all, which also left 突破丹 with no remaining use after Lv.500.
   *
   * Holding `powerMultiplier`, `expRequirementCoefficientBp` and
   * `expMultiplier` equal keeps `calculateTotalPower`,
   * `requiredExperienceForLevel` and `calculateOnlineExperiencePerSecond`
   * byte-identical at every level, so the trial tower's threshold ladder,
   * `TOWER_TASK_FLOORS.achievableAtLevel` and the expedition gates all stay
   * put. The cost is that these four breakthroughs pay no numeric bonus: the
   * only two axes available would each cost more than the bonus is worth — a
   * higher `powerMultiplier` would eat the margin that keeps tower floor 80
   * (1.4315e9) out of bare reach at Lv.1000, and a higher `expMultiplier`
   * would shorten the endgame it is meant to pace.
   *
   * Pill costs are anchored on 渡劫期's precedent, which spends 15.5% of its
   * own idle herb income on 500 pills. These spend 24.8% / 32.5% / 42.4% /
   * 56.9% of theirs, so the last one is meant to be a two-realm project.
   */
  {
    id: "golden_immortal",
    displayName: "金仙期",
    minLevel: 601,
    maxLevel: 700,
    expMultiplier: 60,
    powerMultiplier: "10000",
    expRequirementCoefficientBp: 6_200_000,
    breakthroughPillCost: 1_000,
    nextRealmId: "taiyi",
  },
  {
    id: "taiyi",
    displayName: "太乙期",
    minLevel: 701,
    maxLevel: 800,
    expMultiplier: 60,
    powerMultiplier: "10000",
    expRequirementCoefficientBp: 6_200_000,
    breakthroughPillCost: 1_400,
    nextRealmId: "daluo",
  },
  {
    id: "daluo",
    displayName: "大罗期",
    minLevel: 801,
    maxLevel: 900,
    expMultiplier: 60,
    powerMultiplier: "10000",
    expRequirementCoefficientBp: 6_200_000,
    breakthroughPillCost: 2_000,
    nextRealmId: "daozu",
  },
  {
    id: "daozu",
    displayName: "道祖期",
    minLevel: 901,
    maxLevel: 1000,
    expMultiplier: 60,
    powerMultiplier: "10000",
    expRequirementCoefficientBp: 6_200_000,
    breakthroughPillCost: null,
    nextRealmId: null,
  },
];

export const MIN_LEVEL = REALM_CONFIGS[0]?.minLevel ?? 1;
export const MAX_LEVEL = REALM_CONFIGS[REALM_CONFIGS.length - 1]?.maxLevel ?? 1000;

export function getRealmConfigForLevel(level: number): RealmConfig {
  assertValidLevel(level);

  const realm = REALM_CONFIGS.find(
    (candidate) => level >= candidate.minLevel && level <= candidate.maxLevel,
  );

  if (!realm) {
    throw new RangeError(`No realm configuration for level ${level}`);
  }

  return realm;
}

export function getRealmConfig(realmId: RealmId): RealmConfig {
  const realm = REALM_CONFIGS.find((candidate) => candidate.id === realmId);

  if (!realm) {
    throw new RangeError(`Unknown realm: ${realmId}`);
  }

  return realm;
}

export function getRealmStage(level: number): RealmStage {
  const realm = getRealmConfigForLevel(level);
  const realmLevelCount = realm.maxLevel - realm.minLevel + 1;
  const offset = level - realm.minLevel;
  const stageIndex = Math.min(3, Math.floor((offset * 4) / realmLevelCount));

  return (["early", "middle", "late", "perfect"] as const)[stageIndex] ?? "perfect";
}

export function getRealmTitle(level: number): string {
  const realm = getRealmConfigForLevel(level);
  return `${realm.displayName.replace(/期$/, "")}${REALM_STAGE_DISPLAY_NAMES[getRealmStage(level)]}`;
}

export function isRealmMaxLevel(level: number): boolean {
  return getRealmConfigForLevel(level).maxLevel === level;
}

export function assertValidLevel(level: number): void {
  if (!Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
    throw new RangeError(`Level must be an integer between ${MIN_LEVEL} and ${MAX_LEVEL}`);
  }
}
