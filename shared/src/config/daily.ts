/**
 * The daily loop: the one layer in this version that resets on a calendar day.
 *
 * Everything else in the game is "do it until you run out of resources", which
 * is why nothing used to reward coming back today rather than idling for a week.
 * The budget here is not a new number — it is the 30% that `offlineEfficiencyBp`
 * and `maxOfflineSeconds` already throw away every day, handed back on the one
 * axis that adds no items to the economy. See the design doc §3.1 and §3.2.
 */

/**
 * Aligned with `TRIAL_TOWER_UNLOCK_LEVEL`, not because the loop uses the tower
 * (it deliberately cannot — see the design doc §3.5) but because Lv.15 is the
 * first level where alchemy, crafting and the cave are all open. Earlier than
 * that the panel would list rows the player cannot act on.
 */
export const DAILY_LOOP_UNLOCK_LEVEL = 15;

/**
 * The exchange rate the whole design hangs off: one jade is six minutes of
 * full-efficiency online time. Every price in `IMMORTAL_JADE_SHOP_ROWS` and the
 * daily total below are derived from it, and `test/daily-loop.test.ts` re-derives
 * both ends from `CLIENT_CONFIG` so the budget cannot drift upward by hand.
 */
export const IMMORTAL_JADE_MINUTES_PER_UNIT = 6;

/** Opening the panel and tapping once, with no other action required. */
export const DAILY_CHECK_IN_JADE = 12;
/** Every task pays the same: six equal sixths of one day's 72. */
export const DAILY_TASK_JADE = 12;

/** How a task's `target` and `progress` read. `second` is printed as minutes. */
export type DailyTaskUnit = "second" | "count";

/**
 * What a task counts. Two tasks share `idle_seconds` on purpose: they read one
 * counter at two thresholds, so "6 hours" completing while "1 hour" has not is
 * not a state that can exist.
 */
export type DailyTaskKind =
  | "idle_seconds"
  | "alchemy_brew"
  | "crafting_forge"
  | "harvest_handled";

export interface DailyTaskConfig {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: DailyTaskKind;
  readonly target: number;
  readonly unit: DailyTaskUnit;
  readonly jade: number;
}

/**
 * Five rows, every one of them completable on every day of the game's life.
 * That constraint is what keeps §3.1 an equation rather than an upper bound, and
 * it rules out most of the game: the tower refuses a cleared or an out-of-reach
 * floor, a sweep would eat a 1.44/day token, enhancing has no cost ceiling, and
 * the three capped systems run out of levels inside a band.
 */
export const DAILY_TASK_CONFIGS: readonly DailyTaskConfig[] = [
  {
    id: "daily.idle_hour",
    title: "今日挂机 1 小时",
    description: "今日累计结算修炼时长满 1 小时",
    kind: "idle_seconds",
    target: 60 * 60,
    unit: "second",
    jade: DAILY_TASK_JADE,
  },
  {
    id: "daily.idle_six_hours",
    title: "今日挂机 6 小时",
    description: "今日累计结算修炼时长满 6 小时",
    kind: "idle_seconds",
    target: 6 * 60 * 60,
    unit: "second",
    jade: DAILY_TASK_JADE,
  },
  {
    id: "daily.alchemy",
    title: "开炉炼丹",
    description: "今日炼制丹药 1 次",
    kind: "alchemy_brew",
    target: 1,
    unit: "count",
    jade: DAILY_TASK_JADE,
  },
  {
    id: "daily.crafting",
    title: "开炉炼器",
    description: "今日炼制法宝 1 次",
    kind: "crafting_forge",
    target: 1,
    unit: "count",
    jade: DAILY_TASK_JADE,
  },
  {
    id: "daily.harvest",
    title: "打理收获",
    description: "今日处理收获 1 件（入库或分解）",
    kind: "harvest_handled",
    target: 1,
    unit: "count",
    jade: DAILY_TASK_JADE,
  },
];

/** Summed, never written down: the check-in plus every task's own payout. */
export const DAILY_IMMORTAL_JADE_TOTAL = DAILY_TASK_CONFIGS.reduce(
  (total, task) => total + task.jade,
  DAILY_CHECK_IN_JADE,
);

export function getDailyTaskConfig(id: string): DailyTaskConfig {
  const config = DAILY_TASK_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown daily task: ${id}`);
  return config;
}

export interface ImmortalJadeShopRow {
  readonly id: string;
  readonly itemConfigId: string;
  readonly quantity: number;
  readonly jadeCost: number;
  /**
   * Whether this row is part of §3.1's time budget. Only 改名卡 is not: it is
   * the second sink jade needs, and the one thing in the game that touches
   * neither a supply table nor power.
   */
  readonly countsTowardTimeBudget: boolean;
}

/**
 * The two pill prices are `durationSeconds / 60 / IMMORTAL_JADE_MINUTES_PER_UNIT`
 * — written out rather than computed so a price is readable where it is charged,
 * and re-derived in the test so a change to either pill's duration fails loudly.
 */
export const IMMORTAL_JADE_SHOP_ROWS: readonly ImmortalJadeShopRow[] = [
  {
    id: "jade.exp_pill_small",
    itemConfigId: "exp_pill_small",
    quantity: 1,
    jadeCost: 10,
    countsTowardTimeBudget: true,
  },
  {
    id: "jade.exp_pill_large",
    itemConfigId: "exp_pill_large",
    quantity: 1,
    jadeCost: 60,
    countsTowardTimeBudget: true,
  },
  {
    id: "jade.rename_card",
    itemConfigId: "rename_card",
    quantity: 1,
    jadeCost: 300,
    countsTowardTimeBudget: false,
  },
];

export function getImmortalJadeShopRow(id: string): ImmortalJadeShopRow {
  const row = IMMORTAL_JADE_SHOP_ROWS.find((candidate) => candidate.id === id);
  if (!row) throw new RangeError(`Unknown immortal jade shop row: ${id}`);
  return row;
}

/** What `minutes` of simulated online time costs, at the rate above. */
export function immortalJadeCostForMinutes(minutes: number): number {
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new RangeError(`Minutes must be a positive integer: ${minutes}`);
  }
  return minutes / IMMORTAL_JADE_MINUTES_PER_UNIT;
}

/**
 * The calendar day `at` falls on, in the player's own timezone, as an integer.
 *
 * Local rather than UTC because "today" means the player's midnight; an index
 * rather than a date string because the only question ever asked of it is
 * whether it changed, which is one integer compare.
 */
export function localDayIndex(at: Date): number {
  const milliseconds = at.getTime();
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError("Cannot take the local day index of an invalid date");
  }
  return Math.floor(
    (milliseconds - at.getTimezoneOffset() * 60_000) / 86_400_000,
  );
}
