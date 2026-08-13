import { BASIS_POINTS } from "../types";
import {
  ASSET_QUALITY_MULTIPLIER_BP,
  type AssetQuality,
} from "./assets";

export const EQUIPMENT_MAX_ENHANCE_LEVEL = 20;
export const TECHNIQUE_MAX_STAR = 10;

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

function scaleByBasisPointsCeil(value: number, multiplierBp: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Upgrade cost must be a non-negative safe integer: ${value}`);
  }
  return Math.ceil((value * multiplierBp) / BASIS_POINTS);
}
