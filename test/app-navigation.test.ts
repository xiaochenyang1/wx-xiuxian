import { describe, expect, it } from "vitest";
import {
  ALL_FEATURE_PANELS,
  BOTTOM_FEATURE_RAIL,
  CULTIVATION_SHORTCUTS,
  HEADER_FEATURE,
  MAIN_TABS,
} from "../assets/scripts/core/AppNavigation";
import type { FeaturePanel } from "../assets/scripts/core/ClientTypes";

/**
 * These are the tables `AppView` renders, not copies of them — the previous
 * version of this file mirrored the bottom rail by hand and so could only prove
 * the mirror was self-consistent.
 */

function entryPointsByPanel(): Map<FeaturePanel, string[]> {
  const found = new Map<FeaturePanel, string[]>();
  const record = (feature: FeaturePanel, where: string): void => {
    const existing = found.get(feature);
    if (existing) existing.push(where);
    else found.set(feature, [where]);
  };
  record(HEADER_FEATURE, "header avatar");
  BOTTOM_FEATURE_RAIL.forEach((entry) => record(entry.feature, `bottom rail ${entry.label}`));
  CULTIVATION_SHORTCUTS.forEach((entry) => record(entry.feature, `shortcut ${entry.label}`));
  return found;
}

describe("navigation coverage", () => {
  it("gives every implemented panel exactly one way in", () => {
    const found = entryPointsByPanel();
    const duplicated = [...found]
      .filter(([, places]) => places.length > 1)
      .map(([feature, places]) => `${feature}: ${places.join(", ")}`);
    expect(duplicated).toEqual([]);
    const missing = ALL_FEATURE_PANELS.filter((panel) => !found.has(panel));
    expect(missing).toEqual([]);
    expect(found.size).toBe(ALL_FEATURE_PANELS.length);
  });

  it("keeps a badge on every cultivation shortcut", () => {
    // A shortcut earns its slot by showing a number the player is waiting on.
    // One without a badge belongs on the bottom rail with the rest.
    expect(CULTIVATION_SHORTCUTS.map((entry) => entry.badge)).toEqual([
      "tasks",
      "harvest",
      "daily",
    ]);
    expect(CULTIVATION_SHORTCUTS.every((entry) => entry.x < 0)).toBe(true);
    // One badge source per slot: two shortcuts showing the same count would put
    // the same number in two places and make one of them a lie.
    expect(
      new Set(CULTIVATION_SHORTCUTS.map((entry) => entry.badge)).size,
    ).toBe(CULTIVATION_SHORTCUTS.length);
  });

  it("lists the four pages the main rail switches between", () => {
    expect(MAIN_TABS.map((tab) => tab.id)).toEqual([
      "cultivation",
      "partner",
      "ranking",
      "cave",
    ]);
  });
});

describe("bottom feature rail wiring", () => {
  it("routes every named system to its own implemented panel", () => {
    expect(BOTTOM_FEATURE_RAIL.find((entry) => entry.label === "炼丹")?.feature).toBe(
      "alchemy",
    );
    expect(BOTTOM_FEATURE_RAIL.find((entry) => entry.label === "炼器")?.feature).toBe(
      "crafting",
    );
    expect(BOTTOM_FEATURE_RAIL.find((entry) => entry.label === "宗门")?.feature).toBe(
      "sect",
    );
  });

  it("routes 试炼塔 to its own panel rather than the equipment page", () => {
    // 灵宠 used to share the 法宝 panel because a pet is one of its slots; the
    // tower took that slot, so a repeated panel id is now a wiring mistake.
    const tower = BOTTOM_FEATURE_RAIL.find((entry) => entry.label === "试炼塔");
    expect(tower?.feature).toBe("trialTower");
    const labels: readonly string[] = BOTTOM_FEATURE_RAIL.map((entry) => entry.label);
    expect(labels).not.toContain("灵宠");
  });

  it("routes 历练 to its implemented expedition panel", () => {
    const expedition = BOTTOM_FEATURE_RAIL.find((entry) => entry.label === "历练");
    expect(expedition?.feature).toBe("expedition");
  });

  it("fits the design width at the pitch the view draws", () => {
    // 750px of design width at a 107px pitch is what forced the shortcuts off
    // this rail; a slot added here without widening the pitch runs off-screen.
    expect(BOTTOM_FEATURE_RAIL.length * 107).toBeLessThanOrEqual(750);
  });
});

describe("fallback glyph assignment", () => {
  const glyphButtons = [...BOTTOM_FEATURE_RAIL, ...CULTIVATION_SHORTCUTS];

  it("gives each of the ten buttons its own outline", () => {
    // The rail used to pass its slot position as the glyph index while the
    // shortcuts declared theirs, so four pairs collided: 炼丹 drew 行囊's bag,
    // 炼器 drew 任务's clock, 功法 drew 日常's, and 宗门/历练 shared the
    // fallback shape. Two buttons on screen with one outline between them is
    // the same defect however the indices come to be equal.
    const byIcon = new Map<number, string[]>();
    for (const entry of glyphButtons) {
      const existing = byIcon.get(entry.icon);
      if (existing) existing.push(entry.label);
      else byIcon.set(entry.icon, [entry.label]);
    }
    const shared = [...byIcon]
      .filter(([, labels]) => labels.length > 1)
      .map(([icon, labels]) => `${icon}: ${labels.join(" + ")}`);
    expect(shared).toEqual([]);
    expect(byIcon.size).toBe(glyphButtons.length);
  });

  it("draws an outline that exists for every index", () => {
    // `drawFeatureGlyph` branches on 0..9 and falls through to a shared shape
    // for anything else, which is why an out-of-range index is invisible in
    // review rather than blank on screen.
    for (const entry of glyphButtons) {
      expect(Number.isInteger(entry.icon)).toBe(true);
      expect(entry.icon).toBeGreaterThanOrEqual(0);
      expect(entry.icon).toBeLessThanOrEqual(9);
    }
  });

  it("keeps the rail's gold and cyan alternating left to right", () => {
    // The glyph and its medallion ring take their accent from `icon % 2`, so
    // the rhythm the rail reads as is a property of these numbers: slot parity
    // has to match index parity or the rail picks up two golds in a row.
    expect(BOTTOM_FEATURE_RAIL.map((entry) => entry.icon % 2)).toEqual([
      0, 1, 0, 1, 0, 1, 0,
    ]);
  });
});
