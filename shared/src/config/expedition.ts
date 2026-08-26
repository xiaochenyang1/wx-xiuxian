import type { BigNumberString } from "../types";

export type ExpeditionStageId =
  | "greenstone_path"
  | "mistwood_forest"
  | "blackwater_marsh"
  | "swordscar_valley"
  | "red_sand_mine"
  | "ancient_cultivator_ruins"
  | "bonecrypt_wastes"
  | "netherfall_abyss"
  | "skyfire_sea"
  | "myriad_sword_mound"
  | "starfall_battlefield"
  | "voidrift_expanse";

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
  readonly sweepSpiritStoneReward: BigNumberString;
  readonly sweepItemRewards: readonly ExpeditionRewardItem[];
}

export const EXPEDITION_SWEEP_TOKEN_COST = 1;
export const EXPEDITION_SWEEP_MAX_COUNT = 1_000_000_000;

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
    sweepSpiritStoneReward: "100",
    sweepItemRewards: [
      { itemConfigId: "wood", quantity: 3 },
      { itemConfigId: "stone", quantity: 3 },
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
    sweepSpiritStoneReward: "250",
    sweepItemRewards: [
      { itemConfigId: "spiritual_soil", quantity: 3 },
      { itemConfigId: "spiritual_herb", quantity: 3 },
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
    sweepSpiritStoneReward: "500",
    sweepItemRewards: [
      { itemConfigId: "ore", quantity: 5 },
      { itemConfigId: "enhance_stone", quantity: 1 },
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
    sweepSpiritStoneReward: "900",
    sweepItemRewards: [
      { itemConfigId: "wood", quantity: 5 },
      { itemConfigId: "stone", quantity: 5 },
      { itemConfigId: "ore", quantity: 5 },
      { itemConfigId: "technique_page", quantity: 2 },
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
    sweepSpiritStoneReward: "1800",
    sweepItemRewards: [
      { itemConfigId: "spiritual_soil", quantity: 8 },
      { itemConfigId: "spiritual_herb", quantity: 8 },
      { itemConfigId: "enhance_stone", quantity: 2 },
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
    sweepSpiritStoneReward: "3000",
    sweepItemRewards: [
      { itemConfigId: "wood", quantity: 8 },
      { itemConfigId: "stone", quantity: 8 },
      { itemConfigId: "spiritual_soil", quantity: 8 },
      { itemConfigId: "spiritual_herb", quantity: 8 },
      { itemConfigId: "ore", quantity: 8 },
      { itemConfigId: "enhance_stone", quantity: 3 },
      { itemConfigId: "technique_page", quantity: 5 },
    ],
  },
  // Stages 7..12 run two per equipment band: 灵阶, 玄阶, 天阶. Each band's first
  // stage is beatable on bare power the level that band opens (Lv.61 = 61,000,
  // Lv.151 = 1,510,000, Lv.301 = 30,100,000); its second needs about half a
  // loadout. The sweep rows are the point of the tier: they pay the five
  // materials in the ratio crafting actually consumes (灵草 24 : 矿石 18 : 木材 9
  // : 灵土 7 : 石材 5) times a multiple of that band's hourly idle income, so a
  // token is worth a fixed number of idle hours instead of a flat 40 materials.
  // First clears pay twice the sweep row plus the token pile that starts it.
  {
    id: "bonecrypt_wastes",
    displayName: "白骨荒原",
    requiredPower: "60000",
    spiritStoneReward: "30000",
    itemRewards: [
      { itemConfigId: "wood", quantity: 90 },
      { itemConfigId: "stone", quantity: 50 },
      { itemConfigId: "spiritual_soil", quantity: 70 },
      { itemConfigId: "spiritual_herb", quantity: 240 },
      { itemConfigId: "ore", quantity: 180 },
      { itemConfigId: "enhance_stone", quantity: 20 },
      { itemConfigId: "treasure_token", quantity: 6 },
    ],
    sweepSpiritStoneReward: "8000",
    sweepItemRewards: [
      { itemConfigId: "wood", quantity: 45 },
      { itemConfigId: "stone", quantity: 25 },
      { itemConfigId: "spiritual_soil", quantity: 35 },
      { itemConfigId: "spiritual_herb", quantity: 120 },
      { itemConfigId: "ore", quantity: 90 },
      { itemConfigId: "enhance_stone", quantity: 10 },
    ],
  },
  {
    id: "netherfall_abyss",
    displayName: "幽冥鬼渊",
    requiredPower: "200000",
    spiritStoneReward: "80000",
    itemRewards: [
      { itemConfigId: "wood", quantity: 144 },
      { itemConfigId: "stone", quantity: 80 },
      { itemConfigId: "spiritual_soil", quantity: 112 },
      { itemConfigId: "spiritual_herb", quantity: 384 },
      { itemConfigId: "ore", quantity: 288 },
      { itemConfigId: "enhance_stone", quantity: 32 },
      { itemConfigId: "technique_page", quantity: 25 },
      { itemConfigId: "treasure_token", quantity: 8 },
    ],
    sweepSpiritStoneReward: "20000",
    sweepItemRewards: [
      { itemConfigId: "wood", quantity: 72 },
      { itemConfigId: "stone", quantity: 40 },
      { itemConfigId: "spiritual_soil", quantity: 56 },
      { itemConfigId: "spiritual_herb", quantity: 192 },
      { itemConfigId: "ore", quantity: 144 },
      { itemConfigId: "enhance_stone", quantity: 16 },
      { itemConfigId: "technique_page", quantity: 3 },
    ],
  },
  {
    id: "skyfire_sea",
    displayName: "焚天火海",
    requiredPower: "1500000",
    spiritStoneReward: "250000",
    itemRewards: [
      { itemConfigId: "wood", quantity: 180 },
      { itemConfigId: "stone", quantity: 100 },
      { itemConfigId: "spiritual_soil", quantity: 140 },
      { itemConfigId: "spiritual_herb", quantity: 480 },
      { itemConfigId: "ore", quantity: 360 },
      { itemConfigId: "enhance_stone", quantity: 50 },
      { itemConfigId: "treasure_token", quantity: 10 },
    ],
    sweepSpiritStoneReward: "60000",
    sweepItemRewards: [
      { itemConfigId: "wood", quantity: 90 },
      { itemConfigId: "stone", quantity: 50 },
      { itemConfigId: "spiritual_soil", quantity: 70 },
      { itemConfigId: "spiritual_herb", quantity: 240 },
      { itemConfigId: "ore", quantity: 180 },
      { itemConfigId: "enhance_stone", quantity: 25 },
    ],
  },
  {
    id: "myriad_sword_mound",
    displayName: "万剑冢",
    requiredPower: "6000000",
    spiritStoneReward: "600000",
    itemRewards: [
      { itemConfigId: "wood", quantity: 288 },
      { itemConfigId: "stone", quantity: 160 },
      { itemConfigId: "spiritual_soil", quantity: 224 },
      { itemConfigId: "spiritual_herb", quantity: 768 },
      { itemConfigId: "ore", quantity: 576 },
      { itemConfigId: "enhance_stone", quantity: 80 },
      { itemConfigId: "technique_page", quantity: 40 },
      { itemConfigId: "treasure_token", quantity: 12 },
    ],
    sweepSpiritStoneReward: "150000",
    sweepItemRewards: [
      { itemConfigId: "wood", quantity: 144 },
      { itemConfigId: "stone", quantity: 80 },
      { itemConfigId: "spiritual_soil", quantity: 112 },
      { itemConfigId: "spiritual_herb", quantity: 384 },
      { itemConfigId: "ore", quantity: 288 },
      { itemConfigId: "enhance_stone", quantity: 40 },
      { itemConfigId: "technique_page", quantity: 6 },
    ],
  },
  {
    id: "starfall_battlefield",
    displayName: "陨星古战场",
    requiredPower: "30000000",
    spiritStoneReward: "2000000",
    itemRewards: [
      { itemConfigId: "wood", quantity: 360 },
      { itemConfigId: "stone", quantity: 200 },
      { itemConfigId: "spiritual_soil", quantity: 280 },
      { itemConfigId: "spiritual_herb", quantity: 960 },
      { itemConfigId: "ore", quantity: 720 },
      { itemConfigId: "enhance_stone", quantity: 120 },
      { itemConfigId: "treasure_token", quantity: 15 },
    ],
    sweepSpiritStoneReward: "500000",
    sweepItemRewards: [
      { itemConfigId: "wood", quantity: 180 },
      { itemConfigId: "stone", quantity: 100 },
      { itemConfigId: "spiritual_soil", quantity: 140 },
      { itemConfigId: "spiritual_herb", quantity: 480 },
      { itemConfigId: "ore", quantity: 360 },
      { itemConfigId: "enhance_stone", quantity: 60 },
    ],
  },
  {
    id: "voidrift_expanse",
    displayName: "太虚裂界",
    requiredPower: "120000000",
    spiritStoneReward: "5000000",
    itemRewards: [
      { itemConfigId: "wood", quantity: 594 },
      { itemConfigId: "stone", quantity: 330 },
      { itemConfigId: "spiritual_soil", quantity: 462 },
      { itemConfigId: "spiritual_herb", quantity: 1584 },
      { itemConfigId: "ore", quantity: 1188 },
      { itemConfigId: "enhance_stone", quantity: 200 },
      { itemConfigId: "technique_page", quantity: 60 },
      { itemConfigId: "treasure_token", quantity: 20 },
    ],
    sweepSpiritStoneReward: "1250000",
    sweepItemRewards: [
      { itemConfigId: "wood", quantity: 297 },
      { itemConfigId: "stone", quantity: 165 },
      { itemConfigId: "spiritual_soil", quantity: 231 },
      { itemConfigId: "spiritual_herb", quantity: 792 },
      { itemConfigId: "ore", quantity: 594 },
      { itemConfigId: "enhance_stone", quantity: 100 },
      { itemConfigId: "technique_page", quantity: 10 },
    ],
  },
];

export function getExpeditionStageConfig(id: string): ExpeditionStageConfig {
  const config = EXPEDITION_STAGE_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown expedition stage config: ${id}`);
  return config;
}
