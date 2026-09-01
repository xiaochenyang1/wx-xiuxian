import {
  CAVE_ABSOLUTE_MAX_LEVEL,
  CAVE_BUILDING_CONFIGS,
  CAVE_MAX_LEVEL,
  PARTNER_ABSOLUTE_MAX_LEVEL,
  PARTNER_MAX_LEVEL,
  SECT_ABSOLUTE_MAX_LEVEL,
  SECT_MAX_LEVEL,
  caveMaxLevelForBand,
  caveUpgradeCost,
  getAlchemyRecipeConfig,
  getCaveBuildingConfig,
  partnerBondRequirement,
  partnerMaxLevelForBand,
  sectContributionRequirement,
  sectDonationYield,
  sectMaxLevelForBand,
  type EquipmentBand,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date("2026-01-01T00:00:00.000Z");
const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const BANDS: readonly EquipmentBand[] = [1, 2, 3, 4];
/** One in-band level per band, all clear of 伴侣's Lv.20 gate. */
const LEVEL_IN_BAND: Readonly<Record<EquipmentBand, number>> = {
  1: 20,
  2: 100,
  3: 200,
  4: 400,
};
/** The four that follow the band. 炼器室 is excluded everywhere by design. */
const IDLE_BUILDINGS = CAVE_BUILDING_CONFIGS.filter(
  (config) => config.id !== "crafting_room",
);

type MutableSave = Record<string, any>;

afterEach(() => vi.useRealTimers());

/**
 * A save at `level` with the sect/partner already joined and a bag stocked.
 * Written through the raw save rather than played forward: 天阶 is 301 levels
 * and hundreds of hours away, and nothing here depends on how it got there.
 */
function bandedService(options: {
  level: number;
  sect?: { level: number; contribution: number };
  partner?: { level: number; bond: number };
  materials?: number;
  /** 灵草 alone, so a test can starve the third material the loop checks. */
  herbs?: number;
  pills?: number;
}): LocalGameService {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  const seeder = new FakePlatformAdapter();
  new LocalGameService(seeder).initialize(START);
  const raw = seeder.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected an initial save");
  const save = JSON.parse(raw) as MutableSave;
  save.savedAt = START.toISOString();
  save.snapshot.progress.settledAt = START.toISOString();
  save.snapshot.progress.level = options.level;
  save.snapshot.progress.experience = "0";
  save.snapshot.progress.status = "gaining";
  if (options.sect) save.snapshot.sect = { sectId: "qingyun", ...options.sect };
  if (options.partner) {
    save.snapshot.partner = { partnerId: "jun_rulan", ...options.partner };
  }
  const materials = options.materials ?? 0;
  // An empty stack is not a thing the save format can hold — the validator only
  // accepts positive quantities — so a count of zero drops the row entirely.
  save.snapshot.inventory.stacks = [
    { itemConfigId: "wood", displayName: "木材", quantity: materials },
    { itemConfigId: "stone", displayName: "石材", quantity: materials },
    {
      itemConfigId: "spiritual_herb",
      displayName: "灵草",
      quantity: options.herbs ?? materials,
    },
    {
      itemConfigId: "dual_cultivation_pill",
      displayName: "双修丹",
      quantity: options.pills ?? 0,
    },
  ]
    .filter((stack) => stack.quantity > 0)
    .map((stack) => ({ ...stack, quantity: String(stack.quantity) }));
  // Every milestone already claimed, so no task reward lands mid-assertion.
  save.snapshot.progressionTasks = save.snapshot.progressionTasks.map(
    (task: MutableSave) => ({
      ...task,
      progress: String(options.level),
      completedAt: START.toISOString(),
      claimedAt: START.toISOString(),
    }),
  );
  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  expect(service.initialize(START).created).toBe(false);
  return service;
}

function quantityOf(service: LocalGameService, itemConfigId: string): number {
  return Number(
    service.snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === itemConfigId,
    )?.quantity ?? "0",
  );
}

describe("the band caps", () => {
  it("raises the four idle buildings to 40 and holds 炼器室 at 10", () => {
    for (const config of IDLE_BUILDINGS) {
      expect(config.maxLevel).toBe(CAVE_ABSOLUTE_MAX_LEVEL);
    }
    expect(getCaveBuildingConfig("crafting_room").maxLevel).toBe(CAVE_MAX_LEVEL);
    expect(CAVE_ABSOLUTE_MAX_LEVEL).toBe(CAVE_MAX_LEVEL * 4);
  });

  it("steps every capped system by ten per band", () => {
    for (const band of BANDS) {
      const expected = 10 * band;
      for (const config of IDLE_BUILDINGS) {
        expect(caveMaxLevelForBand(config.id, band)).toBe(expected);
      }
      // The absolute cap wins here, which is the whole reason the band helper
      // takes a building id instead of just a band.
      expect(caveMaxLevelForBand("crafting_room", band)).toBe(CAVE_MAX_LEVEL);
      expect(sectMaxLevelForBand(band)).toBe(expected);
      expect(partnerMaxLevelForBand(band)).toBe(expected);
    }
  });

  it("leaves 凡阶 reading exactly as it did before bands existed", () => {
    expect(caveMaxLevelForBand("spirit_array", 1)).toBe(CAVE_MAX_LEVEL);
    expect(sectMaxLevelForBand(1)).toBe(SECT_MAX_LEVEL);
    expect(partnerMaxLevelForBand(1)).toBe(PARTNER_MAX_LEVEL);
    expect(sectDonationYield(1)).toBe(100);
  });

  it("keeps the absolute caps in step across the three systems", () => {
    expect(SECT_ABSOLUTE_MAX_LEVEL).toBe(CAVE_ABSOLUTE_MAX_LEVEL);
    expect(PARTNER_ABSOLUTE_MAX_LEVEL).toBe(CAVE_ABSOLUTE_MAX_LEVEL);
  });
});

describe("the cave spirit stone curve", () => {
  it("reproduces 3000n² for every level 凡阶 can reach", () => {
    for (let target = 1; target <= CAVE_MAX_LEVEL; target += 1) {
      expect(caveUpgradeCost("spirit_array", target - 1).spiritStone).toBe(
        3_000 * target * target,
      );
    }
  });

  it("joins the geometric branch at exactly 1.25x with no jump", () => {
    const atCap = caveUpgradeCost("spirit_array", CAVE_MAX_LEVEL - 1).spiritStone;
    const firstAbove = caveUpgradeCost("spirit_array", CAVE_MAX_LEVEL).spiritStone;
    expect(atCap).toBe(300_000);
    expect(firstAbove).toBe(375_000);
    expect(firstAbove).toBe(atCap * 1.25);
  });

  it("pins the far end of the ladder and grows strictly all the way", () => {
    expect(
      caveUpgradeCost("spirit_array", CAVE_ABSOLUTE_MAX_LEVEL - 1).spiritStone,
    ).toBe(242_338_071);

    let previous = 0;
    for (let level = 0; level < CAVE_ABSOLUTE_MAX_LEVEL; level += 1) {
      const cost = caveUpgradeCost("spirit_array", level).spiritStone;
      expect(cost).toBeGreaterThan(previous);
      expect(Number.isSafeInteger(cost)).toBe(true);
      previous = cost;
    }
  });

  it("leaves the material requirement linear at every level", () => {
    // Materials pace the midgame, spirit stone paces the endgame: only the one
    // curve was bent.
    for (let level = 0; level < CAVE_ABSOLUTE_MAX_LEVEL; level += 1) {
      for (const material of caveUpgradeCost("spirit_array", level).materials) {
        expect(material.quantity).toBe(5 * (level + 1));
      }
    }
  });

  it("refuses to quote a price past a building's absolute cap", () => {
    expect(() =>
      caveUpgradeCost("crafting_room", CAVE_MAX_LEVEL),
    ).toThrowError(RangeError);
    expect(() =>
      caveUpgradeCost("spirit_array", CAVE_ABSOLUTE_MAX_LEVEL),
    ).toThrowError(RangeError);
  });
});

/** §6.2 of the design, one row per band. Recomputed below, never read back. */
const CAVE_SPIRIT_STONE_BY_BAND = [
  4_620_000, 49_879_372, 464_537_712, 4_326_344_380,
] as const;
const CAVE_MATERIAL_BY_BAND = [550, 1_550, 2_550, 3_550] as const;

describe("the per-band bill", () => {
  it("charges each band what the design's table says", () => {
    BANDS.forEach((band, index) => {
      let spiritStone = 0;
      const materials = new Map<string, number>();
      for (let target = 10 * (band - 1) + 1; target <= 10 * band; target += 1) {
        for (const config of IDLE_BUILDINGS) {
          const cost = caveUpgradeCost(config.id, target - 1);
          spiritStone += cost.spiritStone;
          for (const material of cost.materials) {
            materials.set(
              material.itemConfigId,
              (materials.get(material.itemConfigId) ?? 0) + material.quantity,
            );
          }
        }
      }
      expect(spiritStone).toBe(CAVE_SPIRIT_STONE_BY_BAND[index]);
      // The four idle buildings spend 木材/石材/灵土/灵草 across two buildings
      // each, so all four columns come out equal — asserting the map wholesale
      // is what proves that pairing rather than assuming it.
      expect(materials.size).toBe(4);
      for (const quantity of materials.values()) {
        expect(quantity).toBe(CAVE_MATERIAL_BY_BAND[index]);
      }
    });
  });

  it("adds up to the whole ladder's spirit stone", () => {
    const cave = CAVE_SPIRIT_STONE_BY_BAND.reduce((sum, bill) => sum + bill, 0);
    expect(cave).toBe(4_845_381_464);

    // Joining hands the player Lv.1 free, so the bond ladder pays
    // requirement(2)..requirement(40) — 819 pills, not the 820 the design's
    // table lists by counting requirement(1) as well.
    let pills = 0;
    for (let target = 2; target <= PARTNER_ABSOLUTE_MAX_LEVEL; target += 1) {
      pills += partnerBondRequirement(target) / 100;
    }
    expect(pills).toBe(819);

    const perPill = getAlchemyRecipeConfig("dual_cultivation_pill");
    expect(perPill.spiritStoneCost).toBe(2_000);
    expect(cave + pills * perPill.spiritStoneCost).toBe(4_847_019_464);
  });

  it("pays 100n² per sect level from the level joining gave away", () => {
    // Only 凡阶 differs from the design's table, and for the same reason: it
    // lists 38,500, which includes the 100 for the free Lv.1.
    const expected = [38_400, 248_500, 658_500, 1_268_500];
    BANDS.forEach((band, index) => {
      let contribution = 0;
      const from = band === 1 ? 2 : 10 * (band - 1) + 1;
      for (let target = from; target <= 10 * band; target += 1) {
        contribution += sectContributionRequirement(target);
      }
      expect(contribution).toBe(expected[index]);
      // Donations needed at this band's yield, the §6.2 捐献次数 column.
      expect(Math.ceil(contribution / sectDonationYield(band))).toBe(
        [384, 829, 1_098, 1_269][index],
      );
    });
  });

  it("scales a donation by the idle material multiplier", () => {
    expect(BANDS.map((band) => sectDonationYield(band))).toEqual([
      100, 300, 600, 1_000,
    ]);
  });
});

describe("donating in batch", () => {
  it("climbs every level one payment covers", () => {
    // 2,000 contribution at 天阶 clears Lv.2 (400) and Lv.3 (900) and stops 900
    // short of Lv.4 (1,600). The single-comparison form this replaced would
    // have stopped at Lv.2 holding 1,600 — owing a level it never granted.
    const service = bandedService({
      level: LEVEL_IN_BAND[4],
      sect: { level: 1, contribution: 0 },
      materials: 10,
    });

    service.donateToSect(2);

    expect(service.snapshot.sect).toEqual({
      sectId: "qingyun",
      level: 3,
      contribution: 700,
    });
    expect(sectContributionRequirement(4)).toBe(1_600);
    for (const material of ["wood", "stone", "spiritual_herb"]) {
      expect(quantityOf(service, material)).toBe(0);
    }
  });

  it("charges materials and pays contribution in step with the count", () => {
    const service = bandedService({
      level: LEVEL_IN_BAND[2],
      sect: { level: 1, contribution: 0 },
      materials: 40,
    });

    service.donateToSect(3);

    // 灵阶 pays 300 a donation, so three land 900 and clear Lv.2's 400.
    expect(service.snapshot.sect.level).toBe(2);
    expect(service.snapshot.sect.contribution).toBe(500);
    for (const material of ["wood", "stone", "spiritual_herb"]) {
      expect(quantityOf(service, material)).toBe(25);
    }
  });

  it("deducts nothing and names the shortfall when one material is short", () => {
    const service = bandedService({
      level: LEVEL_IN_BAND[2],
      sect: { level: 1, contribution: 0 },
      materials: 40,
      herbs: 10,
    });
    const before = JSON.stringify(service.snapshot.inventory);
    const sectBefore = { ...service.snapshot.sect };

    expect(() => service.donateToSect(3)).toThrow("灵草不足，还需 5 个");

    expect(JSON.stringify(service.snapshot.inventory)).toBe(before);
    expect(service.snapshot.sect).toEqual(sectBefore);
  });

  it("refuses a count that is not a whole positive number", () => {
    const service = bandedService({
      level: LEVEL_IN_BAND[2],
      sect: { level: 1, contribution: 0 },
      materials: 40,
    });
    for (const times of [0, -1, 1.5]) {
      expect(() => service.donateToSect(times)).toThrow("捐献次数不合法");
    }
    expect(quantityOf(service, "wood")).toBe(40);
  });
});

describe("stopping at the band cap", () => {
  it("names the band that lifts the sect cap and takes nothing", () => {
    const service = bandedService({
      level: LEVEL_IN_BAND[1],
      sect: { level: SECT_MAX_LEVEL, contribution: 0 },
      materials: 40,
    });

    expect(() => service.donateToSect()).toThrow(
      "需突破至灵阶才能继续提升宗门声望",
    );
    expect(quantityOf(service, "wood")).toBe(40);
  });

  it("names the band that lifts the bond cap", () => {
    const service = bandedService({
      level: LEVEL_IN_BAND[1],
      partner: { level: PARTNER_MAX_LEVEL, bond: 0 },
      pills: 5,
    });

    expect(() => service.cultivateWithPartner()).toThrow(
      "需突破至灵阶才能继续加深道侣亲密",
    );
    expect(quantityOf(service, "dual_cultivation_pill")).toBe(5);
  });

  it("truncates the leftover to one short of the next requirement", () => {
    // 221 donations at 凡阶 pay 22,100: Lv.10 costs 10,000 and the band stops the
    // climb there holding 12,100 — which is Lv.11's price exactly. Parking that
    // above the requirement would hand out a free level on the first click
    // after the next breakthrough, so it settles at 12,099 and one donation is
    // lost. That is the §10.5 trade.
    const service = bandedService({
      level: LEVEL_IN_BAND[1],
      sect: { level: SECT_MAX_LEVEL - 1, contribution: 0 },
      materials: 1_105,
    });

    service.donateToSect(221);

    expect(service.snapshot.sect.level).toBe(SECT_MAX_LEVEL);
    expect(service.snapshot.sect.contribution).toBe(
      sectContributionRequirement(SECT_MAX_LEVEL + 1) - 1,
    );
    expect(service.snapshot.sect.contribution).toBe(12_099);
  });

  it("clears the leftover to zero at the absolute cap", () => {
    const service = bandedService({
      level: LEVEL_IN_BAND[4],
      sect: { level: SECT_ABSOLUTE_MAX_LEVEL - 1, contribution: 0 },
      materials: 1_000,
    });

    service.donateToSect(200);

    expect(service.snapshot.sect).toEqual({
      sectId: "qingyun",
      level: SECT_ABSOLUTE_MAX_LEVEL,
      contribution: 0,
    });
    expect(() => service.donateToSect()).toThrow("宗门声望已满级");
  });
});

describe("dual cultivating in batch", () => {
  it("climbs every bond level the pills cover", () => {
    // Ten pills are 1,000 bond: Lv.2 (200), Lv.3 (300) and Lv.4 (400) all fall,
    // leaving 100 against Lv.5's 500.
    const service = bandedService({
      level: LEVEL_IN_BAND[4],
      partner: { level: 1, bond: 0 },
      pills: 10,
    });

    service.cultivateWithPartner(10);

    expect(service.snapshot.partner).toEqual({
      partnerId: "jun_rulan",
      level: 4,
      bond: 100,
    });
    expect(partnerBondRequirement(5)).toBe(500);
    expect(quantityOf(service, "dual_cultivation_pill")).toBe(0);
  });

  it("spends nothing and names the shortfall when pills are short", () => {
    const service = bandedService({
      level: LEVEL_IN_BAND[4],
      partner: { level: 1, bond: 0 },
      pills: 4,
    });
    const partnerBefore = { ...service.snapshot.partner };

    expect(() => service.cultivateWithPartner(10)).toThrow(
      "双修丹不足，还需 6 颗",
    );

    expect(quantityOf(service, "dual_cultivation_pill")).toBe(4);
    expect(service.snapshot.partner).toEqual(partnerBefore);
  });

  it("refuses a count that is not a whole positive number", () => {
    const service = bandedService({
      level: LEVEL_IN_BAND[4],
      partner: { level: 1, bond: 0 },
      pills: 4,
    });
    for (const times of [0, -1, 1.5]) {
      expect(() => service.cultivateWithPartner(times)).toThrow(
        "双修次数不合法",
      );
    }
    expect(quantityOf(service, "dual_cultivation_pill")).toBe(4);
  });
});
