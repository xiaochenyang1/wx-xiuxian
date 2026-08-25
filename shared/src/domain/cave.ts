import { CAVE_BUILDING_CONFIGS, getCaveBuildingConfig } from "../config/cave";
import type { LoadoutBonuses } from "./loadout";

export interface CaveBuildingInput {
  buildingConfigId: string;
  level: number;
}

export function calculateCaveBonuses(
  buildings: readonly CaveBuildingInput[],
): LoadoutBonuses {
  const total: LoadoutBonuses = {
    powerBonusBp: 0,
    experienceBonusBp: 0,
    spiritStoneBonusBp: 0,
    dropBonusBp: 0,
  };

  for (const building of buildings) {
    const config = getCaveBuildingConfig(building.buildingConfigId);
    if (
      !Number.isInteger(building.level) ||
      building.level < 0 ||
      building.level > config.maxLevel
    ) {
      throw new RangeError(
        `Cave building level must be between 0 and ${config.maxLevel}: ${building.level}`,
      );
    }
    if (building.level === 0) continue;

    const amount = config.bonusPerLevelBp * building.level;
    if (config.bonusStat === "experience") total.experienceBonusBp += amount;
    if (config.bonusStat === "spirit_stone") total.spiritStoneBonusBp += amount;
    if (config.bonusStat === "drop") total.dropBonusBp += amount;
    if (config.bonusStat === "power") total.powerBonusBp += amount;
  }
  return total;
}

export function addLoadoutBonuses(
  a: LoadoutBonuses,
  b: LoadoutBonuses,
): LoadoutBonuses {
  return {
    powerBonusBp: a.powerBonusBp + b.powerBonusBp,
    experienceBonusBp: a.experienceBonusBp + b.experienceBonusBp,
    spiritStoneBonusBp: a.spiritStoneBonusBp + b.spiritStoneBonusBp,
    dropBonusBp: a.dropBonusBp + b.dropBonusBp,
  };
}

export function createEmptyCaveBuildings(): CaveBuildingInput[] {
  return CAVE_BUILDING_CONFIGS.map((config) => ({
    buildingConfigId: config.id,
    level: 0,
  }));
}

/**
 * A building the save has never recorded reads as level 0, which is what makes
 * a room's level usable as a gate without every caller handling the absence.
 */
export function caveBuildingLevel(
  buildings: readonly CaveBuildingInput[],
  buildingConfigId: string,
): number {
  return (
    buildings.find(
      (building) => building.buildingConfigId === buildingConfigId,
    )?.level ?? 0
  );
}
