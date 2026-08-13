import {
  EQUIPMENT_MAX_ENHANCE_LEVEL,
  TECHNIQUE_MAX_STAR,
  TECHNIQUE_PAGES_PER_DUPLICATE,
  decimal,
  equipmentEnhanceCost,
  isAssetQuality,
  techniqueStarUpgradeCost,
  type BootstrapSnapshot,
} from "@cultivation-diary/shared";
import { formatLargeNumber } from "./ClientNumber";

export interface AssetUpgradeDisplay {
  readonly maxed: boolean;
  readonly affordable: boolean;
  readonly costText: string;
  readonly actionText: string;
  readonly actionEnabled: boolean;
}

export function getEquipmentEnhanceDisplay(
  snapshot: BootstrapSnapshot,
  equipment: BootstrapSnapshot["equipment"][number],
): AssetUpgradeDisplay {
  if (equipment.enhanceLevel >= EQUIPMENT_MAX_ENHANCE_LEVEL) {
    return {
      maxed: true,
      affordable: false,
      costText: "强化已满",
      actionText: "满级",
      actionEnabled: false,
    };
  }
  if (!isAssetQuality(equipment.quality)) {
    throw new RangeError(`Unknown equipment quality: ${equipment.quality}`);
  }

  const cost = equipmentEnhanceCost(
    equipment.quality,
    equipment.enhanceLevel,
  );
  const ownedEnhanceStone =
    snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === "enhance_stone",
    )?.quantity ?? "0";
  const affordable =
    decimal(snapshot.wallet.spiritStone).greaterThanOrEqualTo(
      cost.spiritStone,
    ) &&
    decimal(ownedEnhanceStone).greaterThanOrEqualTo(cost.enhanceStone);
  return {
    maxed: false,
    affordable,
    costText: `强化石 ${formatLargeNumber(ownedEnhanceStone)}/${cost.enhanceStone}\n灵石 ${formatLargeNumber(String(cost.spiritStone))}`,
    actionText: "强化",
    actionEnabled: true,
  };
}

export function getTechniqueUpgradeDisplay(
  snapshot: BootstrapSnapshot,
  technique: BootstrapSnapshot["techniques"][number],
): AssetUpgradeDisplay {
  if (technique.star >= TECHNIQUE_MAX_STAR) {
    return {
      maxed: true,
      affordable: false,
      costText: "已满星",
      actionText: "满星",
      actionEnabled: false,
    };
  }

  const cost = techniqueStarUpgradeCost(technique.star);
  const duplicateCount = Math.min(
    technique.duplicateCount,
    cost.duplicateCount,
  );
  const requiredPages =
    (cost.duplicateCount - duplicateCount) * TECHNIQUE_PAGES_PER_DUPLICATE;
  const ownedPages =
    snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === "technique_page",
    )?.quantity ?? "0";
  return {
    maxed: false,
    affordable: decimal(ownedPages).greaterThanOrEqualTo(requiredPages),
    costText:
      requiredPages > 0
        ? `副本 ${duplicateCount}/${cost.duplicateCount}\n残页 ${formatLargeNumber(ownedPages)}/${requiredPages}`
        : `副本 ${duplicateCount}/${cost.duplicateCount}`,
    actionText: "升星",
    actionEnabled: true,
  };
}
