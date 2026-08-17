import { countOccupiedBagSlots, type BootstrapSnapshot } from "@cultivation-diary/shared";

type HarvestBatchState = Pick<
  BootstrapSnapshot,
  "inventory" | "equipment" | "harvestChest"
>;

export interface HarvestBatchDisplay {
  readonly collectibleCount: number;
  readonly blockedEquipmentCount: number;
  readonly salvageableCount: number;
}

export function getHarvestBatchDisplay(
  snapshot: HarvestBatchState,
): HarvestBatchDisplay {
  let freeSlots = Math.max(
    0,
    snapshot.inventory.bagCapacity - countOccupiedBagSlots(snapshot),
  );
  let collectibleCount = 0;
  let blockedEquipmentCount = 0;
  let salvageableCount = 0;

  for (const entry of snapshot.harvestChest.entries) {
    if (entry.quality === "common" || entry.quality === "uncommon") {
      salvageableCount += 1;
    }
    if (entry.entryType !== "equipment") {
      collectibleCount += 1;
      continue;
    }
    if (freeSlots > 0) {
      collectibleCount += 1;
      freeSlots -= 1;
    } else {
      blockedEquipmentCount += 1;
    }
  }

  return { collectibleCount, blockedEquipmentCount, salvageableCount };
}
