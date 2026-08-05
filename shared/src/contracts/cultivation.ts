import type { BootstrapSnapshot } from "./bootstrap";
import type { ProgressionEvent } from "../domain/progression";
import type { BigNumberString } from "../types";
import type { OfflineSettlementSummary } from "./offline";
import type { DropRewardSummary } from "./inventory";

export type CultivationSettlementMode = "online" | "offline";

export interface CultivationSettlementSummary {
  settlementId: string;
  mode: CultivationSettlementMode;
  efficiencyBp: number;
  elapsedMilliseconds: number;
  experienceGained: BigNumberString;
  experienceDiscarded: BigNumberString;
  spiritStoneGained: BigNumberString;
  dropAttempts: number;
  drops: DropRewardSummary;
  events: ProgressionEvent[];
  newcomerRewardGranted: boolean;
  offlineSettlement: OfflineSettlementSummary | null;
}

export interface CultivationSettleResult {
  settlement: CultivationSettlementSummary;
  bootstrap: BootstrapSnapshot;
}

export interface CultivationBreakthroughResult {
  breakthroughId: string;
  fromLevel: number;
  toLevel: number;
  consumedPills: number;
  bootstrap: BootstrapSnapshot;
}
