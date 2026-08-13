import {
  ASSET_QUALITY_MULTIPLIER_BP,
  equipmentEnhanceCost,
  techniqueStarUpgradeCost,
  type AssetQuality,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";

const QUALITY_CASES = [
  ["common", 10_000, 1, 250, 10, 5_000],
  ["uncommon", 15_000, 2, 375, 15, 7_500],
  ["rare", 25_000, 3, 625, 25, 12_500],
  ["epic", 40_000, 4, 1_000, 40, 20_000],
  ["legendary", 70_000, 7, 1_750, 70, 35_000],
  ["mythic", 120_000, 12, 3_000, 120, 60_000],
  ["primordial", 200_000, 20, 5_000, 200, 100_000],
] as const satisfies ReadonlyArray<
  readonly [AssetQuality, number, number, number, number, number]
>;

describe("equipment enhancement costs", () => {
  it.each(QUALITY_CASES)(
    "uses the shared %s quality multiplier",
    (
      quality,
      multiplierBp,
      firstEnhanceStone,
      firstSpiritStone,
      finalEnhanceStone,
      finalSpiritStone,
    ) => {
      expect(ASSET_QUALITY_MULTIPLIER_BP[quality]).toBe(multiplierBp);
      expect(equipmentEnhanceCost(quality, 0)).toEqual({
        targetLevel: 1,
        enhanceStone: firstEnhanceStone,
        spiritStone: firstSpiritStone,
      });
      expect(equipmentEnhanceCost(quality, 19)).toEqual({
        targetLevel: 20,
        enhanceStone: finalEnhanceStone,
        spiritStone: finalSpiritStone,
      });
    },
  );

  it("rounds the half-level stone base before applying quality", () => {
    expect(equipmentEnhanceCost("common", 1)).toEqual({
      targetLevel: 2,
      enhanceStone: 1,
      spiritStone: 500,
    });
    expect(equipmentEnhanceCost("uncommon", 2)).toEqual({
      targetLevel: 3,
      enhanceStone: 3,
      spiritStone: 1_125,
    });
  });

  it.each([-1, 20, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid current level: %s",
    (currentLevel) => {
      expect(() => equipmentEnhanceCost("common", currentLevel)).toThrow(
        RangeError,
      );
    },
  );

  it("rejects an unknown quality at runtime", () => {
    expect(() =>
      equipmentEnhanceCost("unknown" as AssetQuality, 0),
    ).toThrow(RangeError);
  });
});

describe("technique star-up costs", () => {
  it.each([
    [1, 2, 1],
    [2, 3, 1],
    [3, 4, 2],
    [4, 5, 2],
    [5, 6, 3],
    [6, 7, 4],
    [7, 8, 5],
    [8, 9, 7],
    [9, 10, 10],
  ] as const)(
    "quotes %i -> %i at %i duplicate copies",
    (currentStar, targetStar, duplicateCount) => {
      expect(techniqueStarUpgradeCost(currentStar)).toEqual({
        targetStar,
        duplicateCount,
      });
    },
  );

  it.each([0, 10, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid current star: %s",
    (currentStar) => {
      expect(() => techniqueStarUpgradeCost(currentStar)).toThrow(RangeError);
    },
  );
});
