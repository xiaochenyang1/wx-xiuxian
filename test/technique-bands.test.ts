import {
  EQUIPMENT_BAND_CONFIGS,
  IDLE_TECHNIQUE_DROP_QUALITY_WEIGHTS,
  TECHNIQUE_CONFIGS,
  TECHNIQUE_INHERIT_BASE_SPIRIT_STONE,
  TECHNIQUE_MAX_STAR,
  calculateLoadoutBonuses,
  getEquipmentBandConfig,
  getTechniqueConfig,
  idleTechniqueDropQualityWeights,
  techniqueBandForConfig,
  techniqueConfigForSlotBandQuality,
  techniqueConfigsForBand,
  techniqueInheritCost,
  type AssetQuality,
  type EquipmentBand,
  type TechniqueConfig,
  type TechniqueSlot,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";

const BANDS: readonly EquipmentBand[] = [1, 2, 3, 4];
const SLOTS: readonly TechniqueSlot[] = [
  "mind",
  "movement",
  "divine",
  "secret",
];
/** Books only ever roll at these two qualities; the rest are equipment-only. */
const QUALITIES: readonly AssetQuality[] = ["common", "uncommon"];

/** The eight ids a save written before this change could be holding. */
const BAND_1_IDS: readonly string[] = [
  "quiet_breathing_art",
  "azure_cloud_heart_manual",
  "light_step_art",
  "drifting_cloud_steps",
  "flame_finger",
  "thunder_seal",
  "spirit_gathering_secret",
  "star_observing_secret",
];

describe("technique config families", () => {
  it("holds exactly one config per slot per quality per band, with unique ids", () => {
    expect(TECHNIQUE_CONFIGS).toHaveLength(
      BANDS.length * SLOTS.length * QUALITIES.length,
    );
    expect(new Set(TECHNIQUE_CONFIGS.map((config) => config.id)).size).toBe(
      TECHNIQUE_CONFIGS.length,
    );
    for (const band of BANDS) {
      for (const slot of SLOTS) {
        for (const quality of QUALITIES) {
          const config = techniqueConfigForSlotBandQuality(slot, band, quality);
          expect(config.slot).toBe(slot);
          expect(config.quality).toBe(quality);
          expect(techniqueBandForConfig(config.id)).toBe(band);
        }
      }
    }
  });

  it("orders each band's eight books the same way", () => {
    // Band 1's order is the order the original literals were written in, and the
    // rows on 功法页 are drawn in array order — so keeping the three new bands on
    // the same order is what makes the page read the same at any level.
    const shape = (band: EquipmentBand): string[] =>
      techniqueConfigsForBand(band).map(
        (config) => `${config.slot}/${config.quality}`,
      );
    for (const band of BANDS) {
      expect(shape(band)).toEqual(shape(1));
    }
    expect(shape(1)).toEqual([
      "mind/common",
      "mind/uncommon",
      "movement/common",
      "movement/uncommon",
      "divine/common",
      "divine/uncommon",
      "secret/common",
      "secret/uncommon",
    ]);
  });

  it("declares a level range matching the band it belongs to", () => {
    for (const band of BANDS) {
      const bandConfig = getEquipmentBandConfig(band);
      for (const config of techniqueConfigsForBand(band)) {
        expect(config.minLevel).toBe(bandConfig.minLevel);
        expect(config.maxLevel).toBe(bandConfig.maxLevel);
      }
    }
  });

  it("covers Lv.1..1000 with the same boundaries the bands publish", () => {
    const ranges = BANDS.map((band) => {
      const configs = techniqueConfigsForBand(band);
      return { minLevel: configs[0]!.minLevel, maxLevel: configs[0]!.maxLevel };
    });
    expect(ranges).toEqual(
      EQUIPMENT_BAND_CONFIGS.map((band) => ({
        minLevel: band.minLevel,
        maxLevel: band.maxLevel,
      })),
    );
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]!.minLevel).toBe(ranges[index - 1]!.maxLevel + 1);
    }
  });

  it("rejects a band or a (slot, quality) pair that has no book", () => {
    expect(() => techniqueConfigForSlotBandQuality("mind", 9 as EquipmentBand, "common")).toThrow(RangeError);
    expect(() => techniqueConfigForSlotBandQuality("mind", 1, "legendary")).toThrow(RangeError);
    expect(() => techniqueBandForConfig("no_such_manual")).toThrow(RangeError);
  });
});

describe("band 1 is byte-for-byte what it was", () => {
  /**
   * The migration from `local-2.12.0` bumps the version and touches nothing else.
   * That is only sound while every id an old save can hold still resolves to the
   * same config, in the same array position, with the same numbers — the stored
   * bonus snapshots on a technique row were computed from these literals.
   */
  const BAND_1_CONFIGS: readonly TechniqueConfig[] = [
    {
      id: "quiet_breathing_art",
      displayName: "静息诀",
      slot: "mind",
      quality: "common",
      minLevel: 1,
      maxLevel: 60,
      valueScore: 100,
      fixedPower: 40,
      experienceBonusBp: 200,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
    },
    {
      id: "azure_cloud_heart_manual",
      displayName: "青云心法",
      slot: "mind",
      quality: "uncommon",
      minLevel: 1,
      maxLevel: 60,
      valueScore: 240,
      fixedPower: 100,
      experienceBonusBp: 500,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
    },
    {
      id: "light_step_art",
      displayName: "轻身步",
      slot: "movement",
      quality: "common",
      minLevel: 1,
      maxLevel: 60,
      valueScore: 90,
      fixedPower: 35,
      experienceBonusBp: 0,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
    },
    {
      id: "drifting_cloud_steps",
      displayName: "流云步",
      slot: "movement",
      quality: "uncommon",
      minLevel: 1,
      maxLevel: 60,
      valueScore: 220,
      fixedPower: 90,
      experienceBonusBp: 0,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
    },
    {
      id: "flame_finger",
      displayName: "离火指",
      slot: "divine",
      quality: "common",
      minLevel: 1,
      maxLevel: 60,
      valueScore: 120,
      fixedPower: 55,
      experienceBonusBp: 0,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
    },
    {
      id: "thunder_seal",
      displayName: "引雷印",
      slot: "divine",
      quality: "uncommon",
      minLevel: 1,
      maxLevel: 60,
      valueScore: 280,
      fixedPower: 125,
      experienceBonusBp: 0,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
    },
    {
      id: "spirit_gathering_secret",
      displayName: "聚灵秘术",
      slot: "secret",
      quality: "common",
      minLevel: 1,
      maxLevel: 60,
      valueScore: 110,
      fixedPower: 45,
      experienceBonusBp: 0,
      spiritStoneBonusBp: 100,
      dropBonusBp: 100,
    },
    {
      id: "star_observing_secret",
      displayName: "观星秘术",
      slot: "secret",
      quality: "uncommon",
      minLevel: 1,
      maxLevel: 60,
      valueScore: 260,
      fixedPower: 110,
      experienceBonusBp: 0,
      spiritStoneBonusBp: 250,
      dropBonusBp: 250,
    },
  ];

  it("keeps the eight original books first in the array", () => {
    expect(TECHNIQUE_CONFIGS.slice(0, BAND_1_IDS.length).map((c) => c.id)).toEqual(
      BAND_1_IDS,
    );
    expect(techniqueConfigsForBand(1).map((config) => config.id)).toEqual(
      BAND_1_IDS,
    );
  });

  it("keeps every field of every original book", () => {
    for (const expected of BAND_1_CONFIGS) {
      expect(getTechniqueConfig(expected.id)).toEqual(expected);
    }
  });
});

describe("what a higher band actually buys", () => {
  /** The four books of one band at one quality, all at the same star. */
  function bandBonuses(band: EquipmentBand, quality: AssetQuality, star: number) {
    return calculateLoadoutBonuses({
      techniques: SLOTS.map((slot) => ({
        techniqueConfigId: techniqueConfigForSlotBandQuality(slot, band, quality)
          .id,
        star,
      })),
      equipment: [],
    });
  }

  it("pays the same power in every band", () => {
    // The load-bearing invariant. The whole 34.607x spread from the worst book to
    // the best is already spent on star (x9.5), quality (x1.5) and the two base
    // sums, and the tower's floor-90 threshold was set against that. A band that
    // moved `fixedPower` would have to be paid for out of the threshold table.
    for (const quality of QUALITIES) {
      const powers = BANDS.map(
        (band) => bandBonuses(band, quality, TECHNIQUE_MAX_STAR).powerBonusBp,
      );
      expect(new Set(powers).size).toBe(1);
    }
    expect(bandBonuses(1, "uncommon", TECHNIQUE_MAX_STAR).powerBonusBp).toBe(
      27_251,
    );
    expect(bandBonuses(1, "common", TECHNIQUE_MAX_STAR).powerBonusBp).toBe(7_480);
  });

  it("sums each band's fixedPower to the same 175 and 425", () => {
    for (const quality of QUALITIES) {
      const sums = BANDS.map((band) =>
        SLOTS.reduce(
          (sum, slot) =>
            sum + techniqueConfigForSlotBandQuality(slot, band, quality).fixedPower,
          0,
        ),
      );
      expect(new Set(sums).size).toBe(1);
      expect(sums[0]).toBe(quality === "common" ? 175 : 425);
    }
  });

  it("raises the idle bonuses instead, on the affix band ladder", () => {
    // x1.00 / x1.20 / x1.45 / x1.75, baked into the literals rather than applied
    // at runtime, so a stored bonus snapshot never disagrees with its config.
    const experience = BANDS.map(
      (band) => bandBonuses(band, "uncommon", TECHNIQUE_MAX_STAR).experienceBonusBp,
    );
    expect(experience).toEqual([7_125, 8_550, 10_331, 12_468]);
    const stone = BANDS.map(
      (band) =>
        bandBonuses(band, "uncommon", TECHNIQUE_MAX_STAR).spiritStoneBonusBp,
    );
    const drop = BANDS.map(
      (band) => bandBonuses(band, "uncommon", TECHNIQUE_MAX_STAR).dropBonusBp,
    );
    expect(stone).toEqual([3_562, 6_412, 7_737, 9_333]);
    expect(drop).toEqual(stone);
  });

  it("never lowers a bonus as the band rises", () => {
    for (const quality of QUALITIES) {
      const totals = BANDS.map((band) => {
        const bonuses = bandBonuses(band, quality, TECHNIQUE_MAX_STAR);
        return (
          bonuses.experienceBonusBp +
          bonuses.spiritStoneBonusBp +
          bonuses.dropBonusBp
        );
      });
      for (let index = 1; index < totals.length; index += 1) {
        expect(totals[index]!).toBeGreaterThan(totals[index - 1]!);
      }
    }
  });
});

describe("idle technique drop quality weights", () => {
  it("keeps band 1 on the split the flat table used", () => {
    expect(idleTechniqueDropQualityWeights(1)).toEqual([
      { quality: "common", weight: 8_000 },
      { quality: "uncommon", weight: 2_000 },
    ]);
  });

  it("totals 10,000 in every band", () => {
    for (const band of BANDS) {
      const total = idleTechniqueDropQualityWeights(band).reduce(
        (sum, entry) => sum + entry.weight,
        0,
      );
      expect(total).toBe(10_000);
    }
  });

  it("is two entries wide in every band, so the seeded stream keeps its shape", () => {
    // `pickWeightedQuality` draws once per table regardless of width, but a band
    // that listed a third quality would also need a third book per slot. Two
    // entries everywhere is what lets a band 1 save replay a seed unchanged.
    for (const band of BANDS) {
      expect(idleTechniqueDropQualityWeights(band).map((e) => e.quality)).toEqual(
        QUALITIES,
      );
    }
    expect(Object.keys(IDLE_TECHNIQUE_DROP_QUALITY_WEIGHTS)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("moves weight out of 普通 as the band rises", () => {
    const commonWeights = BANDS.map(
      (band) =>
        idleTechniqueDropQualityWeights(band).find(
          (entry) => entry.quality === "common",
        )!.weight,
    );
    expect(commonWeights).toEqual([8_000, 7_000, 5_500, 4_000]);
  });

  it("rejects an unknown band", () => {
    expect(() => idleTechniqueDropQualityWeights(0 as EquipmentBand)).toThrow(
      RangeError,
    );
  });
});

describe("techniqueInheritCost", () => {
  it("prices a jump by the band the stars land in", () => {
    expect(TECHNIQUE_INHERIT_BASE_SPIRIT_STONE).toBe(50_000);
    expect(BANDS.map((band) => techniqueInheritCost("common", band))).toEqual([
      50_000, 200_000, 600_000, 1_500_000,
    ]);
    expect(BANDS.map((band) => techniqueInheritCost("uncommon", band))).toEqual([
      75_000, 300_000, 900_000, 2_250_000,
    ]);
  });

  it("reuses the crafting band ladder, so the two prices move together", () => {
    for (const quality of QUALITIES) {
      const base = techniqueInheritCost(quality, 1);
      expect(BANDS.map((band) => techniqueInheritCost(quality, band))).toEqual(
        [1, 4, 12, 30].map((multiplier) => base * multiplier),
      );
    }
  });

  it("rejects an unknown quality or band", () => {
    expect(() => techniqueInheritCost("common", 0 as EquipmentBand)).toThrow(
      RangeError,
    );
    expect(() =>
      techniqueInheritCost("unknown" as AssetQuality, 1),
    ).toThrow(RangeError);
  });
});

