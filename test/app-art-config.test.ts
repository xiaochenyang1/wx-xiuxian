import { describe, expect, it } from "vitest";
import {
  FEATURE_NAVIGATION_ART_FILES,
  findNavigationArtName,
  MAIN_NAVIGATION_ART_FILES,
  normalizeResourceName,
} from "../assets/scripts/core/AppArtConfig";

describe("navigation art resource mapping", () => {
  it("declares every main tab asset with its documented basename", () => {
    expect(Object.keys(MAIN_NAVIGATION_ART_FILES)).toHaveLength(4);
    expect(Object.values(MAIN_NAVIGATION_ART_FILES)).toEqual([
      "cultivation",
      "partner",
      "ranking",
      "cave",
    ]);
  });

  it("declares every bottom feature asset with its documented basename", () => {
    expect(Object.keys(FEATURE_NAVIGATION_ART_FILES)).toHaveLength(7);
    expect(Object.values(FEATURE_NAVIGATION_ART_FILES)).toEqual([
      "technique",
      "treasure",
      "alchemy",
      "crafting",
      "trial-tower",
      "sect",
      "training",
    ]);
  });

  it("matches Cocos sprite names with extensions and directory prefixes", () => {
    expect(normalizeResourceName("Art\\Navigation\\Main\\Partner.PNG")).toBe(
      "art/navigation/main/partner",
    );
    expect(
      findNavigationArtName(
        ["art/navigation/main/partner", "art/navigation/main/cave"],
        "partner",
      ),
    ).toBe("art/navigation/main/partner");
    expect(findNavigationArtName(["cave"], "partner")).toBeUndefined();
  });
});
