import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");

/**
 * Every save the game writes must be a save the game can read back. A value the
 * writer produces but the validator rejects is invisible until the player
 * relaunches and finds their progress gone, so this walks a wide range of
 * reachable states and reloads each one.
 */
function assertReloads(label: string, play: (service: LocalGameService) => void): void {
  const platform = new FakePlatformAdapter();
  const service = new LocalGameService(platform);
  service.initialize(START);
  play(service);

  const raw = platform.raw(SAVE_KEY);
  if (raw === undefined) throw new Error(`${label}: expected a persisted save`);
  const saved = JSON.parse(raw);

  const reader = new FakePlatformAdapter();
  reader.seed(SAVE_KEY, saved);
  const reloaded = new LocalGameService(reader);
  const result = reloaded.initialize(
    new Date(new Date(saved.savedAt).getTime() + 60_000),
  );

  expect(result.created, `${label}: the save was rejected on reload`).toBe(false);
}

describe("every reachable save round-trips", () => {
  it("survives a fresh start", () => {
    assertReloads("fresh", () => {});
  });

  it("survives idle settlement across many seeds", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      assertReloads(`seed ${seed}`, (service) => {
        service.debugSimulateOffline(86_400, seed);
      });
    }
  });

  it("survives breakthrough and the unlocks it triggers", () => {
    assertReloads("breakthrough", (service) => {
      service.debugSimulateOffline(86_400, 1);
      service.breakthrough();
    });
  });

  it("survives equipping every technique that drops", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      assertReloads(`equip technique seed ${seed}`, (service) => {
        service.debugSimulateOffline(86_400, seed);
        for (const entry of [...service.snapshot.harvestChest.entries]) {
          if (entry.entryType !== "technique") continue;
          service.transferHarvest(entry.id);
        }
        for (const technique of [...service.snapshot.techniques]) {
          service.equipTechnique(technique.techniqueConfigId);
        }
      });
    }
  });

  it("survives equipping every piece of equipment that drops", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      assertReloads(`equip gear seed ${seed}`, (service) => {
        service.debugSimulateOffline(86_400, seed);
        for (const entry of [...service.snapshot.harvestChest.entries]) {
          if (entry.entryType !== "equipment") continue;
          service.transferHarvest(entry.id);
        }
        for (const item of [...service.snapshot.equipment]) {
          try {
            service.equipEquipment(item.id, item.slot as never);
          } catch {
            // Slot conflicts are a normal rejection, not a persistence problem.
          }
        }
      });
    }
  });

  it("survives every cave building at every level", () => {
    for (const buildingConfigId of [
      "spirit_array",
      "spirit_field",
      "alchemy_room",
      "crafting_room",
      "seclusion_room",
    ]) {
      assertReloads(`cave ${buildingConfigId}`, (service) => {
        service.debugSimulateOffline(86_400, 1);
        service.breakthrough();
        for (let level = 0; level < 10; level += 1) {
          for (let grant = 0; grant < 60; grant += 1) {
            service.debugGrant("spirit_stone");
          }
          try {
            service.upgradeCaveBuilding(buildingConfigId);
          } catch {
            // Materials run out before the cap; the save must still reload.
          }
        }
      });
    }
  });

  it("survives bag expansion and item use", () => {
    assertReloads("bag and items", (service) => {
      service.debugSimulateOffline(86_400, 1);
      for (let i = 0; i < 30; i += 1) service.debugGrant("spirit_stone");
      service.expandInventory();
      service.expandInventory();
    });
  });

  it("survives renaming and avatar choice", () => {
    assertReloads("profile", (service) => {
      service.chooseAvatar("female");
      service.renamePlayer("测试道友");
    });
  });

  it("survives salvaging harvest entries", () => {
    assertReloads("salvage", (service) => {
      service.debugSimulateOffline(86_400, 3);
      for (const entry of [...service.snapshot.harvestChest.entries]) {
        service.salvageHarvest(entry.id);
      }
    });
  });

  it("survives a long chain of mixed actions", () => {
    assertReloads("mixed", (service) => {
      service.debugSimulateOffline(86_400, 7);
      service.breakthrough();
      for (const entry of [...service.snapshot.harvestChest.entries]) {
        service.transferHarvest(entry.id);
      }
      for (const technique of [...service.snapshot.techniques]) {
        service.equipTechnique(technique.techniqueConfigId);
      }
      for (let i = 0; i < 60; i += 1) service.debugGrant("spirit_stone");
      service.upgradeCaveBuilding("spirit_array");
      service.expandInventory();
      service.renamePlayer("云中客");
      service.checkpoint(new Date(START.getTime() + 90_000_000));
    });
  });
});
