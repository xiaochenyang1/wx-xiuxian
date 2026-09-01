import {
  CAVE_BUILDING_CONFIGS,
  calculateCaveBonuses,
  caveMaxLevelForBand,
  caveUpgradeCost,
  decimal,
  equipmentBandForLevel,
  getEquipmentBandConfig,
  getItemConfig,
  type BootstrapSnapshot,
  type CaveBuildingConfig,
  type EquipmentBand,
} from "@cultivation-diary/shared";
import { formatLargeNumber } from "./ClientNumber";

export interface CaveMaterialDisplay {
  readonly displayName: string;
  readonly required: number;
  readonly owned: string;
  readonly sufficient: boolean;
}

export interface CaveBuildingDisplay {
  readonly buildingConfigId: string;
  readonly displayName: string;
  readonly level: number;
  /** No upgrade available right now — either band-capped or finished. */
  readonly maxed: boolean;
  /** Finished for good. `maxed && !complete` is the band-capped middle state. */
  readonly complete: boolean;
  readonly levelText: string;
  readonly bonusText: string;
  readonly nextBonusText: string;
  readonly costText: string;
  readonly materialText: string;
  readonly materials: readonly CaveMaterialDisplay[];
  readonly materialsSufficient: boolean;
  readonly affordable: boolean;
  readonly actionText: string;
}

const BONUS_LABELS: Readonly<Record<CaveBuildingConfig["bonusStat"], string>> = {
  experience: "修为",
  spirit_stone: "灵石",
  drop: "掉落",
  power: "战力",
};

function bonusText(config: CaveBuildingConfig, level: number): string {
  const label = BONUS_LABELS[config.bonusStat];
  if (level <= 0) return `${label} +0`;
  return `${label} +${(config.bonusPerLevelBp * level) / 100}%`;
}

/**
 * Three states, not two. 炼器室 only ever reaches the first and the third, since
 * its absolute cap equals the 凡阶 cap; the four idle buildings pass through the
 * middle one at every band boundary. The band comes from `snapshot.progress.level`
 * rather than a parameter, which keeps this a function of the snapshot alone.
 */
export function getCaveBuildingDisplay(
  snapshot: BootstrapSnapshot,
  config: CaveBuildingConfig,
): CaveBuildingDisplay {
  const level =
    snapshot.cave.buildings.find((item) => item.buildingConfigId === config.id)
      ?.level ?? 0;
  const band = equipmentBandForLevel(snapshot.progress.level);
  const bandMaxLevel = caveMaxLevelForBand(config.id, band);

  if (level >= config.maxLevel || level >= bandMaxLevel) {
    const complete = level >= config.maxLevel;
    return {
      buildingConfigId: config.id,
      displayName: config.displayName,
      level,
      maxed: true,
      complete,
      levelText: `Lv.${level}`,
      bonusText: bonusText(config, level),
      nextBonusText: complete
        ? "已达上限"
        : `需突破至${getEquipmentBandConfig((band + 1) as EquipmentBand).displayName}`,
      costText: "",
      materialText: "",
      materials: [],
      materialsSufficient: true,
      affordable: false,
      actionText: complete ? "已满级" : "段位已满",
    };
  }

  const cost = caveUpgradeCost(config.id, level);
  const materials = cost.materials.map((material) => {
    const owned =
      snapshot.inventory.stacks.find(
        (stack) => stack.itemConfigId === material.itemConfigId,
      )?.quantity ?? "0";
    return {
      displayName: getItemConfig(material.itemConfigId).displayName,
      required: material.quantity,
      owned,
      sufficient: decimal(owned).greaterThanOrEqualTo(material.quantity),
    };
  });
  const materialsSufficient = materials.every((material) => material.sufficient);
  const stonesSufficient = decimal(snapshot.wallet.spiritStone)
    .greaterThanOrEqualTo(cost.spiritStone);

  return {
    buildingConfigId: config.id,
    displayName: config.displayName,
    level,
    maxed: false,
    complete: false,
    levelText: level === 0 ? "未建造" : `Lv.${level}`,
    bonusText: bonusText(config, level),
    nextBonusText: `下一级 ${bonusText(config, level + 1)}`,
    costText: `${formatLargeNumber(String(cost.spiritStone))} 灵石`,
    materialText: materials
      .map((material) => `${material.displayName} ${material.owned}/${material.required}`)
      .join("  "),
    materials,
    materialsSufficient,
    affordable: stonesSufficient && materialsSufficient,
    actionText: level === 0 ? "建造" : "升级",
  };
}

export function getCaveSummary(snapshot: BootstrapSnapshot): string {
  const built = snapshot.cave.buildings.filter((item) => item.level > 0).length;
  const bonuses = calculateCaveBonuses(snapshot.cave.buildings);
  return `已建成 ${built} / ${CAVE_BUILDING_CONFIGS.length} 座　修为 +${
    bonuses.experienceBonusBp / 100
  }%`;
}
