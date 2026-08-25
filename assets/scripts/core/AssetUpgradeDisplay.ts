import {
  EQUIPMENT_MAX_ENHANCE_LEVEL,
  TECHNIQUE_MAX_STAR,
  TECHNIQUE_PAGES_PER_DUPLICATE,
  affixScorePercent,
  canAscendEquipmentQuality,
  caveBuildingLevel,
  decimal,
  equipmentAffixScoreBp,
  equipmentAscendCost,
  equipmentEnhanceCost,
  equipmentRerollCost,
  isAssetQuality,
  nextAssetQuality,
  readRolledAffixes,
  techniqueStarUpgradeCost,
  type AffixStat,
  type BootstrapSnapshot,
} from "@cultivation-diary/shared";
import { formatBasisPoints, formatLargeNumber } from "./ClientNumber";

export interface AssetUpgradeDisplay {
  readonly maxed: boolean;
  readonly affordable: boolean;
  readonly costText: string;
  readonly actionText: string;
  readonly actionEnabled: boolean;
}

export interface EquipmentAffixDisplay {
  readonly hasAffixes: boolean;
  /** `词条 81%`, or `无词条` for a quality that rolls none. */
  readonly scoreText: string;
  /** The rolled stats in stored order, or an empty string when there are none. */
  readonly affixText: string;
}

const AFFIX_LABELS: Readonly<Record<AffixStat, string>> = {
  experience_bonus: "修为",
  spirit_stone_bonus: "灵石",
  drop_bonus: "掉落",
};

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

/**
 * The affix line: a score against the best roll the quality can produce, then
 * the rolled stats themselves. Both are derived from the stored affixes, so the
 * row cannot disagree with the piece it describes.
 */
export function getEquipmentAffixDisplay(
  equipment: BootstrapSnapshot["equipment"][number],
): EquipmentAffixDisplay {
  if (!isAssetQuality(equipment.quality)) {
    throw new RangeError(`Unknown equipment quality: ${equipment.quality}`);
  }
  const affixes = readRolledAffixes(equipment.rolledAffixes);
  if (affixes.length === 0) {
    return { hasAffixes: false, scoreText: "无词条", affixText: "" };
  }
  const scoreBp = equipmentAffixScoreBp(equipment.quality, affixes);
  return {
    hasAffixes: true,
    scoreText: `词条 ${affixScorePercent(scoreBp)}%`,
    affixText: affixes
      .map(
        (affix) => `${AFFIX_LABELS[affix.stat]} +${formatBasisPoints(affix.valueBp)}`,
      )
      .join("  "),
  };
}

export function getEquipmentRerollDisplay(
  snapshot: BootstrapSnapshot,
  equipment: BootstrapSnapshot["equipment"][number],
): AssetUpgradeDisplay {
  if (!isAssetQuality(equipment.quality)) {
    throw new RangeError(`Unknown equipment quality: ${equipment.quality}`);
  }
  const affixes = readRolledAffixes(equipment.rolledAffixes);
  if (equipment.quality === "common") {
    return {
      maxed: true,
      affordable: false,
      costText: "普通品质没有词条",
      actionText: "无词条",
      actionEnabled: false,
    };
  }
  // A finished piece is a maxed piece: rerolling it can only ever return the
  // same affixes, so the button stops asking for the materials.
  if (equipmentAffixScoreBp(equipment.quality, affixes) >= 10_000) {
    return {
      maxed: true,
      affordable: false,
      costText: "词条已满",
      actionText: "洗练",
      actionEnabled: false,
    };
  }

  const cost = equipmentRerollCost(equipment.quality);
  const ownedEnhanceStone = stackQuantity(snapshot, "enhance_stone");
  return {
    maxed: false,
    affordable:
      decimal(snapshot.wallet.spiritStone).greaterThanOrEqualTo(
        cost.spiritStone,
      ) && decimal(ownedEnhanceStone).greaterThanOrEqualTo(cost.enhanceStone),
    costText: `强化石 ${formatLargeNumber(ownedEnhanceStone)}/${cost.enhanceStone}\n灵石 ${formatLargeNumber(String(cost.spiritStone))}`,
    actionText: "洗练",
    actionEnabled: true,
  };
}

export function getEquipmentAscendDisplay(
  snapshot: BootstrapSnapshot,
  equipment: BootstrapSnapshot["equipment"][number],
): AssetUpgradeDisplay {
  if (!isAssetQuality(equipment.quality)) {
    throw new RangeError(`Unknown equipment quality: ${equipment.quality}`);
  }
  if (nextAssetQuality(equipment.quality) === null) {
    return {
      maxed: true,
      affordable: false,
      costText: "已是最高品质",
      actionText: "升华",
      actionEnabled: false,
    };
  }
  if (!canAscendEquipmentQuality(equipment.quality)) {
    return {
      maxed: false,
      affordable: false,
      costText: "仅传说与神话可升华",
      actionText: "升华",
      actionEnabled: false,
    };
  }

  const cost = equipmentAscendCost(equipment.quality);
  const craftingRoomLevel = caveBuildingLevel(
    snapshot.cave.buildings,
    "crafting_room",
  );
  // The crafting room is a prerequisite rather than a price, so it disables the
  // button instead of only tinting it: no amount of spare copies substitutes.
  if (craftingRoomLevel < cost.requiredCraftingRoomLevel) {
    return {
      maxed: false,
      affordable: false,
      costText: `炼器室 Lv.${craftingRoomLevel}/${cost.requiredCraftingRoomLevel}`,
      actionText: "升华",
      actionEnabled: false,
    };
  }

  const spareCopies = countAscensionMaterials(snapshot, equipment);
  return {
    maxed: false,
    affordable:
      spareCopies >= cost.duplicateCount &&
      decimal(snapshot.wallet.spiritStone).greaterThanOrEqualTo(
        cost.spiritStone,
      ),
    costText: `同款 ${spareCopies}/${cost.duplicateCount}\n灵石 ${formatLargeNumber(String(cost.spiritStone))}`,
    actionText: "升华",
    actionEnabled: true,
  };
}

/**
 * Counts the spare copies ascension may eat, using the same rule the service
 * enforces: another instance of the same piece at the same quality, sitting in
 * the bag, unequipped and unlocked.
 */
function countAscensionMaterials(
  snapshot: BootstrapSnapshot,
  equipment: BootstrapSnapshot["equipment"][number],
): number {
  return snapshot.equipment.filter(
    (item) =>
      item.id !== equipment.id &&
      item.equipmentConfigId === equipment.equipmentConfigId &&
      item.quality === equipment.quality &&
      item.location === "bag" &&
      item.equippedSlot === null &&
      !item.isLocked,
  ).length;
}

function stackQuantity(
  snapshot: BootstrapSnapshot,
  itemConfigId: string,
): string {
  return (
    snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === itemConfigId,
    )?.quantity ?? "0"
  );
}

export function getTechniqueUpgradeDisplay(  snapshot: BootstrapSnapshot,
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
