import {
  TRIAL_TOWER_MAX_FLOOR,
  trialFloorRequiredPower,
} from "../config/trial-tower";
import { decimal } from "../decimal";
import type { BigNumberString } from "../types";

/** Same vocabulary as `evaluateExpeditionStage`, so display code reads alike. */
export type TrialFloorStatus = "cleared" | "locked" | "underpowered" | "ready";

export interface TrialFloorEvaluation {
  readonly status: TrialFloorStatus;
  readonly powerDeficit: BigNumberString;
}

/**
 * The tower is climbed strictly in order, so `highestFloor` alone is the whole
 * record — no id list and no prefix check like the expedition needs.
 */
export function evaluateTrialFloor(
  highestFloor: number,
  floor: number,
  totalPower: BigNumberString,
): TrialFloorEvaluation {
  assertHighestFloor(highestFloor);
  if (floor <= highestFloor) return { status: "cleared", powerDeficit: "0" };
  if (floor > highestFloor + 1) return { status: "locked", powerDeficit: "0" };

  const power = decimal(totalPower);
  const required = decimal(trialFloorRequiredPower(floor));
  if (power.lessThan(required)) {
    return {
      status: "underpowered",
      powerDeficit: required.minus(power).toFixed(0),
    };
  }
  return { status: "ready", powerDeficit: "0" };
}

export function isTrialTowerCleared(highestFloor: number): boolean {
  assertHighestFloor(highestFloor);
  return highestFloor >= TRIAL_TOWER_MAX_FLOOR;
}

function assertHighestFloor(highestFloor: number): void {
  if (
    !Number.isInteger(highestFloor) ||
    highestFloor < 0 ||
    highestFloor > TRIAL_TOWER_MAX_FLOOR
  ) {
    throw new RangeError(
      `Highest trial floor must be between 0 and ${TRIAL_TOWER_MAX_FLOOR}: ${highestFloor}`,
    );
  }
}
