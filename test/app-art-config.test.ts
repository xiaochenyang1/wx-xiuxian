import { describe, expect, it } from "vitest";
import {
  BOTTOM_FEATURE_RAIL,
  CULTIVATION_SHORTCUTS,
  HEADER_FEATURE,
} from "../assets/scripts/core/AppNavigation";
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

  it("declares every feature asset with its documented basename", () => {
    expect(Object.values(FEATURE_NAVIGATION_ART_FILES)).toEqual([
      "technique",
      "treasure",
      "alchemy",
      "crafting",
      "trial-tower",
      "sect",
      "training",
      "inventory",
      "tasks",
    ]);
  });

  it("names a file for every navigation button that can show one", () => {
    const artCapable = [
      ...BOTTOM_FEATURE_RAIL.map((entry) => entry.feature),
      ...CULTIVATION_SHORTCUTS.map((entry) => entry.feature),
    ];
    expect(Object.keys(FEATURE_NAVIGATION_ART_FILES).sort()).toEqual(
      [...artCapable].sort(),
    );
    // 档案 is deliberately absent: its entry point is the header avatar, which
    // draws the player's own portrait rather than a navigation icon.
    expect(FEATURE_NAVIGATION_ART_FILES).not.toHaveProperty(HEADER_FEATURE);
    // Two buttons pointing at one file would make a dropped-in icon appear in
    // a second place its author never saw.
    expect(new Set(Object.values(FEATURE_NAVIGATION_ART_FILES)).size).toBe(
      artCapable.length,
    );
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
