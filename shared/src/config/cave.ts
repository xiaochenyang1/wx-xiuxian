import type { EquipmentBand } from "./assets";
import { Decimal, decimal } from "../decimal";

export type CaveBuildingId =
  | "spirit_array"
  | "spirit_field"
  | "alchemy_room"
  | "crafting_room"
  | "seclusion_room";

export type CaveBonusStat = "experience" | "spirit_stone" | "drop" | "power";

export interface CaveMaterialRequirement {
  readonly itemConfigId: string;
  readonly baseQuantity: number;
}

export interface CaveBuildingConfig {
  readonly id: CaveBuildingId;
  readonly displayName: string;
  readonly maxLevel: number;
  readonly bonusStat: CaveBonusStat;
  readonly bonusPerLevelBp: number;
  readonly baseSpiritStoneCost: number;
  readonly materials: ReadonlyArray<CaveMaterialRequirement>;
}

/**
 * The 凡阶 cap, and the step each band adds on top of it: a building's reachable
 * level is `CAVE_MAX_LEVEL * band`. The name and the value are both unchanged
 * from when 10 was the only cap, so every 凡阶 number stays byte-for-byte where
 * it was.
 */
export const CAVE_MAX_LEVEL = 10;

/**
 * The highest level a building can ever reach, band aside. `maxLevel` on each
 * config means this rather than "the cap right now", which is what keeps
 * `calculateCaveBonuses` and load validation free of the player's level — band
 * is mutable runtime state, and those two only answer "given a level, what does
 * it produce".
 */
export const CAVE_ABSOLUTE_MAX_LEVEL = 40;

/** The first large system to unlock; the tower and the partner follow later. */
export const CAVE_UNLOCK_LEVEL = 11;

/**
 * Spirit stone cost above `CAVE_MAX_LEVEL`, anchored so the first geometric
 * step is exactly 1.25x the last quadratic one: `3000 * 10^2` is the Lv.10
 * price, and Lv.11 therefore reads 375,000 with no jump at the seam.
 *
 * 1.25 comes from the per-band growth of idle spirit stone income (x11.64,
 * x7.89, x19.54 across the three boundaries, geometric mean 1.284), stepped
 * down so the whole ladder takes 29.6% of lifetime tower output instead of
 * 55.1% — the cave should be the largest late-game sink, not the only one.
 */
const CAVE_GEOMETRIC_ANCHOR = CAVE_MAX_LEVEL * CAVE_MAX_LEVEL * 3_000;
const CAVE_GEOMETRIC_GROWTH = "1.25";

export const CAVE_BUILDING_CONFIGS: readonly CaveBuildingConfig[] = [
  {
    id: "spirit_array",
    displayName: "聚灵阵",
    maxLevel: CAVE_ABSOLUTE_MAX_LEVEL,
    bonusStat: "experience",
    bonusPerLevelBp: 300,
    baseSpiritStoneCost: 3_000,
    materials: [
      { itemConfigId: "stone", baseQuantity: 5 },
      { itemConfigId: "spiritual_soil", baseQuantity: 5 },
    ],
  },
  {
    id: "spirit_field",
    displayName: "灵田",
    maxLevel: CAVE_ABSOLUTE_MAX_LEVEL,
    bonusStat: "spirit_stone",
    bonusPerLevelBp: 400,
    baseSpiritStoneCost: 3_000,
    materials: [
      { itemConfigId: "spiritual_soil", baseQuantity: 5 },
      { itemConfigId: "spiritual_herb", baseQuantity: 5 },
    ],
  },
  {
    id: "alchemy_room",
    displayName: "炼丹房",
    maxLevel: CAVE_ABSOLUTE_MAX_LEVEL,
    bonusStat: "drop",
    bonusPerLevelBp: 250,
    baseSpiritStoneCost: 3_000,
    materials: [
      { itemConfigId: "spiritual_herb", baseQuantity: 5 },
      { itemConfigId: "wood", baseQuantity: 5 },
    ],
  },
  {
    id: "crafting_room",
    displayName: "炼器室",
    /**
     * The only building on the power axis, and the reason it alone stays at 10:
     * `LOADOUT_POWER_SCALE_BP` was solved from two endpoints, and
     * `test/progression-task-chain.test.ts` rederives the whole tower
     * achievability table from `FULL_LOADOUT_BP = 71774`. Adding 6,000bp here
     * would shift that table, the expedition thresholds and the task chain's
     * ordering all at once. Its ten levels are already doing a second job:
     * recipes unlock at Lv.0-4 and ascension gates on Lv.5 and Lv.8.
     */
    maxLevel: CAVE_MAX_LEVEL,
    bonusStat: "power",
    bonusPerLevelBp: 200,
    baseSpiritStoneCost: 3_000,
    materials: [
      { itemConfigId: "ore", baseQuantity: 5 },
      { itemConfigId: "wood", baseQuantity: 5 },
    ],
  },
  {
    id: "seclusion_room",
    displayName: "闭关室",
    maxLevel: CAVE_ABSOLUTE_MAX_LEVEL,
    bonusStat: "experience",
    bonusPerLevelBp: 150,
    baseSpiritStoneCost: 3_000,
    materials: [
      { itemConfigId: "wood", baseQuantity: 5 },
      { itemConfigId: "stone", baseQuantity: 5 },
    ],
  },
];

export interface CaveUpgradeCost {
  spiritStone: number;
  materials: ReadonlyArray<{ itemConfigId: string; quantity: number }>;
}

export function getCaveBuildingConfig(id: string): CaveBuildingConfig {
  const config = CAVE_BUILDING_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown cave building config: ${id}`);
  return config;
}

/**
 * How far this building can be raised at `band`. The absolute cap wins, which is
 * what holds 炼器室 at 10 in every band without a special case at the call site.
 */
export function caveMaxLevelForBand(id: string, band: EquipmentBand): number {
  const config = getCaveBuildingConfig(id);
  return Math.min(config.maxLevel, CAVE_MAX_LEVEL * band);
}

export function caveUpgradeCost(id: string, currentLevel: number): CaveUpgradeCost {
  const config = getCaveBuildingConfig(id);
  if (!Number.isInteger(currentLevel) || currentLevel < 0) {
    throw new RangeError(`Cave building level must be a non-negative integer: ${currentLevel}`);
  }
  if (currentLevel >= config.maxLevel) {
    throw new RangeError(`Cave building is already at max level: ${id}`);
  }
  const targetLevel = currentLevel + 1;
  return {
    spiritStone: caveSpiritStoneCost(config, targetLevel),
    // Materials stay linear at every level. Materials pace the midgame and
    // spirit stone paces the endgame, which is the same split
    // `CRAFTING_BAND_SPIRIT_STONE_MULTIPLIER` already encodes: the priciest
    // single material across the whole ladder is 8,200, about ten 太虚裂界
    // sweeps, while the spirit stone bill for the same span needs 3,878.
    materials: config.materials.map((material) => ({
      itemConfigId: material.itemConfigId,
      quantity: material.baseQuantity * targetLevel,
    })),
  };
}

/**
 * Quadratic through `CAVE_MAX_LEVEL`, geometric above it. Decimal rather than
 * `Math.pow` for the same reason the tower and 悟道 use it: `Math.pow` has
 * implementation-defined precision, and this figure is a price the save's
 * economy is built on, so it has to read the same in V8 and in WeChat's engine.
 */
function caveSpiritStoneCost(config: CaveBuildingConfig, targetLevel: number): number {
  if (targetLevel <= CAVE_MAX_LEVEL) {
    return config.baseSpiritStoneCost * targetLevel * targetLevel;
  }
  return Number(
    decimal(CAVE_GEOMETRIC_ANCHOR)
      .times(decimal(CAVE_GEOMETRIC_GROWTH).pow(targetLevel - CAVE_MAX_LEVEL))
      .toDecimalPlaces(0, Decimal.ROUND_CEIL)
      .toFixed(0),
  );
}
