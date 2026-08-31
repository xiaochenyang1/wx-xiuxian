import { BASIS_POINTS } from "../types";
import {
  ASSET_QUALITY_MULTIPLIER_BP,
  ASSET_QUALITY_ORDER,
  type AssetQuality,
} from "./assets";

export const EQUIPMENT_MAX_ENHANCE_LEVEL = 20;
export const TECHNIQUE_MAX_STAR = 10;
export const TECHNIQUE_PAGES_PER_DUPLICATE = 5;
export const EQUIPMENT_SALVAGE_ENHANCE_REFUND_BP = 5_000;
export const ENHANCE_STONE_OVERFLOW_SPIRIT_STONE_VALUE = 100;
export const EQUIPMENT_REROLL_BASE_ENHANCE_STONE = 3;
export const EQUIPMENT_REROLL_BASE_SPIRIT_STONE = 800;
export const EQUIPMENT_ASCEND_DUPLICATE_COUNT = 2;
export const EQUIPMENT_ASCEND_BASE_SPIRIT_STONE = 20_000;

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
