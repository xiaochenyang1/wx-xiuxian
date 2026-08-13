import {
  decimal,
  getItemConfig,
  type AlchemyRecipeConfig,
  type BootstrapSnapshot,
} from "@cultivation-diary/shared";
import { formatLargeNumber } from "./ClientNumber";

export interface AlchemyRecipeDisplay {
  readonly roomRequirementText: string;
  readonly outputText: string;
  readonly costText: string;
  readonly materialText: string;
  readonly affordable: boolean;
}

export function getAlchemyRecipeDisplay(
  snapshot: BootstrapSnapshot,
  recipe: AlchemyRecipeConfig,
): AlchemyRecipeDisplay {
  const roomLevel = buildingLevel(snapshot, "alchemy_room");
  const materials = recipe.ingredients.map((ingredient) => {
    const owned = stackQuantity(snapshot, ingredient.itemConfigId);
    return {
      text: `${getItemConfig(ingredient.itemConfigId).displayName} ${owned}/${ingredient.quantity}`,
      sufficient: decimal(owned).greaterThanOrEqualTo(ingredient.quantity),
    };
  });
  const roomReady = roomLevel >= recipe.requiredAlchemyRoomLevel;
  const stonesReady = decimal(snapshot.wallet.spiritStone).greaterThanOrEqualTo(
    recipe.spiritStoneCost,
  );
  return {
    roomRequirementText: roomReady
      ? `炼丹房 Lv.${roomLevel}`
      : `需炼丹房 Lv.${recipe.requiredAlchemyRoomLevel}`,
    outputText: `产出 ${getItemConfig(recipe.outputItemConfigId).displayName} x${recipe.outputQuantity}`,
    costText: `${formatLargeNumber(String(recipe.spiritStoneCost))} 灵石`,
    materialText: materials.map((material) => material.text).join("　"),
    affordable:
      roomReady && stonesReady && materials.every((material) => material.sufficient),
  };
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
