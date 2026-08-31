import { describe, expect, it } from "vitest";
import { getAutoSalvageControls } from "../assets/scripts/core/AutoSalvageDisplay";
import {
  getInventoryItemUseDisplay,
  isDirectlyUsableInventoryItem,
} from "../assets/scripts/core/InventoryDisplay";
import {
  getHarvestBatchDisplay,
  getHarvestEntryDetailText,
} from "../assets/scripts/core/HarvestBatchDisplay";

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

describe("harvest chest candidate detail line", () => {
  const candidate = {
    id: "00000000-0000-4000-8000-000000000001",
    equipmentConfigId: "ironwood_sword",
    quality: "legendary",
    rolledAffixes: [
      { stat: "experience_bonus", valueBp: 490 },
      { stat: "spirit_stone_bonus", valueBp: 350 },
      { stat: "drop_bonus", valueBp: 210 },
    ],
  } as never;

  it("names the band and the affix score on an equipment candidate", () => {
    expect(
      getHarvestEntryDetailText(
        { equipment: [candidate] },
        {
          entryType: "equipment",
          equipmentInstanceId: "00000000-0000-4000-8000-000000000001",
        },
      ),
    ).toBe("凡阶法宝 · 词条 71%");
  });

  it("reads the band off the candidate, not off the player", () => {
    expect(
      getHarvestEntryDetailText(
        {
          equipment: [
            { ...(candidate as object), equipmentConfigId: "void_immortal_sword" },
          ] as never,
        },
        {
          entryType: "equipment",
          equipmentInstanceId: "00000000-0000-4000-8000-000000000001",
        },
      ),
    ).toBe("天阶法宝 · 词条 40%");
  });

  it("keeps the score off a technique candidate, which has no affixes", () => {
    expect(
      getHarvestEntryDetailText(
        { equipment: [candidate] },
        { entryType: "technique", equipmentInstanceId: null },
      ),
    ).toBe("功法本体");
  });

  it("still labels the row when the instance cannot be found", () => {
    expect(
      getHarvestEntryDetailText(
        { equipment: [] },
        { entryType: "equipment", equipmentInstanceId: "missing" },
      ),
    ).toBe("独立法宝");
  });
});
