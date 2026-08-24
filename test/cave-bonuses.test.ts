import { describe, expect, it } from "vitest";
import {
  CAVE_MAX_LEVEL,
  calculateCaveBonuses,
  caveUpgradeCost,
  getCaveBuildingConfig,
} from "@cultivation-diary/shared";

describe("cave bonuses", () => {
  it("gives no bonus for unbuilt buildings", () => {
    const bonuses = calculateCaveBonuses([
      { buildingConfigId: "spirit_array", level: 0 },
    ]);
    expect(bonuses).toEqual({
      powerBonusBp: 0,
      experienceBonusBp: 0,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
    });
  });

  it("routes each building to its own bonus dimension", () => {
    expect(
      calculateCaveBonuses([{ buildingConfigId: "spirit_field", level: 1 }])
        .spiritStoneBonusBp,
    ).toBeGreaterThan(0);
    expect(
      calculateCaveBonuses([{ buildingConfigId: "alchemy_room", level: 1 }])
        .dropBonusBp,
    ).toBeGreaterThan(0);
    expect(
      calculateCaveBonuses([{ buildingConfigId: "crafting_room", level: 1 }])
        .powerBonusBp,
    ).toBe(200);
  });

  it("sums bonuses across buildings on the same dimension", () => {
    const both = calculateCaveBonuses([
      { buildingConfigId: "spirit_array", level: 2 },
      { buildingConfigId: "seclusion_room", level: 3 },
    ]);
    const array = calculateCaveBonuses([
      { buildingConfigId: "spirit_array", level: 2 },
    ]);
    const seclusion = calculateCaveBonuses([
      { buildingConfigId: "seclusion_room", level: 3 },
    ]);
    expect(both.experienceBonusBp).toBe(
      array.experienceBonusBp + seclusion.experienceBonusBp,
    );
  });

  it("scales bonus linearly with level", () => {
    const one = calculateCaveBonuses([
      { buildingConfigId: "spirit_array", level: 1 },
    ]).experienceBonusBp;
    const three = calculateCaveBonuses([
      { buildingConfigId: "spirit_array", level: 3 },
    ]).experienceBonusBp;
    expect(three).toBe(one * 3);
  });

  it("rejects levels outside 0..maxLevel", () => {
    expect(() =>
      calculateCaveBonuses([{ buildingConfigId: "spirit_array", level: -1 }]),
    ).toThrow(RangeError);
    expect(() =>
      calculateCaveBonuses([
        { buildingConfigId: "spirit_array", level: CAVE_MAX_LEVEL + 1 },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      calculateCaveBonuses([{ buildingConfigId: "spirit_array", level: 1.5 }]),
    ).toThrow(RangeError);
  });

  it("rejects unknown building ids", () => {
    expect(() => getCaveBuildingConfig("nope")).toThrow();
  });
});

describe("cave upgrade cost", () => {
  it("scales spirit stone by the square of the target level", () => {
    const config = getCaveBuildingConfig("spirit_array");
    const first = caveUpgradeCost("spirit_array", 0);
    const third = caveUpgradeCost("spirit_array", 2);
    expect(first.spiritStone).toBe(config.baseSpiritStoneCost);
    expect(third.spiritStone).toBe(config.baseSpiritStoneCost * 9);
  });

  it("scales materials linearly with the target level", () => {
    const first = caveUpgradeCost("spirit_field", 0);
    const fourth = caveUpgradeCost("spirit_field", 3);
    expect(fourth.materials[0]!.quantity).toBe(first.materials[0]!.quantity * 4);
  });

  it("rejects upgrading past max level", () => {
    expect(() => caveUpgradeCost("spirit_array", CAVE_MAX_LEVEL)).toThrow(RangeError);
  });
});
