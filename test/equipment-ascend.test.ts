import {
  CAVE_BUILDING_CONFIGS,
  equipmentAscendCost,
  equipmentAffixScoreBp,
  readRolledAffixes,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const TARGET_ID = "00000000-0000-4000-8000-000000000601";
const MATERIAL_IDS = [
  "00000000-0000-4000-8000-000000000602",
  "00000000-0000-4000-8000-000000000603",
  "00000000-0000-4000-8000-000000000604",
];

type MutableSave = Record<string, any>;

const LEGENDARY_AFFIXES = [
  { stat: "experience_bonus", valueBp: 350 },
  { stat: "spirit_stone_bonus", valueBp: 350 },
  { stat: "drop_bonus", valueBp: 350 },
];

interface PieceOptions {
  readonly id: string;
  readonly quality: string;
  readonly location?: "bag" | "equipped";
  readonly isLocked?: boolean;
  readonly equipmentConfigId?: string;
  readonly displayName?: string;
  readonly slot?: string;
  readonly enhanceLevel?: number;
}

function piece(options: PieceOptions): MutableSave {
  const location = options.location ?? "bag";
  return {
    id: options.id,
    equipmentConfigId: options.equipmentConfigId ?? "ironwood_sword",
    displayName: options.displayName ?? "玄木剑",
    quality: options.quality,
    slot: options.slot ?? "weapon",
    powerBonusBp: 0,
    enhanceLevel: options.enhanceLevel ?? 0,
    rolledAffixes: options.quality === "common" ? [] : LEGENDARY_AFFIXES,
    location,
    equippedSlot: location === "equipped" ? "weapon" : null,
    isLocked: options.isLocked ?? false,
    configVersion: "local-idle-drop-v1",
  };
}

interface SeedOptions {
  readonly spiritStone: number;
  readonly craftingRoomLevel: number;
  readonly equipment: readonly MutableSave[];
}

function serviceWith(overrides: Partial<SeedOptions> = {}): LocalGameService {
  const options: SeedOptions = {
    spiritStone: 1_000_000,
    craftingRoomLevel: 8,
    equipment: [
      piece({ id: TARGET_ID, quality: "legendary", enhanceLevel: 5 }),
      piece({ id: MATERIAL_IDS[0]!, quality: "legendary" }),
      piece({ id: MATERIAL_IDS[1]!, quality: "legendary" }),
    ],
    ...overrides,
  };
  const now = new Date();
  const platform = new FakePlatformAdapter();
  const writer = new LocalGameService(platform);
  writer.initialize(now);
  const raw = platform.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected a persisted save");

  const save = JSON.parse(raw) as MutableSave;
  save.savedAt = now.toISOString();
  save.snapshot.progress.settledAt = now.toISOString();
  save.snapshot.wallet.spiritStone = String(options.spiritStone);
  save.snapshot.harvestChest = { pendingCount: 0, entries: [] };
  save.snapshot.cave.buildings = CAVE_BUILDING_CONFIGS.map((config) => ({
    buildingConfigId: config.id,
    level: config.id === "crafting_room" ? options.craftingRoomLevel : 0,
  }));
  save.snapshot.unlocks.cave = true;
  save.snapshot.equipment = options.equipment.map((item) => ({ ...item }));
  platform.seed(SAVE_KEY, save);

  const service = new LocalGameService(platform);
  if (service.initialize(now).created) {
    throw new Error("ascend fixture save was rejected");
  }
  return service;
}

function targetOf(service: LocalGameService) {
  const target = service.snapshot.equipment.find((item) => item.id === TARGET_ID);
  if (!target) throw new Error("expected the ascension target to survive");
  return target;
}

function idsOf(service: LocalGameService): string[] {
  return service.snapshot.equipment.map((item) => item.id);
}

/** Forces every draw to the top of its span, i.e. a full 100% roll. */
function rollHighest(): void {
  vi.spyOn(Math, "random").mockReturnValue(0.999_999_999);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ascendEquipment", () => {
  it("raises the quality, consumes two copies and charges the target's price", () => {
    const service = serviceWith();
    rollHighest();

    const result = service.ascendEquipment(TARGET_ID);
    const cost = equipmentAscendCost("legendary");

    expect(targetOf(service).quality).toBe("mythic");
    expect(idsOf(service)).toEqual([TARGET_ID]);
    expect(service.snapshot.wallet.spiritStone).toBe(
      String(1_000_000 - cost.spiritStone),
    );
    expect(result.message).toContain("升华为神话");
  });

  it("keeps the enhance level and rerolls the affixes at the new quality", () => {
    const service = serviceWith();
    rollHighest();

    service.ascendEquipment(TARGET_ID);

    expect(targetOf(service).enhanceLevel).toBe(5);
    expect(targetOf(service).rolledAffixes).toEqual([
      { stat: "experience_bonus", valueBp: 700 },
      { stat: "spirit_stone_bonus", valueBp: 700 },
      { stat: "drop_bonus", valueBp: 700 },
    ]);
    expect(
      equipmentAffixScoreBp(
        "mythic",
        1,
        readRolledAffixes(targetOf(service).rolledAffixes),
      ),
    ).toBe(10_000);
  });

  it("rerolls at the ascended piece's own band, not at band 1", () => {
    const voidSword = {
      equipmentConfigId: "void_immortal_sword",
      displayName: "太虚斩仙剑",
    };
    const service = serviceWith({
      equipment: [
        piece({ id: TARGET_ID, quality: "legendary", enhanceLevel: 5, ...voidSword }),
        piece({ id: MATERIAL_IDS[0]!, quality: "legendary", ...voidSword }),
        piece({ id: MATERIAL_IDS[1]!, quality: "legendary", ...voidSword }),
      ],
    });
    rollHighest();

    service.ascendEquipment(TARGET_ID);

    // 神话 centers on 500, so band 4 tops out at floor(500 * 1.75) * 1.4 = 1,225
    // where band 1 stopped at 700.
    expect(targetOf(service).rolledAffixes).toEqual([
      { stat: "experience_bonus", valueBp: 1_225 },
      { stat: "spirit_stone_bonus", valueBp: 1_225 },
      { stat: "drop_bonus", valueBp: 1_225 },
    ]);
    expect(
      equipmentAffixScoreBp(
        "mythic",
        4,
        readRolledAffixes(targetOf(service).rolledAffixes),
      ),
    ).toBe(10_000);
  });

  it("locks the ascended piece so it cannot be salvaged by accident", () => {
    const service = serviceWith({
      equipment: [
        piece({ id: TARGET_ID, quality: "legendary", isLocked: false }),
        piece({ id: MATERIAL_IDS[0]!, quality: "legendary" }),
        piece({ id: MATERIAL_IDS[1]!, quality: "legendary" }),
      ],
    });

    service.ascendEquipment(TARGET_ID);

    expect(targetOf(service).isLocked).toBe(true);
  });

  it("raises the power of an equipped piece, because power follows quality", () => {
    const service = serviceWith({
      equipment: [
        piece({ id: TARGET_ID, quality: "legendary", location: "equipped" }),
        piece({ id: MATERIAL_IDS[0]!, quality: "legendary" }),
        piece({ id: MATERIAL_IDS[1]!, quality: "legendary" }),
      ],
    });
    const bonusBefore = service.snapshot.progress.loadoutPowerBonusBp;

    service.ascendEquipment(TARGET_ID);

    expect(service.snapshot.progress.loadoutPowerBonusBp).toBeGreaterThan(
      bonusBefore,
    );
    expect(targetOf(service).equippedSlot).toBe("weapon");
    expect(targetOf(service).location).toBe("equipped");
  });

  it("walks mythic on to primordial once the crafting room is high enough", () => {
    const service = serviceWith({
      equipment: [
        piece({ id: TARGET_ID, quality: "mythic" }),
        piece({ id: MATERIAL_IDS[0]!, quality: "mythic" }),
        piece({ id: MATERIAL_IDS[1]!, quality: "mythic" }),
      ],
    });

    const result = service.ascendEquipment(TARGET_ID);

    expect(targetOf(service).quality).toBe("primordial");
    expect(result.message).toContain("升华为洪荒");
  });

  it("refuses mythic while the crafting room is below its gate", () => {
    const service = serviceWith({
      craftingRoomLevel: 5,
      equipment: [
        piece({ id: TARGET_ID, quality: "mythic" }),
        piece({ id: MATERIAL_IDS[0]!, quality: "mythic" }),
        piece({ id: MATERIAL_IDS[1]!, quality: "mythic" }),
      ],
    });

    expect(() => service.ascendEquipment(TARGET_ID)).toThrow("炼器室需达到 Lv.8");
    expect(targetOf(service).quality).toBe("mythic");
    expect(idsOf(service)).toHaveLength(3);
  });

  it("refuses legendary while the crafting room is below its gate", () => {
    const service = serviceWith({ craftingRoomLevel: 4 });

    expect(() => service.ascendEquipment(TARGET_ID)).toThrow("炼器室需达到 Lv.5");
    expect(service.snapshot.wallet.spiritStone).toBe("1000000");
  });

  it("refuses a quality with no ascension path", () => {
    const epic = serviceWith({
      equipment: [
        piece({ id: TARGET_ID, quality: "epic" }),
        piece({ id: MATERIAL_IDS[0]!, quality: "epic" }),
        piece({ id: MATERIAL_IDS[1]!, quality: "epic" }),
      ],
    });
    expect(() => epic.ascendEquipment(TARGET_ID)).toThrow("只有传说与神话法宝可以升华");

    const primordial = serviceWith({
      equipment: [
        piece({ id: TARGET_ID, quality: "primordial" }),
        piece({ id: MATERIAL_IDS[0]!, quality: "primordial" }),
        piece({ id: MATERIAL_IDS[1]!, quality: "primordial" }),
      ],
    });
    expect(() => primordial.ascendEquipment(TARGET_ID)).toThrow("已是最高品质");
  });

  it("reports how many copies are missing and consumes nothing", () => {
    const service = serviceWith({
      equipment: [
        piece({ id: TARGET_ID, quality: "legendary" }),
        piece({ id: MATERIAL_IDS[0]!, quality: "legendary" }),
      ],
    });

    expect(() => service.ascendEquipment(TARGET_ID)).toThrow(
      "同款传说法宝不足，还需 1 件",
    );
    expect(idsOf(service)).toHaveLength(2);
    expect(service.snapshot.wallet.spiritStone).toBe("1000000");
  });

  it("does not count locked, equipped, mismatched or lower-quality copies", () => {
    const service = serviceWith({
      equipment: [
        piece({ id: TARGET_ID, quality: "legendary" }),
        piece({ id: MATERIAL_IDS[0]!, quality: "legendary", isLocked: true }),
        piece({ id: MATERIAL_IDS[1]!, quality: "legendary", location: "equipped" }),
        piece({ id: MATERIAL_IDS[2]!, quality: "epic" }),
      ],
    });

    expect(() => service.ascendEquipment(TARGET_ID)).toThrow(
      "同款传说法宝不足，还需 2 件",
    );
    expect(idsOf(service)).toHaveLength(4);
  });

  it("does not count a copy of a different equipment id", () => {
    const service = serviceWith({
      equipment: [
        piece({ id: TARGET_ID, quality: "legendary" }),
        piece({ id: MATERIAL_IDS[0]!, quality: "legendary" }),
        piece({
          id: MATERIAL_IDS[1]!,
          quality: "legendary",
          equipmentConfigId: "cloudweave_robe",
          displayName: "流云法袍",
          slot: "armor",
        }),
      ],
    });

    expect(() => service.ascendEquipment(TARGET_ID)).toThrow(
      "同款传说法宝不足，还需 1 件",
    );
    expect(idsOf(service)).toHaveLength(3);
  });

  it("reports the exact spirit stone deficit and consumes no copies", () => {
    const service = serviceWith({ spiritStone: 40_000 });

    expect(() => service.ascendEquipment(TARGET_ID)).toThrow(
      "灵石不足，还需 200000 灵石",
    );
    expect(idsOf(service)).toHaveLength(3);
    expect(targetOf(service).quality).toBe("legendary");
  });

  it("refuses a piece still sitting in the harvest chest", () => {
    const service = serviceWith();
    const snapshot = service.snapshot as unknown as MutableSave;
    snapshot.equipment[0].location = "harvest";
    snapshot.harvestChest.entries = [
      {
        id: "00000000-0000-4000-8000-000000000605",
        entryType: "equipment",
        equipmentInstanceId: TARGET_ID,
        techniqueConfigId: null,
        assetConfigId: "ironwood_sword",
        displayName: "玄木剑",
        quality: "legendary",
        valueScore: "80",
        acquiredAt: new Date().toISOString(),
      },
    ];
    snapshot.harvestChest.pendingCount = 1;

    expect(() => service.ascendEquipment(TARGET_ID)).toThrow("不在行囊中");
  });
});
