import { describe, expect, it } from "vitest";
import { getAutoSalvageControls } from "../assets/scripts/core/AutoSalvageDisplay";
import { isDirectlyUsableInventoryItem } from "../assets/scripts/core/InventoryDisplay";

describe("inventory item actions", () => {
  it("offers a direct use button for both experience pill sizes", () => {
    expect(isDirectlyUsableInventoryItem("exp_pill_small")).toBe(true);
    expect(isDirectlyUsableInventoryItem("exp_pill_large")).toBe(true);
  });

  it("does not present materials and system-consumed items as directly usable", () => {
    for (const itemConfigId of [
      "breakthrough_pill",
      "dual_cultivation_pill",
      "technique_page",
      "treasure_token",
      "rename_card",
      "ore",
    ]) {
      expect(isDirectlyUsableInventoryItem(itemConfigId)).toBe(false);
    }
  });
});

describe("auto salvage controls", () => {
  it("maps both saved settings to stable toggle labels and states", () => {
    expect(
      getAutoSalvageControls({
        autoSalvageCommon: true,
        autoSalvageUncommon: false,
        partnerUnlockNoticeSeen: false,
        selectedTab: "inventory",
      }),
    ).toEqual([
      { quality: "common", label: "普通自动", active: true },
      { quality: "uncommon", label: "优秀自动", active: false },
    ]);
  });
});
