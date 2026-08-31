import {
  AFFIX_STATS,
  ASSET_QUALITY_ORDER,
  EQUIPMENT_AFFIX_BAND_MULTIPLIER_BP,
  EQUIPMENT_AFFIX_ROLL,
  equipmentAffixRange,
  equipmentAffixScoreBp,
  equipmentAscendCost,
  equipmentRerollCost,
  canAscendEquipmentQuality,
  nextAssetQuality,
  rollEquipmentAffixes,
  type AssetQuality,
  type EquipmentBand,
  type RolledAffix,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";

const QUALITIES = Object.keys(ASSET_QUALITY_ORDER) as AssetQuality[];
const BANDS: readonly EquipmentBand[] = [1, 2, 3, 4];

/** Feeds rollEquipmentAffixes a fixed sequence so a roll becomes an assertion. */
function scriptedRandomInt(values: readonly number[]): (max: number) => number {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) {
      throw new Error(`Scripted randomInt exhausted after ${index} calls`);
    }
    index += 1;
    return value;
  };
}

/** Always returns the lowest allowed draw: first stats in order, minimum values. */
const lowestRoll = (): number => 0;

/** Always returns the highest allowed draw for whatever span it is given. */
const highestRoll = (maxExclusive: number): number => maxExclusive - 1;

describe("equipment affix roll table", () => {
  it("covers every quality", () => {
    for (const quality of QUALITIES) {
      expect(EQUIPMENT_AFFIX_ROLL[quality]).toBeDefined();
    }
  });

  it("keeps the documented counts and ranges", () => {
    expect(
      QUALITIES.map((quality) => [quality, equipmentAffixRange(quality, 1)] as const),
    ).toEqual([
      ["common", { count: 0, minValueBp: 0, maxValueBp: 0 }],
      ["uncommon", { count: 1, minValueBp: 60, maxValueBp: 140 }],
      ["rare", { count: 1, minValueBp: 108, maxValueBp: 252 }],
      ["epic", { count: 2, minValueBp: 150, maxValueBp: 350 }],
      ["legendary", { count: 3, minValueBp: 210, maxValueBp: 490 }],
      ["mythic", { count: 3, minValueBp: 300, maxValueBp: 700 }],
      ["primordial", { count: 3, minValueBp: 420, maxValueBp: 980 }],
    ]);
  });

  it("centers uncommon through legendary on the values they used to award", () => {
    expect(EQUIPMENT_AFFIX_ROLL.uncommon.centerBp).toBe(100);
    expect(EQUIPMENT_AFFIX_ROLL.rare.centerBp).toBe(180);
    expect(EQUIPMENT_AFFIX_ROLL.epic.centerBp).toBe(250);
    expect(EQUIPMENT_AFFIX_ROLL.legendary.centerBp).toBe(350);
  });

  it("never asks for more affixes than there are stats", () => {
    for (const quality of QUALITIES) {
      expect(EQUIPMENT_AFFIX_ROLL[quality].count).toBeLessThanOrEqual(
        AFFIX_STATS.length,
      );
    }
  });
});

describe("affix ranges grow with the band", () => {
  it("multiplies the center by the documented factor", () => {
    expect(EQUIPMENT_AFFIX_BAND_MULTIPLIER_BP).toEqual({
      1: 10_000,
      2: 12_000,
      3: 14_500,
      4: 17_500,
    });
  });

  it("reproduces the design's legendary table", () => {
    expect(
      BANDS.map((band) => equipmentAffixRange("legendary", band)),
    ).toEqual([
      { count: 3, minValueBp: 210, maxValueBp: 490 },
      { count: 3, minValueBp: 252, maxValueBp: 588 },
      { count: 3, minValueBp: 305, maxValueBp: 709 },
      { count: 3, minValueBp: 368, maxValueBp: 856 },
    ]);
  });

  it("leaves band 1 exactly where it was before bands existed", () => {
    // Old saves rolled every affix out of this table, so their stored values and
    // their scores have to stay byte-identical.
    expect(QUALITIES.map((quality) => equipmentAffixRange(quality, 1))).toEqual([
      { count: 0, minValueBp: 0, maxValueBp: 0 },
      { count: 1, minValueBp: 60, maxValueBp: 140 },
      { count: 1, minValueBp: 108, maxValueBp: 252 },
      { count: 2, minValueBp: 150, maxValueBp: 350 },
      { count: 3, minValueBp: 210, maxValueBp: 490 },
      { count: 3, minValueBp: 300, maxValueBp: 700 },
      { count: 3, minValueBp: 420, maxValueBp: 980 },
    ]);
  });

  it("keeps the count and widens the window in every band", () => {
    for (const quality of QUALITIES) {
      const ranges = BANDS.map((band) => equipmentAffixRange(quality, band));
      expect(new Set(ranges.map((range) => range.count)).size).toBe(1);
      for (let index = 1; index < ranges.length; index += 1) {
        const previous = ranges[index - 1]!;
        const current = ranges[index]!;
        if (previous.count === 0) {
          expect(current).toEqual(previous);
          continue;
        }
        expect(current.minValueBp).toBeGreaterThan(previous.minValueBp);
        expect(current.maxValueBp).toBeGreaterThan(previous.maxValueBp);
      }
    }
  });

  it("rejects a band the game does not have", () => {
    for (const band of [0, 5, 1.5]) {
      expect(() => equipmentAffixRange("legendary", band as EquipmentBand)).toThrow(
        RangeError,
      );
    }
  });
});

describe("rollEquipmentAffixes", () => {
  it("gives common nothing and consumes no randomness", () => {
    const exhausted = scriptedRandomInt([]);
    expect(rollEquipmentAffixes("common", 1, exhausted)).toEqual([]);
  });

  it("rolls the right count with distinct stats in stored order", () => {
    for (const quality of QUALITIES) {
      const range = equipmentAffixRange(quality, 1);
      const affixes = rollEquipmentAffixes(quality, 1, highestRoll);
      expect(affixes).toHaveLength(range.count);
      expect(new Set(affixes.map((affix) => affix.stat)).size).toBe(range.count);
      expect(affixes.map((affix) => AFFIX_STATS.indexOf(affix.stat))).toEqual(
        [...affixes.map((affix) => AFFIX_STATS.indexOf(affix.stat))].sort(
          (left, right) => left - right,
        ),
      );
    }
  });

  it("keeps every value inside its quality range", () => {
    for (const band of BANDS) {
      for (const quality of QUALITIES) {
        const range = equipmentAffixRange(quality, band);
        for (let attempt = 0; attempt < 200; attempt += 1) {
          for (const affix of rollEquipmentAffixes(
            quality,
            band,
            (max: number) => attempt % max,
          )) {
            expect(affix.valueBp).toBeGreaterThanOrEqual(range.minValueBp);
            expect(affix.valueBp).toBeLessThanOrEqual(range.maxValueBp);
            expect(Number.isInteger(affix.valueBp)).toBe(true);
          }
        }
      }
    }
  });

  it("reaches both ends of the range", () => {
    expect(rollEquipmentAffixes("legendary", 1, lowestRoll)).toEqual([
      { stat: "experience_bonus", valueBp: 210 },
      { stat: "spirit_stone_bonus", valueBp: 210 },
      { stat: "drop_bonus", valueBp: 210 },
    ]);
    expect(rollEquipmentAffixes("legendary", 1, highestRoll)).toEqual([
      { stat: "experience_bonus", valueBp: 490 },
      { stat: "spirit_stone_bonus", valueBp: 490 },
      { stat: "drop_bonus", valueBp: 490 },
    ]);
  });

  it("is fully determined by the randomInt sequence", () => {
    // The two stat draws keep experience_bonus and then pull drop_bonus in; the
    // values follow in stored order, so the 40 lands on experience_bonus and
    // the 0 on drop_bonus.
    const affixes = rollEquipmentAffixes("epic", 1, scriptedRandomInt([0, 1, 40, 0]));
    expect(affixes).toEqual([
      { stat: "experience_bonus", valueBp: 190 },
      { stat: "drop_bonus", valueBp: 150 },
    ]);
  });

  it("rejects a randomInt that answers outside the span", () => {
    expect(() => rollEquipmentAffixes("rare", 1, () => 3)).toThrow(RangeError);
    expect(() =>
      rollEquipmentAffixes("rare", 1, scriptedRandomInt([0, 145])),
    ).toThrow(RangeError);
  });
});

describe("equipmentAffixScoreBp", () => {
  function affixes(...values: readonly number[]): RolledAffix[] {
    return values.map((valueBp, index) => ({
      stat: AFFIX_STATS[index]!,
      valueBp,
    }));
  }

  it("scores a full roll at 100%", () => {
    expect(equipmentAffixScoreBp("legendary", 1, affixes(490, 490, 490))).toBe(10_000);
    expect(equipmentAffixScoreBp("uncommon", 1, affixes(140))).toBe(10_000);
  });

  it("scores the lowest roll at its exact ratio", () => {
    // 3 * 210 out of 3 * 490.
    expect(equipmentAffixScoreBp("legendary", 1, affixes(210, 210, 210))).toBe(4_285);
    expect(equipmentAffixScoreBp("primordial", 1, affixes(420, 420, 420))).toBe(4_285);
  });

  it("floors instead of rounding", () => {
    // 1191 out of 1470 is 81.02%.
    expect(equipmentAffixScoreBp("legendary", 1, affixes(420, 385, 386))).toBe(8_102);
  });

  it("scores common at zero", () => {
    expect(equipmentAffixScoreBp("common", 1, [])).toBe(0);
  });

  it("scores the affixes old saves already carry", () => {
    // Pre-randomization pieces stored the center value, which reads back as an
    // ordinary roll rather than as corruption.
    expect(equipmentAffixScoreBp("legendary", 1, affixes(350, 350, 350))).toBe(7_142);
    expect(equipmentAffixScoreBp("uncommon", 1, affixes(100))).toBe(7_142);
  });

  it("measures each band against its own ceiling", () => {
    // A 凡阶 roll carried into a 天阶 comparison would read as a poor 天阶 roll,
    // which is exactly why the score is not a cross-band ranking.
    expect(equipmentAffixScoreBp("legendary", 4, affixes(856, 856, 856))).toBe(10_000);
    expect(equipmentAffixScoreBp("legendary", 4, affixes(490, 490, 490))).toBe(5_724);
  });

  it("rejects a band outside the game's four", () => {
    expect(() =>
      equipmentAffixScoreBp("legendary", 5 as EquipmentBand, affixes(490, 490, 490)),
    ).toThrow(RangeError);
  });
});

describe("reroll and ascend costs", () => {
  it("charges reroll by quality multiplier", () => {
    expect(
      QUALITIES.filter((quality) => quality !== "common").map((quality) => [
        quality,
        equipmentRerollCost(quality),
      ]),
    ).toEqual([
      ["uncommon", { enhanceStone: 5, spiritStone: 1_200 }],
      ["rare", { enhanceStone: 8, spiritStone: 2_000 }],
      ["epic", { enhanceStone: 12, spiritStone: 3_200 }],
      ["legendary", { enhanceStone: 21, spiritStone: 5_600 }],
      ["mythic", { enhanceStone: 36, spiritStone: 9_600 }],
      ["primordial", { enhanceStone: 60, spiritStone: 16_000 }],
    ]);
  });

  it("refuses to price a common reroll", () => {
    expect(() => equipmentRerollCost("common")).toThrow(RangeError);
  });

  it("walks the quality ladder", () => {
    expect(nextAssetQuality("legendary")).toBe("mythic");
    expect(nextAssetQuality("mythic")).toBe("primordial");
    expect(nextAssetQuality("primordial")).toBeNull();
  });

  it("only ascends legendary and mythic", () => {
    expect(QUALITIES.filter(canAscendEquipmentQuality)).toEqual([
      "legendary",
      "mythic",
    ]);
  });

  it("prices ascension off the target quality", () => {
    expect(equipmentAscendCost("legendary")).toEqual({
      targetQuality: "mythic",
      duplicateCount: 2,
      spiritStone: 240_000,
      requiredCraftingRoomLevel: 5,
    });
    expect(equipmentAscendCost("mythic")).toEqual({
      targetQuality: "primordial",
      duplicateCount: 2,
      spiritStone: 400_000,
      requiredCraftingRoomLevel: 8,
    });
  });

  it("refuses qualities with no ascension path", () => {
    expect(() => equipmentAscendCost("epic")).toThrow(RangeError);
    expect(() => equipmentAscendCost("primordial")).toThrow(RangeError);
  });
});
