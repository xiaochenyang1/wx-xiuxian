import {
  EQUIPMENT_MAX_ENHANCE_LEVEL,
  TECHNIQUE_MAX_STAR,
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
  return {
    maxed: false,
    affordable: technique.duplicateCount >= cost.duplicateCount,
    costText: `副本 ${formatLargeNumber(String(technique.duplicateCount))}/${cost.duplicateCount}`,
    actionText: "升星",
    actionEnabled: true,
  };
}
