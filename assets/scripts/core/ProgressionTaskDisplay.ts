import {
  getItemConfig,
  getProgressionTaskConfig,
  progressionTaskTarget,
  type BootstrapSnapshot,
  type ProgressionTaskConfig,
} from "@cultivation-diary/shared";
import { formatLargeNumber } from "./ClientNumber";

/** Rows the panel has room for; the rail badge counts the same window. */
export const VISIBLE_PROGRESSION_TASK_COUNT = 3;

export interface ProgressionTaskDisplay {
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

export function getProgressionTaskDisplay(
  task: BootstrapSnapshot["progressionTasks"][number],
): ProgressionTaskDisplay {
  const config = getProgressionTaskConfig(task.taskConfigId);
  const current = formatLargeNumber(task.progress);
  const target = config ? String(progressionTaskTarget(config)) : "?";
  const claimed = task.claimedAt !== null;
  const completed = claimed || task.completedAt !== null;
  const pendingReward = completed && !claimed && config?.reward != null;
  const label = config ? describeReward(config) : "奖励信息不可用";
  const rewardText = claimed
    ? `已自动发放：${label}`
    : pendingReward
      ? `等待行囊空间：${label}`
      : `奖励：${label}`;

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

/**
 * The chain runs to Lv.100 but the panel has room for three rows, so it shows a
 * window starting at the first task still worth looking at: one awaiting a bag
 * slot, or the next one not yet finished. Once everything is settled it holds on
 * the tail rather than going blank.
 */
export function selectVisibleProgressionTasks(
  tasks: readonly BootstrapSnapshot["progressionTasks"][number][],
  count: number,
): readonly BootstrapSnapshot["progressionTasks"][number][] {
  if (tasks.length <= count) return tasks;
  const firstOpen = tasks.findIndex((task) => !isSettled(task));
  const start =
    firstOpen === -1
      ? tasks.length - count
      : Math.min(firstOpen, tasks.length - count);
  return tasks.slice(start, start + count);
}

/**
 * The rail badge counts the same window the panel draws, not the whole chain:
 * with 22 milestones a raw "unfinished" tally would read 19 at Lv.1 and mean
 * nothing. Bounded by `count`, it reads as "rows waiting for you in there".
 */
export function countPendingProgressionTasks(
  tasks: readonly BootstrapSnapshot["progressionTasks"][number][],
  count: number,
): number {
  return selectVisibleProgressionTasks(tasks, count).filter(
    (task) => !isSettled(task),
  ).length;
}

/** Settled means nothing is left to happen: claimed, or complete with no reward. */
function isSettled(
  task: BootstrapSnapshot["progressionTasks"][number],
): boolean {
  const config = getProgressionTaskConfig(task.taskConfigId);
  return (
    task.claimedAt !== null ||
    (task.completedAt !== null && config?.reward == null)
  );
}

/** Built from the reward itself so the copy cannot drift from what is granted. */
function describeReward(config: ProgressionTaskConfig): string {
  const reward = config.reward;
  if (reward === null) return "无额外奖励";
  const parts: string[] = [];
  if (reward.spiritStone > 0) {
    parts.push(`灵石 ×${formatLargeNumber(String(reward.spiritStone))}`);
  }
  for (const item of reward.items) {
    parts.push(`${getItemConfig(item.itemConfigId).displayName} ×${item.quantity}`);
  }
  return parts.length > 0 ? parts.join("、") : "无额外奖励";
}
