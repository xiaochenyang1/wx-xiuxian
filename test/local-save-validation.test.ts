import { EXPEDITION_STAGE_CONFIGS, MAX_LEVEL } from "@cultivation-diary/shared";
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
});

describe("expedition validation", () => {
  it("rejects a missing or malformed expedition record", () => {
    expect(corrupt((save) => delete save.snapshot.expedition)).toBe(true);
    expect(corrupt((save) => (save.snapshot.expedition = null))).toBe(true);
    expect(
      corrupt((save) => (save.snapshot.expedition.clearedStageIds = {})),
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
    expect(corrupt((save) => (save.snapshot.settings.selectedTab = "shop"))).toBe(true);
    expect(corrupt((save) => (save.snapshot.settings.autoSalvageCommon = 1))).toBe(true);
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
