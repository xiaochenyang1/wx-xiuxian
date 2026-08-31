import {
  CAVE_BUILDING_CONFIGS,
  calculateCaveBonuses,
  caveUpgradeCost,
  decimal,
  getItemConfig,
  type BootstrapSnapshot,
  type CaveBuildingConfig,
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
  readonly maxed: boolean;
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

export function getCaveBuildingDisplay(
  snapshot: BootstrapSnapshot,
  config: CaveBuildingConfig,
): CaveBuildingDisplay {
  const level =
    snapshot.cave.buildings.find((item) => item.buildingConfigId === config.id)
      ?.level ?? 0;

  if (level >= config.maxLevel) {
    return {
      buildingConfigId: config.id,
      displayName: config.displayName,
      level,
      maxed: true,
      levelText: `Lv.${level}`,
      bonusText: bonusText(config, level),
      nextBonusText: "已达上限",
      costText: "",
      materialText: "",
      materials: [],
      materialsSufficient: true,
      affordable: false,
      actionText: "已满级",
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
