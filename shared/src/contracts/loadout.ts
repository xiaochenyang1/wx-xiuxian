import type { BootstrapSnapshot } from "./bootstrap";
import type { BigNumberString } from "../types";

export interface LoadoutMutationResult {
  operationId: string;
  assetType: "technique" | "equipment";
  action: "equip" | "unequip";
  assetId: string;
  equippedSlot: string;
  replacedAssetId: string | null;
  previousTotalPower: BigNumberString;
  totalPower: BigNumberString;
  powerDelta: BigNumberString;
  bootstrap: BootstrapSnapshot;
}
