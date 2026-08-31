import {
  CRAFTING_BAND_SPIRIT_STONE_MULTIPLIER,
  CRAFTING_QUALITY_BAND_WEIGHTS,
  CRAFTING_QUALITY_WEIGHTS,
  CRAFTING_RECIPE_CONFIGS,
  EQUIPMENT_BAND_CONFIGS,
  EQUIPMENT_CONFIGS,
  EQUIPMENT_DROP_QUALITY_WEIGHTS,
  MAX_LEVEL,
  craftingQualityWeight,
  craftingSpiritStoneCost,
  equipmentBandForConfig,
  equipmentBandForLevel,
  equipmentConfigForSlotAndBand,
  equipmentConfigsForBand,
  equipmentDropQualityWeights,
  getEquipmentBandConfig,
  type AssetQuality,
  type EquipmentBand,
  type EquipmentSlot,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";

const BANDS: readonly EquipmentBand[] = [1, 2, 3, 4];
const SLOTS: readonly EquipmentSlot[] = [
  "weapon",
  "armor",
  "accessory",
  "mount",
  "pet",
];
const QUALITIES: readonly AssetQuality[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
];

describe("equipment band boundaries", () => {
  it("covers every level from 1 to the cap with exactly one band", () => {
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      const matches = EQUIPMENT_BAND_CONFIGS.filter(
        (band) => level >= band.minLevel && level <= band.maxLevel,
      );
      expect(matches).toHaveLength(1);
      expect(equipmentBandForLevel(level)).toBe(matches[0]!.band);
    }
  });

  it("switches band exactly at the published boundaries", () => {
    expect(equipmentBandForLevel(1)).toBe(1);
    expect(equipmentBandForLevel(60)).toBe(1);
    expect(equipmentBandForLevel(61)).toBe(2);
    expect(equipmentBandForLevel(150)).toBe(2);
    expect(equipmentBandForLevel(151)).toBe(3);
    expect(equipmentBandForLevel(300)).toBe(3);
    expect(equipmentBandForLevel(301)).toBe(4);
    expect(equipmentBandForLevel(MAX_LEVEL)).toBe(4);
  });

  it("rejects levels outside the game's range", () => {
    expect(() => equipmentBandForLevel(0)).toThrow(RangeError);
    expect(() => equipmentBandForLevel(MAX_LEVEL + 1)).toThrow(RangeError);
    expect(() => equipmentBandForLevel(1.5)).toThrow(RangeError);
  });

  it("names every band and rejects unknown ones", () => {
    expect(BANDS.map((band) => getEquipmentBandConfig(band).displayName)).toEqual([
      "凡阶",
      "灵阶",
      "玄阶",
      "天阶",
    ]);
    expect(() => getEquipmentBandConfig(5 as EquipmentBand)).toThrow(RangeError);
  });
});

describe("equipment config families", () => {
  it("holds exactly one config per slot per band, with unique ids", () => {
    expect(EQUIPMENT_CONFIGS).toHaveLength(BANDS.length * SLOTS.length);
    expect(new Set(EQUIPMENT_CONFIGS.map((config) => config.id)).size).toBe(
      EQUIPMENT_CONFIGS.length,
    );
    for (const band of BANDS) {
      const configs = equipmentConfigsForBand(band);
      expect(configs.map((config) => config.slot)).toEqual(SLOTS);
    }
  });

  it("keeps the five original ids as band 1 so no save can be orphaned", () => {
    expect(equipmentConfigsForBand(1).map((config) => config.id)).toEqual([
      "ironwood_sword",
      "cloudweave_robe",
      "jade_spirit_ring",
      "mist_crane_mount",
      "moonfox_companion",
    ]);
  });

  it("gives every band of a slot the same basePower", () => {
    // This is the guard on the loadout ruler: the scale constant is solved from
    // a maxed and a starter endpoint at once, so the top band's base sum is
    // pinned to today's value and bands cannot be a power axis. Raising one
    // band's basePower here is what would break `loadout-power-model`.
    for (const slot of SLOTS) {
      const powers = BANDS.map(
        (band) => equipmentConfigForSlotAndBand(slot, band).basePower,
      );
      expect(new Set(powers).size).toBe(1);
    }
    expect(
      SLOTS.map((slot) => equipmentConfigForSlotAndBand(slot, 4).basePower),
    ).toEqual([80, 75, 55, 95, 90]);
  });

  it("reads a piece's band off its config, not off a level", () => {
    expect(equipmentBandForConfig("ironwood_sword")).toBe(1);
    expect(equipmentBandForConfig("azure_edge_sword")).toBe(2);
    expect(equipmentBandForConfig("violet_thunder_blade")).toBe(3);
    expect(equipmentBandForConfig("void_immortal_sword")).toBe(4);
    expect(() => equipmentBandForConfig("no_such_sword")).toThrow(RangeError);
  });

  it("resolves a slot within a band and rejects a band that lacks one", () => {
    expect(equipmentConfigForSlotAndBand("pet", 3).id).toBe("ninetail_sky_fox");
    expect(() => equipmentConfigForSlotAndBand("pet", 9 as EquipmentBand)).toThrow(
      RangeError,
    );
  });

  it("declares a level range matching the band it belongs to", () => {
    for (const band of BANDS) {
      const bandConfig = getEquipmentBandConfig(band);
      for (const config of equipmentConfigsForBand(band)) {
        expect(config.minLevel).toBe(bandConfig.minLevel);
        expect(config.maxLevel).toBe(bandConfig.maxLevel);
      }
    }
  });
});

describe("idle drop quality weights", () => {
  it("keeps band 1 on the split the fixed roll used", () => {
    expect(equipmentDropQualityWeights(1)).toEqual([
      { quality: "common", weight: 7_500 },
      { quality: "uncommon", weight: 2_500 },
    ]);
  });

  it("totals 10,000 in every band", () => {
    for (const band of BANDS) {
      const total = equipmentDropQualityWeights(band).reduce(
        (sum, entry) => sum + entry.weight,
        0,
      );
      expect(total).toBe(10_000);
    }
  });

  it("raises the ceiling one quality at a time and never lowers it", () => {
    const best = BANDS.map((band) => {
      const entries = EQUIPMENT_DROP_QUALITY_WEIGHTS[band];
      return entries[entries.length - 1]!.quality;
    });
    expect(best).toEqual(["uncommon", "rare", "epic", "legendary"]);
  });

  it("moves weight out of 普通 as the band rises", () => {
    const commonWeights = BANDS.map(
      (band) =>
        equipmentDropQualityWeights(band).find(
          (entry) => entry.quality === "common",
        )!.weight,
    );
    expect(commonWeights).toEqual([7_500, 5_000, 2_500, 1_000]);
  });

  it("rejects an unknown band", () => {
    expect(() => equipmentDropQualityWeights(0 as EquipmentBand)).toThrow(RangeError);
  });
});

describe("crafting quality weights", () => {
  it("leaves band 1 exactly where the single-table version had it", () => {
    expect(CRAFTING_QUALITY_WEIGHTS).toEqual([
      { quality: "common", weight: 7_000 },
      { quality: "uncommon", weight: 2_200 },
      { quality: "rare", weight: 650 },
      { quality: "epic", weight: 140 },
      { quality: "legendary", weight: 10 },
    ]);
    expect(CRAFTING_QUALITY_BAND_WEIGHTS[1].commonWeightFloor).toBe(3_000);
    expect(QUALITIES.map((quality) => craftingQualityWeight(quality, 10))).toEqual([
      3_500, 4_200, 1_750, 490, 60,
    ]);
  });

  it("defaults to band 1 so an un-migrated caller keeps today's odds", () => {
    for (const quality of QUALITIES) {
      expect(craftingQualityWeight(quality, 4)).toBe(
        craftingQualityWeight(quality, 4, 1),
      );
    }
  });

  it("quotes the published odds at a maxed crafting room", () => {
    // 传说 0.60% -> 0.86% -> 1.30% -> 2.40%, 普通 35.0% -> 6.4%.
    const percent = (band: EquipmentBand, quality: AssetQuality): string => {
      const weights = QUALITIES.map((candidate) =>
        craftingQualityWeight(candidate, 10, band),
      );
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      const own = craftingQualityWeight(quality, 10, band);
      return ((own / total) * 100).toFixed(2);
    };
    expect(BANDS.map((band) => percent(band, "legendary"))).toEqual([
      "0.60",
      "0.86",
      "1.30",
      "2.40",
    ]);
    expect(BANDS.map((band) => percent(band, "common"))).toEqual([
      "35.00",
      "20.95",
      "12.17",
      "6.40",
    ]);
  });

  it("lets the crafting room push weight out of 普通 down to each band's floor", () => {
    for (const band of BANDS) {
      const table = CRAFTING_QUALITY_BAND_WEIGHTS[band];
      expect(craftingQualityWeight("common", 0, band)).toBe(
        Math.max(table.commonWeightFloor, table.weights[0]!.weight),
      );
      expect(craftingQualityWeight("common", 100, band)).toBe(
        table.commonWeightFloor,
      );
    }
    expect(
      BANDS.map((band) => CRAFTING_QUALITY_BAND_WEIGHTS[band].commonWeightFloor),
    ).toEqual([3_000, 2_200, 1_400, 800]);
  });

  it("rejects a fractional or negative crafting room level and an unknown band", () => {
    expect(() => craftingQualityWeight("common", -1)).toThrow(RangeError);
    expect(() => craftingQualityWeight("common", 1.5)).toThrow(RangeError);
    expect(() => craftingQualityWeight("common", 1, 7 as EquipmentBand)).toThrow(
      RangeError,
    );
  });

  it("gives a quality outside the table no weight at all", () => {
    expect(craftingQualityWeight("mythic", 10, 4)).toBe(0);
    expect(craftingQualityWeight("primordial", 10, 4)).toBe(0);
  });
});

describe("crafting spirit stone cost", () => {
  it("scales spirit stone by band and leaves band 1 unchanged", () => {
    expect(CRAFTING_BAND_SPIRIT_STONE_MULTIPLIER).toEqual({ 1: 1, 2: 4, 3: 12, 4: 30 });
    const weapon = CRAFTING_RECIPE_CONFIGS.find(
      (recipe) => recipe.id === "forge_weapon",
    )!;
    expect(BANDS.map((band) => craftingSpiritStoneCost(weapon, band))).toEqual([
      1_200, 4_800, 14_400, 36_000,
    ]);
    const pet = CRAFTING_RECIPE_CONFIGS.find((recipe) => recipe.id === "forge_pet")!;
    expect(BANDS.map((band) => craftingSpiritStoneCost(pet, band))).toEqual([
      3_000, 12_000, 36_000, 90_000,
    ]);
  });

  it("rejects an unknown band", () => {
    const weapon = CRAFTING_RECIPE_CONFIGS[0]!;
    expect(() => craftingSpiritStoneCost(weapon, 0 as EquipmentBand)).toThrow(
      RangeError,
    );
  });
});
