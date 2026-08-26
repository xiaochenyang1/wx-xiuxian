import {
  MAX_LEVEL,
  MIN_LEVEL,
  NEWCOMER_REACH_LEVEL_3_TASK_ID,
  NEWCOMER_REACH_LEVEL_5_TASK_ID,
  NEWCOMER_REACH_LEVEL_8_TASK_ID,
  PROGRESSION_TASK_CONFIGS,
  TRIAL_TOWER_MAX_FLOOR,
  TRIAL_TOWER_TASK_ACHIEVABLE_LEVELS,
  calculateTotalPower,
  getProgressionTaskConfig,
  getRealmConfigForLevel,
  progressionTaskTarget,
  trialFloorRequiredPower,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");

type MutableSave = Record<string, any>;

afterEach(() => vi.useRealTimers());

function seeded(mutate?: (save: MutableSave) => void): {
  service: LocalGameService;
  platform: FakePlatformAdapter;
} {
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
  save.snapshot.progress.experience = "0";
  save.snapshot.progress.status = "gaining";
  mutate?.(save);
  const reader = new FakePlatformAdapter();
  reader.seed(SAVE_KEY, save);
  const service = new LocalGameService(reader);
  expect(service.initialize(START).created).toBe(false);
  // Task state settles on the first checkpoint rather than at load, which is
  // what a running client does within its first tick.
  service.checkpoint(new Date(START.getTime() + 1_000));
  return { service, platform: reader };
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

function taskOf(service: LocalGameService, taskConfigId: string) {
  const task = service.snapshot.progressionTasks.find(
    (entry) => entry.taskConfigId === taskConfigId,
  );
  if (task === undefined) throw new Error(`missing task ${taskConfigId}`);
  return task;
}

function quantityOf(service: LocalGameService, itemConfigId: string): string {
  return (
    service.snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === itemConfigId,
    )?.quantity ?? "0"
  );
}

describe("progression task chain", () => {
  it("covers the whole climb with both kinds of condition", () => {
    const levels = PROGRESSION_TASK_CONFIGS.filter(
      (config) => config.condition.kind === "level",
    );
    const floors = PROGRESSION_TASK_CONFIGS.filter(
      (config) => config.condition.kind === "trial_tower_floor",
    );

    expect(levels.length).toBeGreaterThan(3);
    expect(floors.length).toBeGreaterThan(0);
    expect(levels.length + floors.length).toBe(PROGRESSION_TASK_CONFIGS.length);
    // Ids are unique and every reward names a real item, so a grant can never
    // fail on a lookup at run time.
    expect(new Set(PROGRESSION_TASK_CONFIGS.map((config) => config.id)).size).toBe(
      PROGRESSION_TASK_CONFIGS.length,
    );
    expect(
      Math.max(...levels.map((config) => progressionTaskTarget(config))),
    ).toBe(1000);
    // Both endpoints sit on their own system's real endpoint: the level cap and
    // the top of the tower, not somewhere in the first few percent of the climb.
    expect(
      Math.max(...floors.map((config) => progressionTaskTarget(config))),
    ).toBe(TRIAL_TOWER_MAX_FLOOR);
  });

  it("orders the chain by the level each milestone becomes reachable at", () => {
    // The table in the config is hand-written so the order stays auditable, so
    // rederive every entry here: bare power where it can reach the floor at all,
    // a full loadout otherwise. A power change makes this fail instead of
    // quietly leaving the chain sorted by a stale ladder.
    const FULL_LOADOUT_BP = 71774;
    const firstLevelClearing = (floor: number, bonusBp: number): number | null => {
      const threshold = BigInt(trialFloorRequiredPower(floor));
      for (let level = MIN_LEVEL; level <= MAX_LEVEL; level += 1) {
        if (BigInt(calculateTotalPower(level, { percentBonusBp: bonusBp })) >= threshold) {
          return level;
        }
      }
      return null;
    };

    for (const [floor, declared] of Object.entries(
      TRIAL_TOWER_TASK_ACHIEVABLE_LEVELS,
    )) {
      const bare = firstLevelClearing(Number(floor), 0);
      expect(bare ?? firstLevelClearing(Number(floor), FULL_LOADOUT_BP), floor).toBe(
        declared,
      );
    }
    // Floors 80 and 90 are the two the tower only ever opens to gear: no level,
    // not even the cap, clears them bare.
    expect(firstLevelClearing(80, 0)).toBeNull();
    expect(firstLevelClearing(90, 0)).toBeNull();
    expect(firstLevelClearing(70, 0)).not.toBeNull();

    const keyOf = (config: (typeof PROGRESSION_TASK_CONFIGS)[number]): number =>
      config.condition.kind === "level"
        ? config.condition.level
        : TRIAL_TOWER_TASK_ACHIEVABLE_LEVELS[config.condition.floor]!;
    // The opening three are a hard prefix; everything after them is sorted, so
    // level and tower rows alternate instead of arriving in two blocks.
    const keys = PROGRESSION_TASK_CONFIGS.slice(3).map(keyOf);
    expect(keys).toEqual([...keys].sort((left, right) => left - right));
    expect(PROGRESSION_TASK_CONFIGS.slice(0, 3).map((config) => config.id)).toEqual([
      NEWCOMER_REACH_LEVEL_3_TASK_ID,
      NEWCOMER_REACH_LEVEL_5_TASK_ID,
      NEWCOMER_REACH_LEVEL_8_TASK_ID,
    ]);
    const kinds = PROGRESSION_TASK_CONFIGS.map((config) => config.condition.kind);
    expect(kinds.lastIndexOf("level")).toBeGreaterThan(
      kinds.indexOf("trial_tower_floor"),
    );
  });

  it("stops paying breakthrough pills where a breakthrough no longer costs any", () => {
    for (const config of PROGRESSION_TASK_CONFIGS) {
      if (config.condition.kind !== "trial_tower_floor") continue;
      const pill = config.reward?.items.find(
        (item) => item.itemConfigId === "breakthrough_pill",
      );
      const realm = getRealmConfigForLevel(
        TRIAL_TOWER_TASK_ACHIEVABLE_LEVELS[config.condition.floor]!,
      );
      // A pill is only worth granting while the realm the achiever is standing
      // in still charges for a breakthrough. 真仙期 charges nothing, so the top
      // floors pay experience pills instead of dead weight.
      if (pill !== undefined) {
        expect(realm.breakthroughPillCost, config.id).not.toBeNull();
      }
    }
    expect(
      getProgressionTaskConfig("progression.trial_tower_floor_60")?.reward?.items,
    ).toEqual([
      { itemConfigId: "exp_pill_large", quantity: 4 },
      { itemConfigId: "breakthrough_pill", quantity: 1 },
    ]);
    expect(
      getProgressionTaskConfig("progression.trial_tower_floor_90")?.reward?.items,
    ).toEqual([{ itemConfigId: "exp_pill_large", quantity: 7 }]);
  });

  it("settles every level milestone the save has already passed", () => {
    const { service } = seeded((save) => {
      save.snapshot.progress.level = 30;
    });

    for (const config of PROGRESSION_TASK_CONFIGS) {
      if (config.condition.kind !== "level") continue;
      const task = taskOf(service, config.id);
      if (config.condition.level <= 30) {
        expect(task.completedAt, config.id).not.toBeNull();
        expect(task.progress, config.id).toBe(String(config.condition.level));
        if (config.reward !== null) {
          expect(task.claimedAt, config.id).not.toBeNull();
        }
      } else {
        expect(task.completedAt, config.id).toBeNull();
        expect(task.progress, config.id).toBe("30");
      }
    }
  });

  it("tracks tower milestones against the cleared floor, not the level", () => {
    const { service } = seeded((save) => {
      save.snapshot.progress.level = 30;
      save.snapshot.trialTower = { highestFloor: 10 };
    });

    const cleared = taskOf(service, "progression.trial_tower_floor_10");
    const ahead = taskOf(service, "progression.trial_tower_floor_15");

    expect(cleared.progress).toBe("10");
    expect(cleared.completedAt).not.toBeNull();
    expect(cleared.claimedAt).not.toBeNull();
    // A Lv.30 character with an unclimbed floor 15 gets nothing for it: the
    // condition is the floor, so levelling cannot substitute for the climb.
    expect(ahead.progress).toBe("10");
    expect(ahead.completedAt).toBeNull();
    expect(ahead.claimedAt).toBeNull();
  });

  it("pays a level milestone in both spirit stone and items", () => {
    const config = getProgressionTaskConfig("progression.reach_level_20");
    if (config?.reward == null) throw new Error("expected a rewarded milestone");
    const { service } = seeded((save) => {
      save.snapshot.progress.level = 20;
    });

    expect(taskOf(service, config.id).claimedAt).not.toBeNull();
    expect(Number(service.snapshot.wallet.spiritStone)).toBeGreaterThanOrEqual(
      config.reward.spiritStone,
    );
    for (const item of config.reward.items) {
      expect(Number(quantityOf(service, item.itemConfigId))).toBeGreaterThanOrEqual(
        item.quantity,
      );
    }
  });

  it("does not pay the same milestone twice across reloads", () => {
    const { service, platform } = seeded((save) => {
      save.snapshot.progress.level = 20;
    });
    const stones = service.snapshot.wallet.spiritStone;
    const stones20 = quantityOf(service, "enhance_stone");

    service.checkpoint(new Date(START.getTime() + 1_000));
    const reloaded = new LocalGameService(platform);
    expect(reloaded.initialize(START).created).toBe(false);
    reloaded.checkpoint(new Date(START.getTime() + 2_000));

    // Idle income moves the wallet, so compare the enhance stones, which only
    // the milestone grants at this point in the game.
    expect(quantityOf(reloaded, "enhance_stone")).toBe(stones20);
    expect(Number(reloaded.snapshot.wallet.spiritStone)).toBeGreaterThanOrEqual(
      Number(stones),
    );
  });

  it("completes a tower milestone the moment the floor is cleared", () => {
    // Lv.40 so power is not the binding constraint, and the floor 5 milestone is
    // the first one the chain places inside a reachable climb.
    const { service } = seeded((save) => {
      save.snapshot.progress.level = 40;
    });
    const milestone = () => taskOf(service, "progression.trial_tower_floor_5");
    expect(milestone().completedAt).toBeNull();

    for (let floor = 1; floor <= 5; floor += 1) {
      service.challengeTrialTower(floor);
    }

    // No checkpoint in between: clearing the floor is itself a mutation, so the
    // milestone settles in the same tick rather than on the next tick of idle time.
    expect(milestone().progress).toBe("5");
    expect(milestone().completedAt).not.toBeNull();
    expect(milestone().claimedAt).not.toBeNull();
  });

  it("holds a whole reward when the bag is full and pays it once a slot frees up", () => {
    const { service, platform } = seeded((save) => {
      save.snapshot.progress.level = 20;
      save.snapshot.inventory = { bagCapacity: 50, stacks: [] };
      save.snapshot.equipment = fullBagEquipment();
    });

    const milestone = () => taskOf(service, "progression.reach_level_20");
    expect(milestone().completedAt).not.toBeNull();
    // All or nothing: the stones are not paid out while the stone stack has
    // nowhere to land, so the reward cannot be half-granted and then forgotten.
    expect(milestone().claimedAt).toBeNull();
    expect(quantityOf(service, "enhance_stone")).toBe("0");

    const reloaded = new LocalGameService(platform);
    expect(reloaded.initialize(START).created).toBe(false);
    reloaded.debugGrant("spirit_stone");
    reloaded.expandInventory();
    reloaded.checkpoint(new Date(START.getTime() + 2_000));

    expect(taskOf(reloaded, "progression.reach_level_20").claimedAt).not.toBeNull();
    expect(Number(quantityOf(reloaded, "enhance_stone"))).toBeGreaterThan(0);
  });
});
