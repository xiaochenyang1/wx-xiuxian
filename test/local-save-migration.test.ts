import {
  CAVE_BUILDING_CONFIGS,
  CAVE_MAX_LEVEL,
  EXPEDITION_STAGE_CONFIGS,
  NEWCOMER_REACH_LEVEL_3_TASK_ID,
  NEWCOMER_REACH_LEVEL_5_TASK_ID,
  NEWCOMER_REACH_LEVEL_8_TASK_ID,
  PROGRESSION_TASK_CONFIGS,
  TRIAL_TOWER_UNLOCK_LEVEL,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");
const LATER = new Date(START.getTime() + 900_000);

type MutableSave = Record<string, any>;

/**
 * A genuine current-version save carrying non-default progress, so that
 * "nothing was lost" is a meaningful assertion rather than a comparison
 * between two pristine starting states.
 */
function authenticSaveWithProgress(): MutableSave {
  const platform = new FakePlatformAdapter();
  const service = new LocalGameService(platform);
  service.initialize(START);
  service.debugGrant("spirit_stone");
  service.debugGrant("breakthrough_pill");
  service.checkpoint(new Date(START.getTime() + 600_000));
  const raw = platform.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected a persisted save");
  return JSON.parse(raw) as MutableSave;
}

/** Rewind a current save to look exactly like a pre-cave `local-1.0.0` save. */
function legacySave(): MutableSave {
  const save = authenticSaveWithProgress();
  delete save.snapshot.cave;
  delete save.snapshot.expedition;
  save.snapshot.config.version = "local-1.0.0";
  return save;
}

/** Rewind a current save to the cave-only `local-1.1.0` format. */
function preExpeditionSave(): MutableSave {
  const save = authenticSaveWithProgress();
  delete save.snapshot.expedition;
  save.snapshot.config.version = "local-1.1.0";
  return save;
}

/** Rewind a current save to the pre-completion `local-1.2.0` format. */
function preFeatureCompletionSave(): MutableSave {
  const save = authenticSaveWithProgress();
  delete save.snapshot.partner;
  delete save.snapshot.sect;
  save.snapshot.config.version = "local-1.2.0";
  return save;
}

/** Rewind a current save to the pre-sweep `local-2.1.0` format. */
function preExpeditionSweepSave(): MutableSave {
  const save = authenticSaveWithProgress();
  delete save.snapshot.expedition.sweepCounts;
  save.snapshot.config.version = "local-2.1.0";
  return save;
}

/** Rewind a current save to the pre-equipment-management `local-2.2.0` format. */
function preEquipmentManagementSave(): MutableSave {
  const save = authenticSaveWithProgress();
  save.snapshot.config.version = "local-2.2.0";
  save.snapshot.harvestChest = { pendingCount: 0, entries: [] };
  save.snapshot.equipment = [
    {
      id: "00000000-0000-4000-8000-000000000201",
      equipmentConfigId: "ironwood_sword",
      displayName: "玄木剑",
      quality: "common",
      slot: "weapon",
      fixedPower: "80",
      enhanceLevel: 0,
      rolledAffixes: [],
      location: "bag",
      equippedSlot: null,
      isLocked: false,
      configVersion: "local-idle-drop-v1",
    },
    {
      id: "00000000-0000-4000-8000-000000000202",
      equipmentConfigId: "cloudweave_robe",
      displayName: "流云法袍",
      quality: "rare",
      slot: "armor",
      fixedPower: "120",
      enhanceLevel: 0,
      rolledAffixes: [],
      location: "bag",
      equippedSlot: null,
      isLocked: false,
      configVersion: "local-idle-drop-v1",
    },
  ];
  return save;
}

/**
 * Rewind a current save to the pre-power-model `local-2.3.0` format, where the
 * loadout's power contribution was a fixed decimal string rather than basis
 * points. The names have to go back for the rename step to be under test.
 */
function prePowerModelSave(): MutableSave {
  const save = authenticSaveWithProgress();
  save.snapshot.config.version = "local-2.3.0";
  save.snapshot.progress.loadoutFixedPower = "625";
  delete save.snapshot.progress.loadoutPowerBonusBp;
  for (const item of [...save.snapshot.techniques, ...save.snapshot.equipment]) {
    item.fixedPower = "80";
    delete item.powerBonusBp;
  }
  return save;
}

/**
 * Rewind a current save to the pre-tower `local-2.4.0` format: three newcomer
 * tasks under the old field name, no tower record, and a two-bit `unlocks`.
 */
function preTrialTowerSave(): MutableSave {
  const save = authenticSaveWithProgress();
  save.snapshot.config.version = "local-2.4.0";
  save.snapshot.newcomerTasks = openingTasksOnly();
  delete save.snapshot.progressionTasks;
  delete save.snapshot.trialTower;
  save.snapshot.unlocks = {
    partner: save.snapshot.unlocks.partner,
    cave: save.snapshot.unlocks.cave,
  };
  return save;
}

/** The three-row task table as it stood before the chain grew to Lv.100. */
function openingTasksOnly(): MutableSave[] {
  return [
    NEWCOMER_REACH_LEVEL_3_TASK_ID,
    NEWCOMER_REACH_LEVEL_5_TASK_ID,
    NEWCOMER_REACH_LEVEL_8_TASK_ID,
  ].map((taskConfigId) => ({
    taskConfigId,
    progress: "1",
    completedAt: null,
    claimedAt: null,
  }));
}

/**
 * The fixture is parked at Lv.10 `breakthrough_ready` with its bar exactly full,
 * so moving the level has to reset the bar too or the save reads as tampered.
 */
function atLevel(save: MutableSave, level: number): MutableSave {
  save.snapshot.progress.level = level;
  save.snapshot.progress.experience = "0";
  save.snapshot.progress.status = "gaining";
  return save;
}

function load(save: unknown): LocalGameService {
  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  service.initialize(LATER);
  return service;
}

/** `true` means the save was rejected and a fresh one was created instead. */
function rejected(save: unknown): boolean {
  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  return service.initialize(LATER).created;
}

function corruptCave(mutate: (save: MutableSave) => void): boolean {
  const save = authenticSaveWithProgress();
  mutate(save);
  return rejected(save);
}

describe("local-1.0.0 migration", () => {
  it("keeps every piece of player progress", () => {
    const legacy = legacySave();
    const service = load(legacy);

    expect(service.snapshot.progress.level).toBe(legacy.snapshot.progress.level);
    expect(service.snapshot.wallet.spiritStone).toBe(
      legacy.snapshot.wallet.spiritStone,
    );
    expect(service.snapshot.inventory.bagCapacity).toBe(
      legacy.snapshot.inventory.bagCapacity,
    );
    expect(service.snapshot.inventory.stacks).toEqual(
      legacy.snapshot.inventory.stacks,
    );
    expect(service.snapshot.player.id).toBe(legacy.snapshot.player.id);
    expect(service.snapshot.account.id).toBe(legacy.snapshot.account.id);
  });

  it("does not discard the legacy save", () => {
    const platform = new FakePlatformAdapter();
    platform.seed(SAVE_KEY, legacySave());
    const service = new LocalGameService(platform);

    expect(service.initialize(LATER).created).toBe(false);
  });

  it("chains through both migrations and backfills every new subsystem", () => {
    const service = load(legacySave());

    expect(service.snapshot.config.version).toBe("local-2.5.0");
    expect(service.snapshot.cave.buildings).toEqual(
      CAVE_BUILDING_CONFIGS.map((config) => ({
        buildingConfigId: config.id,
        level: 0,
      })),
    );
    expect(service.snapshot.expedition.clearedStageIds).toEqual([]);
    expect(service.snapshot.expedition.sweepCounts).toEqual([]);
    expect(service.snapshot.partner).toEqual({ partnerId: null, level: 0, bond: 0 });
    expect(service.snapshot.sect).toEqual({ sectId: null, level: 0, contribution: 0 });
  });

  it("round-trips cave levels without drift", () => {
    const save = authenticSaveWithProgress();
    save.snapshot.cave.buildings[0].level = 4;
    save.snapshot.cave.buildings[3].level = CAVE_MAX_LEVEL;

    const service = load(save);

    expect(service.snapshot.cave.buildings[0]!.level).toBe(4);
    expect(service.snapshot.cave.buildings[3]!.level).toBe(CAVE_MAX_LEVEL);
  });
});

describe("local-1.1.0 migration", () => {
  it("keeps cave progress while adding an empty expedition record", () => {
    const legacy = preExpeditionSave();
    legacy.snapshot.cave.buildings[0].level = 4;
    legacy.snapshot.cave.buildings[3].level = CAVE_MAX_LEVEL;

    const service = load(legacy);

    expect(service.snapshot.config.version).toBe("local-2.5.0");
    expect(service.snapshot.cave.buildings[0].level).toBe(4);
    expect(service.snapshot.cave.buildings[3].level).toBe(CAVE_MAX_LEVEL);
    expect(service.snapshot.expedition.clearedStageIds).toEqual([]);
    expect(service.snapshot.expedition.sweepCounts).toEqual([]);
    expect(service.snapshot.player.id).toBe(legacy.snapshot.player.id);
    expect(service.snapshot.account.id).toBe(legacy.snapshot.account.id);
  });

  it("does not discard a valid cave-era save", () => {
    const platform = new FakePlatformAdapter();
    platform.seed(SAVE_KEY, preExpeditionSave());
    const service = new LocalGameService(platform);

    expect(service.initialize(LATER).created).toBe(false);
  });

  it("round-trips every valid cleared-stage prefix", () => {
    for (let length = 0; length <= EXPEDITION_STAGE_CONFIGS.length; length += 1) {
      const save = authenticSaveWithProgress();
      save.snapshot.expedition.clearedStageIds = EXPEDITION_STAGE_CONFIGS.slice(
        0,
        length,
      ).map((stage) => stage.id);

      expect(load(save).snapshot.expedition.clearedStageIds).toEqual(
        save.snapshot.expedition.clearedStageIds,
      );
    }
  });
});

describe("local-1.2.0 to local-2.0.0 migration", () => {
  it("keeps existing progress while adding partner and sect records", () => {
    const legacy = preFeatureCompletionSave();
    legacy.snapshot.cave.buildings[0].level = 6;
    legacy.snapshot.expedition.clearedStageIds = EXPEDITION_STAGE_CONFIGS.slice(
      0,
      3,
    ).map((stage) => stage.id);

    const service = load(legacy);

    expect(service.snapshot.config.version).toBe("local-2.5.0");
    expect(service.snapshot.cave.buildings[0].level).toBe(6);
    expect(service.snapshot.expedition.clearedStageIds).toEqual(
      legacy.snapshot.expedition.clearedStageIds,
    );
    expect(service.snapshot.partner).toEqual({ partnerId: null, level: 0, bond: 0 });
    expect(service.snapshot.sect).toEqual({ sectId: null, level: 0, contribution: 0 });
    expect(service.snapshot.player.id).toBe(legacy.snapshot.player.id);
  });

  it("does not discard a valid pre-completion save", () => {
    const platform = new FakePlatformAdapter();
    platform.seed(SAVE_KEY, preFeatureCompletionSave());
    const service = new LocalGameService(platform);

    expect(service.initialize(LATER).created).toBe(false);
  });
});

describe("local-2.0.0 to local-2.1.0 migration", () => {
  it("removes the obsolete protection talisman without losing other items", () => {
    const legacy = authenticSaveWithProgress();
    legacy.snapshot.config.version = "local-2.0.0";
    legacy.snapshot.inventory.stacks.push(
      {
        itemConfigId: "protection_talisman",
        displayName: "保护符",
        quantity: "2",
      },
      {
        itemConfigId: "rename_card",
        displayName: "改名卡",
        quantity: "1",
      },
    );

    const service = load(legacy);

    expect(service.snapshot.config.version).toBe("local-2.5.0");
    expect(
      service.snapshot.inventory.stacks.some(
        (stack) => stack.itemConfigId === "protection_talisman",
      ),
    ).toBe(false);
    expect(
      service.snapshot.inventory.stacks.find(
        (stack) => stack.itemConfigId === "rename_card",
      )?.quantity,
    ).toBe("1");
  });
});

describe("local-2.1.0 to local-2.2.0 migration", () => {
  it("keeps expedition clears while adding empty sweep counters", () => {
    const legacy = preExpeditionSweepSave();
    legacy.snapshot.expedition.clearedStageIds = EXPEDITION_STAGE_CONFIGS.slice(
      0,
      4,
    ).map((stage) => stage.id);

    const service = load(legacy);

    expect(service.snapshot.config.version).toBe("local-2.5.0");
    expect(service.snapshot.expedition.clearedStageIds).toEqual(
      legacy.snapshot.expedition.clearedStageIds,
    );
    expect(service.snapshot.expedition.sweepCounts).toEqual([]);
    expect(service.snapshot.player.id).toBe(legacy.snapshot.player.id);
    expect(service.snapshot.wallet.spiritStone).toBe(
      legacy.snapshot.wallet.spiritStone,
    );
  });

  it("does not discard a valid pre-sweep save", () => {
    const platform = new FakePlatformAdapter();
    platform.seed(SAVE_KEY, preExpeditionSweepSave());
    const service = new LocalGameService(platform);

    expect(service.initialize(LATER).created).toBe(false);
  });
});

describe("local-2.2.0 to local-2.3.0 migration", () => {
  it("protects existing rare equipment while preserving ordinary gear", () => {
    const legacy = preEquipmentManagementSave();
    const service = load(legacy);

    expect(service.snapshot.config.version).toBe("local-2.5.0");
    expect(service.snapshot.equipment[0]!.isLocked).toBe(false);
    expect(service.snapshot.equipment[1]!.isLocked).toBe(true);
    expect(service.snapshot.player.id).toBe(legacy.snapshot.player.id);
  });

  it("does not discard a valid pre-equipment-management save", () => {
    const platform = new FakePlatformAdapter();
    platform.seed(SAVE_KEY, preEquipmentManagementSave());
    const service = new LocalGameService(platform);

    expect(service.initialize(LATER).created).toBe(false);
  });
});

describe("local-2.3.0 to local-2.4.0 migration", () => {
  it("renames the loadout power fields and recomputes them from config", () => {
    const legacy = prePowerModelSave();
    const service = load(legacy);
    const progress = service.snapshot.progress as Record<string, unknown>;

    expect(service.snapshot.config.version).toBe("local-2.5.0");
    expect(progress.loadoutFixedPower).toBeUndefined();
    expect(typeof progress.loadoutPowerBonusBp).toBe("number");
    for (const item of [
      ...service.snapshot.techniques,
      ...service.snapshot.equipment,
    ]) {
      expect((item as Record<string, unknown>).fixedPower).toBeUndefined();
      expect(typeof item.powerBonusBp).toBe("number");
    }
  });

  it("keeps every piece of player progress across the rename", () => {
    const legacy = prePowerModelSave();
    const service = load(legacy);

    expect(service.snapshot.player.id).toBe(legacy.snapshot.player.id);
    expect(service.snapshot.progress.level).toBe(legacy.snapshot.progress.level);
    expect(service.snapshot.progress.experience).toBe(
      legacy.snapshot.progress.experience,
    );
    expect(service.snapshot.wallet.spiritStone).toBe(
      legacy.snapshot.wallet.spiritStone,
    );
  });

  it("does not discard a valid pre-power-model save", () => {
    const platform = new FakePlatformAdapter();
    platform.seed(SAVE_KEY, prePowerModelSave());
    const service = new LocalGameService(platform);

    expect(service.initialize(LATER).created).toBe(false);
  });

  it("chains a local-1.0.0 save all the way to local-2.5.0", () => {
    const legacy = legacySave();
    legacy.snapshot.progress.loadoutFixedPower = "625";
    delete legacy.snapshot.progress.loadoutPowerBonusBp;
    const service = load(legacy);
    const progress = service.snapshot.progress as Record<string, unknown>;

    expect(service.snapshot.config.version).toBe("local-2.5.0");
    expect(progress.loadoutFixedPower).toBeUndefined();
    expect(typeof progress.loadoutPowerBonusBp).toBe("number");
    expect(service.snapshot.player.id).toBe(legacy.snapshot.player.id);
    expect(service.snapshot.cave.buildings).toHaveLength(
      CAVE_BUILDING_CONFIGS.length,
    );
    expect(service.snapshot.expedition.clearedStageIds).toEqual([]);
  });
});

describe("local-2.4.0 to local-2.5.0 migration", () => {
  it("adds the tower record and expands the task table without losing claims", () => {
    const legacy = preTrialTowerSave();
    const claimed = legacy.snapshot.newcomerTasks.find(
      (task: MutableSave) => task.taskConfigId === NEWCOMER_REACH_LEVEL_8_TASK_ID,
    );
    claimed.completedAt = START.toISOString();
    claimed.claimedAt = START.toISOString();
    const service = load(legacy);
    const snapshot = service.snapshot as unknown as MutableSave;

    expect(service.snapshot.config.version).toBe("local-2.5.0");
    expect(service.snapshot.trialTower).toEqual({ highestFloor: 0 });
    expect(snapshot.newcomerTasks).toBeUndefined();
    expect(service.snapshot.progressionTasks).toHaveLength(
      PROGRESSION_TASK_CONFIGS.length,
    );
    expect(service.snapshot.progressionTasks.map((task) => task.taskConfigId)).toEqual(
      PROGRESSION_TASK_CONFIGS.map((config) => config.id),
    );
    // The pill was already handed over; re-running the grant would duplicate it.
    expect(
      service.snapshot.progressionTasks.find(
        (task) => task.taskConfigId === NEWCOMER_REACH_LEVEL_8_TASK_ID,
      )?.claimedAt,
    ).toBe(START.toISOString());
  });

  it("seeds the tower unlock from the stored level and leaves earlier saves locked", () => {
    const low = atLevel(preTrialTowerSave(), TRIAL_TOWER_UNLOCK_LEVEL - 1);

    expect(rejected(low)).toBe(false);
    expect(load(low).snapshot.unlocks.trialTower).toBe(false);

    const high = atLevel(preTrialTowerSave(), TRIAL_TOWER_UNLOCK_LEVEL);

    expect(rejected(high)).toBe(false);
    expect(load(high).snapshot.unlocks.trialTower).toBe(true);
  });

  it("keeps the partner entrance a Lv.11 save had already been given", () => {
    const legacy = atLevel(preTrialTowerSave(), 11);
    legacy.snapshot.unlocks = { partner: true, cave: true };

    expect(load(legacy).snapshot.unlocks).toEqual({
      partner: true,
      cave: true,
      trialTower: false,
    });
  });

  it("does not discard a valid pre-tower save", () => {
    expect(rejected(preTrialTowerSave())).toBe(false);
  });

  it("chains a local-1.0.0 save all the way to the tower era", () => {
    const legacy = legacySave();
    legacy.snapshot.progress.loadoutFixedPower = "625";
    delete legacy.snapshot.progress.loadoutPowerBonusBp;
    legacy.snapshot.progressionTasks = undefined;
    delete legacy.snapshot.progressionTasks;
    legacy.snapshot.newcomerTasks = openingTasksOnly();
    delete legacy.snapshot.trialTower;
    legacy.snapshot.unlocks = { partner: false, cave: false };
    const service = load(legacy);

    expect(service.snapshot.config.version).toBe("local-2.5.0");
    expect(service.snapshot.trialTower).toEqual({ highestFloor: 0 });
    expect(service.snapshot.progressionTasks).toHaveLength(
      PROGRESSION_TASK_CONFIGS.length,
    );
    expect(service.snapshot.unlocks).toEqual({
      partner: false,
      cave: false,
      trialTower: false,
    });
  });
});

describe("cave save validation", () => {
  it("rejects an unknown building id", () => {
    expect(
      corruptCave((save) => {
        save.snapshot.cave.buildings[0].buildingConfigId = "nope";
      }),
    ).toBe(true);
  });

  it("rejects levels outside 0..maxLevel", () => {
    expect(
      corruptCave((save) => {
        save.snapshot.cave.buildings[0].level = CAVE_MAX_LEVEL + 1;
      }),
    ).toBe(true);
    expect(
      corruptCave((save) => {
        save.snapshot.cave.buildings[0].level = -1;
      }),
    ).toBe(true);
    expect(
      corruptCave((save) => {
        save.snapshot.cave.buildings[0].level = 1.5;
      }),
    ).toBe(true);
  });

  it("rejects duplicate building ids", () => {
    expect(
      corruptCave((save) => {
        save.snapshot.cave.buildings[1].buildingConfigId =
          save.snapshot.cave.buildings[0].buildingConfigId;
      }),
    ).toBe(true);
  });

  it("rejects a missing or malformed buildings list", () => {
    expect(
      corruptCave((save) => {
        save.snapshot.cave.buildings = {};
      }),
    ).toBe(true);
    expect(
      corruptCave((save) => {
        delete save.snapshot.cave;
      }),
    ).toBe(true);
    expect(
      corruptCave((save) => {
        save.snapshot.cave.buildings.pop();
      }),
    ).toBe(true);
  });

  it("rejects an unknown legacy config version instead of migrating it", () => {
    expect(
      corruptCave((save) => {
        save.snapshot.config.version = "local-0.9.0";
      }),
    ).toBe(true);
    expect(
      corruptCave((save) => {
        delete save.snapshot.cave;
        save.snapshot.config.version = "local-0.9.0";
      }),
    ).toBe(true);
  });
});
