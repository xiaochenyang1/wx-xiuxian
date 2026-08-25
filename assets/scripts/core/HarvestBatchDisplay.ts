import { countOccupiedBagSlots, type BootstrapSnapshot } from "@cultivation-diary/shared";
import { getEquipmentAffixDisplay } from "./AssetUpgradeDisplay";

type HarvestBatchState = Pick<
  BootstrapSnapshot,
  "inventory" | "equipment" | "harvestChest"
>;

type HarvestChestEntry = BootstrapSnapshot["harvestChest"]["entries"][number];

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

/**
 * The second line of a chest row. An equipment candidate carries its affix score
 * and nothing else from the roll: the score answers "is this worth a bag slot",
 * and the values behind it are one tap away on the 法宝页 once it is collected.
 */
export function getHarvestEntryDetailText(
  snapshot: Pick<BootstrapSnapshot, "equipment">,
  entry: Pick<HarvestChestEntry, "entryType" | "equipmentInstanceId">,
): string {
  if (entry.entryType !== "equipment") return "功法本体";
  const candidate = snapshot.equipment.find(
    (item) => item.id === entry.equipmentInstanceId,
  );
  return candidate
    ? `独立法宝 · ${getEquipmentAffixDisplay(candidate).scoreText}`
    : "独立法宝";
}
