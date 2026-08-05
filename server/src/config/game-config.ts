import {
  EQUIPMENT_CONFIGS,
  ITEM_CONFIGS,
  REALM_CONFIGS,
  TECHNIQUE_CONFIGS,
  getEquipmentConfig,
  getItemConfig,
  getTechniqueConfig,
} from "@cultivation-diary/shared";

export const ACTIVE_GAME_CONFIG_VERSION = "mvp-0.3.0";

export const ONLINE_HEARTBEAT_GRACE_MILLISECONDS = 90_000;
export const BASE_OFFLINE_EFFICIENCY_BP = 7_000;

export const ACTIVE_IDLE_DROP_TABLE = {
  version: "idle-drop-2026-08-05-v1",
  probabilityScale: 1_000_000,
  harvestChestCapacity: 100,
  pools: {
    material: {
      chance: 350_000,
      itemConfigIds: ["wood", "stone", "spiritual_soil", "spiritual_herb", "ore"],
      minimumQuantity: 1,
      maximumQuantity: 3,
    },
    enhanceStone: { chance: 10_000, itemConfigId: "enhance_stone", quantity: 1 },
    equipment: {
      chance: 4_000,
      commonWeight: 7_500,
      qualityWeightScale: 10_000,
    },
    technique: {
      chance: 1_200,
      commonWeight: 8_000,
      qualityWeightScale: 10_000,
    },
    breakthroughPill: {
      chance: 500,
      itemConfigId: "breakthrough_pill",
      quantity: 1,
    },
  },
  salvage: {
    equipment: {
      common: { spiritStone: 100, enhanceStone: 1 },
      uncommon: { spiritStone: 250, enhanceStone: 2 },
    },
    technique: {
      common: { spiritStone: 80, enhanceStone: 0 },
      uncommon: { spiritStone: 200, enhanceStone: 0 },
    },
  },
} as const;

export const BAG_INITIAL_CAPACITY = 50;
export const BAG_MAX_CAPACITY = 200;
export const BAG_EXPANSION_SIZE = 10;
export const BAG_EXPANSION_BASE_COST = 5_000;

export function bagExpansionCostForCapacity(capacity: number): string | null {
  if (capacity >= BAG_MAX_CAPACITY) return null;
  if (
    capacity < BAG_INITIAL_CAPACITY ||
    (capacity - BAG_INITIAL_CAPACITY) % BAG_EXPANSION_SIZE !== 0
  ) {
    throw new RangeError(`Invalid bag capacity: ${capacity}`);
  }
  const purchaseIndex = (capacity - BAG_INITIAL_CAPACITY) / BAG_EXPANSION_SIZE + 1;
  return (BAG_EXPANSION_BASE_COST * purchaseIndex * purchaseIndex).toString();
}

export function validateGameConfig(): void {
  assertUniqueIds("item", ITEM_CONFIGS);
  assertUniqueIds("technique", TECHNIQUE_CONFIGS);
  assertUniqueIds("equipment", EQUIPMENT_CONFIGS);
  assertUniqueIds("realm", REALM_CONFIGS);

  for (const item of ITEM_CONFIGS) {
    if (
      item.useEffect &&
      (!Number.isSafeInteger(item.useEffect.durationSeconds) ||
        item.useEffect.durationSeconds <= 0)
    ) {
      throw new Error(`Invalid item use duration: ${item.id}`);
    }
  }

  let expectedLevel = 1;
  for (const realm of REALM_CONFIGS) {
    if (realm.minLevel !== expectedLevel || realm.maxLevel < realm.minLevel) {
      throw new Error(`Realm configuration is not contiguous at ${realm.id}`);
    }
    expectedLevel = realm.maxLevel + 1;
  }

  const dropTable = ACTIVE_IDLE_DROP_TABLE;
  if (dropTable.harvestChestCapacity !== 100) {
    throw new Error("Idle harvest chest capacity must be 100");
  }
  for (const chance of [
    dropTable.pools.material.chance,
    dropTable.pools.enhanceStone.chance,
    dropTable.pools.equipment.chance,
    dropTable.pools.technique.chance,
    dropTable.pools.breakthroughPill.chance,
  ]) {
    if (!Number.isInteger(chance) || chance < 0 || chance > dropTable.probabilityScale) {
      throw new Error(`Invalid idle drop chance: ${chance}`);
    }
  }
  for (const itemConfigId of dropTable.pools.material.itemConfigIds) {
    if (getItemConfig(itemConfigId).category !== "material") {
      throw new Error(`Idle material pool references a non-material item: ${itemConfigId}`);
    }
  }
  getItemConfig(dropTable.pools.enhanceStone.itemConfigId);
  getItemConfig(dropTable.pools.breakthroughPill.itemConfigId);
  for (const equipment of EQUIPMENT_CONFIGS) getEquipmentConfig(equipment.id);
  for (const technique of TECHNIQUE_CONFIGS) {
    getTechniqueConfig(technique.id);
    for (const [field, value] of Object.entries({
      fixedPower: technique.fixedPower,
      experienceBonusBp: technique.experienceBonusBp,
      spiritStoneBonusBp: technique.spiritStoneBonusBp,
      dropBonusBp: technique.dropBonusBp,
    })) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`Invalid technique ${field}: ${technique.id}`);
      }
    }
  }
}

function assertUniqueIds(
  label: string,
  configs: readonly { id: string }[],
): void {
  const ids = new Set<string>();
  for (const config of configs) {
    if (!config.id || ids.has(config.id)) {
      throw new Error(`Duplicate or empty ${label} config id: ${config.id}`);
    }
    ids.add(config.id);
  }
}
