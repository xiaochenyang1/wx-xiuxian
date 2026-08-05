import type { BootstrapSnapshot } from "./bootstrap";
import type { CultivationSettlementSummary } from "./cultivation";

export interface SyncHeartbeatResult {
  settlement: CultivationSettlementSummary;
  bootstrap: BootstrapSnapshot;
}
