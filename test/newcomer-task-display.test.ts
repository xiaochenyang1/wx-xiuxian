import {
  NEWCOMER_REACH_LEVEL_3_TASK_ID,
  NEWCOMER_REACH_LEVEL_8_TASK_ID,
  type BootstrapSnapshot,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { getNewcomerTaskDisplay } from "../assets/scripts/core/NewcomerTaskDisplay";

type NewcomerTask = BootstrapSnapshot["newcomerTasks"][number];

function task(overrides: Partial<NewcomerTask> = {}): NewcomerTask {
  return {
    taskConfigId: NEWCOMER_REACH_LEVEL_3_TASK_ID,
    progress: "1",
    completedAt: null,
    claimedAt: null,
    ...overrides,
  };
}

describe("newcomer task display", () => {
  it("shows an incomplete task as in progress", () => {
    expect(getNewcomerTaskDisplay(task({ progress: "2" }))).toEqual({
      title: "修炼至 Lv.3",
      description: "提升等级至 Lv.3",
      current: "2",
      target: "3",
      progressText: "进度 2 / 3",
      statusText: "进行中",
      rewardText: "奖励：无额外奖励",
      completed: false,
      claimed: false,
      pendingReward: false,
    });
  });

  it("shows a completed task without a reward as complete", () => {
    const display = getNewcomerTaskDisplay(
      task({
        progress: "3",
        completedAt: "2026-08-14T08:00:00.000Z",
      }),
    );

    expect(display).toMatchObject({
      statusText: "已完成",
      rewardText: "奖励：无额外奖励",
      completed: true,
      claimed: false,
      pendingReward: false,
    });
  });

  it("shows a completed reward task as pending while its reward waits for space", () => {
    const display = getNewcomerTaskDisplay(
      task({
        taskConfigId: NEWCOMER_REACH_LEVEL_8_TASK_ID,
        progress: "8",
        completedAt: "2026-08-14T08:00:00.000Z",
      }),
    );

    expect(display).toMatchObject({
      statusText: "待发放",
      rewardText: "等待行囊空间：突破丹 ×1",
      completed: true,
      claimed: false,
      pendingReward: true,
    });
  });

  it("shows an issued reward as claimed and complete", () => {
    const display = getNewcomerTaskDisplay(
      task({
        taskConfigId: NEWCOMER_REACH_LEVEL_8_TASK_ID,
        progress: "8",
        completedAt: "2026-08-14T08:00:00.000Z",
        claimedAt: "2026-08-14T08:01:00.000Z",
      }),
    );

    expect(display).toMatchObject({
      statusText: "已完成",
      rewardText: "已自动发放：突破丹 ×1",
      completed: true,
      claimed: true,
      pendingReward: false,
    });
  });

  it("keeps an unknown task configuration renderable", () => {
    expect(
      getNewcomerTaskDisplay(
        task({ taskConfigId: "removed.task" as never, progress: "12345" }),
      ),
    ).toEqual({
      title: "未知修行任务",
      description: "任务配置暂不可用",
      current: "1.23万",
      target: "?",
      progressText: "进度 1.23万 / ?",
      statusText: "进行中",
      rewardText: "奖励：奖励信息不可用",
      completed: false,
      claimed: false,
      pendingReward: false,
    });
  });
});
