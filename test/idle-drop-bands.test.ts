import {
  equipmentBandForConfig,
  equipmentConfigsForBand,
  type AssetQuality,
  type EquipmentBand,
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
