import {
  ALCHEMY_BAND_SPIRIT_STONE_MULTIPLIER,
  ALCHEMY_RECIPE_CONFIGS,
  CAVE_BUILDING_CONFIGS,
  CRAFTING_BAND_SPIRIT_STONE_MULTIPLIER,
  IDLE_MATERIAL_BAND_MULTIPLIER,
  alchemyIngredientCosts,
  alchemySpiritStoneCost,
  getAlchemyRecipeConfig,
  type AlchemyRecipeId,
  type EquipmentBand,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAlchemyHeaderText,
  getAlchemyRecipeDisplay,
} from "../assets/scripts/core/AlchemyDisplay";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const NOW = new Date("2026-09-01T08:00:00.000Z");
const BANDS: readonly EquipmentBand[] = [1, 2, 3, 4];
const BAND_LEVELS: Readonly<Record<EquipmentBand, number>> = {
  1: 1,
  2: 61,
  3: 151,
  4: 301,
};
/** The 凡阶 prices, quoted from the design's §5 table rather than the config. */
const BAND_1_SPIRIT_STONE: Readonly<Record<AlchemyRecipeId, number>> = {
  small_experience_pill: 300,
  large_experience_pill: 1_500,
  dual_cultivation_pill: 2_000,
  breakthrough_pill: 3_000,
};

type MutableSave = Record<string, any>;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A save at one level with a maxed 炼丹房 and whatever stock a case needs. */
function brewerAtLevel(
  level: number,
  options: {
    readonly spiritStone?: string;
    readonly herbs?: number;
    readonly soil?: number;
    readonly ore?: number;
  } = {},
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
  // A high-level fixture has passed dozens of milestones; marking them claimed
  // keeps their payout out of the wallet, so brewing is the only thing that
  // moves the balance.
  save.snapshot.progressionTasks = save.snapshot.progressionTasks.map(
    (task: MutableSave) => ({
      ...task,
      progress: String(level),
      completedAt: NOW.toISOString(),
      claimedAt: NOW.toISOString(),
    }),
  );
  save.snapshot.wallet.spiritStone = options.spiritStone ?? "1000000000";
  save.snapshot.unlocks.cave = true;
  save.snapshot.cave.buildings = CAVE_BUILDING_CONFIGS.map((config) => ({
    buildingConfigId: config.id,
    level: config.id === "alchemy_room" ? 40 : 0,
  }));
  save.snapshot.inventory.stacks = [
    { itemConfigId: "spiritual_herb", displayName: "灵草", quantity: options.herbs ?? 500 },
    { itemConfigId: "spiritual_soil", displayName: "灵土", quantity: options.soil ?? 500 },
    { itemConfigId: "ore", displayName: "矿石", quantity: options.ore ?? 500 },
  ]
    .filter((stack) => Number(stack.quantity) > 0)
    .map((stack) => ({ ...stack, quantity: String(stack.quantity) }));
  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  if (service.initialize(NOW).created) {
    throw new Error(`expected the Lv.${level} brewer fixture to load`);
  }
  return service;
}

function quantityOf(service: LocalGameService, itemConfigId: string): number {
  return Number(
    service.snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === itemConfigId,
    )?.quantity ?? "0",
  );
}

describe("which recipes follow the band", () => {
  it("declares material scaling on the two experience pills only", () => {
    const scaling = new Map(
      ALCHEMY_RECIPE_CONFIGS.map((recipe) => [recipe.id, recipe.materialScalesWithBand]),
    );
    expect(scaling.get("small_experience_pill")).toBe(true);
    expect(scaling.get("large_experience_pill")).toBe(true);
    // 双修丹 pays flat bond and 突破丹 pays one breakthrough's worth, so neither
    // output gains value with the band — scaling their inputs would be pure
    // difficulty, and for 突破丹 a hard lock at 5,840 pills a lifetime.
    expect(scaling.get("dual_cultivation_pill")).toBe(false);
    expect(scaling.get("breakthrough_pill")).toBe(false);
    expect(scaling.size).toBe(4);
  });
});

describe("the alchemy spirit stone curve", () => {
  it("charges the design's sixteen prices", () => {
    const expected: Readonly<Record<AlchemyRecipeId, readonly number[]>> = {
      small_experience_pill: [300, 1_200, 3_600, 9_000],
      large_experience_pill: [1_500, 6_000, 18_000, 45_000],
      dual_cultivation_pill: [2_000, 8_000, 24_000, 60_000],
      breakthrough_pill: [3_000, 12_000, 36_000, 90_000],
    };
    for (const recipe of ALCHEMY_RECIPE_CONFIGS) {
      BANDS.forEach((band, index) => {
        expect(alchemySpiritStoneCost(recipe, band)).toBe(expected[recipe.id][index]);
      });
      // The config field itself is the 凡阶 price and keeps its old value.
      expect(recipe.spiritStoneCost).toBe(BAND_1_SPIRIT_STONE[recipe.id]);
    }
  });

  it("matches the crafting bench band for band, on purpose", () => {
    // Same numbers, separate constants: one curve for the player to learn, two
    // knobs for the designer to turn. If one bench is ever retuned this
    // assertion is the place to record that the split became real.
    for (const band of BANDS) {
      expect(ALCHEMY_BAND_SPIRIT_STONE_MULTIPLIER[band]).toBe(
        CRAFTING_BAND_SPIRIT_STONE_MULTIPLIER[band],
      );
    }
    expect(BANDS.map((band) => ALCHEMY_BAND_SPIRIT_STONE_MULTIPLIER[band])).toEqual([
      1, 4, 12, 30,
    ]);
  });
});

describe("the alchemy ingredient costs", () => {
  it("returns 凡阶 exactly as the config writes it", () => {
    for (const recipe of ALCHEMY_RECIPE_CONFIGS) {
      expect(alchemyIngredientCosts(recipe, 1)).toEqual(recipe.ingredients);
    }
  });

  it("scales the experience pills and leaves the other two flat", () => {
    const small = getAlchemyRecipeConfig("small_experience_pill");
    const large = getAlchemyRecipeConfig("large_experience_pill");
    expect(alchemyIngredientCosts(small, 4)).toEqual([
      { itemConfigId: "spiritual_herb", quantity: 40 },
      { itemConfigId: "spiritual_soil", quantity: 20 },
    ]);
    expect(alchemyIngredientCosts(large, 3)).toEqual([
      { itemConfigId: "spiritual_herb", quantity: 72 },
      { itemConfigId: "spiritual_soil", quantity: 48 },
    ]);
    for (const id of ["dual_cultivation_pill", "breakthrough_pill"] as const) {
      const recipe = getAlchemyRecipeConfig(id);
      for (const band of BANDS) {
        expect(alchemyIngredientCosts(recipe, band)).toEqual(recipe.ingredients);
      }
    }
  });

  it("prices experience pill herbs off the idle material multiplier itself", () => {
    // The invariant the whole design rests on: a pill is worth N hours of the
    // player's *current* income, so its cost has to grow by exactly the factor
    // income grew by. Sharing the table is what holds the exchange rate at
    // 凡阶's 2.1x/4.2x — two tables would drift and the rate would climb again.
    const herbsPerBand = (id: AlchemyRecipeId, band: EquipmentBand): number =>
      alchemyIngredientCosts(getAlchemyRecipeConfig(id), band).find(
        (ingredient) => ingredient.itemConfigId === "spiritual_herb",
      )!.quantity;
    for (const band of BANDS) {
      const multiplier = IDLE_MATERIAL_BAND_MULTIPLIER[band];
      expect(herbsPerBand("small_experience_pill", band) / multiplier).toBe(4);
      expect(herbsPerBand("large_experience_pill", band) / multiplier).toBe(12);
    }
  });

  it("refuses to quote a price for a band that does not exist", () => {
    const recipe = getAlchemyRecipeConfig("large_experience_pill");
    for (const band of [0, 5, -1] as unknown as EquipmentBand[]) {
      expect(() => alchemySpiritStoneCost(recipe, band)).toThrowError(RangeError);
      expect(() => alchemyIngredientCosts(recipe, band)).toThrowError(RangeError);
    }
  });
});

describe("brewing at a band", () => {
  it("charges 天阶 the scaled price for an experience pill", () => {
    const service = brewerAtLevel(BAND_LEVELS[4], { spiritStone: "100000" });

    service.brewAlchemy("large_experience_pill");

    expect(service.snapshot.wallet.spiritStone).toBe("55000");
    expect(quantityOf(service, "spiritual_herb")).toBe(380);
    expect(quantityOf(service, "spiritual_soil")).toBe(420);
    expect(quantityOf(service, "exp_pill_large")).toBe(1);
  });

  it("charges 凡阶 what it charged before bands existed", () => {
    const service = brewerAtLevel(BAND_LEVELS[1], { spiritStone: "100000" });

    service.brewAlchemy("large_experience_pill");

    expect(service.snapshot.wallet.spiritStone).toBe("98500");
    expect(quantityOf(service, "spiritual_herb")).toBe(488);
    expect(quantityOf(service, "spiritual_soil")).toBe(492);
  });

  it("scales 突破丹's spirit stone without touching its materials", () => {
    const service = brewerAtLevel(BAND_LEVELS[4], { spiritStone: "100000" });

    service.brewAlchemy("breakthrough_pill");

    expect(service.snapshot.wallet.spiritStone).toBe("10000");
    expect(quantityOf(service, "spiritual_herb")).toBe(480);
    expect(quantityOf(service, "ore")).toBe(495);
  });

  it("sizes a batch by the current band's price, not 凡阶's", () => {
    // 1,200 herbs at 120 a pill is ten, where the 凡阶 price of 12 would have
    // read a hundred — and a hundred is also the batch ceiling, so a stale read
    // here would look exactly like a full batch.
    const service = brewerAtLevel(BAND_LEVELS[4], { herbs: 1_200, soil: 1_000 });

    service.brewAlchemyBatch("large_experience_pill");

    expect(quantityOf(service, "exp_pill_large")).toBe(10);
    expect(quantityOf(service, "spiritual_herb")).toBe(0);
    expect(quantityOf(service, "spiritual_soil")).toBe(200);
  });

  it("deducts nothing when the band's price is one herb short", () => {
    const service = brewerAtLevel(BAND_LEVELS[4], { herbs: 119 });
    const before = JSON.stringify(service.snapshot.inventory);
    const walletBefore = service.snapshot.wallet.spiritStone;

    expect(() => service.brewAlchemy("large_experience_pill")).toThrow(
      "灵草不足，还需 1 个",
    );

    expect(JSON.stringify(service.snapshot.inventory)).toBe(before);
    expect(service.snapshot.wallet.spiritStone).toBe(walletBefore);
  });
});

describe("the alchemy panel", () => {
  it("quotes the band's price on the recipe row", () => {
    const service = brewerAtLevel(BAND_LEVELS[4], { herbs: 1_234 });
    const display = getAlchemyRecipeDisplay(
      service.snapshot,
      getAlchemyRecipeConfig("large_experience_pill"),
    );
    // `formatLargeNumber` abbreviates past ten thousand, so the 天阶 price reads
    // 4.5万 — the point of the assertion is that it is the banded number and not
    // the config's 1,500.
    expect(display.costText).toBe("4.5万 灵石");
    expect(display.materialText).toContain("灵草 1234/120");
  });

  it("names the band and both multipliers in the header", () => {
    const service = brewerAtLevel(BAND_LEVELS[4]);
    expect(getAlchemyHeaderText(service.snapshot)).toBe(
      "炼丹房 Lv.40　天阶　经验丹材料 ×10　灵石 ×30",
    );
    const novice = brewerAtLevel(BAND_LEVELS[1]);
    expect(getAlchemyHeaderText(novice.snapshot)).toBe(
      "炼丹房 Lv.40　凡阶　经验丹材料 ×1　灵石 ×1",
    );
  });
});
