import {
  MAX_LEVEL,
  getRealmConfig,
  getRealmConfigForLevel,
  isRealmMaxLevel,
} from "../config/realms";
import { Decimal, decimal, type DecimalInput } from "../decimal";
import { BASIS_POINTS, type BigNumberString } from "../types";

export type ProgressionStatus =
  | "gaining"
  | "breakthrough_ready"
  | "version_cap";

export interface PlayerProgress {
  level: number;
  experience: BigNumberString;
  cultivationReserve: BigNumberString;
  status: ProgressionStatus;
}

export type ProgressionEvent =
  | { type: "level_up"; fromLevel: number; toLevel: number }
  | { type: "breakthrough_ready"; level: number }
  | { type: "version_cap_reached"; level: number };

export interface ApplyExperienceResult {
  progress: PlayerProgress;
  events: ProgressionEvent[];
  discardedExperience: BigNumberString;
}

export interface PowerBonuses {
  percentBonusBp?: number;
}

export function requiredExperienceForLevel(level: number): BigNumberString {
  const realm = getRealmConfigForLevel(level);
  return decimal(level)
    .times(decimal(level).sqrt())
    .times(100)
    .times(realm.expRequirementCoefficientBp)
    .div(BASIS_POINTS)
    .toDecimalPlaces(0, Decimal.ROUND_CEIL)
    .toFixed(0);
}

export function calculateOnlineExperiencePerSecond(
  level: number,
  totalBonusBp = 0,
): BigNumberString {
  assertValidBonus(totalBonusBp);
  const realm = getRealmConfigForLevel(level);

  return decimal(level)
    .times(realm.expMultiplier)
    .times(BASIS_POINTS + totalBonusBp)
    .div(BASIS_POINTS)
    .toString();
}

export function calculateTotalPower(
  level: number,
  bonuses: PowerBonuses = {},
): BigNumberString {
  const percentBonusBp = bonuses.percentBonusBp ?? 0;
  assertValidBonus(percentBonusBp);

  const realm = getRealmConfigForLevel(level);
  const basePower = decimal(level).times(100).times(realm.powerMultiplier);

  return basePower
    .times(BASIS_POINTS + percentBonusBp)
    .div(BASIS_POINTS)
    .toDecimalPlaces(0, Decimal.ROUND_FLOOR)
    .toFixed(0);
}

export function applyWholeExperience(
  input: PlayerProgress,
  experienceToApply: DecimalInput,
): ApplyExperienceResult {
  const amount = assertWholeNonNegative(experienceToApply, "Experience amount");
  let level = input.level;
  let experience = assertWholeNonNegative(input.experience, "Current experience");
  let cultivationReserve = assertWholeNonNegative(
    input.cultivationReserve,
    "Cultivation reserve",
  );
  let status = input.status;
  let remaining = amount;
  let discarded = decimal(0);
  const events: ProgressionEvent[] = [];

  validateProgressState(input, experience);

  if (status === "breakthrough_ready") {
    discarded = remaining;
    remaining = decimal(0);
  } else if (status === "version_cap") {
    cultivationReserve = cultivationReserve.plus(remaining);
    remaining = decimal(0);
  }

  while (remaining.isPositive() && status === "gaining") {
    const required = decimal(requiredExperienceForLevel(level));
    const needed = required.minus(experience);

    if (remaining.lessThan(needed)) {
      experience = experience.plus(remaining);
      remaining = decimal(0);
      break;
    }

    experience = required;
    remaining = remaining.minus(needed);

    if (level === MAX_LEVEL) {
      status = "version_cap";
      cultivationReserve = cultivationReserve.plus(remaining);
      remaining = decimal(0);
      events.push({ type: "version_cap_reached", level });
      break;
    }

    if (isRealmMaxLevel(level)) {
      status = "breakthrough_ready";
      discarded = discarded.plus(remaining);
      remaining = decimal(0);
      events.push({ type: "breakthrough_ready", level });
      break;
    }

    const previousLevel = level;
    level += 1;
    experience = decimal(0);
    events.push({ type: "level_up", fromLevel: previousLevel, toLevel: level });
  }

  return {
    progress: {
      level,
      experience: experience.toFixed(0),
      cultivationReserve: cultivationReserve.toFixed(0),
      status,
    },
    events,
    discardedExperience: discarded.toFixed(0),
  };
}

export function completeBreakthrough(input: PlayerProgress): {
  progress: PlayerProgress;
  requiredPills: number;
} {
  const realm = getRealmConfigForLevel(input.level);
  const currentExperience = assertWholeNonNegative(input.experience, "Current experience");
  const requiredExperience = decimal(requiredExperienceForLevel(input.level));

  if (
    input.status !== "breakthrough_ready" ||
    input.level !== realm.maxLevel ||
    !currentExperience.equals(requiredExperience) ||
    realm.nextRealmId === null ||
    realm.breakthroughPillCost === null
  ) {
    throw new Error("BREAKTHROUGH_NOT_READY");
  }

  const nextRealm = getRealmConfig(realm.nextRealmId);
  const nextLevel = input.level + 1;

  if (nextLevel !== nextRealm.minLevel) {
    throw new Error(`Realm configuration is not contiguous at level ${input.level}`);
  }

  return {
    progress: {
      level: nextLevel,
      experience: "0",
      cultivationReserve: input.cultivationReserve,
      status: "gaining",
    },
    requiredPills: realm.breakthroughPillCost,
  };
}

function validateProgressState(input: PlayerProgress, experience: Decimal): void {
  const realm = getRealmConfigForLevel(input.level);
  const required = decimal(requiredExperienceForLevel(input.level));

  if (experience.greaterThan(required)) {
    throw new RangeError("Current experience cannot exceed required experience");
  }

  if (input.status === "breakthrough_ready") {
    if (input.level !== realm.maxLevel || input.level === MAX_LEVEL || !experience.equals(required)) {
      throw new Error("Invalid breakthrough-ready progress state");
    }
  }

  if (input.status === "version_cap") {
    if (input.level !== MAX_LEVEL || !experience.equals(required)) {
      throw new Error("Invalid version-cap progress state");
    }
  }
}

function assertWholeNonNegative(value: DecimalInput, label: string): Decimal {
  const parsed = decimal(value);

  if (parsed.isNegative() || !parsed.isInteger()) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }

  return parsed;
}

function assertValidBonus(totalBonusBp: number): void {
  if (!Number.isInteger(totalBonusBp) || totalBonusBp < -BASIS_POINTS) {
    throw new RangeError("Bonus basis points must be an integer greater than or equal to -10000");
  }
}
