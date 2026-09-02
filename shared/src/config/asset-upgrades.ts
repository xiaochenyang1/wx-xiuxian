import { BASIS_POINTS } from "../types";
import {
  ASSET_QUALITY_MULTIPLIER_BP,
  ASSET_QUALITY_ORDER,
  type AssetQuality,
  type EquipmentBand,
} from "./assets";
import { CRAFTING_BAND_SPIRIT_STONE_MULTIPLIER } from "./crafting";

export const EQUIPMENT_MAX_ENHANCE_LEVEL = 20;
export const TECHNIQUE_MAX_STAR = 10;
export const TECHNIQUE_PAGES_PER_DUPLICATE = 5;
export const EQUIPMENT_SALVAGE_ENHANCE_REFUND_BP = 5_000;
export const ENHANCE_STONE_OVERFLOW_SPIRIT_STONE_VALUE = 100;
export const EQUIPMENT_REROLL_BASE_ENHANCE_STONE = 3;
export const EQUIPMENT_REROLL_BASE_SPIRIT_STONE = 800;
export const EQUIPMENT_ASCEND_DUPLICATE_COUNT = 2;
export const EQUIPMENT_ASCEND_BASE_SPIRIT_STONE = 20_000;
export const TECHNIQUE_ASCEND_DUPLICATE_COUNT = 2;
export const TECHNIQUE_ASCEND_BASE_SPIRIT_STONE = 50_000;
export const TECHNIQUE_ASCEND_REQUIRED_SECLUSION_ROOM_LEVEL = 5;

/**
 * The only quality step a book can take. 功法 has two qualities where 法宝 has
 * seven, and that is not an omission to be filled in later:
 * `LOADOUT_POWER_SCALE_BP` is solved from a starter and a *maxed* endpoint, and
 * the maxed one is the four 优秀 books at `TECHNIQUE_MAX_STAR`
 * (`test/loadout-power-model.test.ts` pins it at 69,774bp, which is
 * `FULL_LOADOUT_BP = 71774` less the crafting room's 2,000). A third technique
 * quality would move that endpoint, and with it the tower's achievability
 * table, the expedition thresholds and the task chain's ordering — the same
 * cascade the 炼器室 cap comment in `cave.ts` exists to prevent.
 *
 * So ascension here buys *agency over an existing ceiling*, not a new one: the
 * 优秀 book was always the top of the ladder and always droppable, and this
 * turns reaching it from a matter of luck into a matter of investment.
 */
export const TECHNIQUE_ASCEND_SOURCE_QUALITY = "common" satisfies AssetQuality;
export const TECHNIQUE_ASCEND_TARGET_QUALITY = "uncommon" satisfies AssetQuality;

/**
 * Which crafting room level unlocks ascending *into* each quality. Keyed by
 * target rather than source, so the table itself states that mythic and
 * primordial are the only qualities ascension can produce.
 */
const EQUIPMENT_ASCEND_REQUIRED_CRAFTING_ROOM_LEVEL: Readonly<
  Partial<Record<AssetQuality, number>>
> = {
  mythic: 5,
  primordial: 8,
};

const ASSET_QUALITY_BY_ORDER: readonly AssetQuality[] = (
  Object.keys(ASSET_QUALITY_ORDER) as AssetQuality[]
).sort((left, right) => ASSET_QUALITY_ORDER[left] - ASSET_QUALITY_ORDER[right]);

const EQUIPMENT_SALVAGE_BASE_REWARD: Readonly<
  Record<AssetQuality, { readonly spiritStone: number; readonly enhanceStone: number }>
> = {
  common: { spiritStone: 100, enhanceStone: 1 },
  uncommon: { spiritStone: 250, enhanceStone: 2 },
  rare: { spiritStone: 600, enhanceStone: 4 },
  epic: { spiritStone: 1_500, enhanceStone: 8 },
  legendary: { spiritStone: 4_000, enhanceStone: 15 },
  mythic: { spiritStone: 10_000, enhanceStone: 25 },
  primordial: { spiritStone: 25_000, enhanceStone: 40 },
};

const TECHNIQUE_DUPLICATE_COST_BY_TARGET_STAR = [
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  4,
  5,
  7,
  10,
] as const;

export interface EquipmentEnhanceCost {
  readonly targetLevel: number;
  readonly enhanceStone: number;
  readonly spiritStone: number;
}

export interface TechniqueStarUpgradeCost {
  readonly targetStar: number;
  readonly duplicateCount: number;
}

export interface EquipmentSalvageReward {
  readonly spiritStone: number;
  readonly enhanceStone: number;
  readonly refundedSpiritStone: number;
  readonly refundedEnhanceStone: number;
}

export interface EquipmentRerollCost {
  readonly enhanceStone: number;
  readonly spiritStone: number;
}

export interface EquipmentAscendCost {
  readonly targetQuality: AssetQuality;
  readonly duplicateCount: number;
  readonly spiritStone: number;
  readonly requiredCraftingRoomLevel: number;
}

export interface TechniqueAscendCost {
  readonly targetQuality: AssetQuality;
  readonly duplicateCount: number;
  readonly spiritStone: number;
  readonly requiredSeclusionRoomLevel: number;
}

export function equipmentEnhanceCost(
  quality: AssetQuality,
  currentLevel: number,
): EquipmentEnhanceCost {
  if (
    !Number.isSafeInteger(currentLevel) ||
    currentLevel < 0 ||
    currentLevel >= EQUIPMENT_MAX_ENHANCE_LEVEL
  ) {
    throw new RangeError(
      `Equipment enhance level must be between 0 and ${EQUIPMENT_MAX_ENHANCE_LEVEL - 1}: ${currentLevel}`,
    );
  }
  const qualityMultiplierBp = ASSET_QUALITY_MULTIPLIER_BP[quality];
  if (qualityMultiplierBp === undefined) {
    throw new RangeError(`Unknown equipment quality: ${quality}`);
  }

  const targetLevel = currentLevel + 1;
  return {
    targetLevel,
    enhanceStone: scaleByBasisPointsCeil(
      Math.ceil(targetLevel / 2),
      qualityMultiplierBp,
    ),
    spiritStone: scaleByBasisPointsCeil(
      250 * targetLevel,
      qualityMultiplierBp,
    ),
  };
}

export function techniqueStarUpgradeCost(
  currentStar: number,
): TechniqueStarUpgradeCost {
  if (
    !Number.isSafeInteger(currentStar) ||
    currentStar < 1 ||
    currentStar >= TECHNIQUE_MAX_STAR
  ) {
    throw new RangeError(
      `Technique star must be between 1 and ${TECHNIQUE_MAX_STAR - 1}: ${currentStar}`,
    );
  }
  const targetStar = currentStar + 1;
  const duplicateCount = TECHNIQUE_DUPLICATE_COST_BY_TARGET_STAR[targetStar];
  if (duplicateCount === undefined) {
    throw new RangeError(`Unknown technique target star: ${targetStar}`);
  }
  return { targetStar, duplicateCount };
}

/**
 * What it costs to move a book's stars onto its higher-band counterpart.
 *
 * Paid in spirit stone, never in 功法残页. The lifetime page demand is pinned at
 * 700 for all four equipped slots and deliberately does not grow with the band
 * (see the spec's technique-page note), so charging pages here would either
 * break that number or turn every band boundary into a wall. Spirit stone is the
 * resource one trial tower floor already pays out in the billions, which is the
 * same reason crafting scales its stone cost with the band and its materials not.
 *
 * The multiplier is the *target* band's alone: the price is set by where the
 * stars land, not by how far they travelled. So a direct 凡阶→天阶 jump costs one
 * 天阶 fee rather than the sum of the three steps, which is why the display picks
 * the highest band the player owns instead of the next one up.
 */
export const TECHNIQUE_INHERIT_BASE_SPIRIT_STONE = 50_000;

export function techniqueInheritCost(
  quality: AssetQuality,
  targetBand: EquipmentBand,
): number {
  const qualityMultiplierBp = ASSET_QUALITY_MULTIPLIER_BP[quality];
  if (qualityMultiplierBp === undefined) {
    throw new RangeError(`Unknown technique quality: ${quality}`);
  }
  const bandMultiplier = CRAFTING_BAND_SPIRIT_STONE_MULTIPLIER[targetBand];
  if (!bandMultiplier) {
    throw new RangeError(`Unknown equipment band: ${targetBand}`);
  }
  return (
    scaleByBasisPointsCeil(
      TECHNIQUE_INHERIT_BASE_SPIRIT_STONE,
      qualityMultiplierBp,
    ) * bandMultiplier
  );
}

/**
 * What it costs to turn a 普通 book into its 优秀 counterpart in the same slot
 * and band.
 *
 * The same shape as `techniqueInheritCost`, because it is the same kind of move:
 * both take the stars a player has already paid for and carry them onto another
 * config, one along the band axis and one along the quality axis. The band
 * multiplier is the book's own — there is no "target band" here, the step is
 * sideways — and the quality multiplier is the target's, so the price is set by
 * what the stars land on rather than by what they left.
 *
 * Paid in the book's own duplicates plus spirit stone, never in 功法残页. Pages
 * substitute for duplicates in 升星 and that is deliberate; letting them do it
 * here too would put the lifetime page budget (700 across four equipped slots)
 * in the path of a second mechanic, and pages would then be able to buy quality
 * on a book the player never farmed.
 */
export function techniqueAscendCost(band: EquipmentBand): TechniqueAscendCost {
  const qualityMultiplierBp =
    ASSET_QUALITY_MULTIPLIER_BP[TECHNIQUE_ASCEND_TARGET_QUALITY];
  const bandMultiplier = CRAFTING_BAND_SPIRIT_STONE_MULTIPLIER[band];
  if (!bandMultiplier) {
    throw new RangeError(`Unknown equipment band: ${band}`);
  }
  return {
    targetQuality: TECHNIQUE_ASCEND_TARGET_QUALITY,
    duplicateCount: TECHNIQUE_ASCEND_DUPLICATE_COUNT,
    spiritStone:
      scaleByBasisPointsCeil(
        TECHNIQUE_ASCEND_BASE_SPIRIT_STONE,
        qualityMultiplierBp,
      ) * bandMultiplier,
    requiredSeclusionRoomLevel: TECHNIQUE_ASCEND_REQUIRED_SECLUSION_ROOM_LEVEL,
  };
}

/** 优秀 is the top of the two-quality ladder, so only 普通 books can ascend. */
export function canAscendTechniqueQuality(quality: AssetQuality): boolean {
  return quality === TECHNIQUE_ASCEND_SOURCE_QUALITY;
}

export function shouldAutoLockEquipment(quality: AssetQuality): boolean {
  const qualityMultiplierBp = ASSET_QUALITY_MULTIPLIER_BP[quality];
  if (qualityMultiplierBp === undefined) {
    throw new RangeError(`Unknown equipment quality: ${quality}`);
  }
  return quality !== "common" && quality !== "uncommon";
}

export function nextAssetQuality(quality: AssetQuality): AssetQuality | null {
  const order = ASSET_QUALITY_ORDER[quality];
  if (order === undefined) {
    throw new RangeError(`Unknown equipment quality: ${quality}`);
  }
  return ASSET_QUALITY_BY_ORDER[order + 1] ?? null;
}

export function equipmentRerollCost(quality: AssetQuality): EquipmentRerollCost {
  const qualityMultiplierBp = ASSET_QUALITY_MULTIPLIER_BP[quality];
  if (qualityMultiplierBp === undefined) {
    throw new RangeError(`Unknown equipment quality: ${quality}`);
  }
  if (quality === "common") {
    throw new RangeError("Common equipment has no affixes to reroll");
  }
  return {
    enhanceStone: scaleByBasisPointsCeil(
      EQUIPMENT_REROLL_BASE_ENHANCE_STONE,
      qualityMultiplierBp,
    ),
    spiritStone: scaleByBasisPointsCeil(
      EQUIPMENT_REROLL_BASE_SPIRIT_STONE,
      qualityMultiplierBp,
    ),
  };
}

export function equipmentAscendCost(quality: AssetQuality): EquipmentAscendCost {
  const targetQuality = nextAssetQuality(quality);
  if (!targetQuality) {
    throw new RangeError(`Equipment quality is already the highest: ${quality}`);
  }
  const requiredCraftingRoomLevel =
    EQUIPMENT_ASCEND_REQUIRED_CRAFTING_ROOM_LEVEL[targetQuality];
  if (requiredCraftingRoomLevel === undefined) {
    throw new RangeError(`Equipment quality cannot be ascended: ${quality}`);
  }
  return {
    targetQuality,
    duplicateCount: EQUIPMENT_ASCEND_DUPLICATE_COUNT,
    spiritStone: scaleByBasisPointsCeil(
      EQUIPMENT_ASCEND_BASE_SPIRIT_STONE,
      ASSET_QUALITY_MULTIPLIER_BP[targetQuality],
    ),
    requiredCraftingRoomLevel,
  };
}

export function canAscendEquipmentQuality(quality: AssetQuality): boolean {
  const targetQuality = nextAssetQuality(quality);
  return (
    targetQuality !== null &&
    EQUIPMENT_ASCEND_REQUIRED_CRAFTING_ROOM_LEVEL[targetQuality] !== undefined
  );
}

export function equipmentSalvageReward(
  quality: AssetQuality,
  enhanceLevel: number,
): EquipmentSalvageReward {
  const base = EQUIPMENT_SALVAGE_BASE_REWARD[quality];
  if (!base) throw new RangeError(`Unknown equipment quality: ${quality}`);
  if (
    !Number.isSafeInteger(enhanceLevel) ||
    enhanceLevel < 0 ||
    enhanceLevel > EQUIPMENT_MAX_ENHANCE_LEVEL
  ) {
    throw new RangeError(
      `Equipment enhance level must be between 0 and ${EQUIPMENT_MAX_ENHANCE_LEVEL}: ${enhanceLevel}`,
    );
  }

  let investedSpiritStone = 0;
  let investedEnhanceStone = 0;
  for (let currentLevel = 0; currentLevel < enhanceLevel; currentLevel += 1) {
    const cost = equipmentEnhanceCost(quality, currentLevel);
    investedSpiritStone += cost.spiritStone;
    investedEnhanceStone += cost.enhanceStone;
  }
  const refundedSpiritStone = Math.floor(
    (investedSpiritStone * EQUIPMENT_SALVAGE_ENHANCE_REFUND_BP) / BASIS_POINTS,
  );
  const refundedEnhanceStone = Math.floor(
    (investedEnhanceStone * EQUIPMENT_SALVAGE_ENHANCE_REFUND_BP) / BASIS_POINTS,
  );
  return {
    spiritStone: base.spiritStone + refundedSpiritStone,
    enhanceStone: base.enhanceStone + refundedEnhanceStone,
    refundedSpiritStone,
    refundedEnhanceStone,
  };
}

function scaleByBasisPointsCeil(value: number, multiplierBp: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Upgrade cost must be a non-negative safe integer: ${value}`);
  }
  return Math.ceil((value * multiplierBp) / BASIS_POINTS);
}
