import {
  ASSET_QUALITY_MULTIPLIER_BP,
  calculateTechniqueContribution,
  canAscendTechniqueQuality,
  equipmentEnhanceCost,
  equipmentSalvageReward,
  shouldAutoLockEquipment,
  techniqueAscendCost,
  techniqueInheritCost,
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

describe("technique ascension costs", () => {
  it.each([
    [1, 75_000],
    [2, 300_000],
    [3, 900_000],
    [4, 2_250_000],
  ] as const)("quotes band %i at %i spirit stone", (band, spiritStone) => {
    expect(techniqueAscendCost(band)).toEqual({
      targetQuality: "uncommon",
      duplicateCount: 2,
      spiritStone,
      requiredSeclusionRoomLevel: 5,
    });
  });

  it("charges what inheriting to the same band's 优秀 book charges", () => {
    // Both moves carry stars the player has already paid for, one along the
    // quality axis and one along the band axis, and both price them off
    // `50,000 x 优秀` — so the two axes cost the same per step by construction.
    for (const band of [2, 3, 4] as const) {
      expect(techniqueAscendCost(band).spiritStone).toBe(
        techniqueInheritCost("uncommon", band),
      );
    }
  });

  it("keeps 优秀 the top of the ladder", () => {
    // A third quality would move the maxed endpoint `LOADOUT_POWER_SCALE_BP` is
    // solved from; `test/loadout-power-model.test.ts` measures it with 优秀 books.
    expect(canAscendTechniqueQuality("common")).toBe(true);
    expect(canAscendTechniqueQuality("uncommon")).toBe(false);
    expect(canAscendTechniqueQuality("legendary")).toBe(false);
  });

  it("rejects an unknown band", () => {
    expect(() => techniqueAscendCost(9 as 1)).toThrow(RangeError);
  });
});

describe("technique contribution star bounds", () => {
  it.each([0, 11, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid equipped technique star: %s",
    (star) => {
      expect(() =>
        calculateTechniqueContribution({
          techniqueConfigId: "quiet_breathing_art",
          star,
        }),
      ).toThrow(RangeError);
    },
  );
});

describe("equipment salvage rewards", () => {
  it("returns a base reward by quality", () => {
    expect(equipmentSalvageReward("common", 0)).toEqual({
      spiritStone: 100,
      enhanceStone: 1,
      refundedSpiritStone: 0,
      refundedEnhanceStone: 0,
    });
    expect(equipmentSalvageReward("rare", 0)).toEqual({
      spiritStone: 600,
      enhanceStone: 4,
      refundedSpiritStone: 0,
      refundedEnhanceStone: 0,
    });
  });

  it("refunds half of enhancement investment using the same upgrade quotes", () => {
    expect(equipmentSalvageReward("common", 2)).toEqual({
      spiritStone: 475,
      enhanceStone: 2,
      refundedSpiritStone: 375,
      refundedEnhanceStone: 1,
    });
  });

  it("auto-locks rare and higher quality equipment", () => {
    expect(shouldAutoLockEquipment("uncommon")).toBe(false);
    expect(shouldAutoLockEquipment("rare")).toBe(true);
    expect(shouldAutoLockEquipment("primordial")).toBe(true);
  });

  it("rejects an invalid salvage level", () => {
    expect(() => equipmentSalvageReward("common", -1)).toThrow(RangeError);
    expect(() => equipmentSalvageReward("common", 21)).toThrow(RangeError);
  });
});
