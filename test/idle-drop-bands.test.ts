import {
  IDLE_ENHANCE_STONE_BAND_MULTIPLIER,
  IDLE_ITEM_DROPS,
  IDLE_MATERIAL_BAND_MULTIPLIER,
  IDLE_MATERIAL_ITEM_IDS,
  IDLE_STACK_DROPS,
  equipmentAffixRange,
  equipmentBandForConfig,
  equipmentConfigsForBand,
  idleItemDropBandMultiplier,
  idleStackDropBandMultiplier,
  idleStackDropQuantitySpan,
  readRolledAffixes,
  type AssetQuality,
  type EquipmentBand,
  type RolledAffix,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");
const DAY_SECONDS = 86_400;
const SEED = 20_260_101;

type MutableSave = Record<string, any>;

/**
 * A save parked at one level with an empty harvest chest and a roomy bag, so a
 * long idle run's drops are all observable instead of being auto-salvaged.
 */
function serviceAtLevel(level: number): LocalGameService {
  const writer = new FakePlatformAdapter();
  new LocalGameService(writer).initialize(START);
  const save = JSON.parse(writer.raw(SAVE_KEY)!) as MutableSave;
  save.savedAt = START.toISOString();
  save.snapshot.progress.level = level;
  save.snapshot.progress.experience = "0";
  save.snapshot.progress.settledAt = START.toISOString();

  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  if (service.initialize(START).created) {
    throw new Error(`expected the Lv.${level} fixture to load`);
  }
  return service;
}

interface DroppedPiece {
  readonly equipmentConfigId: string;
  readonly quality: AssetQuality;
  readonly rolledAffixes: readonly RolledAffix[];
}

/** Every equipment piece a seeded idle stretch put in the harvest chest. */
function droppedEquipment(level: number, days = 8): readonly DroppedPiece[] {
  const service = serviceAtLevel(level);
  const seen: DroppedPiece[] = [];
  const collected = new Set<string>();
  for (let day = 0; day < days; day += 1) {
    service.debugSimulateOffline(DAY_SECONDS, SEED + day);
    for (const item of service.snapshot.equipment) {
      if (item.location !== "harvest" || collected.has(item.id)) continue;
      collected.add(item.id);
      seen.push({
        equipmentConfigId: item.equipmentConfigId,
        quality: item.quality as AssetQuality,
        rolledAffixes: readRolledAffixes(item.rolledAffixes),
      });
    }
  }
  if (seen.length === 0) throw new Error(`no equipment dropped at Lv.${level}`);
  return seen;
}

const BAND_LEVELS: Readonly<Record<EquipmentBand, number>> = {
  1: 1,
  2: 61,
  3: 151,
  4: 301,
};

describe("idle drops stay inside the player's band", () => {
  it("only ever drops configs from the band the level resolves to", () => {
    for (const band of [1, 2, 3, 4] as const) {
      const ids = new Set(
        equipmentConfigsForBand(band).map((config) => config.id),
      );
      for (const piece of droppedEquipment(BAND_LEVELS[band])) {
        expect(ids.has(piece.equipmentConfigId)).toBe(true);
        expect(equipmentBandForConfig(piece.equipmentConfigId)).toBe(band);
      }
    }
  });

  it("switches pool at the band boundary, not one level early or late", () => {
    expect(
      new Set(droppedEquipment(60).map((piece) => piece.equipmentConfigId)),
    ).toEqual(new Set(["ironwood_sword", "cloudweave_robe", "jade_spirit_ring", "mist_crane_mount", "moonfox_companion"]));
    for (const piece of droppedEquipment(61)) {
      expect(equipmentBandForConfig(piece.equipmentConfigId)).toBe(2);
    }
  });

  it("still reaches every slot in the band, so no slot goes unfillable", () => {
    for (const band of [1, 2, 3, 4] as const) {
      const slots = new Set(
        droppedEquipment(BAND_LEVELS[band], 12).map(
          (piece) => piece.equipmentConfigId,
        ),
      );
      expect(slots.size).toBe(5);
    }
  });
});

describe("idle drop quality grows with the band", () => {
  it("keeps a band 1 player on 普通 and 优秀 only", () => {
    const qualities = new Set(
      droppedEquipment(1, 12).map((piece) => piece.quality),
    );
    expect([...qualities].sort()).toEqual(["common", "uncommon"]);
  });

  it("caps each band's drops at that band's best listed quality", () => {
    const ceilings: Readonly<Record<EquipmentBand, readonly AssetQuality[]>> = {
      1: ["common", "uncommon"],
      2: ["common", "uncommon", "rare"],
      3: ["common", "uncommon", "rare", "epic"],
      4: ["common", "uncommon", "rare", "epic", "legendary"],
    };
    for (const band of [1, 2, 3, 4] as const) {
      for (const piece of droppedEquipment(BAND_LEVELS[band], 12)) {
        expect(ceilings[band]).toContain(piece.quality);
      }
    }
  });

  it("actually pays out above 优秀 once the band allows it", () => {
    // The point of the whole change: an idle day at 天阶 is not an idle day at
    // 凡阶. 稀有 needs band 3+ weight to show up in a run this short.
    const band3 = droppedEquipment(BAND_LEVELS[3], 12);
    expect(band3.some((piece) => piece.quality === "rare")).toBe(true);
    const band4 = droppedEquipment(BAND_LEVELS[4], 12);
    expect(
      band4.some(
        (piece) => piece.quality === "rare" || piece.quality === "epic",
      ),
    ).toBe(true);
  });

  it("values a piece by its own quality multiplier, not a two-way guess", () => {
    // 史诗 is ×4.0 and 传说 ×7.0; the pre-band code scored everything above
    // 普通 as ×1.5, which would have understated every high-band drop.
    const service = serviceAtLevel(BAND_LEVELS[4]);
    const scores = new Map<string, number>();
    for (let day = 0; day < 12; day += 1) {
      service.debugSimulateOffline(DAY_SECONDS, SEED + day);
      for (const entry of service.snapshot.harvestChest.entries) {
        if (entry.entryType !== "equipment") continue;
        scores.set(`${entry.assetConfigId}:${entry.quality}`, Number(entry.valueScore));
      }
    }
    const multipliers: Readonly<Record<string, number>> = {
      common: 1,
      uncommon: 1.5,
      rare: 2.5,
      epic: 4,
      legendary: 7,
    };
    const bases: Readonly<Record<string, number>> = {
      void_immortal_sword: 80,
      void_heaven_vestment: 75,
      void_dao_seal: 55,
      void_candle_dragon_mount: 95,
      void_golden_crow: 90,
    };
    expect(scores.size).toBeGreaterThan(0);
    // Guard the guard: if band 4 ever stopped rolling above 优秀, every
    // assertion below would pass on the one multiplier the old code got right.
    expect(
      [...scores.keys()].some(
        (key) => !key.endsWith(":common") && !key.endsWith(":uncommon"),
      ),
    ).toBe(true);
    for (const [key, score] of scores) {
      const [configId, quality] = key.split(":");
      expect(score).toBe(
        Math.floor(bases[configId!]! * multipliers[quality!]!),
      );
    }
  });
});

interface SampledStack {
  readonly itemConfigId: string;
  readonly quantity: number;
}

/**
 * One attempt's worth of stack rewards, sampled from a fresh seed each time.
 *
 * Reseeding per sample keeps the stack draw the *first* draw of every run, so
 * sample `i` draws the same thing at every band. That is what lets the tests
 * below compare two bands stream-for-stream instead of settling for a
 * distribution check: a long run diverges across bands because a higher band
 * rolls more affixes and therefore spends a different number of draws.
 */
function sampledStacks(level: number, samples = 80): readonly SampledStack[] {
  const service = serviceAtLevel(level);
  const seen: SampledStack[] = [];
  for (let sample = 0; sample < samples; sample += 1) {
    // 90s offline at 70% efficiency is 63 effective seconds: exactly one attempt.
    const drops = service.debugSimulateOffline(90, SEED + sample).snapshot
      .offlineSettlement!.drops;
    for (const item of drops.stackItems) {
      seen.push({
        itemConfigId: item.itemConfigId,
        quantity: Number(item.quantity),
      });
    }
  }
  if (seen.length === 0) throw new Error(`no stack drops at Lv.${level}`);
  return seen;
}

const MATERIAL_IDS: ReadonlySet<string> = new Set(IDLE_MATERIAL_ITEM_IDS);
/** Materials and 强化石 both ride the band; 功法残页 and 寻宝令 do not. */
const BAND_SCALED_IDS: ReadonlySet<string> = new Set([
  ...IDLE_MATERIAL_ITEM_IDS,
  "enhance_stone",
]);

function bandMultiplierFor(itemConfigId: string, band: EquipmentBand): number {
  if (MATERIAL_IDS.has(itemConfigId)) return IDLE_MATERIAL_BAND_MULTIPLIER[band];
  if (itemConfigId === "enhance_stone") {
    return IDLE_ENHANCE_STONE_BAND_MULTIPLIER[band];
  }
  return 1;
}

describe("material drops scale with the band", () => {
  it("multiplies the same draw instead of drawing differently", () => {
    // The load-bearing assertion of the whole change. Band 1 is the reference
    // stream; every other band must hit the same items in the same order with
    // the quantity multiplied. If the multiplier had been folded into the
    // table's min/max, the draw width would differ and the streams would part.
    const reference = sampledStacks(1);
    for (const band of [2, 3, 4] as const) {
      const scaled = sampledStacks(BAND_LEVELS[band]);
      expect(scaled).toHaveLength(reference.length);
      for (const [index, sample] of scaled.entries()) {
        const base = reference[index]!;
        expect(sample.itemConfigId).toBe(base.itemConfigId);
        expect(sample.quantity).toBe(
          base.quantity * bandMultiplierFor(base.itemConfigId, band),
        );
      }
    }
  });

  it("keeps the rolled 1..3 window intact under every multiplier", () => {
    for (const band of [1, 2, 3, 4] as const) {
      const multiplier = IDLE_MATERIAL_BAND_MULTIPLIER[band];
      const rolled = new Set<number>();
      for (const sample of sampledStacks(BAND_LEVELS[band])) {
        if (!MATERIAL_IDS.has(sample.itemConfigId)) continue;
        expect(sample.quantity % multiplier).toBe(0);
        rolled.add(sample.quantity / multiplier);
      }
      expect([...rolled].sort()).toEqual([1, 2, 3]);
    }
  });

  it("pays 强化石 the band's rate per hit, always as a whole multiple", () => {
    for (const band of [1, 2, 3, 4] as const) {
      const stones = sampledStacks(BAND_LEVELS[band]).filter(
        (sample) => sample.itemConfigId === "enhance_stone",
      );
      expect(stones.length).toBeGreaterThan(0);
      for (const stone of stones) {
        expect(stone.quantity).toBe(IDLE_ENHANCE_STONE_BAND_MULTIPLIER[band]);
      }
    }
  });

  it("switches multiplier on the band boundary, not one level early or late", () => {
    const reference = sampledStacks(1);
    const scale = (band: EquipmentBand): readonly SampledStack[] =>
      reference.map((sample) => ({
        itemConfigId: sample.itemConfigId,
        quantity:
          sample.quantity * bandMultiplierFor(sample.itemConfigId, band),
      }));
    expect(sampledStacks(60)).toEqual(scale(1));
    expect(sampledStacks(61)).toEqual(scale(2));
    expect(sampledStacks(150)).toEqual(scale(2));
    expect(sampledStacks(151)).toEqual(scale(3));
    expect(sampledStacks(300)).toEqual(scale(3));
    expect(sampledStacks(301)).toEqual(scale(4));
  });
});

/**
 * The same save with 50 pieces of equipment parked in the bag, so every stack
 * reward of the next attempt has to overflow into spirit stone.
 */
function fullBagAtLevel(level: number): LocalGameService {
  const writer = new FakePlatformAdapter();
  new LocalGameService(writer).initialize(START);
  const save = JSON.parse(writer.raw(SAVE_KEY)!) as MutableSave;
  save.savedAt = START.toISOString();
  save.snapshot.progress.level = level;
  save.snapshot.progress.experience = "0";
  save.snapshot.progress.settledAt = START.toISOString();
  save.snapshot.inventory = { bagCapacity: 50, stacks: [] };
  save.snapshot.equipment = Array.from({ length: 50 }, (_, index) => ({
    id: `full-bag-${index}`,
    equipmentConfigId: "ironwood_sword",
    displayName: "玄木剑",
    quality: "common",
    slot: "weapon",
    powerBonusBp: 0,
    enhanceLevel: 0,
    rolledAffixes: [],
    location: "bag",
    equippedSlot: null,
    isLocked: false,
    configVersion: "local-idle-drop-v1",
  }));

  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  if (service.initialize(START).created) {
    throw new Error(`expected the full-bag Lv.${level} fixture to load`);
  }
  return service;
}

describe("a full bag converts the scaled quantity", () => {
  /** What one attempt pays in stack units when the bag can hold it. */
  function unitsWithRoom(level: number): number {
    return serviceAtLevel(level)
      .debugSimulateOffline(86, 0)
      .snapshot.offlineSettlement!.drops.stackItems.reduce(
        (sum, item) => sum + Number(item.quantity),
        0,
      );
  }

  it("pays a 天阶 material hit ten times what a 凡阶 one is worth", () => {
    // The overflow rate is per unit, so it follows the multiplier for free — but
    // only because the band is applied to the quantity and not to the rate.
    const payouts = new Map<number, number>();
    for (const level of [1, BAND_LEVELS[4]]) {
      const units = unitsWithRoom(level);
      expect(units).toBeGreaterThan(0);

      const summary = fullBagAtLevel(level).debugSimulateOffline(86, 0).snapshot
        .offlineSettlement!.drops;

      expect(summary.stackItems).toEqual([]);
      expect(summary.autoSalvagedCount).toBe(units);
      expect(summary.autoSalvageSpiritStone).toBe(String(units * 100));
      payouts.set(level, units);
    }
    expect(payouts.get(BAND_LEVELS[4])!).toBeGreaterThan(payouts.get(1)!);
  });
});

describe("IDLE_MATERIAL_BAND_MULTIPLIER", () => {
  it("starts at exactly 1, which is what keeps 凡阶 byte-identical", () => {
    expect(IDLE_MATERIAL_BAND_MULTIPLIER[1]).toBe(1);
  });

  it("covers every band and never decreases", () => {
    expect(IDLE_MATERIAL_BAND_MULTIPLIER).toEqual({ 1: 1, 2: 3, 3: 6, 4: 10 });
    const bands = [1, 2, 3, 4] as const;
    for (const band of bands.slice(1)) {
      expect(IDLE_MATERIAL_BAND_MULTIPLIER[band]).toBeGreaterThan(
        IDLE_MATERIAL_BAND_MULTIPLIER[(band - 1) as EquipmentBand],
      );
    }
  });

  it("stays below crafting's ×30 spirit stone, so materials stay the tight side", () => {
    expect(IDLE_MATERIAL_BAND_MULTIPLIER[4]).toBeLessThan(30);
  });
});

describe("idleStackDropBandMultiplier", () => {
  it("scales only the row that asks to be scaled", () => {
    const [materials, pages, tokens] = IDLE_STACK_DROPS;
    expect(materials!.scalesWithBand).toBe(true);
    expect(pages!.scalesWithBand).toBe(false);
    expect(tokens!.scalesWithBand).toBe(false);
    for (const band of [1, 2, 3, 4] as const) {
      expect(idleStackDropBandMultiplier(materials!, band)).toBe(
        IDLE_MATERIAL_BAND_MULTIPLIER[band],
      );
      // 功法残页 funds a finite lifetime cost and 寻宝令 gates the sweep tables,
      // so both stay flat on purpose.
      expect(idleStackDropBandMultiplier(pages!, band)).toBe(1);
      expect(idleStackDropBandMultiplier(tokens!, band)).toBe(1);
    }
  });

  it("never changes how wide the quantity draw is", () => {
    // The multiplier is applied after the draw; the span is what the seeded
    // stream depends on, and it must stay band-independent.
    expect(idleStackDropQuantitySpan(IDLE_STACK_DROPS[0]!)).toBe(3);
    expect(IDLE_STACK_DROPS[0]!.minQuantity).toBe(1);
    expect(IDLE_STACK_DROPS[0]!.maxQuantity).toBe(3);
  });

  it("rejects a band that is not in the table", () => {
    expect(() =>
      idleStackDropBandMultiplier(IDLE_STACK_DROPS[0]!, 5 as EquipmentBand),
    ).toThrow(RangeError);
  });
});

describe("IDLE_ENHANCE_STONE_BAND_MULTIPLIER", () => {
  it("starts at exactly 1, which is what keeps 凡阶 byte-identical", () => {
    expect(IDLE_ENHANCE_STONE_BAND_MULTIPLIER[1]).toBe(1);
  });

  it("covers every band and never decreases", () => {
    expect(IDLE_ENHANCE_STONE_BAND_MULTIPLIER).toEqual({
      1: 1,
      2: 3,
      3: 6,
      4: 10,
    });
    const bands = [1, 2, 3, 4] as const;
    for (const band of bands.slice(1)) {
      expect(IDLE_ENHANCE_STONE_BAND_MULTIPLIER[band]).toBeGreaterThan(
        IDLE_ENHANCE_STONE_BAND_MULTIPLIER[(band - 1) as EquipmentBand],
      );
    }
  });

  it("keeps the same shape as the material curve, so one curve is learned once", () => {
    expect(IDLE_ENHANCE_STONE_BAND_MULTIPLIER).toEqual(
      IDLE_MATERIAL_BAND_MULTIPLIER,
    );
  });
});

describe("idleItemDropBandMultiplier", () => {
  it("scales only the row that asks to be scaled", () => {
    const [stones, pills] = IDLE_ITEM_DROPS;
    expect(stones!.itemConfigId).toBe("enhance_stone");
    expect(stones!.scalesWithBand).toBe(true);
    expect(pills!.itemConfigId).toBe("breakthrough_pill");
    expect(pills!.scalesWithBand).toBe(false);
    for (const band of [1, 2, 3, 4] as const) {
      expect(idleItemDropBandMultiplier(stones!, band)).toBe(
        IDLE_ENHANCE_STONE_BAND_MULTIPLIER[band],
      );
      // Breakthrough pills have a hard lifetime ceiling and 真仙期 needs none, so
      // a flat rate is the right curve for them.
      expect(idleItemDropBandMultiplier(pills!, band)).toBe(1);
    }
  });

  it("never spends a draw, so the payout is the only thing a band changes", () => {
    // Unlike the stack table there is no min/max window here: `quantity` is a
    // constant, and `roll` spends one `randomInt` whatever it returns. That is
    // why the sequence assertion below can be exact at *every* band, not just 1.
    for (const drop of IDLE_ITEM_DROPS) expect(drop.quantity).toBe(1);
  });

  it("rejects a band that is not in the table", () => {
    expect(() =>
      idleItemDropBandMultiplier(IDLE_ITEM_DROPS[0]!, 5 as EquipmentBand),
    ).toThrow(RangeError);
  });
});

describe("the enhance stone curve leaves the seeded stream alone", () => {
  it("draws the identical sequence at every band, only paying more", () => {
    // The stronger guarantee the item table allows and the stack table does not.
    // Materials can only promise band 1 is unchanged; here the *draw order* is
    // identical across all four bands, so any divergence means a stray draw.
    const reference = sampledStacks(1);
    for (const band of [2, 3, 4] as const) {
      const scaled = sampledStacks(BAND_LEVELS[band]);
      expect(scaled.map((sample) => sample.itemConfigId)).toEqual(
        reference.map((sample) => sample.itemConfigId),
      );
    }
  });

  it("does not touch how often a stone lands, only how many it pays", () => {
    const hits = (level: number): number =>
      sampledStacks(level).filter(
        (sample) => sample.itemConfigId === "enhance_stone",
      ).length;
    const reference = hits(1);
    expect(reference).toBeGreaterThan(0);
    for (const band of [2, 3, 4] as const) {
      expect(hits(BAND_LEVELS[band])).toBe(reference);
    }
  });
});

describe("dropped affixes come out of the dropped band's range", () => {
  it("rolls every affix inside its own band's window", () => {
    for (const band of [1, 2, 3, 4] as const) {
      for (const piece of droppedEquipment(BAND_LEVELS[band], 12)) {
        const range = equipmentAffixRange(piece.quality, band);
        expect(piece.rolledAffixes).toHaveLength(range.count);
        for (const affix of piece.rolledAffixes) {
          expect(affix.valueBp).toBeGreaterThanOrEqual(range.minValueBp);
          expect(affix.valueBp).toBeLessThanOrEqual(range.maxValueBp);
        }
      }
    }
  });

  it("puts a 天阶 优秀 above the 凡阶 优秀 ceiling", () => {
    // 凡阶 优秀 tops out at 140bp and 天阶 优秀 starts at 105, so the windows
    // overlap; what has to be visible over a long run is a value no 凡阶 piece
    // could have rolled.
    const band4 = droppedEquipment(BAND_LEVELS[4], 12).flatMap((piece) =>
      piece.rolledAffixes.map((affix) => affix.valueBp),
    );
    expect(band4.length).toBeGreaterThan(0);
    expect(Math.max(...band4)).toBeGreaterThan(
      equipmentAffixRange("uncommon", 1).maxValueBp,
    );
  });
});

describe("banding leaves the band 1 drop stream alone", () => {
  it("gives the same seed the same result at the same level", () => {
    const first = droppedEquipment(1);
    const second = droppedEquipment(1);
    expect(second).toEqual(first);
  });

  it("gives a band 4 player a different stream from a band 1 player", () => {
    const band1 = droppedEquipment(1, 12);
    const band4 = droppedEquipment(BAND_LEVELS[4], 12);
    expect(band4.map((piece) => piece.equipmentConfigId)).not.toEqual(
      band1.map((piece) => piece.equipmentConfigId),
    );
  });
});
