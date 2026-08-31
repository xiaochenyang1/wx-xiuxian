import {
  EXPEDITION_STAGE_CONFIGS,
  EXPEDITION_SWEEP_MAX_COUNT,
  MAX_LEVEL,
  PROGRESSION_TASK_CONFIGS,
  TRIAL_TOWER_MAX_FLOOR,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");

type MutableSave = Record<string, any>;

/** Produce a genuine save envelope by playing normally, then hand back a clone. */
function authenticSave(): MutableSave {
  const platform = new FakePlatformAdapter();
  const service = new LocalGameService(platform);
  service.initialize(START);
  service.checkpoint(new Date(START.getTime() + 600_000));
  const raw = platform.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected a persisted save");
  return JSON.parse(raw) as MutableSave;
}

/** Load `save` through a fresh service; `true` means it was rejected. */
function rejected(save: unknown): boolean {
  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  return service.initialize(new Date(START.getTime() + 900_000)).created;
}

function corrupt(mutate: (save: MutableSave) => void): boolean {
  const save = authenticSave();
  mutate(save);
  return rejected(save);
}

describe("save validation accepts legitimate data", () => {
  it("accepts an untouched save produced by the game itself", () => {
    expect(rejected(authenticSave())).toBe(false);
  });

  it("accepts a save at the maximum bag capacity", () => {
    expect(
      corrupt((save) => {
        save.snapshot.inventory.bagCapacity = 200;
      }),
    ).toBe(false);
  });

  it("accepts both non-default avatar variants", () => {
    expect(
      corrupt((save) => {
        save.snapshot.player.avatarVariant = "male";
      }),
    ).toBe(false);
    expect(
      corrupt((save) => {
        save.snapshot.player.avatarVariant = "female";
      }),
    ).toBe(false);
  });

  it("accepts every valid expedition prefix", () => {
    for (let length = 0; length <= EXPEDITION_STAGE_CONFIGS.length; length += 1) {
      expect(
        corrupt((save) => {
          save.snapshot.expedition.clearedStageIds = EXPEDITION_STAGE_CONFIGS.slice(
            0,
            length,
          ).map((stage) => stage.id);
        }),
      ).toBe(false);
    }
  });

  it("accepts valid sweep counters for cleared stages", () => {
    expect(
      corrupt((save) => {
        const [first, second] = EXPEDITION_STAGE_CONFIGS;
        save.snapshot.expedition.clearedStageIds = [first!.id, second!.id];
        save.snapshot.expedition.sweepCounts = [
          { stageConfigId: second!.id, count: EXPEDITION_SWEEP_MAX_COUNT },
          { stageConfigId: first!.id, count: 1 },
        ];
      }),
    ).toBe(false);
  });
});

describe("expedition validation", () => {
  it("rejects a missing or malformed expedition record", () => {
    expect(corrupt((save) => delete save.snapshot.expedition)).toBe(true);
    expect(corrupt((save) => (save.snapshot.expedition = null))).toBe(true);
    expect(
      corrupt((save) => (save.snapshot.expedition.clearedStageIds = {})),
    ).toBe(true);
    expect(
      corrupt((save) => (save.snapshot.expedition.sweepCounts = null)),
    ).toBe(true);
    expect(
      corrupt((save) => delete save.snapshot.expedition.sweepCounts),
    ).toBe(true);
  });

  it("rejects unknown, skipped, duplicated, or reordered stages", () => {
    const [first, second, third] = EXPEDITION_STAGE_CONFIGS;
    expect(
      corrupt((save) => {
        save.snapshot.expedition.clearedStageIds = ["unknown_stage"];
      }),
    ).toBe(true);
    expect(
      corrupt((save) => {
        save.snapshot.expedition.clearedStageIds = [second!.id];
      }),
    ).toBe(true);
    expect(
      corrupt((save) => {
        save.snapshot.expedition.clearedStageIds = [first!.id, first!.id];
      }),
    ).toBe(true);
    expect(
      corrupt((save) => {
        save.snapshot.expedition.clearedStageIds = [first!.id, third!.id];
      }),
    ).toBe(true);
  });

  it("rejects more cleared stages than the configured campaign contains", () => {
    expect(
      corrupt((save) => {
        save.snapshot.expedition.clearedStageIds = [
          ...EXPEDITION_STAGE_CONFIGS.map((stage) => stage.id),
          EXPEDITION_STAGE_CONFIGS[0]!.id,
        ];
      }),
    ).toBe(true);
  });

  it("rejects sweep counters for unknown, uncleared, duplicated, or invalid stages", () => {
    const [first, second] = EXPEDITION_STAGE_CONFIGS;
    expect(
      corrupt((save) => {
        save.snapshot.expedition.clearedStageIds = [first!.id];
        save.snapshot.expedition.sweepCounts = [
          { stageConfigId: "unknown", count: 1 },
        ];
      }),
    ).toBe(true);
    expect(
      corrupt((save) => {
        save.snapshot.expedition.clearedStageIds = [first!.id];
        save.snapshot.expedition.sweepCounts = [
          { stageConfigId: second!.id, count: 1 },
        ];
      }),
    ).toBe(true);
    expect(
      corrupt((save) => {
        save.snapshot.expedition.clearedStageIds = [first!.id];
        save.snapshot.expedition.sweepCounts = [
          { stageConfigId: first!.id, count: 1 },
          { stageConfigId: first!.id, count: 2 },
        ];
      }),
    ).toBe(true);
    for (const count of [
      0,
      1.5,
      EXPEDITION_SWEEP_MAX_COUNT + 1,
    ]) {
      expect(
        corrupt((save) => {
          save.snapshot.expedition.clearedStageIds = [first!.id];
          save.snapshot.expedition.sweepCounts = [
            { stageConfigId: first!.id, count },
          ];
        }),
      ).toBe(true);
    }
  });
});

describe("partner and sect validation", () => {
  it("accepts valid chosen and joined progression records", () => {
    expect(
      corrupt((save) => {
        save.snapshot.partner = { partnerId: "jun_rulan", level: 3, bond: 200 };
        save.snapshot.sect = { sectId: "qingyun", level: 3, contribution: 500 };
      }),
    ).toBe(false);
  });

  it("rejects missing, unknown, or inconsistent partner records", () => {
    expect(corrupt((save) => delete save.snapshot.partner)).toBe(true);
    expect(
      corrupt((save) => {
        save.snapshot.partner = { partnerId: null, level: 1, bond: 0 };
      }),
    ).toBe(true);
    expect(
      corrupt((save) => {
        save.snapshot.partner = { partnerId: "unknown", level: 1, bond: 0 };
      }),
    ).toBe(true);
    expect(
      corrupt((save) => {
        save.snapshot.partner = { partnerId: "jun_rulan", level: 1, bond: 200 };
      }),
    ).toBe(true);
  });

  it("rejects missing, unknown, or inconsistent sect records", () => {
    expect(corrupt((save) => delete save.snapshot.sect)).toBe(true);
    expect(
      corrupt((save) => {
        save.snapshot.sect = { sectId: null, level: 1, contribution: 0 };
      }),
    ).toBe(true);
    expect(
      corrupt((save) => {
        save.snapshot.sect = { sectId: "unknown", level: 1, contribution: 0 };
      }),
    ).toBe(true);
    expect(
      corrupt((save) => {
        save.snapshot.sect = { sectId: "qingyun", level: 1, contribution: 400 };
      }),
    ).toBe(true);
  });
});

describe("save envelope validation", () => {
  it("rejects an unknown schema version", () => {
    expect(corrupt((save) => (save.schemaVersion = 2))).toBe(true);
    expect(corrupt((save) => (save.schemaVersion = 0))).toBe(true);
    expect(corrupt((save) => delete save.schemaVersion)).toBe(true);
  });

  it("rejects a malformed savedAt timestamp", () => {
    expect(corrupt((save) => (save.savedAt = "yesterday"))).toBe(true);
    expect(corrupt((save) => (save.savedAt = 1_700_000_000))).toBe(true);
  });

  it("rejects out-of-range remainder micros", () => {
    expect(corrupt((save) => (save.spiritStoneRemainderMicros = -1))).toBe(true);
    expect(corrupt((save) => (save.spiritStoneRemainderMicros = 1_000_000))).toBe(true);
    expect(corrupt((save) => (save.spiritStoneRemainderMicros = 0.5))).toBe(true);
    expect(corrupt((save) => (save.dropClockRemainderMicros = -1))).toBe(true);
    expect(corrupt((save) => (save.dropClockRemainderMicros = 60_000_000))).toBe(true);
  });

  it("rejects a save with no snapshot at all", () => {
    expect(corrupt((save) => delete save.snapshot)).toBe(true);
    expect(corrupt((save) => (save.snapshot = null))).toBe(true);
  });
});

describe("progress validation", () => {
  it("rejects levels outside the supported range", () => {
    expect(corrupt((save) => (save.snapshot.progress.level = 0))).toBe(true);
    expect(corrupt((save) => (save.snapshot.progress.level = -5))).toBe(true);
    expect(corrupt((save) => (save.snapshot.progress.level = MAX_LEVEL + 1))).toBe(true);
    expect(corrupt((save) => (save.snapshot.progress.level = 1.5))).toBe(true);
  });

  it("rejects non-decimal or negative experience", () => {
    expect(corrupt((save) => (save.snapshot.progress.experience = "-100"))).toBe(true);
    expect(corrupt((save) => (save.snapshot.progress.experience = "1e9"))).toBe(true);
    expect(corrupt((save) => (save.snapshot.progress.experience = "abc"))).toBe(true);
    expect(corrupt((save) => (save.snapshot.progress.experience = 100))).toBe(true);
  });

  it("rejects an unknown progression status", () => {
    expect(corrupt((save) => (save.snapshot.progress.status = "ascended"))).toBe(true);
  });

  it("rejects a gaining status whose bar is already full", () => {
    expect(
      corrupt((save) => {
        save.snapshot.progress.status = "gaining";
        save.snapshot.progress.experience = save.snapshot.progress.requiredExperience;
      }),
    ).toBe(true);
  });

  it("rejects out-of-range experience remainder micros", () => {
    expect(
      corrupt((save) => (save.snapshot.progress.experienceRemainderMicros = 1_000_000)),
    ).toBe(true);
    expect(
      corrupt((save) => (save.snapshot.progress.experienceRemainderMicros = -1)),
    ).toBe(true);
  });

  it("rejects a loadout power bonus that is not a non-negative integer", () => {
    expect(corrupt((save) => (save.snapshot.progress.loadoutPowerBonusBp = -1))).toBe(
      true,
    );
    expect(corrupt((save) => (save.snapshot.progress.loadoutPowerBonusBp = 1.5))).toBe(
      true,
    );
    expect(
      corrupt((save) => (save.snapshot.progress.loadoutPowerBonusBp = "2809")),
    ).toBe(true);
  });

  it("rejects a per-item power bonus that is not a non-negative integer", () => {
    // Otherwise valid records, so only the power field can be the reason.
    const technique = {
      techniqueConfigId: "quiet_breathing_art",
      displayName: "静息诀",
      quality: "common",
      slot: "mind",
      star: 1,
      duplicateCount: 0,
      equippedSlot: null,
      powerBonusBp: 0,
      experienceBonusBp: 200,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
      configVersion: "local-idle-drop-v1",
    };
    const equipment = {
      id: "00000000-0000-4000-8000-000000000301",
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
    };

    expect(
      corrupt((save) => {
        // Emptying the chest keeps the accept case honest: a leftover chest
        // entry points at an instance this list no longer holds.
        save.snapshot.harvestChest = { pendingCount: 0, entries: [] };
        save.snapshot.techniques = [technique];
        save.snapshot.equipment = [equipment];
      }),
    ).toBe(false);
    expect(
      corrupt((save) => {
        save.snapshot.techniques = [{ ...technique, powerBonusBp: "180" }];
      }),
    ).toBe(true);
    expect(
      corrupt((save) => {
        save.snapshot.equipment = [{ ...equipment, powerBonusBp: -1 }];
      }),
    ).toBe(true);
  });
});

describe("rolled affix validation", () => {
  /** A legal legendary piece, so only the affix list can be the reason. */
  function legendaryPiece(rolledAffixes: unknown): MutableSave {
    return {
      id: "00000000-0000-4000-8000-000000000401",
      equipmentConfigId: "ironwood_sword",
      displayName: "玄木剑",
      quality: "legendary",
      slot: "weapon",
      powerBonusBp: 2_520,
      enhanceLevel: 0,
      rolledAffixes,
      location: "bag",
      equippedSlot: null,
      isLocked: true,
      configVersion: "local-idle-drop-v1",
    };
  }

  function withAffixes(rolledAffixes: unknown): boolean {
    return corrupt((save) => {
      // The chest cross-references the pieces it holds, so replacing the
      // equipment list means emptying the chest too, or the fixture reads as
      // tampered for a reason that has nothing to do with affixes.
      save.snapshot.harvestChest = { pendingCount: 0, entries: [] };
      save.snapshot.equipment = [legendaryPiece(rolledAffixes)];
    });
  }

  it("accepts three distinct stats", () => {
    expect(
      withAffixes([
        { stat: "experience_bonus", valueBp: 210 },
        { stat: "spirit_stone_bonus", valueBp: 386 },
        { stat: "drop_bonus", valueBp: 490 },
      ]),
    ).toBe(false);
  });

  it("accepts a value outside the quality's current roll range", () => {
    // Ranges constrain new rolls, not stored ones: a later retune must not
    // condemn a save that was legal when it was written.
    expect(withAffixes([{ stat: "drop_bonus", valueBp: 999_999 }])).toBe(false);
  });

  it("rejects more affixes than there are stats", () => {
    expect(
      withAffixes([
        { stat: "experience_bonus", valueBp: 210 },
        { stat: "spirit_stone_bonus", valueBp: 210 },
        { stat: "drop_bonus", valueBp: 210 },
        { stat: "experience_bonus", valueBp: 210 },
      ]),
    ).toBe(true);
  });

  it("rejects the same stat twice", () => {
    expect(
      withAffixes([
        { stat: "drop_bonus", valueBp: 210 },
        { stat: "drop_bonus", valueBp: 490 },
      ]),
    ).toBe(true);
  });

  it("rejects an unknown stat", () => {
    expect(withAffixes([{ stat: "power_bonus", valueBp: 210 }])).toBe(true);
  });

  it("rejects a malformed value", () => {
    expect(withAffixes([{ stat: "drop_bonus", valueBp: 210.5 }])).toBe(true);
    expect(withAffixes([{ stat: "drop_bonus", valueBp: -1 }])).toBe(true);
    expect(withAffixes([{ stat: "drop_bonus", valueBp: "210" }])).toBe(true);
    expect(withAffixes([{ stat: "drop_bonus", valueBp: 1_000_001 }])).toBe(true);
  });

  it("rejects an affix list that is not a list", () => {
    expect(withAffixes({ drop_bonus: 210 })).toBe(true);
    expect(withAffixes(null)).toBe(true);
    expect(withAffixes(["drop_bonus"])).toBe(true);
  });
});

describe("identity and wallet validation", () => {
  it("rejects a display name outside the allowed pattern", () => {
    expect(corrupt((save) => (save.snapshot.player.displayName = "a"))).toBe(true);
    expect(corrupt((save) => (save.snapshot.player.displayName = "x".repeat(13)))).toBe(
      true,
    );
    expect(corrupt((save) => (save.snapshot.player.displayName = "道 友"))).toBe(true);
    expect(corrupt((save) => (save.snapshot.player.displayName = "<script>"))).toBe(true);
  });

  it("rejects an unknown avatar variant", () => {
    expect(corrupt((save) => (save.snapshot.player.avatarVariant = "dragon"))).toBe(true);
  });

  it("rejects negative or malformed currency", () => {
    expect(corrupt((save) => (save.snapshot.wallet.spiritStone = "-1"))).toBe(true);
    expect(corrupt((save) => (save.snapshot.wallet.immortalJade = "NaN"))).toBe(true);
    expect(corrupt((save) => (save.snapshot.wallet.spiritStone = 500))).toBe(true);
  });
});

describe("collection validation", () => {
  it("rejects a bag capacity off the expansion grid", () => {
    expect(corrupt((save) => (save.snapshot.inventory.bagCapacity = 55))).toBe(true);
    expect(corrupt((save) => (save.snapshot.inventory.bagCapacity = 201))).toBe(true);
    expect(corrupt((save) => (save.snapshot.inventory.bagCapacity = 40))).toBe(true);
  });

  it("rejects an unknown item id in the bag", () => {
    expect(
      corrupt((save) => {
        save.snapshot.inventory.stacks.push({
          itemConfigId: "philosophers_stone",
          displayName: "贤者之石",
          quantity: "999",
        });
      }),
    ).toBe(true);
  });

  it("rejects a stack whose display name was tampered with", () => {
    expect(
      corrupt((save) => {
        save.snapshot.inventory.stacks = [
          { itemConfigId: "wood", displayName: "无限灵石", quantity: "1" },
        ];
      }),
    ).toBe(true);
  });

  it("rejects duplicate stacks of the same item", () => {
    expect(
      corrupt((save) => {
        save.snapshot.inventory.stacks = [
          { itemConfigId: "wood", displayName: "木材", quantity: "1" },
          { itemConfigId: "wood", displayName: "木材", quantity: "1" },
        ];
      }),
    ).toBe(true);
  });

  it("rejects a harvest chest longer than its capacity", () => {
    expect(
      corrupt((save) => {
        const entry = {
          id: "00000000-0000-4000-8000-000000000000",
          entryType: "technique",
          equipmentInstanceId: null,
          techniqueConfigId: "unknown",
          assetConfigId: "unknown",
          displayName: "未知",
          quality: "common",
          valueScore: "1",
          acquiredAt: START.toISOString(),
        };
        save.snapshot.harvestChest.entries = Array.from({ length: 101 }, () => ({
          ...entry,
        }));
        save.snapshot.harvestChest.pendingCount = 101;
      }),
    ).toBe(true);
  });

  it("rejects unknown unlock and settings shapes", () => {
    expect(corrupt((save) => (save.snapshot.unlocks.partner = "yes"))).toBe(true);
    expect(corrupt((save) => (save.snapshot.unlocks.trialTower = 1))).toBe(true);
    expect(corrupt((save) => delete save.snapshot.unlocks.trialTower)).toBe(true);
    expect(corrupt((save) => (save.snapshot.settings.selectedTab = "shop"))).toBe(true);
    expect(corrupt((save) => (save.snapshot.settings.autoSalvageCommon = 1))).toBe(true);
  });

  it("rejects a trial tower floor outside the tower's height", () => {
    expect(
      corrupt(
        (save) => (save.snapshot.trialTower.highestFloor = TRIAL_TOWER_MAX_FLOOR + 1),
      ),
    ).toBe(true);
    expect(corrupt((save) => (save.snapshot.trialTower.highestFloor = -1))).toBe(true);
    expect(corrupt((save) => (save.snapshot.trialTower.highestFloor = 1.5))).toBe(true);
    expect(corrupt((save) => (save.snapshot.trialTower = null))).toBe(true);
    // The top floor and an untouched tower are both legitimate.
    expect(
      corrupt(
        (save) => (save.snapshot.trialTower.highestFloor = TRIAL_TOWER_MAX_FLOOR),
      ),
    ).toBe(false);
  });

  it("rejects a progression task list that does not match the configured chain", () => {
    expect(corrupt((save) => save.snapshot.progressionTasks.pop())).toBe(true);
    expect(
      corrupt((save) =>
        save.snapshot.progressionTasks.push({
          ...save.snapshot.progressionTasks[0],
        }),
      ),
    ).toBe(true);
    expect(
      corrupt(
        (save) => (save.snapshot.progressionTasks[0].taskConfigId = "removed.task"),
      ),
    ).toBe(true);
    expect(
      corrupt((save) => (save.snapshot.progressionTasks[0].progress = "-1")),
    ).toBe(true);
    expect(
      corrupt((save) => (save.snapshot.progressionTasks[0].claimedAt = "yesterday")),
    ).toBe(true);
    expect(authenticSave().snapshot.progressionTasks).toHaveLength(
      PROGRESSION_TASK_CONFIGS.length,
    );
  });

  it("rejects a config block from a different game version", () => {
    expect(corrupt((save) => (save.snapshot.config.version = "local-9.9.9"))).toBe(true);
    expect(corrupt((save) => (save.snapshot.config.maxLevel = MAX_LEVEL + 1))).toBe(true);
  });

  it("rejects a non-empty activeEffects list this version cannot interpret", () => {
    expect(
      corrupt((save) => (save.snapshot.activeEffects = [{ type: "haste" }])),
    ).toBe(true);
  });
});

describe("rejection replaces rather than renders bad data", () => {
  it("starts a clean level 1 character when the save is rejected", () => {
    const platform = new FakePlatformAdapter();
    const tampered = authenticSave();
    tampered.snapshot.progress.level = MAX_LEVEL + 1;
    tampered.snapshot.wallet.spiritStone = "999999999";
    platform.seed(SAVE_KEY, tampered);

    const service = new LocalGameService(platform);
    const result = service.initialize(START);

    expect(result.created).toBe(true);
    expect(result.snapshot.progress.level).toBe(1);
    expect(result.snapshot.wallet.spiritStone).toBe("0");
    expect(result.snapshot.harvestChest.entries).toHaveLength(0);
  });

  it("overwrites the rejected save so the bad data cannot come back", () => {
    const platform = new FakePlatformAdapter();
    const tampered = authenticSave();
    tampered.schemaVersion = 99;
    platform.seed(SAVE_KEY, tampered);

    new LocalGameService(platform).initialize(START);

    const stored = JSON.parse(platform.raw(SAVE_KEY)!) as MutableSave;
    expect(stored.schemaVersion).toBe(1);
    expect(rejected(stored)).toBe(false);
  });
});
