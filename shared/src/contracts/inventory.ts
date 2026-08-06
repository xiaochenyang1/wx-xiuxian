import type { BootstrapSnapshot } from "./bootstrap";
import type { ProgressionEvent } from "../domain/progression";
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

export interface InventoryExpandResult {
  operationId: string;
  expandedBy: number;
  cost: BigNumberString;
  nextCost: BigNumberString | null;
  bootstrap: BootstrapSnapshot;
}

export interface InventoryUseResult {
  operationId: string;
  itemConfigId: string;
  consumedQuantity: number;
  remainingQuantity: BigNumberString;
  effectType: "simulated_online_experience";
  experienceGained: BigNumberString;
  experienceDiscarded: BigNumberString;
  fromLevel: number;
  toLevel: number;
  reachedBreakthrough: boolean;
  newcomerRewardGranted: boolean;
  events: ProgressionEvent[];
  bootstrap: BootstrapSnapshot;
}

export type DebugGrantTarget =
  | "fill_experience"
  | "spirit_stone"
  | "breakthrough_pill";

export interface DebugGrantResult {
  operationId: string;
  target: DebugGrantTarget;
  grantedAmount: BigNumberString;
  balanceAfter: BigNumberString;
  fromLevel: number;
  toLevel: number;
  reachedBreakthrough: boolean;
  newcomerRewardGranted: boolean;
  events: ProgressionEvent[];
  bootstrap: BootstrapSnapshot;
}

export interface HarvestTransferResult {
  operationId: string;
  transferredEquipment: number;
  collectedTechniques: number;
  techniqueDuplicates: number;
  bootstrap: BootstrapSnapshot;
}

export interface HarvestSalvageResult {
  operationId: string;
  salvagedCount: number;
  spiritStoneGained: BigNumberString;
  enhanceStoneGained: BigNumberString;
  bootstrap: BootstrapSnapshot;
}
