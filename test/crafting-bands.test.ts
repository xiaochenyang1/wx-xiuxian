import {
  CAVE_BUILDING_CONFIGS,
  CRAFTING_RECIPE_CONFIGS,
  IDLE_MATERIAL_BAND_MULTIPLIER,
  craftingSpiritStoneCost,
  equipmentAffixRange,
  equipmentBandForConfig,
  getCraftingRecipeConfig,
  readRolledAffixes,
  resolveCraftingEquipmentConfig,
  type AssetQuality,
  type EquipmentBand,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import {
  getCraftingHeaderText,
  getCraftingRecipeDisplay,
} from "../assets/scripts/core/CraftingDisplay";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const NOW = new Date("2026-08-25T08:00:00.000Z");
const BAND_LEVELS: Readonly<Record<EquipmentBand, number>> = {
  1: 1,
  2: 61,
  3: 151,
  4: 301,
};

type MutableSave = Record<string, any>;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A save at one level, with a maxed crafting room and stock to forge from. */
function crafterAtLevel(
  level: number,
  options: { readonly roomLevel?: number; readonly spiritStone?: string } = {},
): LocalGameService {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const writer = new FakePlatformAdapter();
  new LocalGameService(writer).initialize(NOW);
  const save = JSON.parse(writer.raw(SAVE_KEY)!) as MutableSave;
  save.savedAt = NOW.toISOString();
  save.snapshot.progress.level = level;
  save.snapshot.progress.experience = "0";
  save.snapshot.progress.settledAt = NOW.toISOString();
  // A high-level fixture has passed dozens of level milestones. Marking them
  // claimed keeps their spirit stone out of the wallet, so what a craft costs is
  // the only thing that moves the balance.
  save.snapshot.progressionTasks = save.snapshot.progressionTasks.map(
    (task: MutableSave) => ({
      ...task,
      completedAt: NOW.toISOString(),
      claimedAt: NOW.toISOString(),
    }),
  );
  save.snapshot.wallet.spiritStone = options.spiritStone ?? "100000000";
  save.snapshot.unlocks.cave = true;
  save.snapshot.cave.buildings = CAVE_BUILDING_CONFIGS.map((config) => ({
    buildingConfigId: config.id,
    level: config.id === "crafting_room" ? (options.roomLevel ?? 10) : 0,
  }));
  save.snapshot.inventory.stacks = [
    ["wood", "木材"],
    ["stone", "石材"],
    ["ore", "矿石"],
    ["spiritual_herb", "灵草"],
    ["spiritual_soil", "灵土"],
  ].map(([itemConfigId, displayName]) => ({
    itemConfigId,
    displayName,
    quantity: "500",
  }));

  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  if (service.initialize(NOW).created) {
    throw new Error(`expected the Lv.${level} crafter fixture to load`);
  }
  return service;
}

describe("crafting resolves its product from the band", () => {
  it("forges the crafter's own band for every slot", () => {
    for (const band of [1, 2, 3, 4] as const) {
      for (const recipe of CRAFTING_RECIPE_CONFIGS) {
        const config = resolveCraftingEquipmentConfig(
          recipe.slot,
          BAND_LEVELS[band],
        );
        expect(config.slot).toBe(recipe.slot);
        expect(equipmentBandForConfig(config.id)).toBe(band);
      }
    }
  });

  it("switches product exactly at the band boundary", () => {
    expect(resolveCraftingEquipmentConfig("weapon", 60).id).toBe("ironwood_sword");
    expect(resolveCraftingEquipmentConfig("weapon", 61).id).toBe("azure_edge_sword");
    expect(resolveCraftingEquipmentConfig("weapon", 300).id).toBe(
      "violet_thunder_blade",
    );
    expect(resolveCraftingEquipmentConfig("weapon", 301).id).toBe(
      "void_immortal_sword",
    );
  });

  it("rejects a level outside the game's range", () => {
    expect(() => resolveCraftingEquipmentConfig("weapon", 0)).toThrow(RangeError);
    expect(() => resolveCraftingEquipmentConfig("weapon", 1_001)).toThrow(RangeError);
  });

  it("puts the resolved band's piece in the bag, not the band 1 piece", () => {
    const service = crafterAtLevel(BAND_LEVELS[4]);
    const crafted = service.craftEquipment("forge_weapon").snapshot.equipment.at(-1)!;
    expect(crafted.equipmentConfigId).toBe("void_immortal_sword");
    expect(crafted.displayName).toBe("太虚斩仙剑");
    expect(crafted.location).toBe("bag");
  });

  it("rolls the forged piece's affixes in the forging band's range", () => {
    for (const band of [1, 2, 3, 4] as const) {
      const service = crafterAtLevel(BAND_LEVELS[band]);
      const crafted = service.craftEquipmentBatch("forge_weapon").snapshot.equipment;
      expect(crafted.length).toBeGreaterThan(0);
      for (const piece of crafted) {
        const range = equipmentAffixRange(piece.quality as AssetQuality, band);
        const affixes = readRolledAffixes(piece.rolledAffixes);
        expect(affixes).toHaveLength(range.count);
        for (const affix of affixes) {
          expect(affix.valueBp).toBeGreaterThanOrEqual(range.minValueBp);
          expect(affix.valueBp).toBeLessThanOrEqual(range.maxValueBp);
        }
      }
    }
  });

  it("names the slot in the recipe and the product in the message", () => {
    // The recipe can no longer name a piece, because which piece it forges
    // depends on who is forging it.
    expect(CRAFTING_RECIPE_CONFIGS.map((recipe) => recipe.displayName)).toEqual([
      "锻造兵器",
      "缝制护甲",
      "琢磨饰品",
      "驯养坐骑",
      "契约灵宠",
    ]);
    expect(crafterAtLevel(1).craftEquipment("forge_weapon").message).toMatch(
      /^锻造兵器成功，获得\S+品质玄木剑$/,
    );
    expect(
      crafterAtLevel(BAND_LEVELS[4]).craftEquipment("forge_weapon").message,
    ).toMatch(/^锻造兵器成功，获得\S+品质太虚斩仙剑$/);
  });
});

describe("crafting costs scale spirit stone and leave materials flat", () => {
  it("charges the band's multiple of the recipe's spirit stone", () => {
    const recipe = getCraftingRecipeConfig("forge_weapon");
    for (const band of [1, 2, 3, 4] as const) {
      const service = crafterAtLevel(BAND_LEVELS[band]);
      const before = service.snapshot.wallet.spiritStone;
      const after = service.craftEquipment("forge_weapon").snapshot.wallet.spiritStone;
      expect(Number(before) - Number(after)).toBe(
        craftingSpiritStoneCost(recipe, band),
      );
    }
  });

  it("charges band 1 exactly what it charged before bands existed", () => {
    const service = crafterAtLevel(1, { spiritStone: "5000" });
    expect(
      service.craftEquipment("forge_weapon").snapshot.wallet.spiritStone,
    ).toBe("3800");
  });

  it("spends the same materials in every band", () => {
    const spent = [1, 2, 3, 4].map((band) => {
      const service = crafterAtLevel(BAND_LEVELS[band as EquipmentBand]);
      const before = quantities(service.snapshot);
      const after = quantities(service.craftEquipment("forge_weapon").snapshot);
      return { wood: before.wood - after.wood, ore: before.ore - after.ore };
    });
    expect(spent).toEqual([
      { wood: 8, ore: 6 },
      { wood: 8, ore: 6 },
      { wood: 8, ore: 6 },
      { wood: 8, ore: 6 },
    ]);
  });

  it("limits a batch by the band's price, not the band 1 price", () => {
    // 36,000 per 天阶 weapon: 100,000 spirit stone buys two, not the 83 it
    // would buy at the 凡阶 price of 1,200.
    const service = crafterAtLevel(BAND_LEVELS[4], { spiritStone: "100000" });
    const result = service.craftEquipmentBatch("forge_weapon");
    expect(result.message).toMatch(/^批量锻造兵器 x2，/);
    expect(result.snapshot.wallet.spiritStone).toBe("28000");
  });

  it("refuses a craft the band's price puts out of reach", () => {
    const service = crafterAtLevel(BAND_LEVELS[4], { spiritStone: "1200" });
    expect(() => service.craftEquipment("forge_weapon")).toThrow("灵石不足");
    expect(service.snapshot.wallet.spiritStone).toBe("1200");
  });
});

describe("crafting panel display", () => {
  it("quotes the current band's product and price", () => {
    const band4 = getCraftingRecipeDisplay(
      crafterAtLevel(BAND_LEVELS[4]).snapshot,
      getCraftingRecipeConfig("forge_weapon"),
    );
    expect(band4.productText).toBe("天阶 · 太虚斩仙剑");
    expect(band4.costText).toBe("3.6万 灵石");

    const band1 = getCraftingRecipeDisplay(
      crafterAtLevel(1).snapshot,
      getCraftingRecipeConfig("forge_weapon"),
    );
    expect(band1.productText).toBe("凡阶 · 玄木剑");
    expect(band1.costText).toBe("1,200 灵石");
  });

  it("marks a recipe unaffordable once the band's price outruns the wallet", () => {
    const recipe = getCraftingRecipeConfig("forge_weapon");
    expect(
      getCraftingRecipeDisplay(
        crafterAtLevel(BAND_LEVELS[4], { spiritStone: "36000" }).snapshot,
        recipe,
      ).affordable,
    ).toBe(true);
    expect(
      getCraftingRecipeDisplay(
        crafterAtLevel(BAND_LEVELS[4], { spiritStone: "35999" }).snapshot,
        recipe,
      ).affordable,
    ).toBe(false);
  });

  it("puts the band and its odds in the header", () => {
    expect(getCraftingHeaderText(crafterAtLevel(1).snapshot)).toBe(
      "炼器室 Lv.10　凡阶　当前稀有及以上概率 23.0%　挂机材料 ×1",
    );
    expect(getCraftingHeaderText(crafterAtLevel(BAND_LEVELS[4]).snapshot)).toBe(
      "炼器室 Lv.10　天阶　当前稀有及以上概率 52.0%　挂机材料 ×10",
    );
  });

  it("names the idle material rate of every band it can be read at", () => {
    // The header is the only surface that states the multiplier, so a band whose
    // rate went unsaid would leave the player guessing why the bill got easier.
    for (const band of [1, 2, 3, 4] as const) {
      expect(
        getCraftingHeaderText(crafterAtLevel(BAND_LEVELS[band]).snapshot),
      ).toContain(`挂机材料 ×${IDLE_MATERIAL_BAND_MULTIPLIER[band]}`);
    }
  });
});

function quantities(snapshot: {
  inventory: { stacks: readonly { itemConfigId: string; quantity: string }[] };
}): { wood: number; ore: number } {
  const read = (id: string): number =>
    Number(
      snapshot.inventory.stacks.find((stack) => stack.itemConfigId === id)
        ?.quantity ?? "0",
    );
  return { wood: read("wood"), ore: read("ore") };
}
