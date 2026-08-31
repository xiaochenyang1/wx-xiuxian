import {
  EQUIPMENT_MAX_ENHANCE_LEVEL,
  IDLE_ENHANCE_STONE_BAND_MULTIPLIER,
  TECHNIQUE_MAX_STAR,
  TECHNIQUE_PAGES_PER_DUPLICATE,
  ASSET_QUALITY_DISPLAY_NAMES,
  affixScorePercent,
  canAscendEquipmentQuality,
  caveBuildingLevel,
  decimal,
  equipmentAffixScoreBp,
  equipmentAscendCost,
  equipmentBandForConfig,
  equipmentBandForLevel,
  equipmentEnhanceCost,
  equipmentRerollCost,
  getEquipmentBandConfig,
  isAssetQuality,
  nextAssetQuality,
  readRolledAffixes,
  techniqueStarUpgradeCost,
  type AffixStat,
  type AssetQuality,
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
  /** The band this piece belongs to, e.g. `天阶`. */
  readonly bandName: string;
  /** `词条 81%`, or `无词条` for a quality that rolls none. */
  readonly scoreText: string;
  /** `天阶 词条 81%` — the score together with the ceiling it was measured against. */
  readonly bandScoreText: string;
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
 * The affix line: a score against the best roll the quality can produce in this
 * piece's band, then the rolled stats themselves. Both are derived from the
 * stored affixes, so the row cannot disagree with the piece it describes.
 *
 * The band leads the combined score because the ceiling it is measured against
 * is the band's: a 天阶 100% is a bigger number than a 凡阶 100%, and putting the
 * two percentages side by side without the band would read as equivalent.
 */
export function getEquipmentAffixDisplay(
  equipment: BootstrapSnapshot["equipment"][number],
): EquipmentAffixDisplay {
  if (!isAssetQuality(equipment.quality)) {
    throw new RangeError(`Unknown equipment quality: ${equipment.quality}`);
  }
  const band = equipmentBandForConfig(equipment.equipmentConfigId);
  const bandName = getEquipmentBandConfig(band).displayName;
  const affixes = readRolledAffixes(equipment.rolledAffixes);
  if (affixes.length === 0) {
    return {
      hasAffixes: false,
      bandName,
      scoreText: "无词条",
      bandScoreText: "无词条",
      affixText: "",
    };
  }
  const scoreText = `词条 ${affixScorePercent(
    equipmentAffixScoreBp(equipment.quality, band, affixes),
  )}%`;
  return {
    hasAffixes: true,
    bandName,
    scoreText,
    bandScoreText: `${bandName} ${scoreText}`,
    affixText: affixes
      .map(
        (affix) => `${AFFIX_LABELS[affix.stat]} +${formatBasisPoints(affix.valueBp)}`,
      )
      .join("  "),
  };
}

/**
 * The 法宝页 name line: `天阶 · 太虚斩仙剑`. The band is shown on every row, not
 * only on the ones with affixes, because it is the piece's identity — the four
 * bands share a slot's base power, so the band is the only thing distinguishing
 * two pieces that read the same everywhere else.
 */
export function getEquipmentTitleText(
  equipment: Pick<
    BootstrapSnapshot["equipment"][number],
    "equipmentConfigId" | "displayName"
  >,
): string {
  const band = equipmentBandForConfig(equipment.equipmentConfigId);
  return `${getEquipmentBandConfig(band).displayName} · ${equipment.displayName}`;
}

/**
 * The 法宝页 header: how many pieces are stored, the enhance stone stock, and the
 * rate the current band pays back in idle stones. The last one lives here for
 * the same reason the material rate lives on the crafting page — this is where
 * stones are spent, and the band is already the page's organising idea.
 */
export function getEquipmentHeaderText(
  snapshot: BootstrapSnapshot,
  equipmentCount: number,
): string {
  const band = equipmentBandForLevel(snapshot.progress.level);
  const stones =
    snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === "enhance_stone",
    )?.quantity ?? "0";
  return `法宝 ${equipmentCount} 件 · 强化石 ${formatLargeNumber(stones)}（挂机 ×${IDLE_ENHANCE_STONE_BAND_MULTIPLIER[band]}） · 装备影响战力与挂机效率`;
}

/**
 * A compact page-level warning for the irreversible cost difference between
 * enhancing before ascending and enhancing after ascending. It intentionally
 * reports the maximum saving for each quality that is currently present, so
 * the line remains useful when pieces on the page have different levels.
 */
export function getEquipmentEnhanceOrderHintText(
  equipment: readonly BootstrapSnapshot["equipment"][number][],
): string | null {
  const savingsByQuality = new Map<string, number>();
  for (const item of equipment) {
    if (
      !isAssetQuality(item.quality) ||
      item.enhanceLevel >= EQUIPMENT_MAX_ENHANCE_LEVEL ||
      !canAscendEquipmentQuality(item.quality)
    ) {
      continue;
    }
    const quality = item.quality as AssetQuality;
    const savings = enhancementStoneSavingsToHighestQuality(
      quality,
      item.enhanceLevel,
    );
    const previous = savingsByQuality.get(quality) ?? 0;
    if (savings > previous) savingsByQuality.set(quality, savings);
  }

  if (savingsByQuality.size === 0) return null;
  // Map.forEach rather than spreading map.entries(): the Cocos build transpiles
  // array spread to [].concat(...), which appends an iterator as a single
  // element instead of expanding it, so the spread form renders "undefined" in
  // the built game while passing here.
  const clauses: string[] = [];
  savingsByQuality.forEach((savings, quality) => {
    clauses.push(
      `${ASSET_QUALITY_DISPLAY_NAMES[quality as AssetQuality]}法宝先强化至 +${EQUIPMENT_MAX_ENHANCE_LEVEL} 再升华，单件最多可省 ${formatLargeNumber(String(savings))} 枚强化石`,
    );
  });
  return `强化顺序提示：${clauses.join("；")}`;
}

function enhancementStoneSavingsToHighestQuality(
  quality: AssetQuality,
  currentLevel: number,
): number {
  let highestQuality = quality;
  let nextQuality = nextAssetQuality(highestQuality);
  while (nextQuality !== null) {
    highestQuality = nextQuality;
    nextQuality = nextAssetQuality(highestQuality);
  }

  let savings = 0;
  for (
    let targetLevel = currentLevel + 1;
    targetLevel <= EQUIPMENT_MAX_ENHANCE_LEVEL;
    targetLevel += 1
  ) {
    const sourceCost = equipmentEnhanceCost(quality, targetLevel - 1).enhanceStone;
    const finalCost = equipmentEnhanceCost(highestQuality, targetLevel - 1).enhanceStone;
    savings += finalCost - sourceCost;
  }
  return savings;
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
  // same affixes, so the button stops asking for the materials. The ceiling is
  // the piece's own band, so a 凡阶 piece maxes out at the 凡阶 ceiling.
  if (
    equipmentAffixScoreBp(
      equipment.quality,
      equipmentBandForConfig(equipment.equipmentConfigId),
      affixes,
    ) >= 10_000
  ) {
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
