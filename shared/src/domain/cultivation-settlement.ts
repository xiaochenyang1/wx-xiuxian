import { getRealmConfigForLevel } from "../config/realms";
import { Decimal, decimal } from "../decimal";
import {
  BASIS_POINTS,
  type BigNumberString,
} from "../types";
import {
  accrueRate,
  advanceDropClock,
  calculateSpiritStonePerMinute,
} from "./economy";
import {
  applyWholeExperience,
  calculateOnlineExperiencePerSecond,
  requiredExperienceForLevel,
  type PlayerProgress,
  type ProgressionEvent,
} from "./progression";

export interface CultivationSettlementInput {
  progress: PlayerProgress;
  elapsedMilliseconds: number;
  experienceRemainderMicros: number;
  spiritStoneRemainderMicros: number;
  dropClockRemainderMicros: number;
  efficiencyBp?: number;
  experienceBonusBp?: number;
  spiritStoneBonusBp?: number;
  dropBonusBp?: number;
}

export interface CultivationSettlementResult {
  progress: PlayerProgress;
  experienceGained: BigNumberString;
  experienceDiscarded: BigNumberString;
  spiritStoneGained: BigNumberString;
  experienceRemainderMicros: number;
  spiritStoneRemainderMicros: number;
  dropAttempts: number;
  dropClockRemainderMicros: number;
  events: ProgressionEvent[];
}

export interface SimulatedOnlineExperienceInput {
  progress: PlayerProgress;
  elapsedMilliseconds: number;
  experienceBonusBp?: number;
}

export interface SimulatedOnlineExperienceResult {
  progress: PlayerProgress;
  experienceGained: BigNumberString;
  experienceDiscarded: BigNumberString;
  events: ProgressionEvent[];
}

export function simulateOnlineExperience(
  input: SimulatedOnlineExperienceInput,
): SimulatedOnlineExperienceResult {
  const settlement = settleCultivation({
    progress: input.progress,
    elapsedMilliseconds: input.elapsedMilliseconds,
    experienceRemainderMicros: 0,
    spiritStoneRemainderMicros: 0,
    dropClockRemainderMicros: 0,
    efficiencyBp: BASIS_POINTS,
    experienceBonusBp: input.experienceBonusBp ?? 0,
  });
  return {
    progress: settlement.progress,
    experienceGained: settlement.experienceGained,
    experienceDiscarded: settlement.experienceDiscarded,
    events: settlement.events,
  };
}

export function settleCultivation(
  input: CultivationSettlementInput,
): CultivationSettlementResult {
  assertElapsedMilliseconds(input.elapsedMilliseconds);
  const efficiencyBp = input.efficiencyBp ?? BASIS_POINTS;
  const experienceBonusBp = input.experienceBonusBp ?? 0;
  const spiritStoneBonusBp = input.spiritStoneBonusBp ?? 0;
  const dropBonusBp = input.dropBonusBp ?? 0;
  getRealmConfigForLevel(input.progress.level);

  let progress = { ...input.progress };
  let remainingMilliseconds = input.elapsedMilliseconds;
  let experienceRemainderMicros = input.experienceRemainderMicros;
  let spiritStoneRemainderMicros = input.spiritStoneRemainderMicros;
  let experienceGained = decimal(0);
  let experienceDiscarded = decimal(0);
  let spiritStoneGained = decimal(0);
  const events: ProgressionEvent[] = [];

  while (remainingMilliseconds > 0) {
    if (progress.status === "breakthrough_ready") {
      const stones = accrueSpiritStones(
        progress.level,
        remainingMilliseconds,
        spiritStoneRemainderMicros,
        efficiencyBp,
        spiritStoneBonusBp,
      );
      spiritStoneGained = spiritStoneGained.plus(stones.wholeUnits);
      spiritStoneRemainderMicros = stones.remainderMicros;
      experienceRemainderMicros = 0;
      remainingMilliseconds = 0;
      break;
    }

    if (progress.status === "version_cap") {
      const experience = accrueExperience(
        progress.level,
        remainingMilliseconds,
        experienceRemainderMicros,
        efficiencyBp,
        experienceBonusBp,
      );
      const stones = accrueSpiritStones(
        progress.level,
        remainingMilliseconds,
        spiritStoneRemainderMicros,
        efficiencyBp,
        spiritStoneBonusBp,
      );
      const applied = applyWholeExperience(progress, experience.wholeUnits);
      progress = applied.progress;
      experienceGained = experienceGained.plus(experience.wholeUnits);
      experienceRemainderMicros = experience.remainderMicros;
      spiritStoneGained = spiritStoneGained.plus(stones.wholeUnits);
      spiritStoneRemainderMicros = stones.remainderMicros;
      events.push(...applied.events);
      remainingMilliseconds = 0;
      break;
    }

    const required = decimal(requiredExperienceForLevel(progress.level));
    const current = decimal(progress.experience);
    const needed = required.minus(current);
    if (!needed.isPositive()) {
      throw new Error("Invalid gaining progress at a full experience bar");
    }

    const segmentMilliseconds = millisecondsUntilExperienceBoundary({
      neededExperience: needed,
      ratePerSecond: calculateOnlineExperiencePerSecond(progress.level, experienceBonusBp),
      remainderMicros: experienceRemainderMicros,
      efficiencyBp,
      maximumMilliseconds: remainingMilliseconds,
    });
    const experience = accrueExperience(
      progress.level,
      segmentMilliseconds,
      experienceRemainderMicros,
      efficiencyBp,
      experienceBonusBp,
    );
    const stones = accrueSpiritStones(
      progress.level,
      segmentMilliseconds,
      spiritStoneRemainderMicros,
      efficiencyBp,
      spiritStoneBonusBp,
    );
    const applied = applyWholeExperience(progress, experience.wholeUnits);

    progress = applied.progress;
    experienceGained = experienceGained
      .plus(experience.wholeUnits)
      .minus(applied.discardedExperience);
    experienceDiscarded = experienceDiscarded.plus(applied.discardedExperience);
    experienceRemainderMicros =
      progress.status === "breakthrough_ready" ? 0 : experience.remainderMicros;
    spiritStoneGained = spiritStoneGained.plus(stones.wholeUnits);
    spiritStoneRemainderMicros = stones.remainderMicros;
    events.push(...applied.events);
    remainingMilliseconds -= segmentMilliseconds;
  }

  const dropClock = advanceDropClock({
    elapsedMilliseconds: input.elapsedMilliseconds,
    efficiencyBp: Math.floor(
      (efficiencyBp * (BASIS_POINTS + dropBonusBp)) / BASIS_POINTS,
    ),
    remainderMicros: input.dropClockRemainderMicros,
  });

  return {
    progress,
    experienceGained: experienceGained.toFixed(0),
    experienceDiscarded: experienceDiscarded.toFixed(0),
    spiritStoneGained: spiritStoneGained.toFixed(0),
    experienceRemainderMicros,
    spiritStoneRemainderMicros,
    dropAttempts: dropClock.attempts,
    dropClockRemainderMicros: dropClock.remainderMicros,
    events,
  };
}

function accrueExperience(
  level: number,
  elapsedMilliseconds: number,
  remainderMicros: number,
  efficiencyBp: number,
  experienceBonusBp: number,
) {
  return accrueRate({
    ratePerPeriod: calculateOnlineExperiencePerSecond(level, experienceBonusBp),
    periodSeconds: 1,
    elapsedMilliseconds,
    remainderMicros,
    efficiencyBp,
  });
}

function accrueSpiritStones(
  level: number,
  elapsedMilliseconds: number,
  remainderMicros: number,
  efficiencyBp: number,
  spiritStoneBonusBp: number,
) {
  return accrueRate({
    ratePerPeriod: calculateSpiritStonePerMinute(level, spiritStoneBonusBp),
    periodSeconds: 60,
    elapsedMilliseconds,
    remainderMicros,
    efficiencyBp,
  });
}

function millisecondsUntilExperienceBoundary(params: {
  neededExperience: Decimal;
  ratePerSecond: BigNumberString;
  remainderMicros: number;
  efficiencyBp: number;
  maximumMilliseconds: number;
}): number {
  const requiredMicros = params.neededExperience
    .times(1_000_000)
    .minus(params.remainderMicros);
  const generatedMicrosPerMillisecond = decimal(params.ratePerSecond)
    .times(1_000)
    .times(params.efficiencyBp)
    .div(BASIS_POINTS);

  if (!generatedMicrosPerMillisecond.isPositive()) {
    return params.maximumMilliseconds;
  }

  const requiredMilliseconds = requiredMicros
    .div(generatedMicrosPerMillisecond)
    .toDecimalPlaces(0, Decimal.ROUND_CEIL);

  if (requiredMilliseconds.greaterThanOrEqualTo(params.maximumMilliseconds)) {
    return params.maximumMilliseconds;
  }

  return Math.max(1, requiredMilliseconds.toNumber());
}

function assertElapsedMilliseconds(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Elapsed milliseconds must be a non-negative safe integer");
  }
}
