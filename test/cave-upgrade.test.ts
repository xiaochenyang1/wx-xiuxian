import {
  caveUpgradeCost,
  getCaveBuildingConfig,
  getItemConfig,
  CAVE_MAX_LEVEL,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");
/** Seed 1 yields both a technique and a full set of materials over one idle day. */
const SEED = 1;

type MutableSave = Record<string, any>;

/** A level-1 service that has not yet unlocked the cave. */
function lockedService(): LocalGameService {
  const service = new LocalGameService(new FakePlatformAdapter());
  service.initialize(START);
  return service;
}

/**
 * A level-11 service with the cave unlocked, materials in the bag, and by
 * default enough spirit stone for several upgrades.
 */
function unlockedService({ grants = 10 } = {}): LocalGameService {
  const service = new LocalGameService(new FakePlatformAdapter());
  service.initialize(START);
  service.debugSimulateOffline(86_400, SEED);
  service.breakthrough();
  for (let i = 0; i < grants; i += 1) service.debugGrant("spirit_stone");
  return service;
}

/**
 * Reload an unlocked save after editing it, so a test can start from an exact
 * building level or material count instead of grinding towards one.
 */
function serviceWithSave(mutate: (save: MutableSave) => void): LocalGameService {
  const platform = new FakePlatformAdapter();
  const seedService = new LocalGameService(platform);
  seedService.initialize(START);
  seedService.debugSimulateOffline(86_400, SEED);
  seedService.breakthrough();

  const raw = platform.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected a persisted save");
  const save = JSON.parse(raw) as MutableSave;
  mutate(save);

  const reloaded = new FakePlatformAdapter();
  reloaded.seed(SAVE_KEY, save);
  const service = new LocalGameService(reloaded);
  service.initialize(new Date(new Date(save.savedAt).getTime() + 60_000));
  return service;
}

function building(save: MutableSave, buildingConfigId: string): any {
  return save.snapshot.cave.buildings.find(
    (item: any) => item.buildingConfigId === buildingConfigId,
  );
}

function stack(save: MutableSave, itemConfigId: string): any {
  return save.snapshot.inventory.stacks.find(
    (item: any) => item.itemConfigId === itemConfigId,
  );
}

function stackOf(service: LocalGameService, itemConfigId: string): number {
  const found = service.snapshot.inventory.stacks.find(
    (item) => item.itemConfigId === itemConfigId,
  );
  return Number(found?.quantity ?? "0");
}

function levelOf(service: LocalGameService, buildingConfigId: string): number {
  return service.snapshot.cave.buildings.find(
    (item) => item.buildingConfigId === buildingConfigId,
  )!.level;
}

describe("cave building upgrade", () => {
  it("charges exactly the quoted spirit stone and materials", () => {
    const service = unlockedService();
    const cost = caveUpgradeCost("spirit_array", 0);
    const stonesBefore = Number(service.snapshot.wallet.spiritStone);
    const materialsBefore = cost.materials.map((material) =>
      stackOf(service, material.itemConfigId),
    );

    service.upgradeCaveBuilding("spirit_array");

    expect(Number(service.snapshot.wallet.spiritStone)).toBe(
      stonesBefore - cost.spiritStone,
    );
    cost.materials.forEach((material, index) => {
      expect(stackOf(service, material.itemConfigId)).toBe(
        materialsBefore[index]! - material.quantity,
      );
    });
    expect(levelOf(service, "spirit_array")).toBe(1);
  });

  it("leaves other buildings untouched", () => {
    const service = unlockedService();
    service.upgradeCaveBuilding("spirit_array");

    expect(levelOf(service, "spirit_field")).toBe(0);
    expect(levelOf(service, "alchemy_room")).toBe(0);
    expect(levelOf(service, "crafting_room")).toBe(0);
    expect(levelOf(service, "seclusion_room")).toBe(0);
  });

  it("raises the experience bonus and the cultivation rate", () => {
    const service = unlockedService();
    const bonusBefore = service.snapshot.progress.experienceBonusBp;
    const rateBefore = Number(service.snapshot.progress.experiencePerSecond);

    service.upgradeCaveBuilding("spirit_array");

    expect(service.snapshot.progress.experienceBonusBp).toBeGreaterThan(bonusBefore);
    expect(Number(service.snapshot.progress.experiencePerSecond)).toBeGreaterThan(
      rateBefore,
    );
  });

  it("stacks cave bonuses on top of equipped technique bonuses", () => {
    const service = unlockedService();
    const technique = service.snapshot.harvestChest.entries.find(
      (entry) => entry.entryType === "technique",
    );
    expect(technique).toBeDefined();
    service.transferHarvest(technique!.id);
    service.equipTechnique(service.snapshot.techniques[0]!.techniqueConfigId);

    const techniqueBonus = service.snapshot.progress.experienceBonusBp;
    expect(techniqueBonus).toBeGreaterThan(0);

    service.upgradeCaveBuilding("spirit_array");

    const config = getCaveBuildingConfig("spirit_array");
    expect(service.snapshot.progress.experienceBonusBp).toBe(
      techniqueBonus + config.bonusPerLevelBp,
    );
  });

  it("survives a save round-trip with the bonus still applied", () => {
    const platform = new FakePlatformAdapter();
    const service = new LocalGameService(platform);
    service.initialize(START);
    service.debugSimulateOffline(86_400, SEED);
    service.breakthrough();
    for (let i = 0; i < 10; i += 1) service.debugGrant("spirit_stone");
    service.upgradeCaveBuilding("spirit_array");
    const expected = service.snapshot.progress.experienceBonusBp;

    const reloaded = new LocalGameService(platform);
    reloaded.initialize(new Date(START.getTime() + 86_400_000));

    expect(levelOf(reloaded, "spirit_array")).toBe(1);
    expect(reloaded.snapshot.progress.experienceBonusBp).toBe(expected);
  });
});

describe("cave upgrade rejections", () => {
  it("refuses before the cave is unlocked", () => {
    const service = lockedService();
    expect(() => service.upgradeCaveBuilding("spirit_array")).toThrow(
      "修为达到 Lv.11 才能开辟洞府",
    );
  });

  it("refuses an unknown building", () => {
    const service = unlockedService();
    expect(() => service.upgradeCaveBuilding("nope")).toThrow();
  });

  it("refuses once the building is at max level", () => {
    const service = serviceWithSave((save) => {
      building(save, "spirit_array").level = CAVE_MAX_LEVEL - 1;
    });
    for (let i = 0; i < 40; i += 1) service.debugGrant("spirit_stone");

    service.upgradeCaveBuilding("spirit_array");
    expect(levelOf(service, "spirit_array")).toBe(CAVE_MAX_LEVEL);

    expect(() => service.upgradeCaveBuilding("spirit_array")).toThrow("已满级");
  });

  it("refuses when spirit stone is short", () => {
    const service = unlockedService({ grants: 0 });
    // The first upgrade is affordable; the second costs four times as much.
    service.upgradeCaveBuilding("spirit_array");
    const stones = Number(service.snapshot.wallet.spiritStone);
    const next = caveUpgradeCost("spirit_array", 1);
    expect(stones).toBeLessThan(next.spiritStone);

    expect(() => service.upgradeCaveBuilding("spirit_array")).toThrow("灵石不足");
  });

  it("names the missing material and the exact shortfall", () => {
    const cost = caveUpgradeCost("alchemy_room", 0);
    const scarce = cost.materials[0]!;
    const remaining = scarce.quantity - 2;
    const service = serviceWithSave((save) => {
      stack(save, scarce.itemConfigId).quantity = String(remaining);
    });
    for (let i = 0; i < 40; i += 1) service.debugGrant("spirit_stone");

    expect(() => service.upgradeCaveBuilding("alchemy_room")).toThrow(
      `${getItemConfig(scarce.itemConfigId).displayName}不足，还需 2 个`,
    );
  });

  it("charges nothing when it refuses", () => {
    const service = unlockedService();
    const wallet = service.snapshot.wallet.spiritStone;
    const stacks = JSON.stringify(service.snapshot.inventory.stacks);
    const buildings = JSON.stringify(service.snapshot.cave.buildings);

    expect(() => service.upgradeCaveBuilding("nope")).toThrow();

    // `mutate` settles idle progress before running the operation, so only the
    // resources this call would have spent are asserted to be untouched.
    expect(service.snapshot.wallet.spiritStone).toBe(wallet);
    expect(JSON.stringify(service.snapshot.inventory.stacks)).toBe(stacks);
    expect(JSON.stringify(service.snapshot.cave.buildings)).toBe(buildings);

    const locked = lockedService();
    const lockedBuildings = JSON.stringify(locked.snapshot.cave.buildings);
    expect(() => locked.upgradeCaveBuilding("spirit_array")).toThrow();
    expect(JSON.stringify(locked.snapshot.cave.buildings)).toBe(lockedBuildings);
  });
});
