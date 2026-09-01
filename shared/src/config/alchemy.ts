import type { EquipmentBand } from "./assets";
import { IDLE_MATERIAL_BAND_MULTIPLIER } from "./drops";

export type AlchemyRecipeId =
  | "small_experience_pill"
  | "large_experience_pill"
  | "dual_cultivation_pill"
  | "breakthrough_pill";

export interface AlchemyRecipeCost {
  readonly itemConfigId: string;
  readonly quantity: number;
}

export interface AlchemyRecipeConfig {
  readonly id: AlchemyRecipeId;
  readonly displayName: string;
  readonly outputItemConfigId: string;
  readonly outputQuantity: number;
  /** The 凡阶 price. Every band pays this times the multiplier below. */
  readonly spiritStoneCost: number;
  /** The 凡阶 quantities, scaled per band only where the next field says so. */
  readonly ingredients: readonly AlchemyRecipeCost[];
  readonly requiredAlchemyRoomLevel: number;
  /**
   * Whether this recipe's materials follow the band, declared per row the way
   * `IDLE_STACK_DROPS` declares `scalesWithBand`. Only true for the two
   * experience pills, because they are the only recipes whose output is priced
   * in the player's own income: a pill simulates N hours of *current* idle
   * gain, so a flat material price makes the exchange rate improve every band.
   * 双修丹 pays a flat +100 bond and 突破丹 pays one breakthrough's worth, so
   * scaling their materials would be difficulty for its own sake — and for
   * 突破丹 it would be a hard lock, since 天阶 needs 5,840 of them.
   */
  readonly materialScalesWithBand: boolean;
}

export const ALCHEMY_RECIPE_CONFIGS: readonly AlchemyRecipeConfig[] = [
  {
    id: "small_experience_pill",
    displayName: "小经验丹",
    outputItemConfigId: "exp_pill_small",
    outputQuantity: 1,
    spiritStoneCost: 300,
    ingredients: [
      { itemConfigId: "spiritual_herb", quantity: 4 },
      { itemConfigId: "spiritual_soil", quantity: 2 },
    ],
    requiredAlchemyRoomLevel: 0,
    materialScalesWithBand: true,
  },
  {
    id: "large_experience_pill",
    displayName: "大经验丹",
    outputItemConfigId: "exp_pill_large",
    outputQuantity: 1,
    spiritStoneCost: 1_500,
    ingredients: [
      { itemConfigId: "spiritual_herb", quantity: 12 },
      { itemConfigId: "spiritual_soil", quantity: 8 },
    ],
    requiredAlchemyRoomLevel: 2,
    materialScalesWithBand: true,
  },
  {
    id: "dual_cultivation_pill",
    displayName: "双修丹",
    outputItemConfigId: "dual_cultivation_pill",
    outputQuantity: 1,
    spiritStoneCost: 2_000,
    ingredients: [
      { itemConfigId: "spiritual_herb", quantity: 15 },
      { itemConfigId: "spiritual_soil", quantity: 10 },
    ],
    requiredAlchemyRoomLevel: 3,
    materialScalesWithBand: false,
  },
  {
    id: "breakthrough_pill",
    displayName: "突破丹",
    outputItemConfigId: "breakthrough_pill",
    outputQuantity: 1,
    spiritStoneCost: 3_000,
    ingredients: [
      { itemConfigId: "spiritual_herb", quantity: 20 },
      { itemConfigId: "ore", quantity: 5 },
    ],
    requiredAlchemyRoomLevel: 4,
    materialScalesWithBand: false,
  },
];

/**
 * Same values as `CRAFTING_BAND_SPIRIT_STONE_MULTIPLIER`, and deliberately so:
 * one curve for the player to learn across both benches. It is a separate
 * constant for the same reason `IDLE_ENHANCE_STONE_BAND_MULTIPLIER` copies the
 * material table's shape instead of reusing it — either side can be retuned
 * without dragging the other along. Applies to all four recipes, including the
 * two whose materials stay flat: spirit stone has no exchange rate to hold, it
 * is only here so the late game has one more sink and no price on a
 * band-labelled panel reads the same in all four bands.
 */
export const ALCHEMY_BAND_SPIRIT_STONE_MULTIPLIER: Readonly<
  Record<EquipmentBand, number>
> = { 1: 1, 2: 4, 3: 12, 4: 30 };

export function alchemySpiritStoneCost(
  recipe: AlchemyRecipeConfig,
  band: EquipmentBand,
): number {
  const multiplier = ALCHEMY_BAND_SPIRIT_STONE_MULTIPLIER[band];
  if (!multiplier) throw new RangeError(`Unknown equipment band: ${band}`);
  return recipe.spiritStoneCost * multiplier;
}

/**
 * The ingredients `band` actually pays. Reuses the idle material multiplier
 * rather than declaring a second table, because it is cancelling out that exact
 * effect: an experience pill is worth N hours of the player's current income,
 * so its cost has to grow by whatever factor the band grew material income by,
 * or the same pill buys more and more every band. Sharing the number is what
 * keeps the exchange rate fixed at 凡阶's — two tables would drift apart.
 */
export function alchemyIngredientCosts(
  recipe: AlchemyRecipeConfig,
  band: EquipmentBand,
): readonly AlchemyRecipeCost[] {
  const multiplier = IDLE_MATERIAL_BAND_MULTIPLIER[band];
  if (!multiplier) throw new RangeError(`Unknown equipment band: ${band}`);
  if (!recipe.materialScalesWithBand) return recipe.ingredients;
  return recipe.ingredients.map((ingredient) => ({
    itemConfigId: ingredient.itemConfigId,
    quantity: ingredient.quantity * multiplier,
  }));
}

export function getAlchemyRecipeConfig(id: string): AlchemyRecipeConfig {
  const config = ALCHEMY_RECIPE_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown alchemy recipe: ${id}`);
  return config;
}
