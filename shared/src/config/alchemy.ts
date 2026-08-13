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
  readonly spiritStoneCost: number;
  readonly ingredients: readonly AlchemyRecipeCost[];
  readonly requiredAlchemyRoomLevel: number;
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
  },
];

export function getAlchemyRecipeConfig(id: string): AlchemyRecipeConfig {
  const config = ALCHEMY_RECIPE_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown alchemy recipe: ${id}`);
  return config;
}
