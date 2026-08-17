import type { ProgressionStatus } from "@cultivation-diary/shared";

export interface InventoryItemUseDisplay {
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly label: string;
}

export function isDirectlyUsableInventoryItem(itemConfigId: string): boolean {
  return itemConfigId === "exp_pill_small" || itemConfigId === "exp_pill_large";
}

export function getInventoryItemUseDisplay(
  itemConfigId: string,
  progressStatus: ProgressionStatus,
): InventoryItemUseDisplay {
  if (!isDirectlyUsableInventoryItem(itemConfigId)) {
    return { visible: false, enabled: false, label: "" };
  }
  if (progressStatus === "breakthrough_ready") {
    return { visible: true, enabled: false, label: "需突破" };
  }
  return { visible: true, enabled: true, label: "使用" };
}
