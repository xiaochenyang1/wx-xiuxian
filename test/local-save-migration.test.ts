import { CAVE_BUILDING_CONFIGS, CAVE_MAX_LEVEL } from "@cultivation-diary/shared";
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
  save.snapshot.config.version = "local-1.0.0";
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

describe("local-1.0.0 to local-1.1.0 migration", () => {
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

  it("backfills five unbuilt buildings and bumps the config version", () => {
    const service = load(legacySave());

    expect(service.snapshot.config.version).toBe("local-1.1.0");
    expect(service.snapshot.cave.buildings).toEqual(
      CAVE_BUILDING_CONFIGS.map((config) => ({
        buildingConfigId: config.id,
        level: 0,
      })),
    );
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
