import { describe, expect, it } from "vitest";
import {
  generateIdleDrops,
  getSalvageYield,
} from "../src/modules/cultivation/drop-rewards";

describe("idle drop generation", () => {
  it("rolls every independent pool on the server and aggregates stack rewards", () => {
    const drops = generateIdleDrops(1, 1, () => 0);

    expect(drops).toMatchObject({
      configVersion: "idle-drop-2026-08-05-v1",
      stackItems: [
        { itemConfigId: "breakthrough_pill", quantity: "1" },
        { itemConfigId: "enhance_stone", quantity: "1" },
        { itemConfigId: "wood", quantity: "1" },
      ],
      equipment: [
        {
          equipmentConfigId: "ironwood_sword",
          quality: "common",
          rolledAffixes: [],
        },
      ],
      techniques: [
        {
          techniqueConfigId: "quiet_breathing_art",
          quality: "common",
        },
      ],
    });
  });

  it("keeps the five pools independent when every roll misses", () => {
    const drops = generateIdleDrops(1_440, 10, (maximum) => maximum - 1);

    expect(drops.stackItems).toEqual([]);
    expect(drops.equipment).toEqual([]);
    expect(drops.techniques).toEqual([]);
  });

  it("rejects an invalid random source instead of accepting client-like results", () => {
    expect(() => generateIdleDrops(1, 1, (maximum) => maximum)).toThrow(
      RangeError,
    );
  });

  it("defines deterministic salvage returns for chest protection and manual salvage", () => {
    expect(getSalvageYield("equipment", "common")).toEqual({
      spiritStone: 100n,
      enhanceStone: 1n,
    });
    expect(getSalvageYield("technique", "uncommon")).toEqual({
      spiritStone: 200n,
      enhanceStone: 0n,
    });
    expect(getSalvageYield("equipment", "rare")).toEqual({
      spiritStone: 500n,
      enhanceStone: 3n,
    });
  });
});
