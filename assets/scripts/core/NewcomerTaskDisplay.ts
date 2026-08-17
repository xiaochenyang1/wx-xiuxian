import {
  getNewcomerTaskConfig,
  type BootstrapSnapshot,
} from "@cultivation-diary/shared";
import { formatLargeNumber } from "./ClientNumber";

export interface NewcomerTaskDisplay {
  readonly title: string;
  readonly description: string;
  readonly current: string;
  readonly target: string;
  readonly progressText: string;
  readonly statusText: string;
  readonly rewardText: string;
  readonly completed: boolean;
  readonly claimed: boolean;
  readonly pendingReward: boolean;
}

export function getNewcomerTaskDisplay(
  task: BootstrapSnapshot["newcomerTasks"][number],
): NewcomerTaskDisplay {
  const config = getNewcomerTaskConfig(task.taskConfigId);
  const current = formatLargeNumber(task.progress);
  const target = config ? String(config.targetLevel) : "?";
  const claimed = task.claimedAt !== null;
  const completed = claimed || task.completedAt !== null;
  const pendingReward = completed && !claimed && config?.rewardLabel != null;
  const rewardLabel = config
    ? config.rewardLabel ?? "无额外奖励"
    : "奖励信息不可用";
  const rewardText = claimed
    ? `已自动发放：${rewardLabel}`
    : pendingReward
      ? `等待行囊空间：${rewardLabel}`
      : `奖励：${rewardLabel}`;

  return {
    title: config?.title ?? "未知修行任务",
    description: config?.description ?? "任务配置暂不可用",
    current,
    target,
    progressText: `进度 ${current} / ${target}`,
    statusText: pendingReward ? "待发放" : completed ? "已完成" : "进行中",
    rewardText,
    completed,
    claimed,
    pendingReward,
  };
}
