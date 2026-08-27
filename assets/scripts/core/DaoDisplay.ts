import {
  DAO_MAX_LEVEL,
  MAX_LEVEL,
  affordableDaoLevels,
  calculateDaoBonuses,
  daoLevelCost,
  decimal,
  type BootstrapSnapshot,
} from "@cultivation-diary/shared";
import { formatLargeNumber } from "./ClientNumber";

export interface DaoDisplay {
  /**
   * The whole block is hidden below the cap. `cultivationReserve` only accrues
   * at `version_cap`, so before then there is nothing to spend and nothing to
   * explain.
   */
  readonly visible: boolean;
  readonly titleText: string;
  readonly bonusText: string;
  readonly costText: string;
  readonly reserveText: string;
  readonly actionText: string;
  readonly batchActionText: string;
  readonly actionEnabled: boolean;
  readonly affordableLevels: number;
}

export function getDaoDisplay(snapshot: BootstrapSnapshot): DaoDisplay {
  const level = snapshot.dao.level;
  const reserve = snapshot.progress.cultivationReserve;
  const bonuses = calculateDaoBonuses({ level });
  const affordableLevels = affordableDaoLevels({ level, cultivationReserve: reserve });
  const full = level >= DAO_MAX_LEVEL;
  const nextCost = full ? null : daoLevelCost(level + 1);
  const shortfall =
    nextCost === null ? decimal(0) : decimal(nextCost).minus(reserve);

  return {
    visible: snapshot.progress.level >= MAX_LEVEL,
    titleText: `道行 Lv.${level}/${DAO_MAX_LEVEL}`,
    bonusText: `修为 +${percent(bonuses.experienceBonusBp)} · 灵石 +${percent(
      bonuses.spiritStoneBonusBp,
    )} · 掉落 +${percent(bonuses.dropBonusBp)}`,
    costText: full
      ? "道行已至圆满"
      : shortfall.isPositive()
        ? `下一级需 ${formatLargeNumber(nextCost!)}，还差 ${formatLargeNumber(
            shortfall.toFixed(0),
          )}`
        : `下一级需 ${formatLargeNumber(nextCost!)}`,
    reserveText: `修为储备 ${formatLargeNumber(reserve)}`,
    actionText: "悟道",
    batchActionText:
      affordableLevels > 1 ? `批量悟道 x${affordableLevels}` : "批量悟道",
    actionEnabled: affordableLevels > 0,
    affordableLevels,
  };
}

/** Basis points read as percentages everywhere else in the UI. */
function percent(bp: number): string {
  return `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;
}
