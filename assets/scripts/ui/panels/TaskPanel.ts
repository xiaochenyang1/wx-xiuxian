import { getNewcomerTaskConfig, type BootstrapSnapshot } from "@cultivation-diary/shared";
import { formatLargeNumber } from "../../core/ClientNumber";
import type { AppState } from "../../core/ClientTypes";
import { COLORS } from "../primitives/Colors";
import { addLabel, drawBand } from "../primitives/Draw";
import { HorizontalTextAlignment, Node } from "cc";

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
}

export function getNewcomerTaskDisplay(
  task: BootstrapSnapshot["newcomerTasks"][number],
): NewcomerTaskDisplay {
  let config: ReturnType<typeof getNewcomerTaskConfig>;
  try {
    config = getNewcomerTaskConfig(task.taskConfigId);
  } catch {
    // A stale or unknown config must remain renderable until the next sync.
  }

  const current = formatLargeNumber(task.progress);
  const target = config ? String(config.targetLevel) : "?";
  const claimed = task.claimedAt !== null;
  const completed = claimed || task.completedAt !== null;
  const rewardLabel = config
    ? config.rewardLabel ?? "无额外奖励"
    : "奖励信息不可用";

  return {
    title: config?.title ?? "未知修行任务",
    description: config?.description ?? "任务配置暂不可用",
    current,
    target,
    progressText: `进度 ${current} / ${target}`,
    statusText: completed ? "已完成" : "进行中",
    rewardText: claimed
      ? `已自动发放：${rewardLabel}`
      : `奖励：${rewardLabel}`,
    completed,
    claimed,
  };
}

export function drawTaskPanel(overlay: Node, state: Readonly<AppState>): void {
  const tasks = state.bootstrap!.newcomerTasks.slice(0, 3);
  drawBand(overlay, "TaskIntro", 0, 340, 600, 110, COLORS.inkGreen);
  addLabel(overlay, "新手修行录", -170, 358, 240, 38, 22, COLORS.gold, true);
  addLabel(overlay, "里程碑与奖励会自动写入本地存档", 25, 319, 500, 32, 16, COLORS.textMuted);
  if (tasks.length === 0) {
    addLabel(overlay, "暂无修行任务", 0, 190, 520, 44, 21, COLORS.text);
    return;
  }
  tasks.forEach((task, index) => {
    const display = getNewcomerTaskDisplay(task);
    const y = 205 - index * 166;
    drawBand(overlay, `Task-${index}`, 0, y, 600, 148, COLORS.panel);
    addLabel(
      overlay,
      display.title,
      -145,
      y + 46,
      280,
      32,
      18,
      COLORS.text,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      display.statusText,
      205,
      y + 46,
      130,
      32,
      16,
      display.completed ? COLORS.gold : COLORS.jade,
      true,
      1,
      HorizontalTextAlignment.RIGHT,
      "fixed",
    );
    addLabel(
      overlay,
      display.description,
      0,
      y + 9,
      540,
      30,
      15,
      COLORS.textMuted,
      false,
      1,
      HorizontalTextAlignment.LEFT,
      "fixed",
    );
    addLabel(
      overlay,
      display.progressText,
      -165,
      y - 38,
      210,
      30,
      15,
      display.completed ? COLORS.textMuted : COLORS.jade,
      true,
      1,
      HorizontalTextAlignment.LEFT,
      "fixed",
    );
    addLabel(
      overlay,
      display.rewardText,
      112,
      y - 38,
      316,
      30,
      15,
      display.claimed ? COLORS.gold : COLORS.textMuted,
      false,
      1,
      HorizontalTextAlignment.RIGHT,
      "fixed",
    );
  });
}
