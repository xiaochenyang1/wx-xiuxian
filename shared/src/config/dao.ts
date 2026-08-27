import { Decimal, decimal } from "../decimal";
import type { BigNumberString } from "../types";

/**
 * 悟道 — the only sink for `cultivationReserve`, which the rest of the game
 * writes to and never reads. Everything earned past Lv.1000 lands in the
 * reserve, so without this track the whole post-cap endgame accrues into a
 * number with no use.
 *
 * A formulaic ladder rather than a hand-authored table, same shape as
 * `trialFloorRequiredPower`: one expression covers all 50 levels, and the two
 * constants are the whole balance surface.
 */
export const DAO_MAX_LEVEL = 50;

const DAO_COST_BASE = 1_000_000;
const DAO_COST_GROWTH = "1.28";

/**
 * Each level pays all three non-power axes at once. Drop takes the smaller
 * share because material income is already band-scaled by up to x10, so the
 * same basis points buy noticeably more absolute output on that axis than on
 * the other two.
 *
 * Power is deliberately absent. Nothing is left to gate — tower floor 90 and
 * expedition stage 12 both fall to a full loadout well before the cap — and
 * feeding this into `calculateTotalPower` would drift the meaning of
 * `TOWER_TASK_FLOORS.achievableAtLevel`, whose guard test rederives every entry
 * from a hardcoded gear-only `FULL_LOADOUT_BP`. Spirit stone and drop buy power
 * indirectly, through the reroll, sublimation and crafting sinks that already
 * exist.
 */
export const DAO_EXPERIENCE_BONUS_PER_LEVEL_BP = 150;
export const DAO_SPIRIT_STONE_BONUS_PER_LEVEL_BP = 150;
export const DAO_DROP_BONUS_PER_LEVEL_BP = 100;

/** Reserve cost of the step from `level - 1` to `level`. */
export function daoLevelCost(level: number): BigNumberString {
  assertDaoLevel(level, 1);
  return decimal(DAO_COST_BASE)
    .times(decimal(DAO_COST_GROWTH).pow(level - 1))
    .toDecimalPlaces(0, Decimal.ROUND_CEIL)
    .toFixed(0);
}

/** Reserve spent to reach `level` from scratch. `0` costs nothing. */
export function daoCumulativeCost(level: number): BigNumberString {
  assertDaoLevel(level, 0);
  let total = decimal(0);
  for (let step = 1; step <= level; step += 1) {
    total = total.plus(daoLevelCost(step));
  }
  return total.toFixed(0);
}

function assertDaoLevel(level: number, minimum: number): void {
  if (!Number.isInteger(level) || level < minimum || level > DAO_MAX_LEVEL) {
    throw new RangeError(
      `Dao level must be between ${minimum} and ${DAO_MAX_LEVEL}: ${level}`,
    );
  }
}
