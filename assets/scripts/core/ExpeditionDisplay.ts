import {
  evaluateExpeditionStage,
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
  return `已通关 ${snapshot.expedition.clearedStageIds.length} 关 · 当前战力 ${formatLargeNumber(snapshot.progress.totalPower)}`;
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
    cleared: { statusText: "首通完成", actionText: "已完成", actionEnabled: false },
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
    rewardText: formatExpeditionReward(config),
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
