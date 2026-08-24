export type CaveBuildingId =
  | "spirit_array"
  | "spirit_field"
  | "alchemy_room"
  | "crafting_room"
  | "seclusion_room";

export type CaveBonusStat = "experience" | "spirit_stone" | "drop" | "power";

export interface CaveMaterialRequirement {
  readonly itemConfigId: string;
  readonly baseQuantity: number;
}

export interface CaveBuildingConfig {
  readonly id: CaveBuildingId;
  readonly displayName: string;
  readonly maxLevel: number;
  readonly bonusStat: CaveBonusStat;
  readonly bonusPerLevelBp: number;
  readonly baseSpiritStoneCost: number;
  readonly materials: ReadonlyArray<CaveMaterialRequirement>;
}

export const CAVE_MAX_LEVEL = 10;

export const CAVE_BUILDING_CONFIGS: readonly CaveBuildingConfig[] = [
  {
    id: "spirit_array",
    displayName: "聚灵阵",
    maxLevel: CAVE_MAX_LEVEL,
    bonusStat: "experience",
    bonusPerLevelBp: 300,
    baseSpiritStoneCost: 3_000,
    materials: [
      { itemConfigId: "stone", baseQuantity: 5 },
      { itemConfigId: "spiritual_soil", baseQuantity: 5 },
    ],
  },
  {
    id: "spirit_field",
    displayName: "灵田",
    maxLevel: CAVE_MAX_LEVEL,
    bonusStat: "spirit_stone",
    bonusPerLevelBp: 400,
    baseSpiritStoneCost: 3_000,
    materials: [
      { itemConfigId: "spiritual_soil", baseQuantity: 5 },
      { itemConfigId: "spiritual_herb", baseQuantity: 5 },
    ],
  },
  {
    id: "alchemy_room",
    displayName: "炼丹房",
    maxLevel: CAVE_MAX_LEVEL,
    bonusStat: "drop",
    bonusPerLevelBp: 250,
    baseSpiritStoneCost: 3_000,
    materials: [
      { itemConfigId: "spiritual_herb", baseQuantity: 5 },
      { itemConfigId: "wood", baseQuantity: 5 },
    ],
  },
  {
    id: "crafting_room",
    displayName: "炼器室",
    maxLevel: CAVE_MAX_LEVEL,
    bonusStat: "power",
    bonusPerLevelBp: 200,
    baseSpiritStoneCost: 3_000,
    materials: [
      { itemConfigId: "ore", baseQuantity: 5 },
      { itemConfigId: "wood", baseQuantity: 5 },
    ],
  },
  {
    id: "seclusion_room",
    displayName: "闭关室",
    maxLevel: CAVE_MAX_LEVEL,
    bonusStat: "experience",
    bonusPerLevelBp: 150,
    baseSpiritStoneCost: 3_000,
    materials: [
      { itemConfigId: "wood", baseQuantity: 5 },
      { itemConfigId: "stone", baseQuantity: 5 },
    ],
  },
];

export interface CaveUpgradeCost {
  spiritStone: number;
  materials: ReadonlyArray<{ itemConfigId: string; quantity: number }>;
}

export function getCaveBuildingConfig(id: string): CaveBuildingConfig {
  const config = CAVE_BUILDING_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown cave building config: ${id}`);
  return config;
}

export function caveUpgradeCost(id: string, currentLevel: number): CaveUpgradeCost {
  const config = getCaveBuildingConfig(id);
  if (!Number.isInteger(currentLevel) || currentLevel < 0) {
    throw new RangeError(`Cave building level must be a non-negative integer: ${currentLevel}`);
  }
  if (currentLevel >= config.maxLevel) {
    throw new RangeError(`Cave building is already at max level: ${id}`);
  }
  const targetLevel = currentLevel + 1;
  return {
    spiritStone: config.baseSpiritStoneCost * targetLevel * targetLevel,
    materials: config.materials.map((material) => ({
      itemConfigId: material.itemConfigId,
      quantity: material.baseQuantity * targetLevel,
    })),
  };
}
