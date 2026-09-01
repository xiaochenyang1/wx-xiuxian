import {
  EXPEDITION_STAGE_CONFIGS,
  TREASURE_HUNT_REWARD_ROWS,
  TREASURE_HUNT_TOTAL_WEIGHT,
  pickTreasureHuntReward,
  treasureHuntRewards,
  type EquipmentBand,
  type TreasureHuntRewardRow,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { getTreasureHuntText } from "../assets/scripts/core/ExpeditionDisplay";
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
/** §3.1's reference sweep: the best stage each band can be expected to run. */
const REFERENCE_STAGE_NUMBER: Readonly<Record<EquipmentBand, number>> = {
  1: 6,
  2: 8,
  3: 10,
  4: 12,
};
/** The twenty-four numbers of the design's §5 table, quoted not computed. */
const QUANTITY_BY_BAND: readonly (readonly number[])[] = [
  [3_600, 24_000, 180_000, 1_500_000],
  [70, 840, 1_680, 3_500],
  [15, 15, 15, 15],
  [15, 80, 200, 500],
  [1, 1, 1, 1],
  [1, 1, 1, 1],
];
const WEIGHTS: readonly number[] = [4_000, 3_000, 1_500, 1_000, 400, 100];
const ROW_KINDS: readonly string[] = [
  "spirit_stone",
  "random_material",
  "item",
  "item",
  "item",
  "item",
];
const ROW_ITEM_IDS: readonly (string | undefined)[] = [
  undefined,
  undefined,
  "technique_page",
  "enhance_stone",
  "exp_pill_large",
  "rename_card",
];

type MutableSave = Record<string, any>;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A save at `level` holding `tokens` 寻宝令 and nothing else. */
function hunterAtLevel(level: number, tokens: number): LocalGameService {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const writer = new FakePlatformAdapter();
  new LocalGameService(writer).initialize(NOW);
  const save = JSON.parse(writer.raw(SAVE_KEY)!) as MutableSave;
  save.savedAt = NOW.toISOString();
  save.snapshot.progress.level = level;
  save.snapshot.progress.experience = "0";
  save.snapshot.progress.settledAt = NOW.toISOString();
  // A Lv.301 fixture has passed dozens of milestones; claiming them all keeps
  // their payout out of the wallet so the hunt is the only thing that moves it.
  save.snapshot.progressionTasks = save.snapshot.progressionTasks.map(
    (task: MutableSave) => ({
      ...task,
      progress: String(level),
      completedAt: NOW.toISOString(),
      claimedAt: NOW.toISOString(),
    }),
  );
  save.snapshot.wallet.spiritStone = "0";
  save.snapshot.wallet.lifetimeSpiritStoneEarned = "0";
  save.snapshot.inventory.stacks = [
    { itemConfigId: "treasure_token", displayName: "寻宝令", quantity: String(tokens) },
  ];
  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  if (service.initialize(NOW).created) {
    throw new Error(`expected the Lv.${level} hunter fixture to load`);
  }
  return service;
}

function quantityOf(service: LocalGameService, itemConfigId: string): string {
  return (
    service.snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === itemConfigId,
    )?.quantity ?? "0"
  );
}

function rowQuantity(row: TreasureHuntRewardRow, band: EquipmentBand): number {
  return row.quantityByBand[band];
}

/** Expected payout per token on one axis, from the weights and quantities. */
function expectedPerToken(
  band: EquipmentBand,
  axis: (row: TreasureHuntRewardRow) => boolean,
): number {
  return TREASURE_HUNT_REWARD_ROWS.filter(axis).reduce(
    (total, row) =>
      total + (rowQuantity(row, band) * row.weight) / TREASURE_HUNT_TOTAL_WEIGHT,
    0,
  );
}

function isItem(itemConfigId: string) {
  return (row: TreasureHuntRewardRow): boolean =>
    row.kind === "item" && row.itemConfigId === itemConfigId;
}

/** The reference sweep row, read out of the stage configs rather than pinned. */
function referenceSweep(band: EquipmentBand): {
  spiritStone: number;
  materials: number;
  enhanceStone: number;
  techniquePages: number;
} {
  const config = EXPEDITION_STAGE_CONFIGS[REFERENCE_STAGE_NUMBER[band] - 1]!;
  const itemQuantity = (itemConfigId: string): number =>
    config.sweepItemRewards
      .filter((reward) => reward.itemConfigId === itemConfigId)
      .reduce((total, reward) => total + reward.quantity, 0);
  const MATERIALS = ["wood", "stone", "spiritual_soil", "spiritual_herb", "ore"];
  return {
    spiritStone: Number(config.sweepSpiritStoneReward),
    materials: MATERIALS.reduce((total, id) => total + itemQuantity(id), 0),
    enhanceStone: itemQuantity("enhance_stone"),
    techniquePages: itemQuantity("technique_page"),
  };
}

describe("the treasure hunt table's shape", () => {
  it("keeps the six weights and their order exactly as they were", () => {
    expect(TREASURE_HUNT_TOTAL_WEIGHT).toBe(10_000);
    expect(TREASURE_HUNT_REWARD_ROWS.map((row) => row.weight)).toEqual(WEIGHTS);
    expect(TREASURE_HUNT_REWARD_ROWS.map((row) => row.kind)).toEqual(ROW_KINDS);
    expect(
      TREASURE_HUNT_REWARD_ROWS.map((row) =>
        row.kind === "item" ? row.itemConfigId : undefined,
      ),
    ).toEqual(ROW_ITEM_IDS);
  });

  it("charges the design's twenty-four quantities", () => {
    TREASURE_HUNT_REWARD_ROWS.forEach((row, index) => {
      BANDS.forEach((band, bandIndex) => {
        expect(rowQuantity(row, band)).toBe(QUANTITY_BY_BAND[index]![bandIndex]);
      });
    });
  });

  it("never pays a later band less, and holds the last three flat", () => {
    for (const row of TREASURE_HUNT_REWARD_ROWS) {
      for (const band of [2, 3, 4] as const) {
        expect(rowQuantity(row, band)).toBeGreaterThanOrEqual(
          rowQuantity(row, (band - 1) as EquipmentBand),
        );
      }
    }
    for (const id of ["technique_page", "exp_pill_large", "rename_card"]) {
      const row = TREASURE_HUNT_REWARD_ROWS.find(isItem(id))!;
      const quantities = BANDS.map((band) => rowQuantity(row, band));
      expect(new Set(quantities).size).toBe(1);
    }
  });
});

describe("picking a reward", () => {
  it("walks the whole roll range at every band", () => {
    for (const band of BANDS) {
      let cursor = 0;
      TREASURE_HUNT_REWARD_ROWS.forEach((row, index) => {
        for (const roll of [cursor, cursor + row.weight - 1]) {
          const reward = pickTreasureHuntReward(band, roll);
          expect(reward.kind).toBe(row.kind);
          const quantity =
            reward.kind === "spirit_stone" ? reward.amount : reward.quantity;
          expect(quantity).toBe(QUANTITY_BY_BAND[index]![band - 1]);
          if (reward.kind === "item") {
            expect(reward.itemConfigId).toBe(ROW_ITEM_IDS[index]);
          }
        }
        cursor += row.weight;
      });
      expect(cursor).toBe(TREASURE_HUNT_TOTAL_WEIGHT);
    }
  });

  it("returns a settled reward carrying no weight", () => {
    const reward = pickTreasureHuntReward(4, 0);
    expect(reward).toEqual({ kind: "spirit_stone", amount: 1_500_000 });
    expect(treasureHuntRewards(1)).toEqual([
      { kind: "spirit_stone", amount: 3_600 },
      { kind: "random_material", quantity: 70 },
      { kind: "item", itemConfigId: "technique_page", quantity: 15 },
      { kind: "item", itemConfigId: "enhance_stone", quantity: 15 },
      { kind: "item", itemConfigId: "exp_pill_large", quantity: 1 },
      { kind: "item", itemConfigId: "rename_card", quantity: 1 },
    ]);
  });

  it("refuses an out-of-range roll and an unknown band", () => {
    for (const roll of [-1, TREASURE_HUNT_TOTAL_WEIGHT, 1.5]) {
      expect(() => pickTreasureHuntReward(1, roll)).toThrowError(RangeError);
    }
    for (const band of [0, 5, -1] as unknown as EquipmentBand[]) {
      expect(() => pickTreasureHuntReward(band, 0)).toThrowError(RangeError);
      expect(() => treasureHuntRewards(band)).toThrowError(RangeError);
    }
  });
});

describe("the invariant against the reference sweep", () => {
  it("pays about half a sweep on all three scaling axes", () => {
    for (const band of BANDS) {
      const sweep = referenceSweep(band);
      const ratios = [
        expectedPerToken(band, (row) => row.kind === "spirit_stone") /
          sweep.spiritStone,
        expectedPerToken(band, (row) => row.kind === "random_material") /
          sweep.materials,
        expectedPerToken(band, isItem("enhance_stone")) / sweep.enhanceStone,
      ];
      for (const ratio of ratios) {
        expect(ratio).toBeGreaterThanOrEqual(0.45);
        expect(ratio).toBeLessThanOrEqual(0.55);
      }
    }
  });

  it("stays strictly under a sweep on pages too, band by band", () => {
    // Flat quantity against a rising reference, so the ratio falls — 45% down to
    // 22.5%. Both ends have to stay inside (0, 1) for §3.3's "no supply table
    // needs recomputing" to hold, which is why this axis is asserted separately
    // rather than folded into the 45–55% band above.
    for (const band of BANDS) {
      const ratio =
        expectedPerToken(band, isItem("technique_page")) /
        referenceSweep(band).techniquePages;
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1);
    }
  });

  it("reads the reference rows out of the stage configs", () => {
    // The mapping is 关 6/8/10/12; pinning the four spirit stone figures here is
    // what makes the ratios above meaningful if a sweep row is ever retuned.
    expect(BANDS.map((band) => referenceSweep(band).spiritStone)).toEqual([
      3_000, 20_000, 150_000, 1_250_000,
    ]);
    expect(BANDS.map((band) => referenceSweep(band).enhanceStone)).toEqual([
      3, 16, 40, 100,
    ]);
  });
});

describe("hunting at a band", () => {
  it("pays 天阶 the scaled spirit stone and banks it as lifetime wealth", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const service = hunterAtLevel(BAND_LEVELS[4], 2);

    service.huntTreasure();

    expect(quantityOf(service, "treasure_token")).toBe("1");
    expect(service.snapshot.wallet.spiritStone).toBe("1500000");
    expect(service.snapshot.wallet.lifetimeSpiritStoneEarned).toBe("1500000");
  });

  it("pays 凡阶 the first row of the table", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const service = hunterAtLevel(BAND_LEVELS[1], 1);

    service.huntTreasure();

    expect(service.snapshot.wallet.spiritStone).toBe("3600");
  });

  it("pays the flat page row the same fifteen in both bands", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.75);
    const heavenly = hunterAtLevel(BAND_LEVELS[4], 1);
    heavenly.huntTreasure();
    expect(quantityOf(heavenly, "technique_page")).toBe("15");

    const mortal = hunterAtLevel(BAND_LEVELS[1], 1);
    mortal.huntTreasure();
    expect(quantityOf(mortal, "technique_page")).toBe("15");
  });

  it("still costs exactly one token and refuses a hunt without one", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const service = hunterAtLevel(BAND_LEVELS[4], 1);

    service.huntTreasure();

    expect(quantityOf(service, "treasure_token")).toBe("0");
    expect(() => service.huntTreasure()).toThrow("寻宝令不足");
  });
});

describe("the treasure hunt line", () => {
  it("names the band and the quantities that band would win", () => {
    // Row order, the same order the table is declared and rolled in.
    const heavenly = hunterAtLevel(BAND_LEVELS[4], 1);
    expect(getTreasureHuntText(heavenly.snapshot)).toBe(
      "寻宝 天阶　灵石 150万 · 材料 3500 · 残页 15 · 强化石 500 · 丹 · 改名卡",
    );
    const mortal = hunterAtLevel(BAND_LEVELS[1], 1);
    expect(getTreasureHuntText(mortal.snapshot)).toBe(
      "寻宝 凡阶　灵石 3,600 · 材料 70 · 残页 15 · 强化石 15 · 丹 · 改名卡",
    );
  });
});
