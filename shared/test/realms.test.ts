import { describe, expect, it } from "vitest";
import {
  MAX_LEVEL,
  REALM_CONFIGS,
  getRealmConfigForLevel,
  getRealmStage,
  getRealmTitle,
} from "../src";

describe("realm configuration", () => {
  it("covers every level from 1 through the configured maximum without gaps", () => {
    let expectedMinLevel = 1;

    for (const realm of REALM_CONFIGS) {
      expect(realm.minLevel).toBe(expectedMinLevel);
      expect(realm.maxLevel).toBeGreaterThanOrEqual(realm.minLevel);
      expectedMinLevel = realm.maxLevel + 1;
    }

    expect(expectedMinLevel).toBe(MAX_LEVEL + 1);
  });

  it("maps important boundary levels to the intended realms", () => {
    expect(getRealmConfigForLevel(10).id).toBe("qi_refining");
    expect(getRealmConfigForLevel(11).id).toBe("foundation_establishment");
    expect(getRealmConfigForLevel(500).id).toBe("tribulation");
    expect(getRealmConfigForLevel(501).id).toBe("true_immortal");
    expect(getRealmConfigForLevel(1000).id).toBe("true_immortal");
  });

  it("derives display-only stages from relative realm progress", () => {
    expect(getRealmStage(1)).toBe("early");
    expect(getRealmStage(4)).toBe("middle");
    expect(getRealmStage(6)).toBe("late");
    expect(getRealmStage(10)).toBe("perfect");
    expect(getRealmStage(626)).toBe("middle");
    expect(getRealmTitle(16)).toBe("筑基中期");
  });

  it("rejects levels outside the configured range", () => {
    expect(() => getRealmConfigForLevel(0)).toThrow(RangeError);
    expect(() => getRealmConfigForLevel(1001)).toThrow(RangeError);
  });
});
