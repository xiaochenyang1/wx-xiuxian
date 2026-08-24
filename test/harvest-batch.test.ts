import { countOccupiedBagSlots } from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { getHarvestBatchDisplay } from "../assets/scripts/core/HarvestBatchDisplay";
import {
  LocalGameError,
  LocalGameService,
} from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date();
const EQUIPMENT_IDS = [
  "00000000-0000-4000-8000-000000000401",
  "00000000-0000-4000-8000-000000000402",
] as const;

type MutableSave = Record<string, any>;

function equipment(id: string, quality = "common"): MutableSave {
  return {
    id,
    equipmentConfigId: "ironwood_sword",
    displayName: "玄木剑",
    quality,
    slot: "weapon",
    powerBonusBp: 0,
    enhanceLevel: 0,
    rolledAffixes: [],
    location: "harvest",
    equippedSlot: null,
    isLocked: quality !== "common" && quality !== "uncommon",
    configVersion: "local-idle-drop-v1",
  };
}

function harvestEquipment(
  id: string,
  equipmentInstanceId: string,
  quality = "common",
): MutableSave {
  return {
    id,
    entryType: "equipment",
    equipmentInstanceId,
    techniqueConfigId: null,
    assetConfigId: "ironwood_sword",
    displayName: "玄木剑",
    quality,
    valueScore: "80",
    acquiredAt: START.toISOString(),
  };
}

function harvestTechnique(
  id: string,
  techniqueConfigId = "quiet_breathing_art",
): MutableSave {
  const config =
    techniqueConfigId === "light_step_art"
      ? { displayName: "轻身步", valueScore: "90" }
      : { displayName: "静息诀", valueScore: "100" };
  return {
    id,
    entryType: "technique",
    equipmentInstanceId: null,
    techniqueConfigId,
    assetConfigId: techniqueConfigId,
    displayName: config.displayName,
    quality: "common",
    valueScore: config.valueScore,
    acquiredAt: START.toISOString(),
  };
}

function serviceWithHarvest(options: {
  readonly entries: MutableSave[];
  readonly equipment?: MutableSave[];
  readonly bagCapacity?: number;
  readonly bagEquipmentCount?: number;
  readonly stacks?: MutableSave[];
  readonly techniques?: MutableSave[];
}): { service: LocalGameService; platform: FakePlatformAdapter } {
  const platform = new FakePlatformAdapter();
  const writer = new LocalGameService(platform);
  writer.initialize(START);
  const raw = platform.raw(CLIENT_CONFIG.localSaveStorageKey);
  if (!raw) throw new Error("expected save fixture");
  const save = JSON.parse(raw) as MutableSave;
  const bagEquipment = Array.from(
    { length: options.bagEquipmentCount ?? 0 },
    (_, index) => ({
      ...equipment(`bag-${index}`),
      location: "bag",
      isLocked: false,
    }),
  );
  save.savedAt = START.toISOString();
  save.snapshot.progress.settledAt = START.toISOString();
  save.snapshot.inventory = {
    bagCapacity: options.bagCapacity ?? 50,
    stacks: options.stacks ?? [],
  };
  save.snapshot.equipment = [
    ...bagEquipment,
    ...(options.equipment ?? []),
  ];
  save.snapshot.techniques = options.techniques ?? [];
  save.snapshot.harvestChest = {
    pendingCount: options.entries.length,
    entries: options.entries,
  };
  platform.seed(CLIENT_CONFIG.localSaveStorageKey, save);
  const service = new LocalGameService(platform);
  if (service.initialize(START).created) throw new Error("fixture was rejected");
  return { service, platform };
}

describe("harvest chest batch collection", () => {
  it("collects in chest order, keeps overflow equipment, and always processes techniques", () => {
    const entries = [
      harvestEquipment("00000000-0000-4000-8000-000000000411", EQUIPMENT_IDS[0]),
      harvestEquipment("00000000-0000-4000-8000-000000000412", EQUIPMENT_IDS[1]),
      harvestTechnique("00000000-0000-4000-8000-000000000413"),
      harvestTechnique(
        "00000000-0000-4000-8000-000000000414",
        "light_step_art",
      ),
    ];
    const { service } = serviceWithHarvest({
      entries,
      equipment: [equipment(EQUIPMENT_IDS[0]), equipment(EQUIPMENT_IDS[1])],
      bagEquipmentCount: 49,
      bagCapacity: 50,
      techniques: [
        {
          techniqueConfigId: "quiet_breathing_art",
          displayName: "静息诀",
          quality: "common",
          slot: "mind",
          star: 1,
          duplicateCount: 2,
          equippedSlot: null,
          powerBonusBp: 0,
          experienceBonusBp: 200,
          spiritStoneBonusBp: 0,
          dropBonusBp: 0,
          configVersion: "local-idle-drop-v1",
        },
      ],
    });

    expect(getHarvestBatchDisplay(service.snapshot)).toEqual({
      collectibleCount: 3,
      blockedEquipmentCount: 1,
      salvageableCount: 4,
    });
    const result = service.collectAllHarvest();

    expect(service.snapshot.harvestChest.entries).toEqual([entries[1]]);
    expect(
      service.snapshot.equipment.find((item) => item.id === EQUIPMENT_IDS[0])
        ?.location,
    ).toBe("bag");
    expect(
      service.snapshot.equipment.find((item) => item.id === EQUIPMENT_IDS[1])
        ?.location,
    ).toBe("harvest");
    expect(
      service.snapshot.techniques.find(
        (item) => item.techniqueConfigId === "quiet_breathing_art",
      )?.duplicateCount,
    ).toBe(3);
    expect(
      service.snapshot.techniques.some(
        (item) => item.techniqueConfigId === "light_step_art",
      ),
    ).toBe(true);
    expect(countOccupiedBagSlots(service.snapshot)).toBe(50);
    expect(result.message).toContain("法宝 1、功法 2");
    expect(result.message).toContain("剩余 1 件");
  });

  it("reports a full bag when only equipment remains", () => {
    const { service } = serviceWithHarvest({
      entries: [
        harvestEquipment(
          "00000000-0000-4000-8000-000000000415",
          EQUIPMENT_IDS[0],
        ),
      ],
      equipment: [equipment(EQUIPMENT_IDS[0])],
      bagEquipmentCount: 50,
      bagCapacity: 50,
    });

    expect(() => service.collectAllHarvest()).toThrow(
      new LocalGameError("行囊空间不足，暂无可批量收取的收获"),
    );
    expect(service.snapshot.harvestChest.entries).toHaveLength(1);
  });
});

describe("harvest chest batch salvage", () => {
  it("salvages only common and uncommon entries and preserves protected quality", () => {
    const rareEquipmentId = EQUIPMENT_IDS[1];
    const entries = [
      harvestEquipment(
        "00000000-0000-4000-8000-000000000421",
        EQUIPMENT_IDS[0],
      ),
      harvestTechnique("00000000-0000-4000-8000-000000000422"),
      harvestEquipment(
        "00000000-0000-4000-8000-000000000423",
        rareEquipmentId,
        "rare",
      ),
    ];
    const { service, platform } = serviceWithHarvest({
      entries,
      equipment: [
        equipment(EQUIPMENT_IDS[0]),
        equipment(rareEquipmentId, "rare"),
      ],
    });

    const result = service.salvageLowQualityHarvest();

    expect(service.snapshot.harvestChest.entries).toEqual([entries[2]]);
    expect(service.snapshot.equipment.map((item) => item.id)).toEqual([
      rareEquipmentId,
    ]);
    expect(service.snapshot.wallet.spiritStone).toBe("180");
    expect(service.snapshot.wallet.lifetimeSpiritStoneEarned).toBe("180");
    expect(
      service.snapshot.inventory.stacks.find(
        (item) => item.itemConfigId === "enhance_stone",
      )?.quantity,
    ).toBe("1");
    expect(result.message).toContain("批量分解 2 件");
    expect(result.message).toContain("剩余 1 件");

    const reloaded = new LocalGameService(platform);
    expect(reloaded.initialize(START).created).toBe(false);
    expect(reloaded.snapshot.harvestChest.entries).toEqual([entries[2]]);
    expect(reloaded.snapshot.wallet.lifetimeSpiritStoneEarned).toBe("180");
  });

  it("converts aggregate enhancement stones when a full bag has no stack", () => {
    const { service } = serviceWithHarvest({
      entries: [
        harvestEquipment(
          "00000000-0000-4000-8000-000000000424",
          EQUIPMENT_IDS[0],
        ),
        harvestEquipment(
          "00000000-0000-4000-8000-000000000425",
          EQUIPMENT_IDS[1],
          "uncommon",
        ),
      ],
      equipment: [
        equipment(EQUIPMENT_IDS[0]),
        equipment(EQUIPMENT_IDS[1], "uncommon"),
      ],
      bagEquipmentCount: 50,
      bagCapacity: 50,
    });

    const result = service.salvageLowQualityHarvest();

    expect(service.snapshot.wallet.spiritStone).toBe("650");
    expect(service.snapshot.wallet.lifetimeSpiritStoneEarned).toBe("650");
    expect(service.snapshot.inventory.stacks).toEqual([]);
    expect(result.message).toContain("3 枚强化石因行囊已满折为灵石");
  });

  it("refuses a batch when only protected entries remain", () => {
    const { service } = serviceWithHarvest({
      entries: [
        harvestEquipment(
          "00000000-0000-4000-8000-000000000426",
          EQUIPMENT_IDS[0],
          "rare",
        ),
      ],
      equipment: [equipment(EQUIPMENT_IDS[0], "rare")],
    });

    expect(() => service.salvageLowQualityHarvest()).toThrow(
      "没有可批量分解的普通或优秀物品",
    );
  });
});
