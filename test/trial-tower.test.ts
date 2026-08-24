import {
  TRIAL_TOWER_MAX_FLOOR,
  TRIAL_TOWER_UNLOCK_LEVEL,
  decimal,
  evaluateTrialFloor,
  isTrialTowerCleared,
  trialFloorRequiredPower,
  trialFloorRewards,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");

type MutableSave = Record<string, any>;

afterEach(() => vi.useRealTimers());

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

/** A save parked at `level` with an empty bar, so the climb starts from rest. */
function seedClimber(
  level: number,
  mutate?: (save: MutableSave) => void,
): { service: LocalGameService; platform: FakePlatformAdapter } {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  const platform = new FakePlatformAdapter();
  const seeder = new LocalGameService(platform);
  seeder.initialize(START);
  const raw = platform.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected an initial save");
  const save = JSON.parse(raw) as MutableSave;
  save.savedAt = START.toISOString();
  save.snapshot.progress.settledAt = START.toISOString();
  save.snapshot.progress.level = level;
  save.snapshot.progress.experience = "0";
  save.snapshot.progress.status = "gaining";
  mutate?.(save);
  const reader = new FakePlatformAdapter();
  reader.seed(SAVE_KEY, save);
  const service = new LocalGameService(reader);
  expect(service.initialize(START).created).toBe(false);
  return { service, platform: reader };
}

function climberAt(
  level: number,
  mutate?: (save: MutableSave) => void,
): LocalGameService {
  return seedClimber(level, mutate).service;
}

function quantityOf(service: LocalGameService, itemConfigId: string): string {
  return (
    service.snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === itemConfigId,
    )?.quantity ?? "0"
  );
}

/** 50 bag slots occupied by gear, leaving no room for a new stack. */
function fullBagEquipment(): MutableSave[] {
  return Array.from({ length: 50 }, (_, index) => ({
    id: `full-bag-${index}`,
    equipmentConfigId: "ironwood_sword",
    displayName: "玄木剑",
    quality: "common",
    slot: "weapon",
    powerBonusBp: 0,
    enhanceLevel: 0,
    rolledAffixes: [],
    location: "bag",
    equippedSlot: null,
    isLocked: false,
    configVersion: "local-idle-drop-v1",
  }));
}

describe("climbing the trial tower", () => {
  it("refuses the tower until its own unlock level", () => {
    const early = climberAt(TRIAL_TOWER_UNLOCK_LEVEL - 1);

    expect(early.snapshot.unlocks.trialTower).toBe(false);
    expect(() => early.challengeTrialTower(1)).toThrow(
      `Lv.${TRIAL_TOWER_UNLOCK_LEVEL}`,
    );
    expect(early.snapshot.trialTower.highestFloor).toBe(0);
  });

  it("accepts only the next floor and never the same one twice", () => {
    const service = climberAt(TRIAL_TOWER_UNLOCK_LEVEL);

    expect(() => service.challengeTrialTower(2)).toThrow("需先通过第 1 层");
    service.challengeTrialTower(1);
    expect(service.snapshot.trialTower.highestFloor).toBe(1);
    expect(() => service.challengeTrialTower(1)).toThrow("已经通过");
    expect(() => service.challengeTrialTower(3)).toThrow("需先通过第 2 层");
    expect(service.snapshot.trialTower.highestFloor).toBe(1);
  });

  it("rejects a floor outside the tower", () => {
    const service = climberAt(TRIAL_TOWER_UNLOCK_LEVEL);

    expect(() => service.challengeTrialTower(0)).toThrow("未知的试炼塔层数");
    expect(() => service.challengeTrialTower(TRIAL_TOWER_MAX_FLOOR + 1)).toThrow(
      "未知的试炼塔层数",
    );
    expect(() => service.challengeTrialTower(1.5)).toThrow("未知的试炼塔层数");
  });

  it("charges nothing and grants nothing when power falls short", () => {
    const service = climberAt(TRIAL_TOWER_UNLOCK_LEVEL);
    service.challengeTrialTower(1);
    const before = JSON.stringify({
      inventory: service.snapshot.inventory,
      wallet: service.snapshot.wallet,
      trialTower: service.snapshot.trialTower,
    });

    // A bare Lv.15 character sits at exactly 3,000 power: floor one lands on the
    // nose and floor two needs gear, so this is the wall a new climber hits.
    expect(service.snapshot.progress.totalPower).toBe("3000");
    expect(() => service.challengeTrialTower(2)).toThrow("战力不足，还需 540");
    expect(
      JSON.stringify({
        inventory: service.snapshot.inventory,
        wallet: service.snapshot.wallet,
        trialTower: service.snapshot.trialTower,
      }),
    ).toBe(before);
  });

  it("rolls back the whole floor when the bag has no room for its loot", () => {
    const service = climberAt(TRIAL_TOWER_UNLOCK_LEVEL, (save) => {
      save.snapshot.inventory = { bagCapacity: 50, stacks: [] };
      save.snapshot.equipment = fullBagEquipment();
    });
    const stones = service.snapshot.wallet.spiritStone;

    expect(() => service.challengeTrialTower(1)).toThrow("行囊空间不足");
    expect(service.snapshot.trialTower.highestFloor).toBe(0);
    expect(service.snapshot.wallet.spiritStone).toBe(stones);
    expect(quantityOf(service, "enhance_stone")).toBe("0");
  });

  it("pays the configured loot for each floor it clears", () => {
    const service = climberAt(40);
    // The level milestones this save has already passed settle on the first
    // tick, so take the baseline after they have paid: only the tower's own loot
    // should move these counters afterwards.
    service.checkpoint(new Date(START.getTime() + 1_000));
    const before = {
      stones: decimal(service.snapshot.wallet.spiritStone),
      enhance: decimal(quantityOf(service, "enhance_stone")),
      pages: decimal(quantityOf(service, "technique_page")),
      tokens: decimal(quantityOf(service, "treasure_token")),
    };

    let stones = decimal(0);
    let enhance = 0;
    let pages = 0;
    let tokens = 0;
    for (let floor = 1; floor <= 5; floor += 1) {
      const rewards = trialFloorRewards(floor);
      service.challengeTrialTower(floor);
      stones = stones.plus(rewards.spiritStone);
      for (const item of rewards.itemRewards) {
        if (item.itemConfigId === "enhance_stone") enhance += item.quantity;
        if (item.itemConfigId === "technique_page") pages += item.quantity;
        if (item.itemConfigId === "treasure_token") tokens += item.quantity;
      }
    }

    expect(service.snapshot.trialTower.highestFloor).toBe(5);
    expect(quantityOf(service, "enhance_stone")).toBe(
      before.enhance.plus(enhance).toFixed(0),
    );
    expect(quantityOf(service, "technique_page")).toBe(
      before.pages.plus(pages).toFixed(0),
    );
    // Only floor five pays tokens across the first five floors.
    expect(tokens).toBe(2);
    expect(quantityOf(service, "treasure_token")).toBe(
      before.tokens.plus(tokens).toFixed(0),
    );
    expect(decimal(service.snapshot.wallet.spiritStone).greaterThanOrEqualTo(
      before.stones.plus(stones),
    )).toBe(true);
  });

  it("keeps the climb across a reload", () => {
    const { service, platform } = seedClimber(40);
    service.challengeTrialTower(1);
    service.challengeTrialTower(2);

    const reloaded = new LocalGameService(platform);
    expect(reloaded.initialize(START).created).toBe(false);

    // The floor is stored, not re-derived from power, so the same loadout that
    // cleared floor two cannot walk back down and collect it a second time.
    expect(reloaded.snapshot.trialTower.highestFloor).toBe(2);
    expect(() => reloaded.challengeTrialTower(2)).toThrow("已经通过");
  });
});
