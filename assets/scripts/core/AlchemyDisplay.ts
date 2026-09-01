import {
  ALCHEMY_BAND_SPIRIT_STONE_MULTIPLIER,
  IDLE_MATERIAL_BAND_MULTIPLIER,
  alchemyIngredientCosts,
  alchemySpiritStoneCost,
  decimal,
  equipmentBandForLevel,
  getEquipmentBandConfig,
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
  const band = equipmentBandForLevel(snapshot.progress.level);
  const spiritStoneCost = alchemySpiritStoneCost(recipe, band);
  const materials = alchemyIngredientCosts(recipe, band).map((ingredient) => {
    const owned = stackQuantity(snapshot, ingredient.itemConfigId);
    return {
      text: `${getItemConfig(ingredient.itemConfigId).displayName} ${owned}/${ingredient.quantity}`,
      sufficient: decimal(owned).greaterThanOrEqualTo(ingredient.quantity),
    };
  });
  const roomReady = roomLevel >= recipe.requiredAlchemyRoomLevel;
  const stonesReady = decimal(snapshot.wallet.spiritStone).greaterThanOrEqualTo(
    spiritStoneCost,
  );
  return {
    roomRequirementText: roomReady
      ? `炼丹房 Lv.${roomLevel}`
      : `需炼丹房 Lv.${recipe.requiredAlchemyRoomLevel}`,
    outputText: `产出 ${getItemConfig(recipe.outputItemConfigId).displayName} x${recipe.outputQuantity}`,
    costText: `${formatLargeNumber(String(spiritStoneCost))} 灵石`,
    materialText: materials.map((material) => material.text).join("　"),
    affordable:
      roomReady && stonesReady && materials.every((material) => material.sufficient),
  };
}

/**
 * The panel's header: room level, the band brewing at, and the two multipliers
 * that band charges. `经验丹材料` names its target on purpose — the crafting
 * page's `挂机材料 ×N` is an *income* rate, while the same number here is a
 * *cost*, and only on the two experience pills. Left as a bare `材料 ×N` a
 * player would go counting 双修丹's herbs looking for the tenfold.
 */
export function getAlchemyHeaderText(snapshot: BootstrapSnapshot): string {
  const roomLevel = buildingLevel(snapshot, "alchemy_room");
  const band = equipmentBandForLevel(snapshot.progress.level);
  return `炼丹房 Lv.${roomLevel}　${getEquipmentBandConfig(band).displayName}　经验丹材料 ×${IDLE_MATERIAL_BAND_MULTIPLIER[band]}　灵石 ×${ALCHEMY_BAND_SPIRIT_STONE_MULTIPLIER[band]}`;
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
