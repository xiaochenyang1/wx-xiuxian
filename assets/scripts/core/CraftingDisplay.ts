import {
  CRAFTING_QUALITY_WEIGHTS,
  IDLE_MATERIAL_BAND_MULTIPLIER,
  craftingQualityWeight,
  craftingSpiritStoneCost,
  decimal,
  equipmentBandForLevel,
  getEquipmentBandConfig,
  getItemConfig,
  resolveCraftingEquipmentConfig,
  type BootstrapSnapshot,
  type CraftingRecipeConfig,
  type EquipmentBand,
} from "@cultivation-diary/shared";
import { formatLargeNumber } from "./ClientNumber";

export interface CraftingRecipeDisplay {
  readonly roomRequirementText: string;
  /** What this recipe forges at the player's current band. */
  readonly productText: string;
  readonly costText: string;
  readonly materialText: string;
  readonly affordable: boolean;
}

export function getCraftingRecipeDisplay(
  snapshot: BootstrapSnapshot,
  recipe: CraftingRecipeConfig,
): CraftingRecipeDisplay {
  const roomLevel = buildingLevel(snapshot, "crafting_room");
  const band = equipmentBandForLevel(snapshot.progress.level);
  const product = resolveCraftingEquipmentConfig(recipe.slot, snapshot.progress.level);
  const spiritStoneCost = craftingSpiritStoneCost(recipe, band);
  const materials = recipe.materials.map((material) => {
    const owned = stackQuantity(snapshot, material.itemConfigId);
    return {
      text: `${getItemConfig(material.itemConfigId).displayName} ${owned}/${material.quantity}`,
      sufficient: decimal(owned).greaterThanOrEqualTo(material.quantity),
    };
  });
  const roomReady = roomLevel >= recipe.requiredCraftingRoomLevel;
  return {
    roomRequirementText: roomReady
      ? `炼器室 Lv.${roomLevel}`
      : `需炼器室 Lv.${recipe.requiredCraftingRoomLevel}`,
    productText: `${getEquipmentBandConfig(band).displayName} · ${product.displayName}`,
    costText: `${formatLargeNumber(String(spiritStoneCost))} 灵石`,
    materialText: materials.map((material) => material.text).join("　"),
    affordable:
      roomReady &&
      decimal(snapshot.wallet.spiritStone).greaterThanOrEqualTo(spiritStoneCost) &&
      materials.every((material) => material.sufficient),
  };
}

/**
 * The panel's header: room level, the band being forged, its odds, and the rate
 * the band pays back in idle materials. The last one lives here because this is
 * the page where materials are spent, and the only place a band is already named.
 */
export function getCraftingHeaderText(snapshot: BootstrapSnapshot): string {
  const roomLevel = buildingLevel(snapshot, "crafting_room");
  const band = equipmentBandForLevel(snapshot.progress.level);
  return `炼器室 Lv.${roomLevel}　${getEquipmentBandConfig(band).displayName}　${craftingOddsSummary(roomLevel, band)}　挂机材料 ×${IDLE_MATERIAL_BAND_MULTIPLIER[band]}`;
}

export function craftingOddsSummary(roomLevel: number, band: EquipmentBand): string {
  const entries = CRAFTING_QUALITY_WEIGHTS.map(({ quality }) => ({
    quality,
    weight: craftingQualityWeight(quality, roomLevel, band),
  }));
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const rareOrBetter = entries
    .filter((entry) => entry.quality !== "common" && entry.quality !== "uncommon")
    .reduce((sum, entry) => sum + entry.weight, 0);
  return `当前稀有及以上概率 ${((rareOrBetter / total) * 100).toFixed(1)}%`;
}

function buildingLevel(snapshot: BootstrapSnapshot, buildingConfigId: string): number {
  return (
    snapshot.cave.buildings.find(
      (building) => building.buildingConfigId === buildingConfigId,
    )?.level ?? 0
  );
}

function stackQuantity(snapshot: BootstrapSnapshot, itemConfigId: string): string {
  return (
    snapshot.inventory.stacks.find((stack) => stack.itemConfigId === itemConfigId)
      ?.quantity ?? "0"
  );
}
