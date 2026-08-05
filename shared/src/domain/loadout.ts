import {
  ASSET_QUALITY_ORDER,
  getEquipmentConfig,
  getTechniqueConfig,
  type AssetQuality,
} from "../config/assets";
import type { BigNumberString } from "../types";

const QUALITY_MULTIPLIER_BP: Readonly<Record<AssetQuality, number>> = {
  common: 10_000,
  uncommon: 15_000,
  rare: 25_000,
  epic: 40_000,
  legendary: 70_000,
  mythic: 120_000,
  primordial: 200_000,
};

const TECHNIQUE_STAR_MULTIPLIER_BP = [
  0,
  10_000,
  12_000,
  15_000,
  20_000,
  27_000,
  36_000,
  47_000,
  60_000,
  76_000,
  95_000,
] as const;

export interface EquippedTechniqueInput {
  techniqueConfigId: string;
  star: number;
}

export interface EquippedEquipmentInput {
  equipmentConfigId: string;
  quality: AssetQuality;
  enhanceLevel: number;
  rolledAffixes: unknown;
}

export interface LoadoutBonuses {
  fixedPower: BigNumberString;
  experienceBonusBp: number;
  spiritStoneBonusBp: number;
  dropBonusBp: number;
}

export function calculateTechniqueContribution(
  input: EquippedTechniqueInput,
): LoadoutBonuses {
  const config = getTechniqueConfig(input.techniqueConfigId);
  const starMultiplierBp = TECHNIQUE_STAR_MULTIPLIER_BP[input.star];
  if (starMultiplierBp === undefined) {
    throw new RangeError(`Technique star must be between 1 and 10: ${input.star}`);
  }
  const qualityMultiplierBp = QUALITY_MULTIPLIER_BP[config.quality];
  return {
    fixedPower: scaleByBasisPoints(
      config.fixedPower,
      qualityMultiplierBp,
      starMultiplierBp,
    ).toString(),
    experienceBonusBp: scaleByBasisPoints(
      config.experienceBonusBp,
      qualityMultiplierBp,
      starMultiplierBp,
    ),
    spiritStoneBonusBp: scaleByBasisPoints(
      config.spiritStoneBonusBp,
      qualityMultiplierBp,
      starMultiplierBp,
    ),
    dropBonusBp: scaleByBasisPoints(
      config.dropBonusBp,
      qualityMultiplierBp,
      starMultiplierBp,
    ),
  };
}

export function calculateEquipmentContribution(
  input: EquippedEquipmentInput,
): LoadoutBonuses {
  if (!Number.isInteger(input.enhanceLevel) || input.enhanceLevel < 0 || input.enhanceLevel > 20) {
    throw new RangeError(`Equipment enhance level must be between 0 and 20: ${input.enhanceLevel}`);
  }
  if (!(input.quality in ASSET_QUALITY_ORDER)) {
    throw new RangeError(`Unknown equipment quality: ${input.quality}`);
  }

  const config = getEquipmentConfig(input.equipmentConfigId);
  const fixedPower = scaleByBasisPoints(
    config.basePower,
    QUALITY_MULTIPLIER_BP[input.quality],
    10_000 + input.enhanceLevel * 1_000,
  );
  const bonuses = emptyLoadoutBonuses();
  bonuses.fixedPower = fixedPower.toString();

  for (const affix of parseAffixes(input.rolledAffixes)) {
    if (affix.stat === "experience_bonus") bonuses.experienceBonusBp += affix.valueBp;
    if (affix.stat === "spirit_stone_bonus") bonuses.spiritStoneBonusBp += affix.valueBp;
    if (affix.stat === "drop_bonus") bonuses.dropBonusBp += affix.valueBp;
  }
  return bonuses;
}

export function calculateLoadoutBonuses(input: {
  techniques: readonly EquippedTechniqueInput[];
  equipment: readonly EquippedEquipmentInput[];
}): LoadoutBonuses {
  const total = emptyLoadoutBonuses();
  for (const technique of input.techniques) {
    addContribution(total, calculateTechniqueContribution(technique));
  }
  for (const equipment of input.equipment) {
    addContribution(total, calculateEquipmentContribution(equipment));
  }
  return total;
}

function emptyLoadoutBonuses(): LoadoutBonuses {
  return {
    fixedPower: "0",
    experienceBonusBp: 0,
    spiritStoneBonusBp: 0,
    dropBonusBp: 0,
  };
}

function addContribution(total: LoadoutBonuses, contribution: LoadoutBonuses): void {
  total.fixedPower = (BigInt(total.fixedPower) + BigInt(contribution.fixedPower)).toString();
  total.experienceBonusBp += contribution.experienceBonusBp;
  total.spiritStoneBonusBp += contribution.spiritStoneBonusBp;
  total.dropBonusBp += contribution.dropBonusBp;
}

function scaleByBasisPoints(value: number, ...multipliersBp: number[]): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Loadout value must be a non-negative safe integer: ${value}`);
  }
  const numerator = multipliersBp.reduce(
    (result, multiplier) => result * BigInt(multiplier),
    BigInt(value),
  );
  const divisor = 10_000n ** BigInt(multipliersBp.length);
  const result = numerator / divisor;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Calculated loadout value exceeds safe integer range");
  }
  return Number(result);
}

function parseAffixes(value: unknown): Array<{
  stat: "experience_bonus" | "spirit_stone_bonus" | "drop_bonus";
  valueBp: number;
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return [];
    const stat = "stat" in candidate ? candidate.stat : null;
    const valueBp = "valueBp" in candidate ? candidate.valueBp : null;
    if (
      (stat !== "experience_bonus" &&
        stat !== "spirit_stone_bonus" &&
        stat !== "drop_bonus") ||
      !Number.isSafeInteger(valueBp) ||
      Number(valueBp) < 0
    ) {
      return [];
    }
    return [{ stat, valueBp: Number(valueBp) }];
  });
}
