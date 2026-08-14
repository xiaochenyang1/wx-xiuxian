import {
  countOccupiedBagSlots,
  getStoredEquipment,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { getEquipmentManagementDisplay } from "../assets/scripts/core/EquipmentManagementDisplay";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");
const BAG_EQUIPMENT_ID = "00000000-0000-4000-8000-000000000301";
const HARVEST_EQUIPMENT_ID = "00000000-0000-4000-8000-000000000302";

type MutableSave = Record<string, any>;

function equipment(
  id: string,
  location: "bag" | "equipped" | "harvest" = "bag",
  overrides: Record<string, unknown> = {},
): MutableSave {
  return {
    id,
    equipmentConfigId: "ironwood_sword",
    displayName: "玄木剑",
    quality: "common",
    slot: "weapon",
    fixedPower: "80",
    enhanceLevel: 0,
    rolledAffixes: [],
    location,
    equippedSlot: location === "equipped" ? "weapon" : null,
    isLocked: false,
    configVersion: "local-idle-drop-v1",
    ...overrides,
  };
}

function serviceWithEquipment(
  item: MutableSave,
  options: { readonly bagCapacity?: number; readonly extraEquipment?: MutableSave[] } = {},
): { service: LocalGameService; platform: FakePlatformAdapter } {
  const now = new Date();
  const platform = new FakePlatformAdapter();
  const writer = new LocalGameService(platform);
  writer.initialize(now);
  const raw = platform.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected a persisted save");
  const save = JSON.parse(raw) as MutableSave;
  save.savedAt = now.toISOString();
  save.snapshot.progress.settledAt = now.toISOString();
  save.snapshot.wallet.spiritStone = "1000";
  save.snapshot.inventory = {
    bagCapacity: options.bagCapacity ?? 50,
    stacks: [],
  };
  save.snapshot.equipment = [item, ...(options.extraEquipment ?? [])];
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  const loaded = service.initialize(now);
  if (loaded.created) throw new Error("equipment fixture save was rejected");
  return { service, platform };
}

function stackQuantity(service: LocalGameService, itemConfigId: string): string {
  return (
    service.snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === itemConfigId,
    )?.quantity ?? "0"
  );
}

describe("equipment management service", () => {
  it("locks and unlocks equipment without changing its power", () => {
    const { service } = serviceWithEquipment(equipment(BAG_EQUIPMENT_ID));
    const powerBefore = service.snapshot.progress.totalPower;

    service.toggleEquipmentLock(BAG_EQUIPMENT_ID);
    expect(service.snapshot.equipment[0]!.isLocked).toBe(true);
    service.toggleEquipmentLock(BAG_EQUIPMENT_ID);

    expect(service.snapshot.equipment[0]!.isLocked).toBe(false);
    expect(service.snapshot.progress.totalPower).toBe(powerBefore);
  });

  it("refuses to salvage a locked or equipped item", () => {
    const locked = serviceWithEquipment(
      equipment(BAG_EQUIPMENT_ID, "bag", { isLocked: true }),
    ).service;
    expect(() => locked.salvageEquipment(BAG_EQUIPMENT_ID)).toThrow("已锁定");
    expect(locked.snapshot.equipment).toHaveLength(1);

    const equipped = serviceWithEquipment(
      equipment(BAG_EQUIPMENT_ID, "equipped"),
    ).service;
    expect(() => equipped.salvageEquipment(BAG_EQUIPMENT_ID)).toThrow("请先卸下");
    expect(equipped.snapshot.equipment).toHaveLength(1);
  });

  it("salvages a bag item and refunds its base plus half of enhancement investment", () => {
    const { service } = serviceWithEquipment(
      equipment(BAG_EQUIPMENT_ID, "bag", { enhanceLevel: 2 }),
      { bagCapacity: 50 },
    );

    const result = service.salvageEquipment(BAG_EQUIPMENT_ID);

    expect(service.snapshot.equipment).toEqual([]);
    expect(stackQuantity(service, "enhance_stone")).toBe("2");
    expect(service.snapshot.wallet.spiritStone).toBe("1475");
    expect(countOccupiedBagSlots(service.snapshot)).toBe(1);
    expect(result.message).toContain("475 灵石和 2 枚强化石");
  });

  it("converts harvest salvage stones to spirit stones when the bag has no free slot", () => {
    const { service } = serviceWithEquipment(
      equipment(BAG_EQUIPMENT_ID, "bag"),
      {
        bagCapacity: 50,
        extraEquipment: [
          ...Array.from({ length: 49 }, (_, index) =>
            equipment(`bag-${index}`, "bag"),
          ),
        ],
      },
    );
    const snapshot = service.snapshot as unknown as MutableSave;
    snapshot.equipment.push(equipment(HARVEST_EQUIPMENT_ID, "harvest"));
    snapshot.harvestChest.entries = [
      {
        id: "00000000-0000-4000-8000-000000000303",
        entryType: "equipment",
        equipmentInstanceId: HARVEST_EQUIPMENT_ID,
        techniqueConfigId: null,
        assetConfigId: "ironwood_sword",
        displayName: "玄木剑",
        quality: "common",
        valueScore: "80",
        acquiredAt: START.toISOString(),
      },
    ];
    snapshot.harvestChest.pendingCount = 1;

    const result = service.salvageHarvest("00000000-0000-4000-8000-000000000303");

    expect(stackQuantity(service, "enhance_stone")).toBe("0");
    expect(service.snapshot.wallet.spiritStone).toBe("1200");
    expect(result.message).toContain("折为灵石");
    expect(countOccupiedBagSlots(service.snapshot)).toBe(50);
  });
});

describe("equipment management display", () => {
  it("shows protection and a destructive action only for unlocked bag gear", () => {
    const display = getEquipmentManagementDisplay(
      equipment(BAG_EQUIPMENT_ID) as never,
    );
    expect(display.lockActionText).toBe("锁定");
    expect(display.protectionText).toBe("可分解");
    expect(display.salvageEnabled).toBe(true);
    expect(display.salvageActionText).toContain("100灵石/1石");
  });

  it("hides destructive action for locked and equipped gear", () => {
    expect(
      getEquipmentManagementDisplay(
        equipment(BAG_EQUIPMENT_ID, "bag", { isLocked: true }) as never,
      ).salvageEnabled,
    ).toBe(false);
    expect(
      getEquipmentManagementDisplay(
        equipment(BAG_EQUIPMENT_ID, "equipped") as never,
      ).protectionText,
    ).toBe("已装备");
  });

  it("excludes harvest equipment from bag counts and equipment management", () => {
    const { service } = serviceWithEquipment(equipment(BAG_EQUIPMENT_ID));
    const snapshot = service.snapshot as unknown as MutableSave;
    snapshot.equipment.push(equipment(HARVEST_EQUIPMENT_ID, "harvest"));

    expect(getStoredEquipment(service.snapshot)).toHaveLength(1);
    expect(countOccupiedBagSlots(service.snapshot)).toBe(1);
    expect(
      getEquipmentManagementDisplay(
        equipment(HARVEST_EQUIPMENT_ID, "harvest") as never,
      ),
    ).toMatchObject({ protectionText: "待收取", salvageEnabled: false });
  });
});
