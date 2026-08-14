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
