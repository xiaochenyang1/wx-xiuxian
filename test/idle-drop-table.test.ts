import {
  HARVEST_CHEST_CAPACITY,
  IDLE_DROP_ROLL_SPAN,
  IDLE_EQUIPMENT_DROP_CHANCE,
  IDLE_ITEM_DROPS,
  IDLE_MATERIAL_ITEM_IDS,
  IDLE_STACK_DROPS,
  IDLE_STACK_OVERFLOW_SPIRIT_STONE_VALUE,
  IDLE_TECHNIQUE_DROP_CHANCE,
  IDLE_TECHNIQUE_DROP_QUALITY_WEIGHTS,
  getItemConfig,
  idleStackDropQuantitySpan,
  pickIdleStackDrop,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date("2026-01-01T00:00:00.000Z");
const DAY_SECONDS = 86_400;
const SEED = 20_260_101;

describe("the idle drop table", () => {
  it("holds the rates the service used to hard-code", () => {
    // These are the numbers that lived inside `applyIdleDrops` as literals. The
    // move is a pure extraction, so they are pinned here rather than restated.
    expect(IDLE_DROP_ROLL_SPAN).toBe(1_000_000);
    expect(IDLE_STACK_DROPS).toEqual([
      {
        itemConfigIds: IDLE_MATERIAL_ITEM_IDS,
        minQuantity: 1,
        maxQuantity: 3,
        weight: 350_000,
        scalesWithBand: true,
      },
      {
        itemConfigIds: ["technique_page"],
        minQuantity: 1,
        maxQuantity: 1,
        weight: 5_000,
        scalesWithBand: false,
      },
      {
        itemConfigIds: ["treasure_token"],
        minQuantity: 1,
        maxQuantity: 1,
        weight: 1_000,
        scalesWithBand: false,
      },
    ]);
    expect(IDLE_ITEM_DROPS).toEqual([
      {
        itemConfigId: "enhance_stone",
        quantity: 1,
        chance: 10_000,
        scalesWithBand: true,
      },
      {
        itemConfigId: "breakthrough_pill",
        quantity: 1,
        chance: 500,
        scalesWithBand: false,
      },
    ]);
    expect(IDLE_EQUIPMENT_DROP_CHANCE).toBe(4_000);
    expect(IDLE_TECHNIQUE_DROP_CHANCE).toBe(1_200);
    expect(IDLE_TECHNIQUE_DROP_QUALITY_WEIGHTS).toEqual([
      { quality: "common", weight: 8_000 },
      { quality: "uncommon", weight: 2_000 },
    ]);
    expect(IDLE_STACK_OVERFLOW_SPIRIT_STONE_VALUE).toBe(100);
    expect(HARVEST_CHEST_CAPACITY).toBe(100);
  });

  it("names only items the game actually has", () => {
    const ids = [
      ...IDLE_STACK_DROPS.flatMap((drop) => drop.itemConfigIds),
      ...IDLE_ITEM_DROPS.map((drop) => drop.itemConfigId),
    ];
    for (const itemConfigId of ids) {
      expect(getItemConfig(itemConfigId).id).toBe(itemConfigId);
    }
    expect(IDLE_MATERIAL_ITEM_IDS).toEqual([
      "wood",
      "stone",
      "spiritual_soil",
      "spiritual_herb",
      "ore",
    ]);
  });

  it("leaves most of the span paying out no stack at all", () => {
    const total = IDLE_STACK_DROPS.reduce((sum, drop) => sum + drop.weight, 0);
    expect(total).toBe(356_000);
    expect(total).toBeLessThan(IDLE_DROP_ROLL_SPAN);
  });
});

describe("pickIdleStackDrop", () => {
  it("splits the span exactly where the literals used to", () => {
    expect(pickIdleStackDrop(0)?.itemConfigIds).toBe(IDLE_MATERIAL_ITEM_IDS);
    expect(pickIdleStackDrop(349_999)?.itemConfigIds).toBe(IDLE_MATERIAL_ITEM_IDS);
    expect(pickIdleStackDrop(350_000)?.itemConfigIds).toEqual(["technique_page"]);
    expect(pickIdleStackDrop(354_999)?.itemConfigIds).toEqual(["technique_page"]);
    expect(pickIdleStackDrop(355_000)?.itemConfigIds).toEqual(["treasure_token"]);
    expect(pickIdleStackDrop(355_999)?.itemConfigIds).toEqual(["treasure_token"]);
  });

  it("returns nothing for the unweighted remainder", () => {
    expect(pickIdleStackDrop(356_000)).toBeNull();
    expect(pickIdleStackDrop(IDLE_DROP_ROLL_SPAN - 1)).toBeNull();
  });

  it("rejects a roll outside the span", () => {
    expect(() => pickIdleStackDrop(-1)).toThrow(RangeError);
    expect(() => pickIdleStackDrop(IDLE_DROP_ROLL_SPAN)).toThrow(RangeError);
    expect(() => pickIdleStackDrop(1.5)).toThrow(RangeError);
  });
});

describe("idleStackDropQuantitySpan", () => {
  it("reports 1 for a fixed quantity, so the caller spends no draw", () => {
    // A wasted draw is not cosmetic: the drop stream is seeded from the save, so
    // it would hand a given seed a different day's loot.
    expect(idleStackDropQuantitySpan(IDLE_STACK_DROPS[1]!)).toBe(1);
    expect(idleStackDropQuantitySpan(IDLE_STACK_DROPS[2]!)).toBe(1);
  });

  it("covers 1..3 for the material entry", () => {
    expect(idleStackDropQuantitySpan(IDLE_STACK_DROPS[0]!)).toBe(3);
  });
});

describe("idle drops pay out only what the table lists", () => {
  it("produces no stack item outside the table across a month", () => {
    const allowed = new Set([
      ...IDLE_STACK_DROPS.flatMap((drop) => drop.itemConfigIds),
      ...IDLE_ITEM_DROPS.map((drop) => drop.itemConfigId),
    ]);
    const service = new LocalGameService(new FakePlatformAdapter());
    service.initialize(START);
    const seen = new Set<string>();
    for (let day = 0; day < 30; day += 1) {
      const summary = service.debugSimulateOffline(DAY_SECONDS, SEED + day)
        .snapshot.offlineSettlement!.drops;
      for (const item of summary.stackItems) {
        seen.add(item.itemConfigId);
        expect(allowed.has(item.itemConfigId)).toBe(true);
      }
    }
    // A month is long enough to see the whole table, so this also catches an
    // entry the service silently stopped reading.
    expect([...seen].sort()).toEqual([...allowed].sort());
  });

  it("keeps materials the commonest stack reward and 寻宝令 the rarest", () => {
    const service = new LocalGameService(new FakePlatformAdapter());
    service.initialize(START);
    const totals = new Map<string, number>();
    for (let day = 0; day < 30; day += 1) {
      const summary = service.debugSimulateOffline(DAY_SECONDS, SEED + day)
        .snapshot.offlineSettlement!.drops;
      for (const item of summary.stackItems) {
        totals.set(
          item.itemConfigId,
          (totals.get(item.itemConfigId) ?? 0) + Number(item.quantity),
        );
      }
    }
    const read = (id: string): number => totals.get(id) ?? 0;
    const materials = IDLE_MATERIAL_ITEM_IDS.reduce(
      (sum, id) => sum + read(id),
      0,
    );
    expect(materials).toBeGreaterThan(read("enhance_stone"));
    expect(read("enhance_stone")).toBeGreaterThan(read("technique_page"));
    expect(read("technique_page")).toBeGreaterThan(read("treasure_token"));
  });
});
