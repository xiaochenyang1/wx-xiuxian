import {
  TRIAL_TOWER_MAX_FLOOR,
  TRIAL_TOWER_UNLOCK_LEVEL,
  type BootstrapSnapshot,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import {
  VISIBLE_TRIAL_FLOOR_COUNT,
  getTrialFloorDisplay,
  getTrialTowerSummary,
  selectVisibleTrialFloors,
} from "../assets/scripts/core/TrialTowerDisplay";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const FUTURE = new Date("2099-01-01T00:00:00.000Z");

/** A real snapshot with only the fields the tower panel reads moved by hand. */
function snapshotWith(
  highestFloor = 0,
  totalPower = "3000",
  unlocked = true,
): BootstrapSnapshot {
  const service = new LocalGameService(new FakePlatformAdapter());
  service.initialize(FUTURE);
  return {
    ...service.snapshot,
    unlocks: { ...service.snapshot.unlocks, trialTower: unlocked },
    trialTower: { highestFloor },
    progress: { ...service.snapshot.progress, totalPower },
  };
}

describe("trial tower summary", () => {
  it("names the next floor while the climb is unfinished", () => {
    expect(getTrialTowerSummary(snapshotWith(12))).toBe(
      `已登临 12/${TRIAL_TOWER_MAX_FLOOR} 层 · 战力 3,000 · 下一层第 13 层`,
    );
  });

  it("says the tower is done rather than pointing at floor 91", () => {
    expect(getTrialTowerSummary(snapshotWith(TRIAL_TOWER_MAX_FLOOR))).toContain(
      "全塔通关",
    );
  });

  it("names the unlock level while the tower is shut", () => {
    expect(getTrialTowerSummary(snapshotWith(0, "3000", false))).toContain(
      `需 Lv.${TRIAL_TOWER_UNLOCK_LEVEL} 开启`,
    );
  });
});

describe("the visible floor window", () => {
  it("starts at the next floor so the actionable rung is always on screen", () => {
    expect(selectVisibleTrialFloors(0)).toEqual([1, 2, 3, 4, 5]);
    expect(selectVisibleTrialFloors(12)).toEqual([13, 14, 15, 16, 17]);
  });

  it("slides back at the top so the last screen is still full", () => {
    expect(selectVisibleTrialFloors(TRIAL_TOWER_MAX_FLOOR - 1)).toEqual([
      86, 87, 88, 89, 90,
    ]);
    // Nothing is left to climb, yet the panel still draws a full window rather
    // than an empty page.
    expect(selectVisibleTrialFloors(TRIAL_TOWER_MAX_FLOOR)).toEqual([
      86, 87, 88, 89, 90,
    ]);
  });

  it("stays inside the tower from the ground floor to the top", () => {
    for (let highest = 0; highest <= TRIAL_TOWER_MAX_FLOOR; highest += 1) {
      const floors = selectVisibleTrialFloors(highest);
      expect(floors).toHaveLength(VISIBLE_TRIAL_FLOOR_COUNT);
      expect(floors[0]).toBeGreaterThanOrEqual(1);
      expect(floors[floors.length - 1]).toBeLessThanOrEqual(TRIAL_TOWER_MAX_FLOOR);
    }
  });
});

describe("a floor row", () => {
  it("enables the button only on the floor the player can actually clear", () => {
    const snapshot = snapshotWith(1, "3540");

    expect(getTrialFloorDisplay(snapshot, 1)).toMatchObject({
      status: "cleared",
      statusText: "已通过",
      actionEnabled: false,
    });
    expect(getTrialFloorDisplay(snapshot, 2)).toMatchObject({
      status: "ready",
      statusText: "可以挑战",
      actionText: "挑战",
      actionEnabled: true,
    });
    expect(getTrialFloorDisplay(snapshot, 3)).toMatchObject({
      status: "locked",
      statusText: "尚未开放",
      actionEnabled: false,
    });
  });

  it("shows the exact power still missing on the next floor", () => {
    const display = getTrialFloorDisplay(snapshotWith(1, "3000"), 2);

    expect(display.status).toBe("underpowered");
    expect(display.statusText).toBe("尚差 540 战力");
    // The button stays visible but dead: the tower never charges for a failed
    // attempt, so offering one would only teach the player to spam it.
    expect(display.actionEnabled).toBe(false);
  });

  it("names the floor, its power bar and its loot", () => {
    expect(getTrialFloorDisplay(snapshotWith(9), 10)).toMatchObject({
      floor: 10,
      titleText: "第 10 层",
      requirementText: "战力 1.33万",
      // Every fifth floor is the only place the tower pays a 寻宝令.
      rewardText: "灵石 4,436 · 强化石x6 · 功法残页x4 · 寻宝令x2",
    });
    expect(getTrialFloorDisplay(snapshotWith(8), 9).rewardText).not.toContain(
      "寻宝令",
    );
  });

  it("refuses the action while the tower itself is shut", () => {
    const display = getTrialFloorDisplay(snapshotWith(0, "999999", false), 1);

    expect(display.status).toBe("ready");
    expect(display.statusText).toBe(`需 Lv.${TRIAL_TOWER_UNLOCK_LEVEL}`);
    expect(display.actionEnabled).toBe(false);
  });
});
