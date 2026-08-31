import {
  TECHNIQUE_PAGES_PER_DUPLICATE,
  calculateEquipmentContribution,
  calculateTechniqueContribution,
  calculateTotalPower,
  equipmentEnhanceCost,
  getTechniqueConfig,
  techniqueInheritCost,
  techniqueStarUpgradeCost,
  type AssetQuality,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const EQUIPMENT_ID = "00000000-0000-4000-8000-000000000001";
const TECHNIQUE_ID = "quiet_breathing_art";

type MutableSave = Record<string, any>;

interface AssetSeedOptions {
  readonly spiritStone: number;
  readonly enhanceStone: number;
  readonly equipmentQuality: AssetQuality;
  readonly enhanceLevel: number;
  readonly equipmentEquipped: boolean;
  readonly star: number;
  readonly duplicateCount: number;
  readonly techniqueEquipped: boolean;
}

const DEFAULT_OPTIONS: AssetSeedOptions = {
  spiritStone: 10_000,
  enhanceStone: 10,
  equipmentQuality: "common",
  enhanceLevel: 0,
  equipmentEquipped: false,
  star: 1,
  duplicateCount: 1,
  techniqueEquipped: false,
};

function serviceWithAssets(
  overrides: Partial<AssetSeedOptions> = {},
): { service: LocalGameService; platform: FakePlatformAdapter } {
  const options = { ...DEFAULT_OPTIONS, ...overrides };
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
  save.snapshot.equipment = [
    {
      id: EQUIPMENT_ID,
      equipmentConfigId: "ironwood_sword",
      displayName: "玄木剑",
      quality: options.equipmentQuality,
      slot: "weapon",
      powerBonusBp: 0,
      enhanceLevel: options.enhanceLevel,
      rolledAffixes: [],
      location: options.equipmentEquipped ? "equipped" : "bag",
      equippedSlot: options.equipmentEquipped ? "weapon" : null,
      isLocked: false,
      configVersion: "local-idle-drop-v1",
    },
  ];
  save.snapshot.techniques = [
    {
      techniqueConfigId: TECHNIQUE_ID,
      displayName: "静息诀",
      quality: "common",
      slot: "mind",
      star: options.star,
      duplicateCount: options.duplicateCount,
      equippedSlot: options.techniqueEquipped ? "mind" : null,
      powerBonusBp: 0,
      experienceBonusBp: 0,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
      configVersion: "local-idle-drop-v1",
    },
  ];
  platform.seed(SAVE_KEY, save);

  const service = new LocalGameService(platform);
  const loaded = service.initialize(now);
  if (loaded.created) throw new Error("asset fixture save was rejected");
  return { service, platform };
}

function equipmentOf(service: LocalGameService) {
  const equipment = service.snapshot.equipment.find(
    (item) => item.id === EQUIPMENT_ID,
  );
  if (!equipment) throw new Error("expected seeded equipment");
  return equipment;
}

function techniqueOf(service: LocalGameService) {
  const technique = service.snapshot.techniques.find(
    (item) => item.techniqueConfigId === TECHNIQUE_ID,
  );
  if (!technique) throw new Error("expected seeded technique");
  return technique;
}

function stackQuantity(service: LocalGameService, itemConfigId: string): string {
  return (
    service.snapshot.inventory.stacks.find(
      (item) => item.itemConfigId === itemConfigId,
    )?.quantity ?? "0"
  );
}

describe("equipment enhancement service", () => {
  it("charges the exact quote and refreshes an equipped item's power", () => {
    const { service } = serviceWithAssets({ equipmentEquipped: true });
    const cost = equipmentEnhanceCost("common", 0);
    const beforeBonusBp = service.snapshot.progress.loadoutPowerBonusBp;

    const result = service.enhanceEquipment(EQUIPMENT_ID);
    const equipment = equipmentOf(service);
    const contribution = calculateEquipmentContribution({
      equipmentConfigId: equipment.equipmentConfigId,
      quality: "common",
      enhanceLevel: 1,
      rolledAffixes: equipment.rolledAffixes,
    });

    expect(equipment.enhanceLevel).toBe(cost.targetLevel);
    expect(equipment.powerBonusBp).toBe(contribution.powerBonusBp);
    expect(service.snapshot.wallet.spiritStone).toBe(
      String(DEFAULT_OPTIONS.spiritStone - cost.spiritStone),
    );
    expect(stackQuantity(service, "enhance_stone")).toBe(
      String(DEFAULT_OPTIONS.enhanceStone - cost.enhanceStone),
    );
    expect(service.snapshot.progress.loadoutPowerBonusBp).toBe(
      contribution.powerBonusBp,
    );
    // The basis-point bonus is the unfloored signal. At Lv.1 base power is only
    // 100, so a single enhancement level does not move the floored totalPower
    // at all — asserting a totalPower delta here would pass even if enhancement
    // stopped working entirely.
    expect(service.snapshot.progress.loadoutPowerBonusBp).toBeGreaterThan(
      beforeBonusBp,
    );
    expect(service.snapshot.progress.totalPower).toBe(
      calculateTotalPower(service.snapshot.progress.level, {
        percentBonusBp: contribution.powerBonusBp,
      }),
    );
    expect(result.message).toContain("强化至 +1");
  });

  it("refreshes a bag item's derived power without changing the loadout", () => {
    const { service } = serviceWithAssets({ equipmentEquipped: false });
    const loadoutBefore = service.snapshot.progress.loadoutPowerBonusBp;
    const totalPowerBefore = service.snapshot.progress.totalPower;

    service.enhanceEquipment(EQUIPMENT_ID);

    expect(equipmentOf(service).powerBonusBp).toBe(396);
    expect(service.snapshot.progress.loadoutPowerBonusBp).toBe(loadoutBefore);
    expect(service.snapshot.progress.totalPower).toBe(totalPowerBefore);
  });

  it("rejects insufficient spirit stones without charging either resource", () => {
    const { service } = serviceWithAssets({ spiritStone: 249 });
    const stonesBefore = stackQuantity(service, "enhance_stone");

    expect(() => service.enhanceEquipment(EQUIPMENT_ID)).toThrow(
      "灵石不足，还需 1 灵石",
    );
    expect(service.snapshot.wallet.spiritStone).toBe("249");
    expect(stackQuantity(service, "enhance_stone")).toBe(stonesBefore);
    expect(equipmentOf(service).enhanceLevel).toBe(0);
  });

  it("rejects insufficient enhancement stones without charging spirit stones", () => {
    const { service } = serviceWithAssets({ enhanceStone: 0 });

    expect(() => service.enhanceEquipment(EQUIPMENT_ID)).toThrow(
      "强化石不足，还需 1 枚",
    );
    expect(service.snapshot.wallet.spiritStone).toBe("10000");
    expect(stackQuantity(service, "enhance_stone")).toBe("0");
    expect(equipmentOf(service).enhanceLevel).toBe(0);
  });

  it("rejects a maxed or unknown equipment instance", () => {
    const { service } = serviceWithAssets({ enhanceLevel: 20 });
    expect(() => service.enhanceEquipment(EQUIPMENT_ID)).toThrow("已强化至上限");
    expect(equipmentOf(service).enhanceLevel).toBe(20);
    expect(() => service.enhanceEquipment("missing-equipment")).toThrow(
      "该法宝不在行囊中",
    );
  });
});

describe("technique star-up service", () => {
  it("spends same-name copies and refreshes an equipped technique's bonuses", () => {
    const { service } = serviceWithAssets({
      star: 3,
      duplicateCount: 5,
      techniqueEquipped: true,
    });
    const cost = techniqueStarUpgradeCost(3);
    const beforeBonusBp = service.snapshot.progress.loadoutPowerBonusBp;

    const result = service.upgradeTechnique(TECHNIQUE_ID);
    const technique = techniqueOf(service);
    const contribution = calculateTechniqueContribution({
      techniqueConfigId: TECHNIQUE_ID,
      star: cost.targetStar,
    });

    expect(technique.star).toBe(cost.targetStar);
    expect(technique.duplicateCount).toBe(5 - cost.duplicateCount);
    expect(technique.powerBonusBp).toBe(contribution.powerBonusBp);
    expect(technique.experienceBonusBp).toBe(
      contribution.experienceBonusBp,
    );
    expect(service.snapshot.progress.loadoutPowerBonusBp).toBe(
      contribution.powerBonusBp,
    );
    expect(service.snapshot.progress.experienceBonusBp).toBe(
      contribution.experienceBonusBp,
    );
    // Asserted on the basis-point bonus rather than a totalPower delta: at Lv.1
    // the floored total barely moves, so a delta comparison is too weak to
    // catch a star-up that stopped contributing.
    expect(service.snapshot.progress.loadoutPowerBonusBp).toBeGreaterThan(
      beforeBonusBp,
    );
    expect(service.snapshot.progress.totalPower).toBe(
      calculateTotalPower(service.snapshot.progress.level, {
        percentBonusBp: contribution.powerBonusBp,
      }),
    );
    expect(result.message).toContain("升至 4 星");
  });

  it("refreshes an unequipped technique without changing player bonuses", () => {
    const { service } = serviceWithAssets({
      star: 1,
      duplicateCount: 1,
      techniqueEquipped: false,
    });
    const progressBefore = { ...service.snapshot.progress };

    service.upgradeTechnique(TECHNIQUE_ID);

    expect(techniqueOf(service).powerBonusBp).toBe(216);
    expect(techniqueOf(service).experienceBonusBp).toBe(240);
    expect(service.snapshot.progress.loadoutPowerBonusBp).toBe(
      progressBefore.loadoutPowerBonusBp,
    );
    expect(service.snapshot.progress.experienceBonusBp).toBe(
      progressBefore.experienceBonusBp,
    );
    expect(service.snapshot.progress.totalPower).toBe(progressBefore.totalPower);
  });

  it("rejects insufficient copies without changing star or copy count", () => {
    const { service } = serviceWithAssets({ star: 3, duplicateCount: 1 });

    expect(() => service.upgradeTechnique(TECHNIQUE_ID)).toThrow(
      "同名副本不足，可用功法残页补足，还需 5 张",
    );
    expect(techniqueOf(service).star).toBe(3);
    expect(techniqueOf(service).duplicateCount).toBe(1);
  });

  it("uses technique pages only for the missing same-name copies", () => {
    const { service } = serviceWithAssets({ star: 3, duplicateCount: 1 });
    const save = service.snapshot as unknown as MutableSave;
    save.inventory.stacks.push({
      itemConfigId: "technique_page",
      displayName: "功法残页",
      quantity: "5",
    });

    const result = service.upgradeTechnique(TECHNIQUE_ID);

    expect(techniqueOf(service).star).toBe(4);
    expect(techniqueOf(service).duplicateCount).toBe(0);
    expect(stackQuantity(service, "technique_page")).toBe("0");
    expect(result.message).toContain("1 本同名副本和 5 张残页");
  });

  it("rejects a maxed or unknown technique", () => {
    const { service } = serviceWithAssets({ star: 10, duplicateCount: 999 });
    expect(() => service.upgradeTechnique(TECHNIQUE_ID)).toThrow(
      "已达到最高星级",
    );
    expect(techniqueOf(service).star).toBe(10);
    expect(() => service.upgradeTechnique("missing-technique")).toThrow(
      "尚未收录该功法",
    );
  });
});

interface TechniqueSeed {
  readonly techniqueConfigId: string;
  readonly star: number;
  readonly duplicateCount?: number;
  readonly equipped?: boolean;
}

/**
 * A save holding an arbitrary set of books. 传承 needs two rows in the same slot
 * from different bands, which the single-technique fixture above cannot express.
 */
function serviceWithTechniques(
  seeds: readonly TechniqueSeed[],
  spiritStone: number,
): LocalGameService {
  const now = new Date();
  const platform = new FakePlatformAdapter();
  const writer = new LocalGameService(platform);
  writer.initialize(now);

  const raw = platform.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected a persisted save");
  const save = JSON.parse(raw) as MutableSave;
  save.savedAt = now.toISOString();
  save.snapshot.progress.settledAt = now.toISOString();
  save.snapshot.wallet.spiritStone = String(spiritStone);
  save.snapshot.inventory.stacks = [];
  save.snapshot.equipment = [];
  save.snapshot.techniques = seeds.map((seed) => {
    const config = getTechniqueConfig(seed.techniqueConfigId);
    return {
      techniqueConfigId: config.id,
      displayName: config.displayName,
      quality: config.quality,
      slot: config.slot,
      star: seed.star,
      duplicateCount: seed.duplicateCount ?? 0,
      equippedSlot: seed.equipped ? config.slot : null,
      powerBonusBp: 0,
      experienceBonusBp: 0,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
      configVersion: "local-idle-drop-v1",
    };
  });
  platform.seed(SAVE_KEY, save);

  const service = new LocalGameService(platform);
  const loaded = service.initialize(now);
  if (loaded.created) throw new Error("technique fixture save was rejected");
  return service;
}

/** 凡阶 and 灵阶 心法, both 上品 — the pairing 传承 exists for. */
const BAND_1_MIND = "azure_cloud_heart_manual";
const BAND_2_MIND = "jade_truth_heart_manual";
const INHERIT_COST = techniqueInheritCost("uncommon", 2);

describe("technique inheritance service", () => {
  it("moves the stars up a band, eats the source and refunds its copies", () => {
    const service = serviceWithTechniques(
      [
        { techniqueConfigId: BAND_1_MIND, star: 7, duplicateCount: 3 },
        { techniqueConfigId: BAND_2_MIND, star: 1 },
      ],
      INHERIT_COST + 200_000,
    );

    const result = service.inheritTechnique(BAND_1_MIND, BAND_2_MIND);

    const target = service.snapshot.techniques.find(
      (item) => item.techniqueConfigId === BAND_2_MIND,
    );
    expect(target?.star).toBe(7);
    expect(
      service.snapshot.techniques.some(
        (item) => item.techniqueConfigId === BAND_1_MIND,
      ),
    ).toBe(false);
    expect(stackQuantity(service, "technique_page")).toBe(
      String(3 * TECHNIQUE_PAGES_PER_DUPLICATE),
    );
    expect(service.snapshot.wallet.spiritStone).toBe("200000");
    expect(result.message).toBe(
      `消耗 ${INHERIT_COST} 灵石，玄真心法承接 7 星，返还 15 张功法残页`,
    );
  });

  it("carries the equipped slot over and refreshes the player's bonuses", () => {
    const service = serviceWithTechniques(
      [
        { techniqueConfigId: BAND_1_MIND, star: 6, equipped: true },
        { techniqueConfigId: BAND_2_MIND, star: 2 },
      ],
      INHERIT_COST,
    );

    service.inheritTechnique(BAND_1_MIND, BAND_2_MIND);

    const target = service.snapshot.techniques.find(
      (item) => item.techniqueConfigId === BAND_2_MIND,
    );
    const contribution = calculateTechniqueContribution({
      techniqueConfigId: BAND_2_MIND,
      star: 6,
    });
    expect(target?.equippedSlot).toBe("mind");
    expect(target?.powerBonusBp).toBe(contribution.powerBonusBp);
    expect(service.snapshot.progress.loadoutPowerBonusBp).toBe(
      contribution.powerBonusBp,
    );
    // The band is bought with idle bonuses, not power, so this is the number that
    // has to move: 灵阶 心法 pays x1.2 the 修为 of its 凡阶 counterpart.
    expect(service.snapshot.progress.experienceBonusBp).toBe(
      contribution.experienceBonusBp,
    );
    expect(contribution.experienceBonusBp).toBeGreaterThan(
      calculateTechniqueContribution({
        techniqueConfigId: BAND_1_MIND,
        star: 6,
      }).experienceBonusBp,
    );
  });

  it("spends nothing when the source has no leftover copies", () => {
    const service = serviceWithTechniques(
      [
        { techniqueConfigId: BAND_1_MIND, star: 5 },
        { techniqueConfigId: BAND_2_MIND, star: 1 },
      ],
      INHERIT_COST,
    );

    const result = service.inheritTechnique(BAND_1_MIND, BAND_2_MIND);

    expect(stackQuantity(service, "technique_page")).toBe("0");
    expect(service.snapshot.wallet.spiritStone).toBe("0");
    expect(result.message).toBe(
      `消耗 ${INHERIT_COST} 灵石，玄真心法承接 5 星`,
    );
  });
});

describe("technique inheritance refuses the wrong pairings", () => {
  /** Runs one rejection and asserts the save came out untouched. */
  function expectRejected(
    seeds: readonly TechniqueSeed[],
    sourceId: string,
    targetId: string,
    message: string,
    spiritStone = INHERIT_COST * 30,
  ): void {
    const service = serviceWithTechniques(seeds, spiritStone);
    const before = JSON.stringify(service.snapshot.techniques);
    expect(() => service.inheritTechnique(sourceId, targetId)).toThrow(message);
    expect(JSON.stringify(service.snapshot.techniques)).toBe(before);
    expect(service.snapshot.wallet.spiritStone).toBe(String(spiritStone));
    expect(stackQuantity(service, "technique_page")).toBe("0");
  }

  it("rejects a source or target the player does not own", () => {
    expectRejected(
      [{ techniqueConfigId: BAND_1_MIND, star: 3 }],
      "no_such_manual",
      BAND_1_MIND,
      "尚未收录传承来源功法",
    );
    expectRejected(
      [{ techniqueConfigId: BAND_1_MIND, star: 3 }],
      BAND_1_MIND,
      BAND_2_MIND,
      "尚未收录传承目标功法",
    );
  });

  it("rejects a book inheriting from itself", () => {
    expectRejected(
      [{ techniqueConfigId: BAND_1_MIND, star: 3 }],
      BAND_1_MIND,
      BAND_1_MIND,
      "传承目标不能是同一本功法",
    );
  });

  it("rejects a different slot", () => {
    expectRejected(
      [
        { techniqueConfigId: BAND_1_MIND, star: 3 },
        { techniqueConfigId: "wind_riding_steps", star: 1 },
      ],
      BAND_1_MIND,
      "wind_riding_steps",
      "只能传承给同类功法",
    );
  });

  it("rejects a different quality", () => {
    expectRejected(
      [
        { techniqueConfigId: BAND_1_MIND, star: 3 },
        { techniqueConfigId: "spirit_intake_art", star: 1 },
      ],
      BAND_1_MIND,
      "spirit_intake_art",
      "只能传承给同品质功法",
    );
  });

  it("rejects a sideways or downward band, so stars never come back down", () => {
    expectRejected(
      [
        { techniqueConfigId: BAND_2_MIND, star: 5 },
        { techniqueConfigId: BAND_1_MIND, star: 1 },
      ],
      BAND_2_MIND,
      BAND_1_MIND,
      "只能向更高段位传承",
    );
  });

  it("rejects a target that is already at or above the source's star", () => {
    expectRejected(
      [
        { techniqueConfigId: BAND_1_MIND, star: 4 },
        { techniqueConfigId: BAND_2_MIND, star: 4 },
      ],
      BAND_1_MIND,
      BAND_2_MIND,
      "玄真心法的星级不低于来源，无需传承",
    );
  });

  it("rejects a price the player cannot pay", () => {
    expectRejected(
      [
        { techniqueConfigId: BAND_1_MIND, star: 4 },
        { techniqueConfigId: BAND_2_MIND, star: 1 },
      ],
      BAND_1_MIND,
      BAND_2_MIND,
      "灵石不足，还需 1 灵石",
      INHERIT_COST - 1,
    );
  });
});
