import type { AssetQuality, EquipmentSlot } from "./assets";

export type CraftingRecipeId =
  | "forge_weapon"
  | "forge_armor"
  | "forge_accessory"
  | "forge_mount"
  | "forge_pet";

export interface CraftingRecipeConfig {
  readonly id: CraftingRecipeId;
  readonly displayName: string;
  readonly equipmentConfigId: string;
  readonly slot: EquipmentSlot;
  readonly spiritStoneCost: number;
  readonly materials: readonly {
    readonly itemConfigId: string;
    readonly quantity: number;
  }[];
  readonly requiredCraftingRoomLevel: number;
}

export const CRAFTING_RECIPE_CONFIGS: readonly CraftingRecipeConfig[] = [
  {
    id: "forge_weapon",
    displayName: "锻造玄木剑",
    equipmentConfigId: "ironwood_sword",
    slot: "weapon",
    spiritStoneCost: 1_200,
    materials: [
      { itemConfigId: "wood", quantity: 8 },
      { itemConfigId: "ore", quantity: 6 },
    ],
    requiredCraftingRoomLevel: 0,
  },
  {
    id: "forge_armor",
    displayName: "缝制流云法袍",
    equipmentConfigId: "cloudweave_robe",
    slot: "armor",
    spiritStoneCost: 1_500,
    materials: [
      { itemConfigId: "wood", quantity: 6 },
      { itemConfigId: "spiritual_herb", quantity: 8 },
    ],
    requiredCraftingRoomLevel: 1,
  },
  {
    id: "forge_accessory",
    displayName: "琢磨蕴灵玉环",
    equipmentConfigId: "jade_spirit_ring",
    slot: "accessory",
    spiritStoneCost: 1_800,
    materials: [
      { itemConfigId: "stone", quantity: 8 },
      { itemConfigId: "ore", quantity: 8 },
    ],
    requiredCraftingRoomLevel: 2,
  },
  {
    id: "forge_mount",
    displayName: "驯养踏雾灵鹤",
    equipmentConfigId: "mist_crane_mount",
    slot: "mount",
    spiritStoneCost: 2_400,
    materials: [
      { itemConfigId: "spiritual_herb", quantity: 12 },
      { itemConfigId: "spiritual_soil", quantity: 10 },
    ],
    requiredCraftingRoomLevel: 3,
  },
  {
    id: "forge_pet",
    displayName: "契约月影灵狐",
    equipmentConfigId: "moonfox_companion",
    slot: "pet",
    spiritStoneCost: 3_000,
    materials: [
      { itemConfigId: "spiritual_herb", quantity: 15 },
      { itemConfigId: "ore", quantity: 12 },
    ],
    requiredCraftingRoomLevel: 4,
  },
];

export const CRAFTING_QUALITY_WEIGHTS: readonly {
  readonly quality: AssetQuality;
  readonly weight: number;
}[] = [
  { quality: "common", weight: 7_000 },
  { quality: "uncommon", weight: 2_200 },
  { quality: "rare", weight: 650 },
  { quality: "epic", weight: 140 },
  { quality: "legendary", weight: 10 },
];

export function getCraftingRecipeConfig(id: string): CraftingRecipeConfig {
  const config = CRAFTING_RECIPE_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown crafting recipe: ${id}`);
  return config;
}

export function craftingQualityWeight(
  quality: AssetQuality,
  craftingRoomLevel: number,
): number {
  const base =
    CRAFTING_QUALITY_WEIGHTS.find((candidate) => candidate.quality === quality)
      ?.weight ?? 0;
  if (!Number.isInteger(craftingRoomLevel) || craftingRoomLevel < 0) {
    throw new RangeError("Crafting room level must be a non-negative integer");
  }
  if (quality === "common") return Math.max(3_000, base - craftingRoomLevel * 350);
  if (quality === "uncommon") return base + craftingRoomLevel * 200;
  if (quality === "rare") return base + craftingRoomLevel * 110;
  if (quality === "epic") return base + craftingRoomLevel * 35;
  if (quality === "legendary") return base + craftingRoomLevel * 5;
  return 0;
}
