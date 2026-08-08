import type { BigNumberString } from "../types";

export interface StackedDropReward {
  itemConfigId: string;
  quantity: BigNumberString;
}

export interface DropRewardSummary {
  configVersion: string;
  stackItems: StackedDropReward[];
  equipmentCount: number;
  techniqueCount: number;
  harvestChestAdded: number;
  techniqueDuplicates: number;
  autoSalvagedCount: number;
  mailedCount: number;
  autoSalvageSpiritStone: BigNumberString;
  autoSalvageEnhanceStone: BigNumberString;
}

export type DebugGrantTarget =
  | "fill_experience"
  | "spirit_stone"
  | "breakthrough_pill";
