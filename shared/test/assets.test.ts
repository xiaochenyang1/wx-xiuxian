import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_CONFIGS,
  ITEM_CONFIGS,
  TECHNIQUE_CONFIGS,
  getEquipmentConfig,
  getItemConfig,
  getTechniqueConfig,
} from "../src";

describe("public asset configuration", () => {
  it("keeps item, technique, and equipment identifiers unique", () => {
    for (const configs of [ITEM_CONFIGS, TECHNIQUE_CONFIGS, EQUIPMENT_CONFIGS]) {
      expect(new Set(configs.map((config) => config.id)).size).toBe(configs.length);
    }
  });

  it("exposes only valid first-phase drop qualities and stable display metadata", () => {
    expect(new Set(TECHNIQUE_CONFIGS.map((config) => config.quality))).toEqual(
      new Set(["common", "uncommon"]),
    );
    expect(getItemConfig("breakthrough_pill").displayName).toBe("突破丹");
    expect(getTechniqueConfig("quiet_breathing_art").slot).toBe("mind");
    expect(getEquipmentConfig("ironwood_sword").slot).toBe("weapon");
    expect(getItemConfig("exp_pill_small").useEffect).toEqual({
      type: "simulated_online_experience",
      durationSeconds: 3_600,
    });
    expect(getItemConfig("exp_pill_large").useEffect).toBeUndefined();
  });
});
