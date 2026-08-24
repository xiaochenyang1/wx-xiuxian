import {
  TRIAL_TOWER_MAX_FLOOR,
  decimal,
  evaluateTrialFloor,
  isTrialTowerCleared,
  trialFloorRequiredPower,
  trialFloorRewards,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";

/**
 * Verified against `decimal.js-light` at the repository's configured precision.
 * These are the calibration ruler from the midgame content design: suspect the
 * implementation before the number.
 */
const FLOORS = [
  { floor: 1, power: "3000", spiritStone: "1000", enhance: 1, pages: 1, tokens: 0 },
  { floor: 2, power: "3540", spiritStone: "1180", enhance: 2, pages: 1, tokens: 0 },
  { floor: 3, power: "4178", spiritStone: "1393", enhance: 2, pages: 2, tokens: 0 },
  { floor: 10, power: "13307", spiritStone: "4436", enhance: 6, pages: 4, tokens: 2 },
  { floor: 30, power: "364502", spiritStone: "121501", enhance: 16, pages: 11, tokens: 2 },
  { floor: 34, power: "706688", spiritStone: "235563", enhance: 18, pages: 12, tokens: 0 },
  {
    floor: 90,
    power: "7492381882",
    spiritStone: "2497460628",
    enhance: 46,
    pages: 31,
    tokens: 2,
  },
] as const;

function rewardQuantity(floor: number, itemConfigId: string): number {
  return (
    trialFloorRewards(floor).itemRewards.find(
      (reward) => reward.itemConfigId === itemConfigId,
    )?.quantity ?? 0
  );
}

describe("trial tower thresholds", () => {
  it("matches the verified power ladder", () => {
    for (const entry of FLOORS) {
      expect(trialFloorRequiredPower(entry.floor)).toBe(entry.power);
    }
  });

  it("grows strictly with every floor", () => {
    for (let floor = 2; floor <= TRIAL_TOWER_MAX_FLOOR; floor += 1) {
      expect(
        decimal(trialFloorRequiredPower(floor)).greaterThan(
          trialFloorRequiredPower(floor - 1),
        ),
      ).toBe(true);
    }
  });

  it("rejects floors outside 1..90", () => {
    expect(() => trialFloorRequiredPower(0)).toThrow(RangeError);
    expect(() => trialFloorRequiredPower(TRIAL_TOWER_MAX_FLOOR + 1)).toThrow(
      RangeError,
    );
    expect(() => trialFloorRequiredPower(1.5)).toThrow(RangeError);
    expect(() => trialFloorRewards(0)).toThrow(RangeError);
    expect(() => trialFloorRewards(TRIAL_TOWER_MAX_FLOOR + 1)).toThrow(RangeError);
  });
});

describe("trial tower rewards", () => {
  it("matches the verified reward table", () => {
    for (const entry of FLOORS) {
      expect(trialFloorRewards(entry.floor).spiritStone).toBe(entry.spiritStone);
      expect(rewardQuantity(entry.floor, "enhance_stone")).toBe(entry.enhance);
      expect(rewardQuantity(entry.floor, "technique_page")).toBe(entry.pages);
      expect(rewardQuantity(entry.floor, "treasure_token")).toBe(entry.tokens);
    }
  });

  it("pays treasure tokens only on multiples of five", () => {
    expect(rewardQuantity(4, "treasure_token")).toBe(0);
    expect(rewardQuantity(5, "treasure_token")).toBe(2);
    expect(rewardQuantity(6, "treasure_token")).toBe(0);
    // Reading the rule as "one per floor, two from floor five" would put the
    // tower alone above a full year of idle token production.
    let total = 0;
    for (let floor = 1; floor <= TRIAL_TOWER_MAX_FLOOR; floor += 1) {
      total += rewardQuantity(floor, "treasure_token");
    }
    expect(total).toBe(36);
  });

  it("omits the token entry entirely on floors that pay none", () => {
    expect(
      trialFloorRewards(4).itemRewards.map((reward) => reward.itemConfigId),
    ).toEqual(["enhance_stone", "technique_page"]);
  });

  it("pays 1,538,704 spirit stone across the 34 floors that cover Lv.100", () => {
    let total = decimal(0);
    for (let floor = 1; floor <= 34; floor += 1) {
      total = total.plus(trialFloorRewards(floor).spiritStone);
    }
    expect(total.toFixed(0)).toBe("1538704");
  });
});

describe("trial floor evaluation", () => {
  it("reports a cleared floor as cleared", () => {
    expect(evaluateTrialFloor(5, 5, "999999999")).toEqual({
      status: "cleared",
      powerDeficit: "0",
    });
    expect(evaluateTrialFloor(5, 1, "0").status).toBe("cleared");
  });

  it("locks every floor beyond the next one", () => {
    expect(evaluateTrialFloor(0, 2, "999999999")).toEqual({
      status: "locked",
      powerDeficit: "0",
    });
  });

  it("reports the exact deficit on the next floor", () => {
    expect(evaluateTrialFloor(2, 3, "3842")).toEqual({
      status: "underpowered",
      powerDeficit: "336",
    });
  });

  it("clears the next floor once power meets the threshold exactly", () => {
    expect(evaluateTrialFloor(0, 1, "3000")).toEqual({
      status: "ready",
      powerDeficit: "0",
    });
    expect(evaluateTrialFloor(1, 2, "3540").status).toBe("ready");
  });

  it("gates a starter loadout at Lv.15 to the first two floors", () => {
    // 3,842 is the Lv.15 starter total locked by loadout-power-model.test.ts.
    // Gear, not levels, is what gets a stuck player past floor three.
    expect(evaluateTrialFloor(0, 1, "3842").status).toBe("ready");
    expect(evaluateTrialFloor(1, 2, "3842").status).toBe("ready");
    expect(evaluateTrialFloor(2, 3, "3842").status).toBe("underpowered");
  });

  it("rejects a highest floor outside 0..90", () => {
    expect(() => evaluateTrialFloor(-1, 1, "3000")).toThrow(RangeError);
    expect(() => evaluateTrialFloor(TRIAL_TOWER_MAX_FLOOR + 1, 1, "3000")).toThrow(
      RangeError,
    );
  });

  it("knows when the whole tower is done", () => {
    expect(isTrialTowerCleared(0)).toBe(false);
    expect(isTrialTowerCleared(TRIAL_TOWER_MAX_FLOOR - 1)).toBe(false);
    expect(isTrialTowerCleared(TRIAL_TOWER_MAX_FLOOR)).toBe(true);
  });
});
