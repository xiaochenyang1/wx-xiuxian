import {
  equipmentAffixRange,
  equipmentAffixScoreBp,
  equipmentRerollCost,
  getEquipmentConfig,
  readRolledAffixes,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const EQUIPMENT_ID = "00000000-0000-4000-8000-000000000501";

type MutableSave = Record<string, any>;

/** The values a legendary piece carried before the roll ranges landed. */
const LEGACY_LEGENDARY_AFFIXES = [
  { stat: "experience_bonus", valueBp: 350 },
  { stat: "spirit_stone_bonus", valueBp: 350 },
  { stat: "drop_bonus", valueBp: 350 },
];

const FULL_LEGENDARY_AFFIXES = [
  { stat: "experience_bonus", valueBp: 490 },
  { stat: "spirit_stone_bonus", valueBp: 490 },
  { stat: "drop_bonus", valueBp: 490 },
];

interface SeedOptions {
  readonly spiritStone: number;
  readonly enhanceStone: number;
  readonly quality: string;
  readonly affixes: readonly MutableSave[];
  readonly location: "bag" | "equipped";
  readonly equipmentConfigId: string;
}

const DEFAULTS: SeedOptions = {
  spiritStone: 100_000,
  enhanceStone: 100,
  quality: "legendary",
  affixes: LEGACY_LEGENDARY_AFFIXES,
  location: "bag",
  equipmentConfigId: "ironwood_sword",
};

function serviceWithPiece(overrides: Partial<SeedOptions> = {}): LocalGameService {
  const options = { ...DEFAULTS, ...overrides };
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
  save.snapshot.inventory.stacks =
    options.enhanceStone > 0
      ? [
          {
            itemConfigId: "enhance_stone",
            displayName: "强化石",
            quantity: String(options.enhanceStone),
          },
        ]
      : [];
  save.snapshot.harvestChest = { pendingCount: 0, entries: [] };
  save.snapshot.equipment = [
    {
      id: EQUIPMENT_ID,
      equipmentConfigId: options.equipmentConfigId,
      displayName: getEquipmentConfig(options.equipmentConfigId).displayName,
      quality: options.quality,
      slot: "weapon",
      powerBonusBp: 0,
      enhanceLevel: 4,
      rolledAffixes: options.affixes,
      location: options.location,
      equippedSlot: options.location === "equipped" ? "weapon" : null,
      isLocked: false,
      configVersion: "local-idle-drop-v1",
    },
  ];
  platform.seed(SAVE_KEY, save);

  const service = new LocalGameService(platform);
  if (service.initialize(now).created) {
    throw new Error("reroll fixture save was rejected");
  }
  return service;
}

function pieceOf(service: LocalGameService) {
  const piece = service.snapshot.equipment.find((item) => item.id === EQUIPMENT_ID);
  if (!piece) throw new Error("expected the fixture piece to survive");
  return piece;
}

function enhanceStoneOf(service: LocalGameService): string {
  return (
    service.snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === "enhance_stone",
    )?.quantity ?? "0"
  );
}

/**
 * Parks the fixture piece in the harvest chest on the loaded snapshot, the same
 * way a fresh drop arrives, so the chest guard is exercised against a piece the
 * validator has already accepted.
 */
function moveToHarvest(service: LocalGameService): void {
  const snapshot = service.snapshot as unknown as MutableSave;
  snapshot.equipment[0].location = "harvest";
  snapshot.harvestChest.entries = [
    {
      id: "00000000-0000-4000-8000-000000000502",
      entryType: "equipment",
      equipmentInstanceId: EQUIPMENT_ID,
      techniqueConfigId: null,
      assetConfigId: "ironwood_sword",
      displayName: "玄木剑",
      quality: "legendary",
      valueScore: "80",
      acquiredAt: new Date().toISOString(),
    },
  ];
  snapshot.harvestChest.pendingCount = 1;
}

/** Forces every draw to the top of its span, i.e. a full 100% roll. */
function rollHighest(): void {
  vi.spyOn(Math, "random").mockReturnValue(0.999_999_999);
}

/** Forces every draw to the bottom of its span, i.e. the worst legal roll. */
function rollLowest(): void {
  vi.spyOn(Math, "random").mockReturnValue(0);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rerollEquipmentAffixes", () => {
  it("keeps a better roll and charges the quality's price", () => {
    const service = serviceWithPiece();
    rollHighest();

    const result = service.rerollEquipmentAffixes(EQUIPMENT_ID);
    const cost = equipmentRerollCost("legendary");

    expect(pieceOf(service).rolledAffixes).toEqual(FULL_LEGENDARY_AFFIXES);
    expect(enhanceStoneOf(service)).toBe(String(100 - cost.enhanceStone));
    expect(service.snapshot.wallet.spiritStone).toBe(
      String(100_000 - cost.spiritStone),
    );
    expect(result.message).toBe("洗练完成：词条评分 71% → 100%");
  });

  it("keeps the old roll when the new one is not better, and still charges", () => {
    const service = serviceWithPiece({ affixes: FULL_LEGENDARY_AFFIXES });
    rollLowest();

    const result = service.rerollEquipmentAffixes(EQUIPMENT_ID);
    const cost = equipmentRerollCost("legendary");

    expect(pieceOf(service).rolledAffixes).toEqual(FULL_LEGENDARY_AFFIXES);
    expect(enhanceStoneOf(service)).toBe(String(100 - cost.enhanceStone));
    expect(service.snapshot.wallet.spiritStone).toBe(
      String(100_000 - cost.spiritStone),
    );
    expect(result.message).toBe("洗练结果 42% 未超过当前 100%，词条保持不变");
  });

  it("feeds the improved roll straight into the derived bonuses", () => {
    const service = serviceWithPiece({ location: "equipped" });
    const before = service.snapshot.progress.experienceBonusBp;
    rollHighest();

    service.rerollEquipmentAffixes(EQUIPMENT_ID);

    expect(service.snapshot.progress.experienceBonusBp).toBe(before + 140);
    expect(service.snapshot.progress.dropBonusBp).toBeGreaterThan(0);
  });

  it("leaves the power bonus untouched, because affixes never feed power", () => {
    const service = serviceWithPiece({ location: "equipped" });
    const powerBefore = service.snapshot.progress.totalPower;
    const bonusBefore = service.snapshot.progress.loadoutPowerBonusBp;
    rollHighest();

    service.rerollEquipmentAffixes(EQUIPMENT_ID);

    expect(service.snapshot.progress.totalPower).toBe(powerBefore);
    expect(service.snapshot.progress.loadoutPowerBonusBp).toBe(bonusBefore);
  });

  it("refuses a common piece, which has no affixes to reroll", () => {
    const service = serviceWithPiece({ quality: "common", affixes: [] });

    expect(() => service.rerollEquipmentAffixes(EQUIPMENT_ID)).toThrow("无法洗练");
    expect(enhanceStoneOf(service)).toBe("100");
  });

  it("refuses a piece still sitting in the harvest chest", () => {
    const service = serviceWithPiece();
    moveToHarvest(service);

    expect(() => service.rerollEquipmentAffixes(EQUIPMENT_ID)).toThrow("不在行囊中");
  });

  it("refuses an unknown instance id", () => {
    const service = serviceWithPiece();

    expect(() =>
      service.rerollEquipmentAffixes("00000000-0000-4000-8000-000000000999"),
    ).toThrow("不在行囊中");
  });

  it("reports the exact enhance stone deficit and changes nothing", () => {
    const service = serviceWithPiece({ enhanceStone: 6 });

    expect(() => service.rerollEquipmentAffixes(EQUIPMENT_ID)).toThrow(
      "强化石不足，还需 15 枚",
    );
    expect(enhanceStoneOf(service)).toBe("6");
    expect(service.snapshot.wallet.spiritStone).toBe("100000");
    expect(pieceOf(service).rolledAffixes).toEqual(LEGACY_LEGENDARY_AFFIXES);
  });

  it("reports the exact spirit stone deficit and changes nothing", () => {
    const service = serviceWithPiece({ spiritStone: 600 });

    expect(() => service.rerollEquipmentAffixes(EQUIPMENT_ID)).toThrow(
      "灵石不足，还需 5000 灵石",
    );
    expect(enhanceStoneOf(service)).toBe("100");
    expect(service.snapshot.wallet.spiritStone).toBe("600");
    expect(pieceOf(service).rolledAffixes).toEqual(LEGACY_LEGENDARY_AFFIXES);
  });

  it("only ever writes affixes that score at or above what was there", () => {
    const service = serviceWithPiece({ enhanceStone: 400, spiritStone: 200_000 });
    let draw = 0;
    // A spread of draws across the span, so improvements and rejections
    // interleave rather than the run testing a single branch twice.
    vi.spyOn(Math, "random").mockImplementation(() => {
      draw += 1;
      return (draw % 17) / 17;
    });

    let bestBp = equipmentAffixScoreBp(
      "legendary",
      1,
      readRolledAffixes(pieceOf(service).rolledAffixes),
    );
    for (let attempt = 0; attempt < 12; attempt += 1) {
      service.rerollEquipmentAffixes(EQUIPMENT_ID);
      const scoreBp = equipmentAffixScoreBp(
        "legendary",
        1,
        readRolledAffixes(pieceOf(service).rolledAffixes),
      );
      expect(scoreBp).toBeGreaterThanOrEqual(bestBp);
      bestBp = scoreBp;
      expect(pieceOf(service).enhanceLevel).toBe(4);
      expect(pieceOf(service).quality).toBe("legendary");
    }
  });

  it("rerolls a 天阶 piece into the 天阶 range, not the 凡阶 one", () => {
    // A 凡阶 legendary tops out at 490 per affix. The 天阶 window starts at 368
    // and reaches 856, so the first reroll almost certainly replaces the legacy
    // 350s outright — which is the late-game exit the reroll sink gains.
    const service = serviceWithPiece({
      equipmentConfigId: "void_immortal_sword",
      enhanceStone: 400,
      spiritStone: 200_000,
    });
    const range = equipmentAffixRange("legendary", 4);
    let observedAbove490 = false;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      service.rerollEquipmentAffixes(EQUIPMENT_ID);
      for (const affix of readRolledAffixes(pieceOf(service).rolledAffixes)) {
        // Below the floor means a legacy 凡阶 value survived, which only happens
        // while the 天阶 roll scored worse against its own ceiling.
        if (affix.valueBp >= range.minValueBp) {
          expect(affix.valueBp).toBeLessThanOrEqual(range.maxValueBp);
        }
        if (affix.valueBp > 490) observedAbove490 = true;
      }
    }

    expect(observedAbove490).toBe(true);
    expect(pieceOf(service).displayName).toBe("太虚斩仙剑");
  });
});
