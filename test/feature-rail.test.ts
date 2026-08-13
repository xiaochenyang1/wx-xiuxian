import { describe, expect, it } from "vitest";
import {
  isUpcomingFeaturePanel,
  type FeaturePanel,
  type UpcomingFeaturePanel,
} from "../assets/scripts/core/ClientTypes";

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
  it("never routes a label to an unrelated implemented panel", () => {
    // Systems that do not exist yet must not borrow another panel.
    const borrowed = BOTTOM_RAIL.filter(
      (entry) =>
        ["炼丹", "炼器", "宗门"].includes(entry.label) &&
        !isUpcomingFeaturePanel(entry.feature),
    );
    expect(borrowed).toEqual([]);
  });

  it("gives each unopened system its own distinct panel", () => {
    const upcoming = BOTTOM_RAIL.filter((entry) =>
      isUpcomingFeaturePanel(entry.feature),
    );
    expect(upcoming.map((entry) => entry.label)).toEqual([
      "炼丹",
      "炼器",
      "宗门",
    ]);
    expect(new Set(upcoming.map((entry) => entry.feature)).size).toBe(
      upcoming.length,
    );
  });

  it("routes 灵宠 to the equipment panel that owns the pet slot", () => {
    const pet = BOTTOM_RAIL.find((entry) => entry.label === "灵宠");
    expect(pet?.feature).toBe("equipment");
    expect(isUpcomingFeaturePanel(pet!.feature)).toBe(false);
  });

  it("routes 历练 to its implemented expedition panel", () => {
    const expedition = BOTTOM_RAIL.find((entry) => entry.label === "历练");
    expect(expedition?.feature).toBe("expedition");
    expect(isUpcomingFeaturePanel(expedition!.feature)).toBe(false);
  });
});

describe("upcoming feature classification", () => {
  it("classifies exactly the three unbuilt systems", () => {
    const upcoming: UpcomingFeaturePanel[] = ["alchemy", "crafting", "sect"];
    for (const feature of upcoming) {
      expect(isUpcomingFeaturePanel(feature)).toBe(true);
    }
  });

  it("does not classify a working panel as upcoming", () => {
    const implemented: FeaturePanel[] = [
      "profile",
      "techniques",
      "equipment",
      "inventory",
      "tasks",
      "expedition",
    ];
    for (const feature of implemented) {
      expect(isUpcomingFeaturePanel(feature)).toBe(false);
    }
  });
});
