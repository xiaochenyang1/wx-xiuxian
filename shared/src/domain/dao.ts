import {
  DAO_DROP_BONUS_PER_LEVEL_BP,
  DAO_EXPERIENCE_BONUS_PER_LEVEL_BP,
  DAO_MAX_LEVEL,
  DAO_SPIRIT_STONE_BONUS_PER_LEVEL_BP,
  daoLevelCost,
} from "../config/dao";
import { decimal } from "../decimal";
import type { BigNumberString } from "../types";
import type { LoadoutBonuses } from "./loadout";

export interface DaoInput {
  level: number;
}

export function calculateDaoBonuses(dao: DaoInput): LoadoutBonuses {
  assertDaoProgress(dao.level);
  return {
    powerBonusBp: 0,
    experienceBonusBp: DAO_EXPERIENCE_BONUS_PER_LEVEL_BP * dao.level,
    spiritStoneBonusBp: DAO_SPIRIT_STONE_BONUS_PER_LEVEL_BP * dao.level,
    dropBonusBp: DAO_DROP_BONUS_PER_LEVEL_BP * dao.level,
  };
}

/** How many further levels the held reserve can pay for right now. */
export function affordableDaoLevels(input: {
  level: number;
  cultivationReserve: BigNumberString;
}): number {
  assertDaoProgress(input.level);
  let remaining = decimal(input.cultivationReserve);
  if (remaining.isNegative()) {
    throw new RangeError("Cultivation reserve must be non-negative");
  }
  let affordable = 0;
  while (input.level + affordable < DAO_MAX_LEVEL) {
    const cost = decimal(daoLevelCost(input.level + affordable + 1));
    if (remaining.lessThan(cost)) break;
    remaining = remaining.minus(cost);
    affordable += 1;
  }
  return affordable;
}

/**
 * Buys `times` levels or nothing at all. A partial purchase would leave the
 * player unable to tell how far the reserve actually went, and every other
 * batch action in the game is all-or-nothing for the same reason.
 */
export function spendReserveOnDao(input: {
  level: number;
  cultivationReserve: BigNumberString;
  times: number;
}): { level: number; cultivationReserve: BigNumberString; spent: BigNumberString } {
  assertDaoProgress(input.level);
  if (!Number.isInteger(input.times) || input.times < 1) {
    throw new RangeError(`Dao purchase count must be a positive integer: ${input.times}`);
  }
  const level = input.level + input.times;
  if (level > DAO_MAX_LEVEL) {
    throw new RangeError(
      `Dao level cannot exceed ${DAO_MAX_LEVEL}: ${input.level} + ${input.times}`,
    );
  }
  let spent = decimal(0);
  for (let step = input.level + 1; step <= level; step += 1) {
    spent = spent.plus(daoLevelCost(step));
  }
  const reserve = decimal(input.cultivationReserve);
  if (reserve.lessThan(spent)) {
    throw new RangeError("Cultivation reserve is not enough for this purchase");
  }
  return {
    level,
    cultivationReserve: reserve.minus(spent).toFixed(0),
    spent: spent.toFixed(0),
  };
}

function assertDaoProgress(level: number): void {
  if (!Number.isInteger(level) || level < 0 || level > DAO_MAX_LEVEL) {
    throw new RangeError(`Dao level must be between 0 and ${DAO_MAX_LEVEL}: ${level}`);
  }
}
