import { Decimal, decimal } from "../decimal";
import type { BigNumberString } from "../types";

/**
 * A formulaic power ladder rather than a hand-authored stage table. One
 * expression covers the whole Lv.11 to Lv.917 span, so the tower needs no
 * content pass to keep up with the level cap.
 */
export const TRIAL_TOWER_MAX_FLOOR = 90;
export const TRIAL_TOWER_UNLOCK_LEVEL = 15;

const FLOOR_POWER_BASE = 3_000;
const FLOOR_SPIRIT_STONE_BASE = 1_000;
const FLOOR_GROWTH = "1.18";

export interface TrialFloorRewardItem {
  readonly itemConfigId: string;
  readonly quantity: number;
}

export interface TrialFloorRewards {
  readonly spiritStone: BigNumberString;
  readonly itemRewards: readonly TrialFloorRewardItem[];
}

export function trialFloorRequiredPower(floor: number): BigNumberString {
  assertTrialFloor(floor);
  return growth(FLOOR_POWER_BASE, floor);
}

export function trialFloorRewards(floor: number): TrialFloorRewards {
  assertTrialFloor(floor);
  // Spirit stone shares the threshold's growth rate so the reward's value never
  // drifts away from the effort the floor costs.
  const itemRewards: TrialFloorRewardItem[] = [
    { itemConfigId: "enhance_stone", quantity: 1 + Math.floor(floor / 2) },
    { itemConfigId: "technique_page", quantity: 1 + Math.floor(floor / 3) },
  ];
  // Only multiples of five pay tokens. Paying one every floor would put the
  // tower alone above a full year of idle token production.
  if (floor % 5 === 0) {
    itemRewards.push({ itemConfigId: "treasure_token", quantity: 2 });
  }
  return { spiritStone: growth(FLOOR_SPIRIT_STONE_BASE, floor), itemRewards };
}

/**
 * `Decimal.pow` with a fractional base and an integer exponent. Deliberately
 * not BigInt exponentiation: Cocos 3.8 transpiles that to `Math.pow`, which
 * throws on BigInt at runtime (see the note in `domain/loadout.ts`).
 */
function growth(base: number, floor: number): BigNumberString {
  return decimal(base)
    .times(decimal(FLOOR_GROWTH).pow(floor - 1))
    .toDecimalPlaces(0, Decimal.ROUND_CEIL)
    .toFixed(0);
}

function assertTrialFloor(floor: number): void {
  if (
    !Number.isInteger(floor) ||
    floor < 1 ||
    floor > TRIAL_TOWER_MAX_FLOOR
  ) {
    throw new RangeError(
      `Trial tower floor must be between 1 and ${TRIAL_TOWER_MAX_FLOOR}: ${floor}`,
    );
  }
}
