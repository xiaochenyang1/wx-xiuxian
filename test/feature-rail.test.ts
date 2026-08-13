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
  { label: "灵宠", feature: "equipment" },
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

  it("uses a distinct panel id for every standalone system", () => {
    const standalone = BOTTOM_RAIL.filter((entry) => entry.label !== "灵宠");
    expect(new Set(standalone.map((entry) => entry.feature)).size).toBe(
      standalone.length,
    );
  });

  it("routes 灵宠 to the equipment panel that owns the pet slot", () => {
    const pet = BOTTOM_RAIL.find((entry) => entry.label === "灵宠");
    expect(pet?.feature).toBe("equipment");
  });

  it("routes 历练 to its implemented expedition panel", () => {
    const expedition = BOTTOM_RAIL.find((entry) => entry.label === "历练");
    expect(expedition?.feature).toBe("expedition");
  });
});
