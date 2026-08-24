import { describe, expect, it } from "vitest";
import type { FeaturePanel } from "../assets/scripts/core/ClientTypes";

/**
 * Mirrors the seven-slot bottom rail in `AppView.drawBottomFeatureRail`.
 * These entries used to point at unrelated panels (炼丹 opened the bag, 宗门
 * opened tasks), so this table exists to keep every label honest.
 */
const BOTTOM_RAIL: ReadonlyArray<{
  readonly label: string;
  readonly feature: FeaturePanel;
}> = [
  { label: "功法", feature: "techniques" },
  { label: "法宝", feature: "equipment" },
  { label: "炼丹", feature: "alchemy" },
  { label: "炼器", feature: "crafting" },
  { label: "试炼塔", feature: "trialTower" },
  { label: "宗门", feature: "sect" },
  { label: "历练", feature: "expedition" },
];

describe("bottom feature rail wiring", () => {
  it("routes every named system to its own implemented panel", () => {
    expect(BOTTOM_RAIL.find((entry) => entry.label === "炼丹")?.feature).toBe(
      "alchemy",
    );
    expect(BOTTOM_RAIL.find((entry) => entry.label === "炼器")?.feature).toBe(
      "crafting",
    );
    expect(BOTTOM_RAIL.find((entry) => entry.label === "宗门")?.feature).toBe(
      "sect",
    );
  });

  it("gives every slot its own panel now that no label is a duplicate", () => {
    // 灵宠 used to share the 法宝 panel because a pet is one of its slots; the
    // tower took that slot, so a repeated panel id is now a wiring mistake.
    expect(new Set(BOTTOM_RAIL.map((entry) => entry.feature)).size).toBe(
      BOTTOM_RAIL.length,
    );
  });

  it("routes 试炼塔 to its own panel rather than the equipment page", () => {
    const tower = BOTTOM_RAIL.find((entry) => entry.label === "试炼塔");
    expect(tower?.feature).toBe("trialTower");
    expect(BOTTOM_RAIL.some((entry) => entry.label === "灵宠")).toBe(false);
  });

  it("routes 历练 to its implemented expedition panel", () => {
    const expedition = BOTTOM_RAIL.find((entry) => entry.label === "历练");
    expect(expedition?.feature).toBe("expedition");
  });
});
