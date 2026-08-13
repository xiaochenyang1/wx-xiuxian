import { EXPEDITION_STAGE_CONFIGS } from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");
const UPGRADE_EQUIPMENT_ID = "00000000-0000-4000-8000-000000000101";
const UPGRADE_TECHNIQUE_ID = "quiet_breathing_art";

type MutableSave = Record<string, any>;

/**
 * Every save the game writes must be a save the game can read back. A value the
 * writer produces but the validator rejects is invisible until the player
 * relaunches and finds their progress gone, so this walks a wide range of
 * reachable states and reloads each one.
 */
function assertReloads(
  label: string,
  play: (service: LocalGameService) => void,
  seedSave?: (save: MutableSave) => void,
): LocalGameService {
  const platform = new FakePlatformAdapter();
  let service = new LocalGameService(platform);
  service.initialize(START);
  if (seedSave) {
    const raw = platform.raw(SAVE_KEY);
    if (raw === undefined) throw new Error(`${label}: expected a seed save`);
    const save = JSON.parse(raw) as MutableSave;
    seedSave(save);
    platform.seed(SAVE_KEY, save);
    service = new LocalGameService(platform);
    const seeded = service.initialize(new Date(save.savedAt));
    expect(seeded.created, `${label}: seed save was rejected`).toBe(false);
  }
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
  return reloaded;
}

function seedUpgradeAssets(save: MutableSave): void {
  save.snapshot.wallet.spiritStone = "10000";
  save.snapshot.inventory.stacks = [
    {
      itemConfigId: "enhance_stone",
      displayName: "强化石",
      quantity: "10",
    },
  ];
  save.snapshot.equipment = [
    {
      id: UPGRADE_EQUIPMENT_ID,
      equipmentConfigId: "ironwood_sword",
      displayName: "玄木剑",
      quality: "common",
      slot: "weapon",
      fixedPower: "0",
      enhanceLevel: 0,
      rolledAffixes: [],
      location: "equipped",
      equippedSlot: "weapon",
      isLocked: false,
      configVersion: "local-idle-drop-v1",
    },
  ];
  save.snapshot.techniques = [
    {
      techniqueConfigId: UPGRADE_TECHNIQUE_ID,
      displayName: "静息诀",
      quality: "common",
      slot: "mind",
      star: 1,
      duplicateCount: 1,
      equippedSlot: "mind",
      fixedPower: "0",
      experienceBonusBp: 0,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
      configVersion: "local-idle-drop-v1",
    },
  ];
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

  it("survives an expedition first-clear reward", () => {
    assertReloads("expedition", (service) => {
      service.challengeExpedition(EXPEDITION_STAGE_CONFIGS[0]!.id);
    });
  });

  it("survives alchemy and crafting results", () => {
    const reloaded = assertReloads(
      "alchemy and crafting",
      (service) => {
        service.brewAlchemy("small_experience_pill");
        service.craftEquipment("forge_weapon");
      },
      (save) => {
        save.snapshot.wallet.spiritStone = "10000";
        save.snapshot.inventory.stacks = [
          { itemConfigId: "spiritual_herb", displayName: "灵草", quantity: "20" },
          { itemConfigId: "spiritual_soil", displayName: "灵土", quantity: "20" },
          { itemConfigId: "wood", displayName: "木材", quantity: "20" },
          { itemConfigId: "ore", displayName: "矿石", quantity: "20" },
        ];
      },
    );

    expect(
      reloaded.snapshot.inventory.stacks.find(
        (stack) => stack.itemConfigId === "exp_pill_small",
      )?.quantity,
    ).toBe("1");
    expect(
      reloaded.snapshot.equipment.some(
        (equipment) => equipment.equipmentConfigId === "ironwood_sword",
      ),
    ).toBe(true);
  });

  it("survives partner and sect progression", () => {
    const reloaded = assertReloads(
      "partner and sect",
      (service) => {
        service.choosePartner("jun_rulan");
        service.cultivateWithPartner();
        service.joinSect("qingyun");
        service.donateToSect();
      },
      (save) => {
        save.snapshot.progress.level = 11;
        save.snapshot.progress.experience = "0";
        save.snapshot.progress.status = "gaining";
        save.snapshot.inventory.stacks = [
          { itemConfigId: "dual_cultivation_pill", displayName: "双修丹", quantity: "2" },
          { itemConfigId: "wood", displayName: "木材", quantity: "10" },
          { itemConfigId: "stone", displayName: "石材", quantity: "10" },
          { itemConfigId: "spiritual_herb", displayName: "灵草", quantity: "10" },
        ];
      },
    );

    expect(reloaded.snapshot.partner).toEqual({
      partnerId: "jun_rulan",
      level: 1,
      bond: 100,
    });
    expect(reloaded.snapshot.sect).toEqual({
      sectId: "qingyun",
      level: 1,
      contribution: 100,
    });
  });

  it("survives a mixed equipment enhancement and technique star-up chain", () => {
    const reloaded = assertReloads(
      "asset upgrades",
      (service) => {
        service.enhanceEquipment(UPGRADE_EQUIPMENT_ID);
        service.upgradeTechnique(UPGRADE_TECHNIQUE_ID);
        service.unequipEquipment(UPGRADE_EQUIPMENT_ID);
        service.equipEquipment(UPGRADE_EQUIPMENT_ID, "weapon");
        service.unequipTechnique(UPGRADE_TECHNIQUE_ID);
        service.equipTechnique(UPGRADE_TECHNIQUE_ID);
      },
      seedUpgradeAssets,
    );

    const equipment = reloaded.snapshot.equipment[0]!;
    const technique = reloaded.snapshot.techniques[0]!;
    expect(equipment.enhanceLevel).toBe(1);
    expect(equipment.fixedPower).toBe("88");
    expect(equipment.equippedSlot).toBe("weapon");
    expect(technique.star).toBe(2);
    expect(technique.duplicateCount).toBe(0);
    expect(technique.fixedPower).toBe("48");
    expect(technique.equippedSlot).toBe("mind");
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
