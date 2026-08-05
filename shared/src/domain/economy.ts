import { Decimal, decimal, type DecimalInput } from "../decimal";
import {
  BASIS_POINTS,
  MAX_OFFLINE_SECONDS,
  MICROS_PER_SECOND,
  MICROS_PER_UNIT,
  SECONDS_PER_MINUTE,
  type BigNumberString,
} from "../types";
import { getRealmConfigForLevel } from "../config/realms";

export interface AccrualResult {
  wholeUnits: BigNumberString;
  remainderMicros: number;
}

export interface DropClockResult {
  attempts: number;
  remainderMicros: number;
}

export function calculateSpiritStonePerMinute(
  level: number,
  totalBonusBp = 0,
): BigNumberString {
  getRealmConfigForLevel(level);
  assertBasisPoints(totalBonusBp);

  return decimal(level)
    .times(BASIS_POINTS + totalBonusBp)
    .div(BASIS_POINTS)
    .toString();
}

export function accrueRate(params: {
  ratePerPeriod: DecimalInput;
  periodSeconds: number;
  elapsedMilliseconds: number;
  remainderMicros?: number;
  efficiencyBp?: number;
}): AccrualResult {
  const rate = decimal(params.ratePerPeriod);
  const remainderMicros = params.remainderMicros ?? 0;
  const efficiencyBp = params.efficiencyBp ?? BASIS_POINTS;

  if (rate.isNegative()) {
    throw new RangeError("Rate cannot be negative");
  }
  if (!Number.isFinite(params.periodSeconds) || params.periodSeconds <= 0) {
    throw new RangeError("Period seconds must be positive");
  }
  if (!Number.isInteger(params.elapsedMilliseconds) || params.elapsedMilliseconds < 0) {
    throw new RangeError("Elapsed milliseconds must be a non-negative integer");
  }
  if (!Number.isInteger(remainderMicros) || remainderMicros < 0 || remainderMicros >= MICROS_PER_UNIT) {
    throw new RangeError("Remainder micros must be between 0 and 999999");
  }
  assertBasisPoints(efficiencyBp);

  const generatedMicros = rate
    .times(params.elapsedMilliseconds)
    .times(MICROS_PER_UNIT)
    .times(efficiencyBp)
    .div(params.periodSeconds)
    .div(1000)
    .div(BASIS_POINTS)
    .toDecimalPlaces(0, Decimal.ROUND_FLOOR);
  const totalMicros = generatedMicros.plus(remainderMicros);
  const wholeUnits = totalMicros
    .div(MICROS_PER_UNIT)
    .toDecimalPlaces(0, Decimal.ROUND_FLOOR);
  const nextRemainder = totalMicros.mod(MICROS_PER_UNIT).toNumber();

  return {
    wholeUnits: wholeUnits.toFixed(0),
    remainderMicros: nextRemainder,
  };
}

export function advanceDropClock(params: {
  elapsedMilliseconds: number;
  efficiencyBp: number;
  remainderMicros?: number;
}): DropClockResult {
  const remainderMicros = params.remainderMicros ?? 0;
  const oneAttemptMicros = SECONDS_PER_MINUTE * MICROS_PER_SECOND;

  if (!Number.isInteger(params.elapsedMilliseconds) || params.elapsedMilliseconds < 0) {
    throw new RangeError("Elapsed milliseconds must be a non-negative integer");
  }
  if (!Number.isInteger(remainderMicros) || remainderMicros < 0 || remainderMicros >= oneAttemptMicros) {
    throw new RangeError(`Drop remainder must be between 0 and ${oneAttemptMicros - 1}`);
  }
  assertBasisPoints(params.efficiencyBp);

  const generatedMicros = decimal(params.elapsedMilliseconds)
    .times(1000)
    .times(params.efficiencyBp)
    .div(BASIS_POINTS)
    .toDecimalPlaces(0, Decimal.ROUND_FLOOR);
  const totalMicros = generatedMicros.plus(remainderMicros);
  const attempts = totalMicros
    .div(oneAttemptMicros)
    .toDecimalPlaces(0, Decimal.ROUND_FLOOR)
    .toNumber();

  return {
    attempts,
    remainderMicros: totalMicros.mod(oneAttemptMicros).toNumber(),
  };
}

export function calculateEffectiveOfflineSeconds(
  lastSettledAt: Date | string | number,
  serverNow: Date | string | number,
  capSeconds = MAX_OFFLINE_SECONDS,
): number {
  const from = toTimestamp(lastSettledAt);
  const to = toTimestamp(serverNow);

  if (!Number.isInteger(capSeconds) || capSeconds < 0) {
    throw new RangeError("Offline cap must be a non-negative integer");
  }

  return Math.min(capSeconds, Math.max(0, Math.floor((to - from) / 1000)));
}

function assertBasisPoints(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError("Efficiency basis points must be a non-negative integer");
  }
}

function toTimestamp(value: Date | string | number): number {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    throw new RangeError("Invalid timestamp");
  }

  return timestamp;
}
