import {
  CRAFTING_QUALITY_WEIGHTS,
  craftingQualityWeight,
  decimal,
  getItemConfig,
  type BootstrapSnapshot,
  type CraftingRecipeConfig,
} from "@cultivation-diary/shared";
import { formatLargeNumber } from "./ClientNumber";

export interface CraftingRecipeDisplay {
  readonly roomRequirementText: string;
  readonly costText: string;
  readonly materialText: string;
  readonly affordable: boolean;
}

export function getCraftingRecipeDisplay(
  snapshot: BootstrapSnapshot,
  recipe: CraftingRecipeConfig,
): CraftingRecipeDisplay {
  const roomLevel = buildingLevel(snapshot, "crafting_room");
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
    costText: `${formatLargeNumber(String(recipe.spiritStoneCost))} 灵石`,
    materialText: materials.map((material) => material.text).join("　"),
    affordable:
      roomReady &&
      decimal(snapshot.wallet.spiritStone).greaterThanOrEqualTo(
        recipe.spiritStoneCost,
      ) &&
      materials.every((material) => material.sufficient),
  };
}

export function craftingOddsSummary(roomLevel: number): string {
  const entries = CRAFTING_QUALITY_WEIGHTS.map(({ quality }) => ({
    quality,
    weight: craftingQualityWeight(quality, roomLevel),
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
