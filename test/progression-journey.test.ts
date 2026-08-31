import {
  NEWCOMER_REACH_LEVEL_3_TASK_ID,
  NEWCOMER_REACH_LEVEL_5_TASK_ID,
  NEWCOMER_REACH_LEVEL_8_TASK_ID,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date("2026-01-01T00:00:00.000Z");

afterEach(() => vi.useRealTimers());

describe("new player progression journey", () => {
  it("carries a save from Lv.1 through the first breakthrough and unlocks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);

    const platform = new FakePlatformAdapter();
    const service = new LocalGameService(platform);
    const created = service.initialize(START);
    const playerId = created.snapshot.player.id;
    const accountId = created.snapshot.account.id;

    expect(service.snapshot.progress.level).toBe(1);
    expect(service.snapshot.progress.status).toBe("gaining");

    for (let level = 1; level < 10; level += 1) {
      const result = service.debugGrant("fill_experience");
      expect(result.snapshot.progress.level).toBe(level + 1);
      expect(result.snapshot.progress.status).toBe("gaining");
    }

    service.debugGrant("fill_experience");

    expect(service.snapshot.progress.level).toBe(10);
    expect(service.snapshot.progress.status).toBe("breakthrough_ready");

    const task3 = service.snapshot.progressionTasks.find(
      (task) => task.taskConfigId === NEWCOMER_REACH_LEVEL_3_TASK_ID,
    );
    const task5 = service.snapshot.progressionTasks.find(
      (task) => task.taskConfigId === NEWCOMER_REACH_LEVEL_5_TASK_ID,
    );
    const task8 = service.snapshot.progressionTasks.find(
      (task) => task.taskConfigId === NEWCOMER_REACH_LEVEL_8_TASK_ID,
    );
    expect(task3?.progress).toBe("3");
    expect(task3?.completedAt).not.toBeNull();
    expect(task5?.progress).toBe("5");
    expect(task5?.completedAt).not.toBeNull();
    expect(task8?.progress).toBe("8");
    expect(task8?.completedAt).not.toBeNull();
    expect(task8?.claimedAt).not.toBeNull();
    expect(
      service.snapshot.inventory.stacks.find(
        (stack) => stack.itemConfigId === "breakthrough_pill",
      )?.quantity,
    ).toBe("1");

    service.breakthrough();

    expect(service.snapshot.progress.level).toBe(11);
    expect(service.snapshot.progress.status).toBe("gaining");
    // Lv.11 opens the cave alone now; the tower waits for Lv.15 and the
    // partner for Lv.20, so the opening no longer dumps three systems at once.
    expect(service.snapshot.unlocks).toEqual({
      partner: false,
      cave: true,
      trialTower: false,
    });
    expect(
      service.snapshot.inventory.stacks.find(
        (stack) => stack.itemConfigId === "breakthrough_pill",
      ),
    ).toBeUndefined();

    const reloaded = new LocalGameService(platform);
    const restored = reloaded.initialize(START);
    expect(restored.created).toBe(false);
    expect(reloaded.snapshot.player.id).toBe(playerId);
    expect(reloaded.snapshot.account.id).toBe(accountId);
    expect(reloaded.snapshot.progress.level).toBe(11);
    expect(reloaded.snapshot.progress.status).toBe("gaining");
    expect(reloaded.snapshot.progressionTasks).toEqual(
      service.snapshot.progressionTasks,
    );
    expect(reloaded.snapshot.unlocks).toEqual({
      partner: false,
      cave: true,
      trialTower: false,
    });
  });
});
