import { describe, expect, it } from "vitest";
import { getAutoSalvageControls } from "../assets/scripts/core/AutoSalvageDisplay";
import {
  getInventoryItemUseDisplay,
  isDirectlyUsableInventoryItem,
} from "../assets/scripts/core/InventoryDisplay";
import { getHarvestBatchDisplay } from "../assets/scripts/core/HarvestBatchDisplay";

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

  it("disables experience pills at a breakthrough bottleneck", () => {
    expect(getInventoryItemUseDisplay("exp_pill_small", "breakthrough_ready")).toEqual({
      visible: true,
      enabled: false,
      label: "需突破",
    });
    expect(getInventoryItemUseDisplay("exp_pill_large", "version_cap")).toEqual({
      visible: true,
      enabled: true,
      label: "使用",
    });
    expect(getInventoryItemUseDisplay("breakthrough_pill", "gaining")).toEqual({
      visible: false,
      enabled: false,
      label: "",
    });
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

describe("harvest batch controls", () => {
  it("quotes deterministic collection capacity and low-quality salvage counts", () => {
    expect(
      getHarvestBatchDisplay({
        inventory: { bagCapacity: 2, stacks: [] },
        equipment: [
          {
            id: "bag-item",
            location: "bag",
          } as never,
          {
            id: "harvest-a",
            location: "harvest",
          } as never,
          {
            id: "harvest-b",
            location: "harvest",
          } as never,
        ],
        harvestChest: {
          pendingCount: 3,
          entries: [
            { entryType: "equipment", quality: "common" } as never,
            { entryType: "equipment", quality: "rare" } as never,
            { entryType: "technique", quality: "uncommon" } as never,
          ],
        },
      }),
    ).toEqual({
      collectibleCount: 2,
      blockedEquipmentCount: 1,
      salvageableCount: 2,
    });
  });
});
