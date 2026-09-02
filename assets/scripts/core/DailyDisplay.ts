import {
  DAILY_CHECK_IN_JADE,
  DAILY_LOOP_UNLOCK_LEVEL,
  IMMORTAL_JADE_MINUTES_PER_UNIT,
  decimal,
  getDailyTaskConfig,
  getItemConfig,
  isDailyTaskClaimable,
  type BootstrapSnapshot,
  type DailyTaskConfig,
  type DailyTaskState,
  type ImmortalJadeShopRow,
} from "@cultivation-diary/shared";
import { formatLargeNumber } from "./ClientNumber";

export interface DailyCheckInDisplay {
  readonly headerText: string;
  readonly description: string;
  readonly buttonText: string;
  readonly canCheckIn: boolean;
  readonly lockedText: string | null;
}

export interface DailyTaskDisplay {
  readonly title: string;
  readonly description: string;
  readonly progressText: string;
  readonly rewardText: string;
  readonly statusText: string;
  readonly buttonText: string;
  readonly canClaim: boolean;
}

export interface ImmortalJadeShopDisplay {
  readonly title: string;
  readonly description: string;
  readonly priceText: string;
  readonly buttonText: string;
  readonly canExchange: boolean;
}

/**
 * The panel header plus the check-in row, which are one unit of copy: both read
 * the wallet and the day's stamp, and neither means anything without the other.
 */
export function getDailyCheckInDisplay(
  snapshot: BootstrapSnapshot,
): DailyCheckInDisplay {
  const checkedIn = snapshot.daily.checkedInAt !== null;
  const locked = snapshot.progress.level < DAILY_LOOP_UNLOCK_LEVEL;
  return {
    headerText: `仙玉 ${formatLargeNumber(snapshot.wallet.immortalJade)} · 累计签到 ${snapshot.daily.checkInCount} 天`,
    description: checkedIn ? "今日已签到" : "每日首次登录即可领取",
    buttonText: checkedIn ? "今日已签到" : `签到 ${DAILY_CHECK_IN_JADE}`,
    canCheckIn: !checkedIn && !locked,
    lockedText: locked ? `修为达到 Lv.${DAILY_LOOP_UNLOCK_LEVEL} 才能开启日常` : null,
  };
}

/**
 * Seconds are printed as whole minutes: a target of 21,600 tells the player
 * nothing, and the row it sits in is one line tall.
 */
export function getDailyTaskDisplay(state: DailyTaskState): DailyTaskDisplay {
  const config = getDailyTaskConfig(state.taskConfigId);
  const claimed = state.claimedAt !== null;
  const canClaim = isDailyTaskClaimable(state);
  const complete = claimed || canClaim;
  return {
    title: config.title,
    description: config.description,
    progressText: progressText(config, state.progress),
    rewardText: `仙玉 ${config.jade}`,
    statusText: claimed ? "已领取" : canClaim ? "可领取" : "进行中",
    buttonText: claimed ? "已领取" : complete ? "领取" : "未完成",
    canClaim,
  };
}

export function getImmortalJadeShopDisplay(
  snapshot: BootstrapSnapshot,
  row: ImmortalJadeShopRow,
): ImmortalJadeShopDisplay {
  const item = getItemConfig(row.itemConfigId);
  const held = decimal(snapshot.wallet.immortalJade);
  const affordable = !held.lessThan(row.jadeCost);
  return {
    title: `${item.displayName} x${row.quantity}`,
    description: exchangeDescription(row),
    priceText: `仙玉 ${row.jadeCost}`,
    buttonText: affordable
      ? "兑换"
      : `还需 ${decimal(row.jadeCost).minus(held).toFixed(0)} 枚`,
    canExchange:
      affordable && snapshot.progress.level >= DAILY_LOOP_UNLOCK_LEVEL,
  };
}

/**
 * What the price buys, said in the unit the price was derived from: the two
 * pills are minutes of full-efficiency cultivation, and 改名卡 is the one row
 * outside that budget so it has to explain itself differently.
 */
function exchangeDescription(row: ImmortalJadeShopRow): string {
  if (!row.countsTowardTimeBudget) return "判据之外的出口，不折算时长";
  const minutes = row.jadeCost * IMMORTAL_JADE_MINUTES_PER_UNIT;
  return `折算满效率修炼 ${minutes} 分钟`;
}

function progressText(
  config: DailyTaskConfig,
  progress: DailyTaskState["progress"],
): string {
  if (config.unit === "count") {
    return `进度 ${progress} / ${config.target}`;
  }
  const minutes = Math.floor(Number(progress) / 60);
  return `进度 ${minutes} / ${Math.floor(config.target / 60)} 分`;
}
