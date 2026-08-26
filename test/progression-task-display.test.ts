import {
  NEWCOMER_REACH_LEVEL_3_TASK_ID,
  NEWCOMER_REACH_LEVEL_8_TASK_ID,
  PROGRESSION_TASK_CONFIGS,
  type BootstrapSnapshot,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import {
  countPendingProgressionTasks,
  getProgressionTaskDisplay,
  selectVisibleProgressionTasks,
  VISIBLE_PROGRESSION_TASK_COUNT,
} from "../assets/scripts/core/ProgressionTaskDisplay";

type ProgressionTask = BootstrapSnapshot["progressionTasks"][number];

function task(overrides: Partial<ProgressionTask> = {}): ProgressionTask {
  return {
    taskConfigId: NEWCOMER_REACH_LEVEL_3_TASK_ID,
    progress: "1",
    completedAt: null,
    claimedAt: null,
    ...overrides,
  };
}

/** A chain in its starting state: nothing completed, nothing claimed. */
function freshChain(): ProgressionTask[] {
  return PROGRESSION_TASK_CONFIGS.map((config) =>
    task({ taskConfigId: config.id, progress: "0" }),
  );
}

describe("progression task display", () => {
  it("shows an incomplete task as in progress", () => {
    expect(getProgressionTaskDisplay(task({ progress: "2" }))).toEqual({
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
    expect(
      getProgressionTaskDisplay(
        task({ progress: "3", completedAt: "2026-08-14T08:00:00.000Z" }),
      ),
    ).toMatchObject({
      statusText: "已完成",
      rewardText: "奖励：无额外奖励",
      completed: true,
      claimed: false,
      pendingReward: false,
    });
  });

  it("shows a completed reward task as pending while its reward waits for space", () => {
    expect(
      getProgressionTaskDisplay(
        task({
          taskConfigId: NEWCOMER_REACH_LEVEL_8_TASK_ID,
          progress: "8",
          completedAt: "2026-08-14T08:00:00.000Z",
        }),
      ),
    ).toMatchObject({
      statusText: "待发放",
      rewardText: "等待行囊空间：突破丹 ×1",
      completed: true,
      claimed: false,
      pendingReward: true,
    });
  });

  it("shows an issued reward as claimed and complete", () => {
    expect(
      getProgressionTaskDisplay(
        task({
          taskConfigId: NEWCOMER_REACH_LEVEL_8_TASK_ID,
          progress: "8",
          completedAt: "2026-08-14T08:00:00.000Z",
          claimedAt: "2026-08-14T08:01:00.000Z",
        }),
      ),
    ).toMatchObject({
      statusText: "已完成",
      rewardText: "已自动发放：突破丹 ×1",
      completed: true,
      claimed: true,
      pendingReward: false,
    });
  });

  it("describes a level milestone reward from its own configuration", () => {
    expect(
      getProgressionTaskDisplay(
        task({ taskConfigId: "progression.reach_level_20", progress: "12" }),
      ),
    ).toMatchObject({
      title: "修炼至 Lv.20",
      target: "20",
      rewardText: "奖励：灵石 ×1万、强化石 ×2",
    });
  });

  it("describes a tower milestone by its floor rather than a level", () => {
    expect(
      getProgressionTaskDisplay(
        task({ taskConfigId: "progression.trial_tower_floor_15", progress: "9" }),
      ),
    ).toMatchObject({
      title: "登临试炼塔第 15 层",
      current: "9",
      target: "15",
      rewardText: "奖励：经验丹（大） ×1、突破丹 ×1",
    });
  });

  it("keeps an unknown task configuration renderable", () => {
    expect(
      getProgressionTaskDisplay(
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

describe("progression task window", () => {
  it("starts at the head of an untouched chain", () => {
    const visible = selectVisibleProgressionTasks(
      freshChain(),
      VISIBLE_PROGRESSION_TASK_COUNT,
    );

    expect(visible.map((entry) => entry.taskConfigId)).toEqual(
      PROGRESSION_TASK_CONFIGS.slice(0, 3).map((config) => config.id),
    );
  });

  it("advances past settled rows to the next open task", () => {
    const tasks = freshChain();
    // The first three are the legacy opening tasks: two are pure markers and
    // the third pays out, so all three settle on completion.
    for (const index of [0, 1]) {
      tasks[index] = task({
        taskConfigId: tasks[index]!.taskConfigId,
        completedAt: "2026-08-14T08:00:00.000Z",
      });
    }
    tasks[2] = task({
      taskConfigId: tasks[2]!.taskConfigId,
      completedAt: "2026-08-14T08:00:00.000Z",
      claimedAt: "2026-08-14T08:00:00.000Z",
    });

    const visible = selectVisibleProgressionTasks(
      tasks,
      VISIBLE_PROGRESSION_TASK_COUNT,
    );

    expect(visible.map((entry) => entry.taskConfigId)).toEqual(
      PROGRESSION_TASK_CONFIGS.slice(3, 6).map((config) => config.id),
    );
  });

  it("holds on the tail instead of going blank once everything is settled", () => {
    const tasks = freshChain().map((entry) =>
      task({
        taskConfigId: entry.taskConfigId,
        completedAt: "2026-08-14T08:00:00.000Z",
        claimedAt: "2026-08-14T08:00:00.000Z",
      }),
    );

    const visible = selectVisibleProgressionTasks(
      tasks,
      VISIBLE_PROGRESSION_TASK_COUNT,
    );

    expect(visible).toHaveLength(3);
    expect(visible.map((entry) => entry.taskConfigId)).toEqual(
      PROGRESSION_TASK_CONFIGS.slice(-3).map((config) => config.id),
    );
    expect(countPendingProgressionTasks(tasks, VISIBLE_PROGRESSION_TASK_COUNT)).toBe(
      0,
    );
  });

  it("caps the rail badge at the window rather than tallying every milestone", () => {
    expect(PROGRESSION_TASK_CONFIGS.length).toBeGreaterThan(3);
    expect(
      countPendingProgressionTasks(freshChain(), VISIBLE_PROGRESSION_TASK_COUNT),
    ).toBe(3);
  });

  it("skips a settled row rather than letting it pin the window", () => {
    // The chain interleaves level and tower milestones, so a player who ignores
    // the tower leaves settled and open rows mixed together. An anchor on the
    // first open row would show that one plus the two settled rows behind it;
    // the panel instead collects the first three rows still worth looking at.
    const tasks = freshChain();
    const settle = (index: number) => {
      tasks[index] = task({
        taskConfigId: tasks[index]!.taskConfigId,
        completedAt: "2026-08-14T08:00:00.000Z",
        claimedAt: "2026-08-14T08:00:00.000Z",
      });
    };
    for (const index of [0, 1, 2, 3, 5]) settle(index);

    const visible = selectVisibleProgressionTasks(
      tasks,
      VISIBLE_PROGRESSION_TASK_COUNT,
    );

    expect(visible.map((entry) => entry.taskConfigId)).toEqual([
      PROGRESSION_TASK_CONFIGS[4]!.id,
      PROGRESSION_TASK_CONFIGS[6]!.id,
      PROGRESSION_TASK_CONFIGS[7]!.id,
    ]);
    expect(countPendingProgressionTasks(tasks, VISIBLE_PROGRESSION_TASK_COUNT)).toBe(
      3,
    );
  });

  it("keeps an unclaimed tower nudge visible without hiding what comes after it", () => {
    // The load-bearing case for skipping: a level task the chain places after an
    // unclimbed floor still reaches the panel, so the player can see the rewards
    // that keep arriving on their own.
    const tasks = freshChain().map((entry, index) =>
      index === 5
        ? task({ taskConfigId: entry.taskConfigId, progress: "0" })
        : task({
            taskConfigId: entry.taskConfigId,
            completedAt: "2026-08-14T08:00:00.000Z",
            claimedAt: "2026-08-14T08:00:00.000Z",
          }),
    );
    // Index 5 is the floor 1 milestone, the first tower row in the chain.
    expect(PROGRESSION_TASK_CONFIGS[5]!.id).toBe("progression.trial_tower_floor_1");

    const visible = selectVisibleProgressionTasks(
      tasks,
      VISIBLE_PROGRESSION_TASK_COUNT,
    );

    expect(visible.map((entry) => entry.taskConfigId)).toEqual([
      "progression.trial_tower_floor_1",
    ]);
  });
});
