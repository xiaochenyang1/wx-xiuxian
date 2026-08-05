import type { ProgressionEvent } from "../domain/progression";
import type { BigNumberString } from "../types";
import type { DropRewardSummary } from "./inventory";

export interface OfflineSettlementSummary {
  id: string;
  fromTime: string;
  toTime: string;
  effectiveSeconds: number;
  efficiencyBp: number;
  experienceGained: BigNumberString;
  experienceDiscarded: BigNumberString;
  spiritStoneGained: BigNumberString;
  dropAttempts: number;
  drops: DropRewardSummary;
  events: ProgressionEvent[];
  newcomerRewardGranted: boolean;
}
