import type { BootstrapSnapshot } from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import {
  getEquipmentEnhanceDisplay,
  getTechniqueUpgradeDisplay,
} from "../assets/scripts/core/AssetUpgradeDisplay";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date("2026-01-01T00:00:00.000Z");

function snapshotWithBalances(
  spiritStone: number,
  enhanceStone: number,
): BootstrapSnapshot {
  const service = new LocalGameService(new FakePlatformAdapter());
  service.initialize(START);
  return {
    ...service.snapshot,
    wallet: {
      ...service.snapshot.wallet,
      spiritStone: String(spiritStone),
    },
    inventory: {
      ...service.snapshot.inventory,
      stacks:
        enhanceStone > 0
          ? [
              {
                itemConfigId: "enhance_stone",
                displayName: "强化石",
                quantity: String(enhanceStone),
              },
            ]
          : [],
    },
  };
}

function equipment(
  enhanceLevel: number,
  quality = "common",
): BootstrapSnapshot["equipment"][number] {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    equipmentConfigId: "ironwood_sword",
    displayName: "玄木剑",
    quality,
    slot: "weapon",
    fixedPower: "80",
    enhanceLevel,
    rolledAffixes: [],
    location: "bag",
    equippedSlot: null,
    isLocked: false,
    configVersion: "local-idle-drop-v1",
  };
}

function technique(
  star: number,
  duplicateCount: number,
): BootstrapSnapshot["techniques"][number] {
  return {
    techniqueConfigId: "quiet_breathing_art",
    displayName: "静息诀",
    quality: "common",
    slot: "mind",
    star,
    duplicateCount,
    equippedSlot: null,
    fixedPower: "40",
    experienceBonusBp: 200,
    spiritStoneBonusBp: 0,
    dropBonusBp: 0,
    configVersion: "local-idle-drop-v1",
  };
}

describe("equipment enhancement display", () => {
  it("shows an affordable quote with owned and required enhancement stones", () => {
    const display = getEquipmentEnhanceDisplay(
      snapshotWithBalances(10_000, 3),
      equipment(0),
    );

    expect(display).toEqual({
      maxed: false,
      affordable: true,
      costText: "强化石 3/1\n灵石 250",
      actionText: "强化",
      actionEnabled: true,
    });
  });

  it("stays actionable when resources are short so the service can explain why", () => {
    const display = getEquipmentEnhanceDisplay(
      snapshotWithBalances(249, 0),
      equipment(0),
    );

    expect(display.affordable).toBe(false);
    expect(display.actionEnabled).toBe(true);
    expect(display.costText).toBe("强化石 0/1\n灵石 250");
  });

  it("formats large owned quantities without changing the quoted cost", () => {
    const display = getEquipmentEnhanceDisplay(
      snapshotWithBalances(10_000, 12_345),
      equipment(0),
    );

    expect(display.costText).toBe("强化石 1.23万/1\n灵石 250");
  });

  it("disables enhancement at +20", () => {
    expect(
      getEquipmentEnhanceDisplay(
        snapshotWithBalances(1_000_000, 1_000),
        equipment(20),
      ),
    ).toEqual({
      maxed: true,
      affordable: false,
      costText: "强化已满",
      actionText: "满级",
      actionEnabled: false,
    });
  });

  it("rejects an unknown equipment quality", () => {
    expect(() =>
      getEquipmentEnhanceDisplay(
        snapshotWithBalances(10_000, 10),
        equipment(0, "unknown"),
      ),
    ).toThrow(RangeError);
  });
});

describe("technique star-up display", () => {
  it("shows an affordable same-name duplicate quote", () => {
    expect(getTechniqueUpgradeDisplay(technique(3, 2))).toEqual({
      maxed: false,
      affordable: true,
      costText: "副本 2/2",
      actionText: "升星",
      actionEnabled: true,
    });
  });

  it("keeps an unaffordable star-up actionable", () => {
    const display = getTechniqueUpgradeDisplay(technique(8, 6));

    expect(display.affordable).toBe(false);
    expect(display.actionEnabled).toBe(true);
    expect(display.costText).toBe("副本 6/7");
  });

  it("disables star-up at ten stars", () => {
    expect(getTechniqueUpgradeDisplay(technique(10, 999))).toEqual({
      maxed: true,
      affordable: false,
      costText: "已满星",
      actionText: "满星",
      actionEnabled: false,
    });
  });
});
