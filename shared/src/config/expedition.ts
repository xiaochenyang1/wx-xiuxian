import type { BigNumberString } from "../types";

export type ExpeditionStageId =
  | "greenstone_path"
  | "mistwood_forest"
  | "blackwater_marsh"
  | "swordscar_valley"
  | "red_sand_mine"
  | "ancient_cultivator_ruins";

export interface ExpeditionRewardItem {
  readonly itemConfigId: string;
  readonly quantity: number;
}

export interface ExpeditionStageConfig {
  readonly id: ExpeditionStageId;
  readonly displayName: string;
  readonly requiredPower: BigNumberString;
  readonly spiritStoneReward: BigNumberString;
  readonly itemRewards: readonly ExpeditionRewardItem[];
}

export const EXPEDITION_STAGE_CONFIGS: readonly ExpeditionStageConfig[] = [
  {
    id: "greenstone_path",
    displayName: "青石山道",
    requiredPower: "100",
    spiritStoneReward: "300",
    itemRewards: [
      { itemConfigId: "wood", quantity: 5 },
      { itemConfigId: "stone", quantity: 5 },
      { itemConfigId: "treasure_token", quantity: 1 },
      { itemConfigId: "rename_card", quantity: 1 },
    ],
  },
  {
    id: "mistwood_forest",
    displayName: "雾隐林",
    requiredPower: "400",
    spiritStoneReward: "700",
    itemRewards: [
      { itemConfigId: "spiritual_soil", quantity: 5 },
      { itemConfigId: "spiritual_herb", quantity: 5 },
      { itemConfigId: "technique_page", quantity: 5 },
      { itemConfigId: "treasure_token", quantity: 1 },
    ],
  },
  {
    id: "blackwater_marsh",
    displayName: "黑水泽",
    requiredPower: "800",
    spiritStoneReward: "1500",
    itemRewards: [
      { itemConfigId: "ore", quantity: 10 },
      { itemConfigId: "enhance_stone", quantity: 2 },
      { itemConfigId: "treasure_token", quantity: 2 },
    ],
  },
  {
    id: "swordscar_valley",
    displayName: "剑痕谷",
    requiredPower: "1200",
    spiritStoneReward: "3000",
    itemRewards: [
      { itemConfigId: "wood", quantity: 10 },
      { itemConfigId: "stone", quantity: 10 },
      { itemConfigId: "ore", quantity: 10 },
      { itemConfigId: "technique_page", quantity: 10 },
      { itemConfigId: "treasure_token", quantity: 2 },
    ],
  },
  {
    id: "red_sand_mine",
    displayName: "赤砂矿窟",
    requiredPower: "3500",
    spiritStoneReward: "6000",
    itemRewards: [
      { itemConfigId: "spiritual_soil", quantity: 15 },
      { itemConfigId: "spiritual_herb", quantity: 15 },
      { itemConfigId: "enhance_stone", quantity: 5 },
      { itemConfigId: "treasure_token", quantity: 3 },
    ],
  },
  {
    id: "ancient_cultivator_ruins",
    displayName: "古修遗府",
    requiredPower: "6500",
    spiritStoneReward: "12000",
    itemRewards: [
      { itemConfigId: "wood", quantity: 20 },
      { itemConfigId: "stone", quantity: 20 },
      { itemConfigId: "spiritual_soil", quantity: 20 },
      { itemConfigId: "spiritual_herb", quantity: 20 },
      { itemConfigId: "ore", quantity: 20 },
      { itemConfigId: "enhance_stone", quantity: 8 },
      { itemConfigId: "technique_page", quantity: 20 },
      { itemConfigId: "treasure_token", quantity: 5 },
    ],
  },
];

export function getExpeditionStageConfig(id: string): ExpeditionStageConfig {
  const config = EXPEDITION_STAGE_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown expedition stage config: ${id}`);
  return config;
}
