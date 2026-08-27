import {
  CAVE_BUILDING_CONFIGS,
  CAVE_MAX_LEVEL,
  EXPEDITION_STAGE_CONFIGS,
  IDLE_MATERIAL_ITEM_IDS,
  NEWCOMER_REACH_LEVEL_3_TASK_ID,
  NEWCOMER_REACH_LEVEL_5_TASK_ID,
  NEWCOMER_REACH_LEVEL_8_TASK_ID,
  PROGRESSION_TASK_CONFIGS,
  TRIAL_TOWER_UNLOCK_LEVEL,
  equipmentBandForConfig,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");
const LATER = new Date(START.getTime() + 900_000);
const MATERIAL_IDS: ReadonlySet<string> = new Set(IDLE_MATERIAL_ITEM_IDS);

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

/**
 * Rewind a current save to the pre-affix-roll `local-2.5.0` format. The pieces
 * carry the fixed values that quality used to award, which is exactly what a
 * player's save holds the moment before the roll ranges land.
 */
function preAffixRollSave(): MutableSave {
  const save = authenticSaveWithProgress();
  save.snapshot.config.version = "local-2.5.0";
  save.snapshot.harvestChest = { pendingCount: 0, entries: [] };
  save.snapshot.equipment = [
    {
      id: "00000000-0000-4000-8000-000000000301",
      equipmentConfigId: "ironwood_sword",
      displayName: "玄木剑",
      quality: "legendary",
      slot: "weapon",
      powerBonusBp: 2_520,
      enhanceLevel: 3,
      rolledAffixes: [
        { stat: "experience_bonus", valueBp: 350 },
        { stat: "spirit_stone_bonus", valueBp: 350 },
        { stat: "drop_bonus", valueBp: 350 },
      ],
      location: "bag",
      equippedSlot: null,
      isLocked: true,
      configVersion: "local-idle-drop-v1",
    },
    {
      id: "00000000-0000-4000-8000-000000000302",
      equipmentConfigId: "cloudweave_robe",
      displayName: "流云法袍",
      quality: "common",
      slot: "armor",
      powerBonusBp: 540,
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

    expect(service.snapshot.config.version).toBe("local-2.10.0");
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

    expect(service.snapshot.config.version).toBe("local-2.10.0");
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

    expect(service.snapshot.config.version).toBe("local-2.10.0");
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

    expect(service.snapshot.config.version).toBe("local-2.10.0");
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

    expect(service.snapshot.config.version).toBe("local-2.10.0");
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

    expect(service.snapshot.config.version).toBe("local-2.10.0");
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

    expect(service.snapshot.config.version).toBe("local-2.10.0");
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

  it("chains a local-1.0.0 save all the way to local-2.10.0", () => {
    const legacy = legacySave();
    legacy.snapshot.progress.loadoutFixedPower = "625";
    delete legacy.snapshot.progress.loadoutPowerBonusBp;
    const service = load(legacy);
    const progress = service.snapshot.progress as Record<string, unknown>;

    expect(service.snapshot.config.version).toBe("local-2.10.0");
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

    expect(service.snapshot.config.version).toBe("local-2.10.0");
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

    expect(service.snapshot.config.version).toBe("local-2.10.0");
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

describe("local-2.5.0 migration", () => {
  it("carries a pre-affix-roll save to head with its affixes byte-identical", () => {
    const legacy = preAffixRollSave();
    const before = JSON.parse(
      JSON.stringify(legacy.snapshot.equipment),
    ) as MutableSave[];
    const service = load(legacy);

    expect(service.snapshot.config.version).toBe("local-2.10.0");
    // The roll ranges are centred on the values old pieces already hold, so the
    // step is a pure version bump: nothing is rerolled on load.
    expect(
      service.snapshot.equipment.map((item) => ({
        id: item.id,
        quality: item.quality,
        enhanceLevel: item.enhanceLevel,
        rolledAffixes: item.rolledAffixes,
      })),
    ).toEqual(
      before.map((item) => ({
        id: item.id,
        quality: item.quality,
        enhanceLevel: item.enhanceLevel,
        rolledAffixes: item.rolledAffixes,
      })),
    );
  });

  it("does not discard a valid pre-affix-roll save", () => {
    expect(rejected(preAffixRollSave())).toBe(false);
  });
});

describe("local-2.6.0 migration", () => {
  /** The same save one version on: bands changed nothing a save can hold. */
  function preEquipmentBandsSave(): MutableSave {
    const save = preAffixRollSave();
    save.snapshot.config.version = "local-2.6.0";
    return save;
  }

  it("bumps the version and leaves every band 1 piece exactly as it was", () => {
    const legacy = preEquipmentBandsSave();
    const before = JSON.parse(
      JSON.stringify(legacy.snapshot.equipment),
    ) as MutableSave[];
    const service = load(legacy);

    expect(service.snapshot.config.version).toBe("local-2.10.0");
    // Bands are derived from the config id, and the five ids an old save can
    // hold are all band 1 ids that survived. Band 1's affix window is unchanged,
    // so there is nothing to rewrite.
    expect(
      service.snapshot.equipment.map((item) => ({
        equipmentConfigId: item.equipmentConfigId,
        displayName: item.displayName,
        quality: item.quality,
        rolledAffixes: item.rolledAffixes,
      })),
    ).toEqual(
      before.map((item) => ({
        equipmentConfigId: item.equipmentConfigId,
        displayName: item.displayName,
        quality: item.quality,
        rolledAffixes: item.rolledAffixes,
      })),
    );
  });

  it("still resolves every stored piece to band 1", () => {
    const service = load(preEquipmentBandsSave());
    for (const item of service.snapshot.equipment) {
      expect(equipmentBandForConfig(item.equipmentConfigId)).toBe(1);
    }
  });

  it("does not discard a valid pre-band save", () => {
    expect(rejected(preEquipmentBandsSave())).toBe(false);
  });
});

describe("local-2.7.0 migration", () => {
  /**
   * A head save parked at the load instant so nothing is settled. The gap has to
   * be zero for two loads to be comparable byte-for-byte: a settling load draws
   * its drops from the unseeded RNG, and one rolled piece of equipment carries a
   * fresh random id.
   */
  function atLoadInstant(): MutableSave {
    const save = authenticSaveWithProgress();
    save.savedAt = LATER.toISOString();
    save.snapshot.progress.settledAt = LATER.toISOString();
    return save;
  }

  /** The same bytes with only the version string rewound. */
  function preMaterialCurveSave(): MutableSave {
    const save = atLoadInstant();
    save.snapshot.config.version = "local-2.7.0";
    return save;
  }

  it("bumps the version and leaves the rest of the save byte-identical", () => {
    const head = atLoadInstant();
    const legacy = JSON.parse(JSON.stringify(head)) as MutableSave;
    legacy.snapshot.config.version = "local-2.7.0";

    const migrated = load(legacy).snapshot;

    expect(migrated.config.version).toBe("local-2.10.0");
    // The band multiplier is read off `progress.level` at settlement time and
    // never stored, so the eleventh step has nothing to rewrite. Same bytes in,
    // same bytes out.
    expect(migrated).toEqual(load(head).snapshot);
  });

  it("pays no back-pay for the materials the flat rate never dropped", () => {
    const legacy = preMaterialCurveSave();
    const bag = JSON.parse(
      JSON.stringify(legacy.snapshot.inventory),
    ) as MutableSave;
    const wallet = JSON.parse(
      JSON.stringify(legacy.snapshot.wallet),
    ) as MutableSave;

    const service = load(legacy);

    expect(service.snapshot.inventory).toEqual(bag);
    expect(service.snapshot.wallet).toEqual(wallet);
  });

  it("earns its own band's rate from the next settlement on", () => {
    const service = load(atLevel(preMaterialCurveSave(), 61));
    const quantities: number[] = [];
    for (let day = 0; day < 4; day += 1) {
      const drops = service.debugSimulateOffline(86_400, 20_260_101 + day)
        .snapshot.offlineSettlement!.drops;
      for (const item of drops.stackItems) {
        if (MATERIAL_IDS.has(item.itemConfigId)) quantities.push(Number(item.quantity));
      }
    }
    expect(quantities.length).toBeGreaterThan(0);
    // 灵阶 is ×3, and a migrated save gets it without asking: the multiplier
    // comes from the level, not from anything the save records.
    for (const quantity of quantities) expect(quantity % 3).toBe(0);
  });

  it("does not discard a valid pre-material-curve save", () => {
    expect(rejected(preMaterialCurveSave())).toBe(false);
  });
});

describe("local-2.8.0 migration", () => {
  /** The 22 rows a `local-2.8.0` save could hold, in that version's own order. */
  const TASK_IDS_AT_2_8_0: readonly string[] = [
    NEWCOMER_REACH_LEVEL_3_TASK_ID,
    NEWCOMER_REACH_LEVEL_5_TASK_ID,
    NEWCOMER_REACH_LEVEL_8_TASK_ID,
    ...[12, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100].map(
      (level) => `progression.reach_level_${level}`,
    ),
    ...[1, 5, 10, 15, 20, 25, 30].map(
      (floor) => `progression.trial_tower_floor_${floor}`,
    ),
  ];

  function preTaskChainSave(): MutableSave {
    const save = authenticSaveWithProgress();
    save.savedAt = LATER.toISOString();
    save.snapshot.progress.settledAt = LATER.toISOString();
    save.snapshot.config.version = "local-2.8.0";
    const stored = new Map<string, MutableSave>(
      save.snapshot.progressionTasks.map((task: MutableSave) => [
        task.taskConfigId,
        task,
      ]),
    );
    save.snapshot.progressionTasks = TASK_IDS_AT_2_8_0.map((id) => {
      const task = stored.get(id);
      if (task === undefined) throw new Error(`missing task ${id}`);
      return task;
    });
    return save;
  }

  it("pads the chain to its new length in config order", () => {
    const legacy = preTaskChainSave();
    expect(legacy.snapshot.progressionTasks).toHaveLength(22);

    const migrated = load(legacy).snapshot;

    expect(migrated.config.version).toBe("local-2.10.0");
    // Mandatory, not cosmetic: `isProgressionTaskList` demands the stored count
    // equal the config length exactly, so without this step a 22-row save would
    // be condemned as corrupt and replaced with a fresh character.
    expect(migrated.progressionTasks).toHaveLength(PROGRESSION_TASK_CONFIGS.length);
    expect(PROGRESSION_TASK_CONFIGS.length).toBe(42);
    expect(migrated.progressionTasks.map((task) => task.taskConfigId)).toEqual(
      PROGRESSION_TASK_CONFIGS.map((config) => config.id),
    );
    // The padding also reorders the stored rows into the interleaved order, which
    // is lawful because validation never compares positions.
    expect(migrated.progressionTasks.map((task) => task.taskConfigId)).not.toEqual(
      TASK_IDS_AT_2_8_0,
    );
  });

  it("carries every claim mark across by id, not by position", () => {
    const legacy = preTaskChainSave();
    for (const task of legacy.snapshot.progressionTasks as MutableSave[]) {
      if (task.taskConfigId !== NEWCOMER_REACH_LEVEL_8_TASK_ID) continue;
      task.progress = "8";
      task.completedAt = START.toISOString();
      task.claimedAt = START.toISOString();
    }
    const pills = legacy.snapshot.inventory.stacks.find(
      (stack: MutableSave) => stack.itemConfigId === "breakthrough_pill",
    )?.quantity;

    const migrated = load(legacy).snapshot;
    const settled = migrated.progressionTasks.find(
      (task) => task.taskConfigId === NEWCOMER_REACH_LEVEL_8_TASK_ID,
    );

    expect(settled?.claimedAt).toBe(START.toISOString());
    expect(settled?.completedAt).toBe(START.toISOString());
    // Re-granting is the failure this guards: the pill was handed over once.
    expect(
      migrated.inventory.stacks.find(
        (stack) => stack.itemConfigId === "breakthrough_pill",
      )?.quantity,
    ).toBe(pills);
    // Everything new arrives open, so nothing is marked claimed without payment.
    for (const task of migrated.progressionTasks) {
      if (TASK_IDS_AT_2_8_0.includes(task.taskConfigId)) continue;
      expect(task.claimedAt, task.taskConfigId).toBeNull();
      expect(task.completedAt, task.taskConfigId).toBeNull();
    }
  });

  it("pays the new milestones a high save has already passed", () => {
    const legacy = atLevel(preTaskChainSave(), 300);
    // A genuine Lv.300 save has long since claimed every milestone the 22-row
    // chain had, so the delta below is only what the new rows pay.
    for (const task of legacy.snapshot.progressionTasks as MutableSave[]) {
      if (!task.taskConfigId.startsWith("progression.reach_level_")) continue;
      task.completedAt = START.toISOString();
      task.claimedAt = START.toISOString();
    }
    const before = Number(
      legacy.snapshot.inventory.stacks.find(
        (stack: MutableSave) => stack.itemConfigId === "enhance_stone",
      )?.quantity ?? 0,
    );

    const service = load(legacy);
    service.checkpoint(new Date(LATER.getTime() + 1_000));
    const tasks = service.snapshot.progressionTasks;
    const claimed = (id: string) =>
      tasks.find((task) => task.taskConfigId === id)?.claimedAt;

    // A Lv.300 character did reach Lv.120..300, and the task says so. This is
    // `syncProgressionTasks`'s standing behaviour, and the precedent the same
    // padding step set at `local-2.5.0`; the alternative would be for the
    // migration to forge a claim timestamp for a reward it never granted.
    expect(claimed("progression.reach_level_120")).not.toBeNull();
    expect(claimed("progression.reach_level_300")).not.toBeNull();
    expect(claimed("progression.reach_level_350")).toBeNull();
    // 12 + 15 + 18 + 22 + 25 + 30 for the six new milestones at or under Lv.300.
    expect(
      Number(
        service.snapshot.inventory.stacks.find(
          (stack) => stack.itemConfigId === "enhance_stone",
        )?.quantity ?? 0,
      ) - before,
    ).toBe(122);
    // Tower milestones are not levelled into: the condition is the floor.
    expect(claimed("progression.trial_tower_floor_40")).toBeNull();
  });

  it("does not discard a valid pre-task-chain save", () => {
    expect(rejected(preTaskChainSave())).toBe(false);
  });
});

describe("local-2.9.0 migration", () => {
  /** A head save parked at the load instant, so two loads are comparable. */
  function atLoadInstant(): MutableSave {
    const save = authenticSaveWithProgress();
    save.savedAt = LATER.toISOString();
    save.snapshot.progress.settledAt = LATER.toISOString();
    return save;
  }

  /** The same bytes with only the version string rewound. */
  function preEnhanceStoneCurveSave(): MutableSave {
    const save = atLoadInstant();
    save.snapshot.config.version = "local-2.9.0";
    return save;
  }

  it("bumps the version and leaves the rest of the save byte-identical", () => {
    const head = atLoadInstant();
    const legacy = JSON.parse(JSON.stringify(head)) as MutableSave;
    legacy.snapshot.config.version = "local-2.9.0";

    const migrated = load(legacy).snapshot;

    expect(migrated.config.version).toBe("local-2.10.0");
    // Same reasoning as the material curve step: the enhance stone multiplier is
    // derived from `progress.level` at settlement time and never stored, so the
    // thirteenth step has nothing to rewrite.
    expect(migrated).toEqual(load(head).snapshot);
  });

  it("pays no back-pay for the stones the flat rate never dropped", () => {
    const legacy = preEnhanceStoneCurveSave();
    const bag = JSON.parse(
      JSON.stringify(legacy.snapshot.inventory),
    ) as MutableSave;

    expect(load(legacy).snapshot.inventory).toEqual(bag);
  });

  it("earns its own band's stone rate from the next settlement on", () => {
    const service = load(atLevel(preEnhanceStoneCurveSave(), 301));
    const quantities: number[] = [];
    for (let day = 0; day < 4; day += 1) {
      const drops = service.debugSimulateOffline(86_400, 20_260_101 + day)
        .snapshot.offlineSettlement!.drops;
      for (const item of drops.stackItems) {
        if (item.itemConfigId === "enhance_stone") {
          quantities.push(Number(item.quantity));
        }
      }
    }
    expect(quantities.length).toBeGreaterThan(0);
    // 天阶 is ×10, and a migrated save gets it without asking: the multiplier
    // comes from the level, not from anything the save records. The reported
    // quantity is a whole settlement's worth, so divisibility is the assertion.
    for (const quantity of quantities) expect(quantity % 10).toBe(0);
  });

  it("does not discard a valid pre-enhance-stone-curve save", () => {
    expect(rejected(preEnhanceStoneCurveSave())).toBe(false);
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
