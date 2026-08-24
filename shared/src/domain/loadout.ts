import {
  ASSET_QUALITY_MULTIPLIER_BP,
  ASSET_QUALITY_ORDER,
  LOADOUT_POWER_SCALE_BP,
  equipmentAffixRange,
  getEquipmentConfig,
  getTechniqueConfig,
  type AssetQuality,
} from "../config/assets";
import {
  EQUIPMENT_MAX_ENHANCE_LEVEL,
  TECHNIQUE_MAX_STAR,
} from "../config/asset-upgrades";

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

export type AffixStat =
  | "experience_bonus"
  | "spirit_stone_bonus"
  | "drop_bonus";

export interface RolledAffix {
  readonly stat: AffixStat;
  readonly valueBp: number;
}

/**
 * The stat order affixes are stored and displayed in. A piece never carries the
 * same stat twice, so this order makes any two pieces directly comparable
 * without sorting at the display layer.
 */
export const AFFIX_STATS: readonly AffixStat[] = [
  "experience_bonus",
  "spirit_stone_bonus",
  "drop_bonus",
];

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
  powerBonusBp: number;
  experienceBonusBp: number;
  spiritStoneBonusBp: number;
  dropBonusBp: number;
}

export function calculateTechniqueContribution(
  input: EquippedTechniqueInput,
): LoadoutBonuses {
  const config = getTechniqueConfig(input.techniqueConfigId);
  if (
    !Number.isInteger(input.star) ||
    input.star < 1 ||
    input.star > TECHNIQUE_MAX_STAR
  ) {
    throw new RangeError(
      `Technique star must be between 1 and ${TECHNIQUE_MAX_STAR}: ${input.star}`,
    );
  }
  const starMultiplierBp = TECHNIQUE_STAR_MULTIPLIER_BP[input.star]!;
  const qualityMultiplierBp = ASSET_QUALITY_MULTIPLIER_BP[config.quality];
  return {
    powerBonusBp: scaleByBasisPoints(
      config.fixedPower,
      LOADOUT_POWER_SCALE_BP,
      qualityMultiplierBp,
      starMultiplierBp,
    ),
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
  if (
    !Number.isInteger(input.enhanceLevel) ||
    input.enhanceLevel < 0 ||
    input.enhanceLevel > EQUIPMENT_MAX_ENHANCE_LEVEL
  ) {
    throw new RangeError(
      `Equipment enhance level must be between 0 and ${EQUIPMENT_MAX_ENHANCE_LEVEL}: ${input.enhanceLevel}`,
    );
  }
  if (!(input.quality in ASSET_QUALITY_ORDER)) {
    throw new RangeError(`Unknown equipment quality: ${input.quality}`);
  }

  const config = getEquipmentConfig(input.equipmentConfigId);
  const bonuses = emptyLoadoutBonuses();
  bonuses.powerBonusBp = scaleByBasisPoints(
    config.basePower,
    LOADOUT_POWER_SCALE_BP,
    ASSET_QUALITY_MULTIPLIER_BP[input.quality],
    10_000 + input.enhanceLevel * 1_000,
  );

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

/**
 * Rolls the affixes for a freshly created, rerolled or ascended piece.
 *
 * Stats are drawn first, without repetition, then values are rolled in stored
 * order, so a given randomInt sequence always produces the same result. The
 * caller owns the randomness: the service passes its plain randomInteger and
 * the idle-drop path passes its seeded one.
 */
export function rollEquipmentAffixes(
  quality: AssetQuality,
  randomInt: (maxExclusive: number) => number,
): RolledAffix[] {
  const range = equipmentAffixRange(quality);
  if (range.count === 0) return [];

  const candidates = [...AFFIX_STATS];
  for (let picked = 0; picked < range.count; picked += 1) {
    const offset = randomInt(candidates.length - picked);
    if (!Number.isInteger(offset) || offset < 0 || offset >= candidates.length - picked) {
      throw new RangeError(`Affix stat roll out of range: ${offset}`);
    }
    const swapWith = picked + offset;
    const held = candidates[picked]!;
    candidates[picked] = candidates[swapWith]!;
    candidates[swapWith] = held;
  }

  const span = range.maxValueBp - range.minValueBp + 1;
  return candidates
    .slice(0, range.count)
    .sort((left, right) => AFFIX_STATS.indexOf(left) - AFFIX_STATS.indexOf(right))
    .map((stat) => {
      const offset = randomInt(span);
      if (!Number.isInteger(offset) || offset < 0 || offset >= span) {
        throw new RangeError(`Affix value roll out of range: ${offset}`);
      }
      return { stat, valueBp: range.minValueBp + offset };
    });
}

/**
 * Scores a piece's affixes against the best roll its quality can produce, in
 * basis points. Derived on demand and never stored, which is the only way it
 * cannot drift away from the affixes it describes.
 */
export function equipmentAffixScoreBp(
  quality: AssetQuality,
  affixes: readonly RolledAffix[],
): number {
  const range = equipmentAffixRange(quality);
  if (range.count === 0) return 0;
  const best = range.count * range.maxValueBp;
  const rolled = affixes.reduce((total, affix) => total + affix.valueBp, 0);
  return Math.floor((rolled * 10_000) / best);
}

function emptyLoadoutBonuses(): LoadoutBonuses {
  return {
    powerBonusBp: 0,
    experienceBonusBp: 0,
    spiritStoneBonusBp: 0,
    dropBonusBp: 0,
  };
}

function addContribution(total: LoadoutBonuses, contribution: LoadoutBonuses): void {
  total.powerBonusBp += contribution.powerBonusBp;
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
  // Cocos 3.8 transpiles BigInt exponentiation to Math.pow, which throws at
  // runtime because Math.pow only accepts numbers. Repeated multiplication
  // preserves exact integer arithmetic in both source tests and built clients.
  const divisor = multipliersBp.reduce(
    (result) => result * 10_000n,
    1n,
  );
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
