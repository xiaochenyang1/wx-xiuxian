import {
  EXPEDITION_STAGE_CONFIGS,
  EXPEDITION_SWEEP_TOKEN_COST,
  evaluateExpeditionStage,
  getExpeditionSweepCount,
  getItemConfig,
  type BootstrapSnapshot,
  type ExpeditionStageConfig,
  type ExpeditionStageStatus,
} from "@cultivation-diary/shared";
import { formatLargeNumber } from "./ClientNumber";

export interface ExpeditionStageDisplay {
  readonly status: ExpeditionStageStatus;
  readonly requirementText: string;
  readonly rewardText: string;
  readonly statusText: string;
  readonly actionText: string;
  readonly actionEnabled: boolean;
}

export function getExpeditionSummary(snapshot: BootstrapSnapshot): string {
  const totalSweeps = snapshot.expedition.sweepCounts.reduce(
    (total, entry) => total + entry.count,
    0,
  );
  return `首通 ${snapshot.expedition.clearedStageIds.length}/${EXPEDITION_STAGE_CONFIGS.length} · 扫荡 ${formatLargeNumber(String(totalSweeps))} · 战力 ${formatLargeNumber(snapshot.progress.totalPower)}`;
}

/** How many stage rows the panel has vertical room for. */
export const VISIBLE_EXPEDITION_STAGE_COUNT = 6;

/**
 * The window *ends* at the next stage to clear, which is the opposite of the
 * tower's window. A cleared floor is dead, but a cleared stage is the thing the
 * player sweeps — and the richest sweep is always the one just unlocked, so the
 * rows worth keeping on screen are the recent history plus the next challenge.
 * Below six clears the window is the whole first screen, so the early game looks
 * exactly like it did before the campaign grew past one screen.
 */
export function selectVisibleExpeditionStages(
  clearedCount: number,
  count = VISIBLE_EXPEDITION_STAGE_COUNT,
): readonly ExpeditionStageConfig[] {
  const start = Math.min(
    Math.max(0, clearedCount - (count - 1)),
    Math.max(0, EXPEDITION_STAGE_CONFIGS.length - count),
  );
  return EXPEDITION_STAGE_CONFIGS.slice(start, start + count);
}

export function getExpeditionStageDisplay(
  snapshot: BootstrapSnapshot,
  config: ExpeditionStageConfig,
): ExpeditionStageDisplay {
  const evaluation = evaluateExpeditionStage(
    config.id,
    snapshot.expedition.clearedStageIds,
    snapshot.progress.totalPower,
  );
  const statusCopy: Record<
    ExpeditionStageStatus,
    Pick<ExpeditionStageDisplay, "statusText" | "actionText" | "actionEnabled">
  > = {
    cleared: {
      statusText: `已扫荡 ${formatLargeNumber(String(getExpeditionSweepCount(snapshot.expedition.sweepCounts, config.id)))} 次`,
      actionText: "扫荡",
      actionEnabled: true,
    },
    locked: { statusText: "前置未完成", actionText: "未解锁", actionEnabled: false },
    underpowered: {
      statusText: `尚差 ${formatLargeNumber(evaluation.powerDeficit)} 战力`,
      actionText: "尝试",
      actionEnabled: true,
    },
    ready: { statusText: "可以挑战", actionText: "挑战", actionEnabled: true },
  };
  return {
    status: evaluation.status,
    requirementText: `战力 ${formatLargeNumber(config.requiredPower)}`,
    rewardText:
      evaluation.status === "cleared"
        ? formatExpeditionSweepReward(config)
        : formatExpeditionReward(config),
    ...statusCopy[evaluation.status],
  };
}

function formatExpeditionReward(config: ExpeditionStageConfig): string {
  const items = config.itemRewards
    .map(
      (reward) =>
        `${getItemConfig(reward.itemConfigId).displayName}x${reward.quantity}`,
    )
    .join(" · ");
  return `灵石 ${formatLargeNumber(config.spiritStoneReward)} · ${items}`;
}

function formatExpeditionSweepReward(config: ExpeditionStageConfig): string {
  const items = config.sweepItemRewards
    .map(
      (reward) =>
        `${getItemConfig(reward.itemConfigId).displayName}x${reward.quantity}`,
    )
    .join(" · ");
  return `耗寻宝令x${EXPEDITION_SWEEP_TOKEN_COST} · 灵石 ${formatLargeNumber(config.sweepSpiritStoneReward)} · ${items}`;
}
