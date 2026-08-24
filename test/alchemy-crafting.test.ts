import { MAX_LEVEL, requiredExperienceForLevel } from "@cultivation-diary/shared";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import {
  LocalGameError,
  LocalGameService,
} from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const NOW = new Date("2026-08-13T08:00:00.000Z");
type MutableSave = Record<string, any>;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function seededService(mutate: (save: MutableSave) => void): {
  service: LocalGameService;
  platform: FakePlatformAdapter;
} {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const platform = new FakePlatformAdapter();
  const initial = new LocalGameService(platform);
  initial.initialize(NOW);
  const raw = platform.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected an initial save");
  const save = JSON.parse(raw) as MutableSave;
  mutate(save);
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  expect(service.initialize(NOW).created).toBe(false);
  return { service, platform };
}

function setStack(save: MutableSave, itemConfigId: string, displayName: string, quantity: number): void {
  save.snapshot.inventory.stacks.push({
    itemConfigId,
    displayName,
    quantity: String(quantity),
  });
}

function equipmentInstance(index: number): Record<string, unknown> {
  return {
    id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    equipmentConfigId: "ironwood_sword",
    displayName: "玄木剑",
    quality: "common",
    slot: "weapon",
    powerBonusBp: 0,
    enhanceLevel: 0,
    rolledAffixes: [],
    location: "bag",
    equippedSlot: null,
    isLocked: false,
    configVersion: "local-idle-drop-v1",
  };
}

describe("alchemy", () => {
  it("deducts the exact recipe cost and creates a usable pill", () => {
    const { service } = seededService((save) => {
      save.snapshot.wallet.spiritStone = "5000";
      setStack(save, "spiritual_herb", "灵草", 10);
      setStack(save, "spiritual_soil", "灵土", 10);
    });

    const result = service.brewAlchemy("small_experience_pill");

    expect(result.snapshot.wallet.spiritStone).toBe("4700");
    expect(quantityOf(service, "spiritual_herb")).toBe("6");
    expect(quantityOf(service, "spiritual_soil")).toBe("8");
    expect(quantityOf(service, "exp_pill_small")).toBe("1");

    const used = service.useInventoryItem("exp_pill_small");
    expect(quantityOf(service, "exp_pill_small")).toBe("0");
    expect(Number(used.snapshot.progress.experience)).toBeGreaterThan(0);
  });

  it("supports the large experience pill use effect", () => {
    const { service } = seededService((save) => {
      setStack(save, "exp_pill_large", "经验丹（大）", 1);
    });

    const result = service.useInventoryItem("exp_pill_large");

    expect(quantityOf(service, "exp_pill_large")).toBe("0");
    expect(Number(result.snapshot.progress.experience)).toBeGreaterThan(0);
  });

  it("uses a whole experience-pill stack in one mutation", () => {
    const { service } = seededService((save) => {
      save.snapshot.progress.level = MAX_LEVEL;
      save.snapshot.progress.experience = requiredExperienceForLevel(MAX_LEVEL);
      save.snapshot.progress.status = "version_cap";
      setStack(save, "exp_pill_small", "经验丹（小）", 3);
    });

    const result = service.useAllInventoryItems("exp_pill_small");

    expect(quantityOf(service, "exp_pill_small")).toBe("0");
    expect(Number(result.snapshot.progress.experience)).toBeGreaterThan(0);
    expect(result.message).toMatch(/^批量使用 经验丹（小） x3，获得 \d+ 修为$/);
  });

  it("stops batch use at a breakthrough bottleneck and preserves the rest", () => {
    const { service } = seededService((save) => {
      const required = BigInt(requiredExperienceForLevel(10));
      save.snapshot.progress.level = 10;
      save.snapshot.progress.experience = (required - 1n).toString();
      save.snapshot.progress.status = "gaining";
      setStack(save, "exp_pill_small", "经验丹（小）", 3);
    });

    const result = service.useAllInventoryItems("exp_pill_small");

    expect(quantityOf(service, "exp_pill_small")).toBe("2");
    expect(result.snapshot.progress.status).toBe("breakthrough_ready");
    expect(result.message).toContain("已到突破瓶颈");
  });

  it.each([
    ["exp_pill_small", "经验丹（小）"],
    ["exp_pill_large", "经验丹（大）"],
  ])("rejects %s at a breakthrough bottleneck without consuming it", (itemConfigId, displayName) => {
    const { service, platform } = seededService((save) => {
      save.snapshot.progress.level = 10;
      save.snapshot.progress.experience = requiredExperienceForLevel(10);
      save.snapshot.progress.status = "breakthrough_ready";
      setStack(save, itemConfigId, displayName, 1);
    });
    const snapshotBefore = JSON.stringify(service.snapshot);
    const persistedBefore = platform.raw(SAVE_KEY);

    expect(() => service.useInventoryItem(itemConfigId)).toThrow(
      new LocalGameError("当前处于突破瓶颈，请先完成突破再使用经验丹"),
    );

    expect(JSON.stringify(service.snapshot)).toBe(snapshotBefore);
    expect(platform.raw(SAVE_KEY)).toBe(persistedBefore);
    expect(quantityOf(service, itemConfigId)).toBe("1");
  });

  it("keeps converting experience pills into reserve at the version cap", () => {
    const reserveBefore = 123n;
    const { service } = seededService((save) => {
      save.snapshot.progress.level = MAX_LEVEL;
      save.snapshot.progress.experience = requiredExperienceForLevel(MAX_LEVEL);
      save.snapshot.progress.cultivationReserve = reserveBefore.toString();
      save.snapshot.progress.status = "version_cap";
      setStack(save, "exp_pill_small", "经验丹（小）", 1);
    });

    const result = service.useInventoryItem("exp_pill_small");

    expect(quantityOf(service, "exp_pill_small")).toBe("0");
    expect(result.snapshot.progress.status).toBe("version_cap");
    expect(BigInt(result.snapshot.progress.cultivationReserve)).toBeGreaterThan(
      reserveBefore,
    );
  });

  it("provides a renewable recipe for partner cultivation pills", () => {
    const { service } = seededService((save) => {
      save.snapshot.wallet.spiritStone = "5000";
      save.snapshot.cave.buildings.find(
        (building: MutableSave) => building.buildingConfigId === "alchemy_room",
      ).level = 3;
      setStack(save, "spiritual_herb", "灵草", 20);
      setStack(save, "spiritual_soil", "灵土", 20);
    });

    service.brewAlchemy("dual_cultivation_pill");

    expect(service.snapshot.wallet.spiritStone).toBe("3000");
    expect(quantityOf(service, "spiritual_herb")).toBe("5");
    expect(quantityOf(service, "spiritual_soil")).toBe("10");
    expect(quantityOf(service, "dual_cultivation_pill")).toBe("1");
  });

  it("enforces room levels and leaves resources untouched on failure", () => {
    const { service } = seededService((save) => {
      save.snapshot.wallet.spiritStone = "5000";
      setStack(save, "spiritual_herb", "灵草", 30);
      setStack(save, "spiritual_soil", "灵土", 20);
    });
    const before = JSON.stringify(service.snapshot);

    expect(() => service.brewAlchemy("large_experience_pill")).toThrow(
      new LocalGameError("炼丹房需达到 Lv.2"),
    );
    expect(JSON.stringify(service.snapshot)).toBe(before);
  });

  it("brews a batch limited by the scarcest ingredient", () => {
    const { service } = seededService((save) => {
      save.snapshot.wallet.spiritStone = "5000";
      setStack(save, "spiritual_herb", "灵草", 10);
      setStack(save, "spiritual_soil", "灵土", 10);
    });

    const result = service.brewAlchemyBatch("small_experience_pill");

    expect(result.snapshot.wallet.spiritStone).toBe("4400");
    expect(quantityOf(service, "spiritual_herb")).toBe("2");
    expect(quantityOf(service, "spiritual_soil")).toBe("6");
    expect(quantityOf(service, "exp_pill_small")).toBe("2");
    expect(result.message).toBe("批量炼成 小经验丹 x2");
  });

  it("brews a batch limited by spirit stones", () => {
    const { service } = seededService((save) => {
      save.snapshot.wallet.spiritStone = "700";
      setStack(save, "spiritual_herb", "灵草", 100);
      setStack(save, "spiritual_soil", "灵土", 100);
    });

    const result = service.brewAlchemyBatch("small_experience_pill");

    expect(result.snapshot.wallet.spiritStone).toBe("100");
    expect(quantityOf(service, "spiritual_herb")).toBe("92");
    expect(quantityOf(service, "spiritual_soil")).toBe("96");
    expect(quantityOf(service, "exp_pill_small")).toBe("2");
  });

  it("caps one brew batch at 100 even with abundant resources", () => {
    const { service } = seededService((save) => {
      save.snapshot.wallet.spiritStone = "1000000000";
      setStack(save, "spiritual_herb", "灵草", 100_000);
      setStack(save, "spiritual_soil", "灵土", 100_000);
    });

    const result = service.brewAlchemyBatch("small_experience_pill");

    expect(quantityOf(service, "exp_pill_small")).toBe("100");
    expect(result.snapshot.wallet.spiritStone).toBe("999970000");
    expect(quantityOf(service, "spiritual_herb")).toBe("99600");
    expect(quantityOf(service, "spiritual_soil")).toBe("99800");
  });

  it("rejects a new output stack when the bag remains full", () => {
    const { service } = seededService((save) => {
      save.snapshot.wallet.spiritStone = "5000";
      setStack(save, "spiritual_herb", "灵草", 5);
      setStack(save, "spiritual_soil", "灵土", 3);
      save.snapshot.equipment = Array.from({ length: 48 }, (_, index) =>
        equipmentInstance(index + 1),
      );
    });

    expect(() => service.brewAlchemy("small_experience_pill")).toThrow(
      "行囊空间不足",
    );
    expect(service.snapshot.wallet.spiritStone).toBe("5000");
    expect(quantityOf(service, "spiritual_herb")).toBe("5");
    expect(quantityOf(service, "spiritual_soil")).toBe("3");
  });
});

describe("crafting", () => {
  it("deducts materials and creates a valid bag equipment instance", () => {
    const { service, platform } = seededService((save) => {
      save.snapshot.wallet.spiritStone = "5000";
      setStack(save, "wood", "木材", 20);
      setStack(save, "ore", "矿石", 20);
    });

    const result = service.craftEquipment("forge_weapon");
    const crafted = result.snapshot.equipment.at(-1)!;

    expect(result.snapshot.wallet.spiritStone).toBe("3800");
    expect(quantityOf(service, "wood")).toBe("12");
    expect(quantityOf(service, "ore")).toBe("14");
    expect(crafted.equipmentConfigId).toBe("ironwood_sword");
    expect(crafted.location).toBe("bag");
    expect(crafted.enhanceLevel).toBe(0);
    expect(["common", "uncommon", "rare", "epic", "legendary"]).toContain(
      crafted.quality,
    );

    const raw = platform.raw(SAVE_KEY);
    if (raw === undefined) throw new Error("expected crafted save");
    const reader = new FakePlatformAdapter();
    reader.seed(SAVE_KEY, JSON.parse(raw));
    const reloaded = new LocalGameService(reader);
    expect(reloaded.initialize(NOW).created).toBe(false);
    expect(reloaded.snapshot.equipment.some((item) => item.id === crafted.id)).toBe(true);
  });

  it("crafts a batch and reports every rolled quality", () => {
    const { service } = seededService((save) => {
      save.snapshot.wallet.spiritStone = "5000";
      setStack(save, "wood", "木材", 20);
      setStack(save, "ore", "矿石", 20);
    });
    // 第一次质量投掷取最低权重（普通），第二次取高位（史诗），让批量消息带两种品质。
    const rolls = [0, 0.99];
    let rollIndex = 0;
    vi.spyOn(Math, "random").mockImplementation(
      () => rolls[rollIndex++ % rolls.length]!,
    );

    const result = service.craftEquipmentBatch("forge_weapon");

    expect(result.snapshot.equipment).toHaveLength(2);
    expect(result.snapshot.wallet.spiritStone).toBe("2600");
    expect(quantityOf(service, "wood")).toBe("4");
    expect(quantityOf(service, "ore")).toBe("8");
    expect(result.message).toBe("批量锻造玄木剑 x2，品质：普通 x1、史诗 x1");
  });

  it("limits a craft batch to the remaining bag slots", () => {
    const { service } = seededService((save) => {
      save.snapshot.wallet.spiritStone = "5000";
      setStack(save, "wood", "木材", 20);
      setStack(save, "ore", "矿石", 20);
      save.snapshot.equipment = Array.from({ length: 47 }, (_, index) =>
        equipmentInstance(index + 1),
      );
    });

    const result = service.craftEquipmentBatch("forge_weapon");

    expect(result.snapshot.equipment).toHaveLength(48);
    expect(result.snapshot.wallet.spiritStone).toBe("3800");
    expect(quantityOf(service, "wood")).toBe("12");
    expect(quantityOf(service, "ore")).toBe("14");
    expect(result.message).toMatch(/^批量锻造玄木剑 x1，品质：\S+ x1$/);
  });

  it("rejects crafting when the bag remains full without deducting costs", () => {
    const { service } = seededService((save) => {
      save.snapshot.wallet.spiritStone = "5000";
      setStack(save, "wood", "木材", 20);
      setStack(save, "ore", "矿石", 20);
      save.snapshot.equipment = Array.from({ length: 48 }, (_, index) =>
        equipmentInstance(index + 1),
      );
    });

    expect(() => service.craftEquipment("forge_weapon")).toThrow("行囊空间不足");
    expect(service.snapshot.wallet.spiritStone).toBe("5000");
    expect(quantityOf(service, "wood")).toBe("20");
    expect(quantityOf(service, "ore")).toBe("20");
    expect(service.snapshot.equipment).toHaveLength(48);
  });
});

function quantityOf(service: LocalGameService, itemConfigId: string): string {
  return (
    service.snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === itemConfigId,
    )?.quantity ?? "0"
  );
}
