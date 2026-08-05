import { describe, expect, it } from "vitest";
import {
  calculateEquipmentContribution,
  calculateLoadoutBonuses,
  calculateTechniqueContribution,
  settleCultivation,
} from "../src";

describe("loadout bonuses", () => {
  it("applies technique quality and star multipliers", () => {
    expect(
      calculateTechniqueContribution({
        techniqueConfigId: "azure_cloud_heart_manual",
        star: 2,
      }),
    ).toEqual({
      fixedPower: "180",
      experienceBonusBp: 900,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
    });
  });

  it("applies equipment quality, enhancement, and rolled efficiency affixes", () => {
    expect(
      calculateEquipmentContribution({
        equipmentConfigId: "ironwood_sword",
        quality: "uncommon",
        enhanceLevel: 2,
        rolledAffixes: [
          { stat: "experience_bonus", valueBp: 100 },
          { stat: "drop_bonus", valueBp: 50 },
          { stat: "unknown_future_affix", valueBp: 999 },
        ],
      }),
    ).toEqual({
      fixedPower: "144",
      experienceBonusBp: 100,
      spiritStoneBonusBp: 0,
      dropBonusBp: 50,
    });
  });

  it("sums all equipped contributions without multiplying player base power", () => {
    expect(
      calculateLoadoutBonuses({
        techniques: [
          { techniqueConfigId: "quiet_breathing_art", star: 1 },
          { techniqueConfigId: "spirit_gathering_secret", star: 1 },
        ],
        equipment: [
          {
            equipmentConfigId: "cloudweave_robe",
            quality: "common",
            enhanceLevel: 0,
            rolledAffixes: [{ stat: "spirit_stone_bonus", valueBp: 100 }],
          },
        ],
      }),
    ).toEqual({
      fixedPower: "160",
      experienceBonusBp: 200,
      spiritStoneBonusBp: 200,
      dropBonusBp: 100,
    });
  });

  it("feeds experience, spirit-stone, and drop bonuses into settlement", () => {
    const result = settleCultivation({
      progress: {
        level: 1,
        experience: "0",
        cultivationReserve: "0",
        status: "gaining",
      },
      elapsedMilliseconds: 60_000,
      experienceRemainderMicros: 0,
      spiritStoneRemainderMicros: 0,
      dropClockRemainderMicros: 0,
      experienceBonusBp: 1_000,
      spiritStoneBonusBp: 1_000,
      dropBonusBp: 1_000,
    });

    expect(result.experienceGained).toBe("66");
    expect(result.spiritStoneGained).toBe("1");
    expect(result.spiritStoneRemainderMicros).toBe(100_000);
    expect(result.dropAttempts).toBe(1);
    expect(result.dropClockRemainderMicros).toBe(6_000_000);
  });
});
