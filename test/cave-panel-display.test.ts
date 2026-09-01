import {
  CAVE_ABSOLUTE_MAX_LEVEL,
  CAVE_MAX_LEVEL,
  caveUpgradeCost,
  getCaveBuildingConfig,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { formatLargeNumber } from "../assets/scripts/core/ClientNumber";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import {
  getCaveBuildingDisplay,
  getCaveSummary,
} from "../assets/scripts/core/CaveDisplay";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");
const SEED = 1;

type MutableSave = Record<string, any>;

/** An unlocked snapshot, optionally edited before it is reloaded. */
function snapshotWith(mutate: (save: MutableSave) => void = () => {}) {
  const platform = new FakePlatformAdapter();
  const seedService = new LocalGameService(platform);
  seedService.initialize(START);
  seedService.debugSimulateOffline(86_400, SEED);
  seedService.breakthrough();

  const save = JSON.parse(platform.raw(SAVE_KEY)!) as MutableSave;
  mutate(save);

  const reloaded = new FakePlatformAdapter();
  reloaded.seed(SAVE_KEY, save);
  const service = new LocalGameService(reloaded);
  service.initialize(new Date(new Date(save.savedAt).getTime() + 60_000));
  return service.snapshot;
}

function building(save: MutableSave, id: string): any {
  return save.snapshot.cave.buildings.find(
    (item: any) => item.buildingConfigId === id,
  );
}

function stack(save: MutableSave, itemConfigId: string): any {
  return save.snapshot.inventory.stacks.find(
    (item: any) => item.itemConfigId === itemConfigId,
  );
}

const SPIRIT_ARRAY = getCaveBuildingConfig("spirit_array");
const CRAFTING_ROOM = getCaveBuildingConfig("crafting_room");

describe("cave building display", () => {
  it("shows an unbuilt building as 未建造 with a build action", () => {
    const display = getCaveBuildingDisplay(snapshotWith(), SPIRIT_ARRAY);

    expect(display.level).toBe(0);
    expect(display.levelText).toBe("未建造");
    expect(display.actionText).toBe("建造");
    expect(display.maxed).toBe(false);
  });

  it("shows a built building with its level and an upgrade action", () => {
    const snapshot = snapshotWith((save) => {
      building(save, "spirit_array").level = 3;
    });
    const display = getCaveBuildingDisplay(snapshot, SPIRIT_ARRAY);

    expect(display.levelText).toBe("Lv.3");
    expect(display.actionText).toBe("升级");
  });

  it("renders every bonus dimension as a percentage, power included", () => {
    const snapshot = snapshotWith((save) => {
      building(save, "spirit_array").level = 2;
      building(save, "crafting_room").level = 2;
    });

    expect(getCaveBuildingDisplay(snapshot, SPIRIT_ARRAY).bonusText).toBe("修为 +6%");
    expect(getCaveBuildingDisplay(snapshot, CRAFTING_ROOM).bonusText).toBe("战力 +4%");
  });

  it("previews the next level rather than the current one", () => {
    const snapshot = snapshotWith((save) => {
      building(save, "spirit_array").level = 1;
    });

    expect(getCaveBuildingDisplay(snapshot, SPIRIT_ARRAY).nextBonusText).toBe(
      "下一级 修为 +6%",
    );
  });

  it("quotes the cost of the next level, not the last one", () => {
    const snapshot = snapshotWith((save) => {
      building(save, "spirit_array").level = 2;
    });
    const display = getCaveBuildingDisplay(snapshot, SPIRIT_ARRAY);

    // Costs are abbreviated for display the same way every other amount is.
    expect(display.costText).toBe(
      `${formatLargeNumber(String(caveUpgradeCost("spirit_array", 2).spiritStone))} 灵石`,
    );
    expect(display.costText).not.toBe(
      `${formatLargeNumber(String(caveUpgradeCost("spirit_array", 1).spiritStone))} 灵石`,
    );
  });

  it("marks the building affordable only when stones and materials both suffice", () => {
    const affordable = getCaveBuildingDisplay(snapshotWith(), SPIRIT_ARRAY);
    expect(affordable.affordable).toBe(true);

    const brokeSnapshot = snapshotWith((save) => {
      save.snapshot.wallet.spiritStone = "0";
    });
    expect(getCaveBuildingDisplay(brokeSnapshot, SPIRIT_ARRAY).affordable).toBe(false);

    const scarce = caveUpgradeCost("spirit_array", 0).materials[0]!;
    const shortSnapshot = snapshotWith((save) => {
      stack(save, scarce.itemConfigId).quantity = "1";
    });
    const shortDisplay = getCaveBuildingDisplay(shortSnapshot, SPIRIT_ARRAY);
    expect(shortDisplay.affordable).toBe(false);
    expect(
      shortDisplay.materials.find(
        (material) => material.displayName === "石材",
      )?.sufficient,
    ).toBe(false);
  });

  it("reports each material against what the player owns", () => {
    const snapshot = snapshotWith();
    const display = getCaveBuildingDisplay(snapshot, SPIRIT_ARRAY);
    const cost = caveUpgradeCost("spirit_array", 0);

    expect(display.materials).toHaveLength(cost.materials.length);
    display.materials.forEach((material, index) => {
      expect(material.required).toBe(cost.materials[index]!.quantity);
      expect(material.sufficient).toBe(true);
    });
  });

  it("replaces the action with 段位已满 at the band cap", () => {
    const snapshot = snapshotWith((save) => {
      building(save, "spirit_array").level = CAVE_MAX_LEVEL;
    });
    const display = getCaveBuildingDisplay(snapshot, SPIRIT_ARRAY);

    // The fixture is a Lv.11 (凡阶) save, so Lv.10 is its ceiling for now but not
    // the building's ceiling for good.
    expect(display.maxed).toBe(true);
    expect(display.complete).toBe(false);
    expect(display.actionText).toBe("段位已满");
    expect(display.affordable).toBe(false);
    expect(display.materials).toHaveLength(0);
    expect(display.nextBonusText).toBe("需突破至灵阶");
  });

  it("replaces the action with 已满级 at the absolute cap", () => {
    // 炼器室 reaches its absolute cap inside 凡阶; the other four never do.
    const craftingRoom = getCaveBuildingDisplay(
      snapshotWith((save) => {
        building(save, "crafting_room").level = CAVE_MAX_LEVEL;
      }),
      CRAFTING_ROOM,
    );
    expect(craftingRoom.maxed).toBe(true);
    expect(craftingRoom.complete).toBe(true);
    expect(craftingRoom.actionText).toBe("已满级");
    expect(craftingRoom.nextBonusText).toBe("已达上限");

    const spiritArray = getCaveBuildingDisplay(
      snapshotWith((save) => {
        save.snapshot.progress.level = 400;
        save.snapshot.progress.experience = "0";
        save.snapshot.progress.status = "gaining";
        building(save, "spirit_array").level = CAVE_ABSOLUTE_MAX_LEVEL;
      }),
      SPIRIT_ARRAY,
    );
    expect(spiritArray.complete).toBe(true);
    expect(spiritArray.actionText).toBe("已满级");
    expect(spiritArray.nextBonusText).toBe("已达上限");
  });

  it("keeps upgrading available above Lv.10 once the band allows it", () => {
    const snapshot = snapshotWith((save) => {
      save.snapshot.progress.level = 100;
      save.snapshot.progress.experience = "0";
      save.snapshot.progress.status = "gaining";
      building(save, "spirit_array").level = CAVE_MAX_LEVEL;
    });
    const display = getCaveBuildingDisplay(snapshot, SPIRIT_ARRAY);

    expect(display.maxed).toBe(false);
    expect(display.actionText).toBe("升级");
    expect(display.costText).toBe(`${formatLargeNumber("375000")} 灵石`);
  });
});

describe("cave summary", () => {
  it("counts only buildings that have been built", () => {
    expect(getCaveSummary(snapshotWith())).toContain("已建成 0 / 5 座");

    const snapshot = snapshotWith((save) => {
      building(save, "spirit_array").level = 1;
      building(save, "spirit_field").level = 2;
    });
    expect(getCaveSummary(snapshot)).toContain("已建成 2 / 5 座");
  });

  it("totals the experience bonus across buildings", () => {
    const snapshot = snapshotWith((save) => {
      building(save, "spirit_array").level = 2;
      building(save, "seclusion_room").level = 2;
    });

    expect(getCaveSummary(snapshot)).toContain("修为 +9%");
  });
});
