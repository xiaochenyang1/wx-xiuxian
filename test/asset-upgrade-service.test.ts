import {
  calculateEquipmentContribution,
  calculateTechniqueContribution,
  equipmentEnhanceCost,
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
      fixedPower: "0",
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
      fixedPower: "0",
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
    const beforePower = BigInt(service.snapshot.progress.totalPower);
    const beforeFixedPower = BigInt(equipmentOf(service).fixedPower);

    const result = service.enhanceEquipment(EQUIPMENT_ID);
    const equipment = equipmentOf(service);
    const contribution = calculateEquipmentContribution({
      equipmentConfigId: equipment.equipmentConfigId,
      quality: "common",
      enhanceLevel: 1,
      rolledAffixes: equipment.rolledAffixes,
    });

    expect(equipment.enhanceLevel).toBe(cost.targetLevel);
    expect(equipment.fixedPower).toBe(contribution.fixedPower);
    expect(service.snapshot.wallet.spiritStone).toBe(
      String(DEFAULT_OPTIONS.spiritStone - cost.spiritStone),
    );
    expect(stackQuantity(service, "enhance_stone")).toBe(
      String(DEFAULT_OPTIONS.enhanceStone - cost.enhanceStone),
    );
    expect(service.snapshot.progress.loadoutFixedPower).toBe(
      contribution.fixedPower,
    );
    expect(BigInt(service.snapshot.progress.totalPower) - beforePower).toBe(
      BigInt(contribution.fixedPower) - beforeFixedPower,
    );
    expect(result.message).toContain("强化至 +1");
  });

  it("refreshes a bag item's derived power without changing the loadout", () => {
    const { service } = serviceWithAssets({ equipmentEquipped: false });
    const loadoutBefore = service.snapshot.progress.loadoutFixedPower;
    const totalPowerBefore = service.snapshot.progress.totalPower;

    service.enhanceEquipment(EQUIPMENT_ID);

    expect(equipmentOf(service).fixedPower).toBe("88");
    expect(service.snapshot.progress.loadoutFixedPower).toBe(loadoutBefore);
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
    const beforePower = BigInt(service.snapshot.progress.totalPower);
    const beforeFixedPower = BigInt(techniqueOf(service).fixedPower);

    const result = service.upgradeTechnique(TECHNIQUE_ID);
    const technique = techniqueOf(service);
    const contribution = calculateTechniqueContribution({
      techniqueConfigId: TECHNIQUE_ID,
      star: cost.targetStar,
    });

    expect(technique.star).toBe(cost.targetStar);
    expect(technique.duplicateCount).toBe(5 - cost.duplicateCount);
    expect(technique.fixedPower).toBe(contribution.fixedPower);
    expect(technique.experienceBonusBp).toBe(
      contribution.experienceBonusBp,
    );
    expect(service.snapshot.progress.loadoutFixedPower).toBe(
      contribution.fixedPower,
    );
    expect(service.snapshot.progress.experienceBonusBp).toBe(
      contribution.experienceBonusBp,
    );
    expect(BigInt(service.snapshot.progress.totalPower) - beforePower).toBe(
      BigInt(contribution.fixedPower) - beforeFixedPower,
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

    expect(techniqueOf(service).fixedPower).toBe("48");
    expect(techniqueOf(service).experienceBonusBp).toBe(240);
    expect(service.snapshot.progress.loadoutFixedPower).toBe(
      progressBefore.loadoutFixedPower,
    );
    expect(service.snapshot.progress.experienceBonusBp).toBe(
      progressBefore.experienceBonusBp,
    );
    expect(service.snapshot.progress.totalPower).toBe(progressBefore.totalPower);
  });

  it("rejects insufficient copies without changing star or copy count", () => {
    const { service } = serviceWithAssets({ star: 3, duplicateCount: 1 });

    expect(() => service.upgradeTechnique(TECHNIQUE_ID)).toThrow(
      "同名副本不足，还需 1 本",
    );
    expect(techniqueOf(service).star).toBe(3);
    expect(techniqueOf(service).duplicateCount).toBe(1);
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
