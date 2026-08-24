import type { AppState } from "../../core/ClientTypes";
import {
  getProgressionTaskDisplay,
  selectVisibleProgressionTasks,
  VISIBLE_PROGRESSION_TASK_COUNT,
} from "../../core/ProgressionTaskDisplay";
import { COLORS } from "../primitives/Colors";
import { addLabel, drawBand } from "../primitives/Draw";
import { HorizontalTextAlignment, Node } from "cc";

export function drawTaskPanel(overlay: Node, state: Readonly<AppState>): void {
  const tasks = selectVisibleProgressionTasks(
    state.bootstrap!.progressionTasks,
    VISIBLE_PROGRESSION_TASK_COUNT,
  );
  drawBand(overlay, "TaskIntro", 0, 340, 600, 110, COLORS.inkGreen);
  addLabel(overlay, "修行录", -170, 358, 240, 38, 22, COLORS.gold, true);
  addLabel(overlay, "里程碑与奖励会自动写入本地存档", 25, 319, 500, 32, 16, COLORS.textMuted);
  if (tasks.length === 0) {
    addLabel(overlay, "暂无修行任务", 0, 190, 520, 44, 21, COLORS.text);
    return;
  }
  tasks.forEach((task, index) => {
    const display = getProgressionTaskDisplay(task);
    const statusColor =
      display.completed && !display.pendingReward ? COLORS.gold : COLORS.jade;
    const rewardColor = display.claimed
      ? COLORS.gold
      : display.pendingReward
        ? COLORS.jade
        : COLORS.textMuted;
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
      statusColor,
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
      rewardColor,
      false,
      1,
      HorizontalTextAlignment.RIGHT,
      "fixed",
    );
  });
}
