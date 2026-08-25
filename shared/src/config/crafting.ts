import {
  equipmentBandForLevel,
  equipmentConfigForSlotAndBand,
  type AssetQuality,
  type EquipmentBand,
  type EquipmentConfig,
  type EquipmentSlot,
} from "./assets";

export type CraftingRecipeId =
  | "forge_weapon"
  | "forge_armor"
  | "forge_accessory"
  | "forge_mount"
  | "forge_pet";

/**
 * A recipe names a slot, not a piece. The product is resolved from the slot and
 * the crafter's band, so one recipe keeps producing new equipment for all 1,000
 * levels instead of forging the same 玄木剑 forever.
 */
export interface CraftingRecipeConfig {
  readonly id: CraftingRecipeId;
  readonly displayName: string;
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
    displayName: "锻造兵器",
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
    displayName: "缝制护甲",
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
    displayName: "琢磨饰品",
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
    displayName: "驯养坐骑",
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
    displayName: "契约灵宠",
    slot: "pet",
    spiritStoneCost: 3_000,
    materials: [
      { itemConfigId: "spiritual_herb", quantity: 15 },
      { itemConfigId: "ore", quantity: 12 },
    ],
    requiredCraftingRoomLevel: 4,
  },
];

/**
 * What a recipe forges for a crafter at this level. Crafting only ever produces
 * the crafter's own band — there is no band picker — so a 天阶 player cannot
 * forge 凡阶 ascension fodder and has to rely on drops for that.
 */
export function resolveCraftingEquipmentConfig(
  slot: EquipmentSlot,
  level: number,
): EquipmentConfig {
  return equipmentConfigForSlotAndBand(slot, equipmentBandForLevel(level));
}

/**
 * Crafting odds per band. This is where a band pays off: the materials a recipe
 * costs never change with the band, so a higher band is the same material spend
 * with better odds. `commonWeightFloor` is how far the crafting room's level can
 * push weight out of 普通 — at band 1 it is the 3,000 the single-table version
 * hard-coded.
 */
export const CRAFTING_QUALITY_BAND_WEIGHTS: Readonly<
  Record<
    EquipmentBand,
    {
      readonly commonWeightFloor: number;
      readonly weights: readonly {
        readonly quality: AssetQuality;
        readonly weight: number;
      }[];
    }
  >
> = {
  1: {
    commonWeightFloor: 3_000,
    weights: [
      { quality: "common", weight: 7_000 },
      { quality: "uncommon", weight: 2_200 },
      { quality: "rare", weight: 650 },
      { quality: "epic", weight: 140 },
      { quality: "legendary", weight: 10 },
    ],
  },
  2: {
    commonWeightFloor: 2_200,
    weights: [
      { quality: "common", weight: 5_200 },
      { quality: "uncommon", weight: 3_000 },
      { quality: "rare", weight: 1_400 },
      { quality: "epic", weight: 360 },
      { quality: "legendary", weight: 40 },
    ],
  },
  3: {
    commonWeightFloor: 1_400,
    weights: [
      { quality: "common", weight: 3_400 },
      { quality: "uncommon", weight: 3_400 },
      { quality: "rare", weight: 2_200 },
      { quality: "epic", weight: 900 },
      { quality: "legendary", weight: 100 },
    ],
  },
  4: {
    commonWeightFloor: 800,
    weights: [
      { quality: "common", weight: 1_800 },
      { quality: "uncommon", weight: 3_200 },
      { quality: "rare", weight: 3_000 },
      { quality: "epic", weight: 1_750 },
      { quality: "legendary", weight: 250 },
    ],
  },
};

/** The band-1 table, kept under its old name because it is the quality list. */
export const CRAFTING_QUALITY_WEIGHTS: readonly {
  readonly quality: AssetQuality;
  readonly weight: number;
}[] = CRAFTING_QUALITY_BAND_WEIGHTS[1].weights;

/**
 * Spirit stone scales with the band, materials do not. Materials only come from
 * idle drops and expedition sweeps and are the real late-game bottleneck, while
 * one trial tower floor pays out into the billions — so this is where late-game
 * spirit stone finds a sink without locking high-band crafting behind farming.
 */
export const CRAFTING_BAND_SPIRIT_STONE_MULTIPLIER: Readonly<
  Record<EquipmentBand, number>
> = { 1: 1, 2: 4, 3: 12, 4: 30 };

export function craftingSpiritStoneCost(
  recipe: CraftingRecipeConfig,
  band: EquipmentBand,
): number {
  const multiplier = CRAFTING_BAND_SPIRIT_STONE_MULTIPLIER[band];
  if (!multiplier) throw new RangeError(`Unknown equipment band: ${band}`);
  return recipe.spiritStoneCost * multiplier;
}

export function getCraftingRecipeConfig(id: string): CraftingRecipeConfig {
  const config = CRAFTING_RECIPE_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown crafting recipe: ${id}`);
  return config;
}

export function craftingQualityWeight(
  quality: AssetQuality,
  craftingRoomLevel: number,
  band: EquipmentBand = 1,
): number {
  const table = CRAFTING_QUALITY_BAND_WEIGHTS[band];
  if (!table) throw new RangeError(`Unknown equipment band: ${band}`);
  const base =
    table.weights.find((candidate) => candidate.quality === quality)?.weight ?? 0;
  if (!Number.isInteger(craftingRoomLevel) || craftingRoomLevel < 0) {
    throw new RangeError("Crafting room level must be a non-negative integer");
  }
  if (quality === "common") {
    return Math.max(table.commonWeightFloor, base - craftingRoomLevel * 350);
  }
  if (quality === "uncommon") return base + craftingRoomLevel * 200;
  if (quality === "rare") return base + craftingRoomLevel * 110;
  if (quality === "epic") return base + craftingRoomLevel * 35;
  if (quality === "legendary") return base + craftingRoomLevel * 5;
  return 0;
}
