import {
  CAVE_MAX_LEVEL,
  EQUIPMENT_MAX_ENHANCE_LEVEL,
  TECHNIQUE_MAX_STAR,
  addLoadoutBonuses,
  calculateCaveBonuses,
  calculateLoadoutBonuses,
  calculateTotalPower,
  equipmentConfigForSlotAndBand,
  techniqueConfigForSlotBandQuality,
  type AssetQuality,
  type EquipmentBand,
  type EquippedEquipmentInput,
  type EquippedTechniqueInput,
  type TechniqueSlot,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";

/**
 * The loadout contributes a percentage of base power, so its share of total
 * power no longer decays as the level climbs. These expected values are the
 * calibration ruler from the midgame content design: they were derived by
 * replaying `scaleByBasisPoints` per item with BigInt arithmetic, flooring
 * each item before summing. If an assertion here fails, suspect the
 * implementation before the number.
 */

/** Six equipped slots: the five configs plus a second accessory. */
function equipmentLoadout(
  quality: EquippedEquipmentInput["quality"],
  enhanceLevel: number,
): EquippedEquipmentInput[] {
  return [
    "ironwood_sword",
    "cloudweave_robe",
    "jade_spirit_ring",
    "jade_spirit_ring",
    "mist_crane_mount",
    "moonfox_companion",
  ].map((equipmentConfigId) => ({
    equipmentConfigId,
    quality,
    enhanceLevel,
    rolledAffixes: [],
  }));
}

function techniqueLoadout(
  ids: readonly string[],
  star: number,
): EquippedTechniqueInput[] {
  return ids.map((techniqueConfigId) => ({ techniqueConfigId, star }));
}

/** The same six slots, filled from one band's config family. */
function bandEquipmentLoadout(
  band: EquipmentBand,
  quality: EquippedEquipmentInput["quality"],
  enhanceLevel: number,
): EquippedEquipmentInput[] {
  return (
    ["weapon", "armor", "accessory", "accessory", "mount", "pet"] as const
  ).map((slot) => ({
    equipmentConfigId: equipmentConfigForSlotAndBand(slot, band).id,
    quality,
    enhanceLevel,
    rolledAffixes: [],
  }));
}

/** Legendary +20 gear, uncommon 10-star techniques, crafting room at max. */
function maxedBonusBp(): number {
  const loadout = calculateLoadoutBonuses({
    techniques: techniqueLoadout(
      [
        "azure_cloud_heart_manual",
        "drifting_cloud_steps",
        "thunder_seal",
        "star_observing_secret",
      ],
      TECHNIQUE_MAX_STAR,
    ),
    equipment: equipmentLoadout("legendary", EQUIPMENT_MAX_ENHANCE_LEVEL),
  });
  return addLoadoutBonuses(
    loadout,
    calculateCaveBonuses([
      { buildingConfigId: "crafting_room", level: CAVE_MAX_LEVEL },
    ]),
  ).powerBonusBp;
}

/** What a player owns on arrival: common +0 gear, common 1-star techniques. */
function starterBonusBp(): number {
  return calculateLoadoutBonuses({
    techniques: techniqueLoadout(
      [
        "quiet_breathing_art",
        "light_step_art",
        "flame_finger",
        "spirit_gathering_secret",
      ],
      1,
    ),
    equipment: equipmentLoadout("common", 0),
  }).powerBonusBp;
}

function loadoutShare(level: number, powerBonusBp: number): string {
  const total = Number(calculateTotalPower(level, { percentBonusBp: powerBonusBp }));
  const base = Number(calculateTotalPower(level));
  return (((total - base) / total) * 100).toFixed(2);
}

describe("loadout power model", () => {
  it("scales a fully maxed loadout to +717.74%", () => {
    expect(maxedBonusBp()).toBe(71_774);
  });

  it("scales a starter loadout to +28.09%", () => {
    expect(starterBonusBp()).toBe(2_809);
  });

  it("keeps the loadout share constant from Lv.11 to Lv.1000", () => {
    const maxed = maxedBonusBp();
    expect(loadoutShare(11, maxed)).toBe("87.77");
    expect(loadoutShare(100, maxed)).toBe("87.77");
    expect(loadoutShare(1_000, maxed)).toBe("87.77");
  });

  it("leaves early-game totals where the fixed-power model had them", () => {
    // The fixed-power model gave 18,205 at Lv.11 maxed and 2,825 on a starter
    // loadout. Staying within a few points is what makes this change safe to
    // ship without retuning any early-game numbers.
    expect(calculateTotalPower(11, { percentBonusBp: maxedBonusBp() })).toBe("17990");
    expect(calculateTotalPower(11, { percentBonusBp: starterBonusBp() })).toBe("2817");
  });

  it("grows the tower's entry window between a starter and a maxed loadout", () => {
    // The starter loadout at the trial tower's unlock level. Floors 1 (3,000)
    // and 2 (3,540) are reachable, floor 3 (4,178) is not — gear, not levels,
    // is what gets a stuck player past it.
    expect(calculateTotalPower(15, { percentBonusBp: starterBonusBp() })).toBe("3842");
  });

  it("pays the crafting room 2% power per level", () => {
    const perLevel = calculateCaveBonuses([
      { buildingConfigId: "crafting_room", level: 1 },
    ]).powerBonusBp;
    const maxLevel = calculateCaveBonuses([
      { buildingConfigId: "crafting_room", level: CAVE_MAX_LEVEL },
    ]).powerBonusBp;

    expect(perLevel).toBe(200);
    expect(maxLevel).toBe(2_000);
  });
});

describe("equipment bands are not a power axis", () => {
  /**
   * The gate on the ruler above. `LOADOUT_POWER_SCALE_BP` is solved from the
   * maxed and starter endpoints at the same time, which pins the top band's
   * base sum to exactly the 450 the five original configs already had. So a
   * 天阶 loadout must weigh the same as a 凡阶 one at equal quality and
   * enhancement: bands buy identity, drop odds and affix size, never power.
   * Give one band a higher `basePower` and this is what fails first.
   */
  const BANDS: readonly EquipmentBand[] = [1, 2, 3, 4];

  it("gives every band the same maxed powerBonusBp", () => {
    const techniques = techniqueLoadout(
      [
        "azure_cloud_heart_manual",
        "drifting_cloud_steps",
        "thunder_seal",
        "star_observing_secret",
      ],
      TECHNIQUE_MAX_STAR,
    );
    const bonuses = BANDS.map(
      (band) =>
        calculateLoadoutBonuses({
          techniques,
          equipment: bandEquipmentLoadout(
            band,
            "legendary",
            EQUIPMENT_MAX_ENHANCE_LEVEL,
          ),
        }).powerBonusBp,
    );
    expect(new Set(bonuses).size).toBe(1);
    // 71,774 minus the crafting room's 2,000, which is a cave bonus.
    expect(bonuses).toEqual([69_774, 69_774, 69_774, 69_774]);
  });

  it("gives every band the same starter powerBonusBp", () => {
    const bonuses = BANDS.map(
      (band) =>
        calculateLoadoutBonuses({
          techniques: [],
          equipment: bandEquipmentLoadout(band, "common", 0),
        }).powerBonusBp,
    );
    expect(new Set(bonuses).size).toBe(1);
  });

  it("reproduces the band-1 loadout with the band-resolved helper", () => {
    expect(
      bandEquipmentLoadout(1, "legendary", EQUIPMENT_MAX_ENHANCE_LEVEL).map(
        (item) => item.equipmentConfigId,
      ),
    ).toEqual(
      equipmentLoadout("legendary", EQUIPMENT_MAX_ENHANCE_LEVEL).map(
        (item) => item.equipmentConfigId,
      ),
    );
  });
});

describe("technique bands are not a power axis either", () => {
  /**
   * The same gate, for the same reason, on the other half of the loadout. The
   * two endpoints between them pin the technique base sums to exactly 175 and
   * 425, and the whole 34.607× spread from worst book to best is already spent
   * on star (×9.5), quality (×1.5) and those two sums (×2.4286). A band that
   * moved `fixedPower` would have to buy it back from the tower's floor-90 row.
   */
  const BANDS: readonly EquipmentBand[] = [1, 2, 3, 4];
  const SLOTS: readonly TechniqueSlot[] = [
    "mind",
    "movement",
    "divine",
    "secret",
  ];

  /** The four slots of one band at one quality. */
  function bandTechniqueLoadout(
    band: EquipmentBand,
    quality: AssetQuality,
    star: number,
  ): EquippedTechniqueInput[] {
    return SLOTS.map((slot) => ({
      techniqueConfigId: techniqueConfigForSlotBandQuality(slot, band, quality)
        .id,
      star,
    }));
  }

  it("repeats one fixedPower per (slot, quality) across all four bands", () => {
    for (const slot of SLOTS) {
      for (const quality of ["common", "uncommon"] as const) {
        const powers = BANDS.map(
          (band) => techniqueConfigForSlotBandQuality(slot, band, quality).fixedPower,
        );
        expect(new Set(powers).size).toBe(1);
      }
    }
  });

  it("gives every band the same maxed powerBonusBp", () => {
    const bonuses = BANDS.map(
      (band) =>
        calculateLoadoutBonuses({
          techniques: bandTechniqueLoadout(band, "uncommon", TECHNIQUE_MAX_STAR),
          equipment: [],
        }).powerBonusBp,
    );
    expect(new Set(bonuses).size).toBe(1);
    // 71,774 minus the 42,523 the six legendary +20 pieces contribute and the
    // crafting room's 2,000.
    expect(bonuses).toEqual([27_251, 27_251, 27_251, 27_251]);
  });

  it("gives every band the same starter powerBonusBp", () => {
    const bonuses = BANDS.map(
      (band) =>
        calculateLoadoutBonuses({
          techniques: bandTechniqueLoadout(band, "common", 1),
          equipment: [],
        }).powerBonusBp,
    );
    expect(new Set(bonuses).size).toBe(1);
  });

  it("reproduces the band-1 books with the band-resolved helper", () => {
    expect(
      bandTechniqueLoadout(1, "uncommon", TECHNIQUE_MAX_STAR).map(
        (item) => item.techniqueConfigId,
      ),
    ).toEqual([
      "azure_cloud_heart_manual",
      "drifting_cloud_steps",
      "thunder_seal",
      "star_observing_secret",
    ]);
  });

  it("keeps the maxed total and the loadout share where they were", () => {
    expect(maxedBonusBp()).toBe(71_774);
    expect(starterBonusBp()).toBe(2_809);
    expect(loadoutShare(1_000, maxedBonusBp())).toBe("87.77");
  });
});
