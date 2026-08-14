import {
  EXPEDITION_STAGE_CONFIGS,
  getExpeditionStageConfig,
  type ExpeditionStageId,
} from "../config/expedition";
import { decimal } from "../decimal";
import type { BigNumberString } from "../types";

export type ExpeditionStageStatus =
  | "cleared"
  | "locked"
  | "underpowered"
  | "ready";

export interface ExpeditionStageEvaluation {
  readonly status: ExpeditionStageStatus;
  readonly powerDeficit: BigNumberString;
}

export type ExpeditionSweepStatus = "locked" | "underpowered" | "ready";

export interface ExpeditionSweepEvaluation {
  readonly status: ExpeditionSweepStatus;
  readonly powerDeficit: BigNumberString;
}

export interface ExpeditionSweepCount {
  readonly stageConfigId: ExpeditionStageId;
  readonly count: number;
}

export function evaluateExpeditionStage(
  stageId: string,
  clearedStageIds: readonly ExpeditionStageId[],
  totalPower: BigNumberString,
): ExpeditionStageEvaluation {
  const stage = getExpeditionStageConfig(stageId);
  const stageIndex = EXPEDITION_STAGE_CONFIGS.findIndex(
    (candidate) => candidate.id === stage.id,
  );
  if (stageIndex < clearedStageIds.length) {
    return { status: "cleared", powerDeficit: "0" };
  }
  if (stageIndex > clearedStageIds.length) {
    return { status: "locked", powerDeficit: "0" };
  }

  const power = decimal(totalPower);
  const required = decimal(stage.requiredPower);
  if (power.lessThan(required)) {
    return {
      status: "underpowered",
      powerDeficit: required.minus(power).toFixed(0),
    };
  }
  return { status: "ready", powerDeficit: "0" };
}

export function evaluateExpeditionSweep(
  stageId: string,
  clearedStageIds: readonly ExpeditionStageId[],
  totalPower: BigNumberString,
): ExpeditionSweepEvaluation {
  const stage = getExpeditionStageConfig(stageId);
  if (!clearedStageIds.includes(stage.id)) {
    return { status: "locked", powerDeficit: "0" };
  }

  const power = decimal(totalPower);
  const required = decimal(stage.requiredPower);
  if (power.lessThan(required)) {
    return {
      status: "underpowered",
      powerDeficit: required.minus(power).toFixed(0),
    };
  }
  return { status: "ready", powerDeficit: "0" };
}

export function getExpeditionSweepCount(
  sweepCounts: readonly ExpeditionSweepCount[],
  stageId: string,
): number {
  return sweepCounts.find((entry) => entry.stageConfigId === stageId)?.count ?? 0;
}
