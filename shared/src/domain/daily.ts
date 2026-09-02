import {
  DAILY_TASK_CONFIGS,
  getDailyTaskConfig,
  type DailyTaskConfig,
  type DailyTaskKind,
} from "../config/daily";
import type { BigNumberString } from "../types";

export interface DailyTaskState {
  taskConfigId: string;
  /** Counted in the task's own unit: seconds for idle, items or brews for the rest. */
  progress: BigNumberString;
  claimedAt: string | null;
}

export interface DailyState {
  /**
   * Which local calendar day `tasks` and `checkedInAt` belong to. `-1` means the
   * save has never been rolled, which is what migrated saves carry: every real
   * index is larger, so the first settlement after a migration resets the block
   * without the migration needing to know today's date.
   */
  dayIndex: number;
  checkedInAt: string | null;
  /** Total days ever checked in. Display only — it changes no payout (§3.4). */
  checkInCount: number;
  tasks: DailyTaskState[];
}

export const NEVER_ROLLED_DAY_INDEX = -1;

export function createDailyState(dayIndex: number): DailyState {
  return {
    dayIndex,
    checkedInAt: null,
    checkInCount: 0,
    tasks: createDailyTaskStates(),
  };
}

/**
 * The day's progress, reset if `dayIndex` has moved on.
 *
 * Returns the same object when the day has not changed, so callers can use it on
 * every settlement — which is what `settleTo` does — without allocating.
 * `checkInCount` survives a reset because it is the one number meant to
 * accumulate; everything else is what "today" means.
 */
export function rollDailyState(state: DailyState, dayIndex: number): DailyState {
  if (state.dayIndex === dayIndex) return state;
  return {
    dayIndex,
    checkedInAt: null,
    checkInCount: state.checkInCount,
    tasks: createDailyTaskStates(),
  };
}

export function isDailyTaskComplete(
  config: DailyTaskConfig,
  progress: BigNumberString,
): boolean {
  return dailyProgressNumber(progress) >= config.target;
}

/** Complete, and not yet turned into jade. */
export function isDailyTaskClaimable(state: DailyTaskState): boolean {
  if (state.claimedAt !== null) return false;
  return isDailyTaskComplete(
    getDailyTaskConfig(state.taskConfigId),
    state.progress,
  );
}

/**
 * What the rail badge shows: the check-in counts as one until it is done, plus
 * every task sitting complete and unclaimed. Zero means nothing is waiting.
 */
export function countPendingDailyRewards(state: DailyState): number {
  const checkIn = state.checkedInAt === null ? 1 : 0;
  return checkIn + state.tasks.filter(isDailyTaskClaimable).length;
}

/**
 * Adds `amount` to every task counting `kind`. Both idle rows share one kind, so
 * one call advances both thresholds at once and they can never disagree.
 */
export function addDailyProgress(
  state: DailyState,
  kind: DailyTaskKind,
  amount: number,
): DailyState {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RangeError(`Daily progress amount must be a whole number: ${amount}`);
  }
  if (amount === 0) return state;
  let changed = false;
  const tasks = state.tasks.map((task) => {
    const config = getDailyTaskConfig(task.taskConfigId);
    if (config.kind !== kind) return task;
    const current = dailyProgressNumber(task.progress);
    // Clamped at the target: the panel prints `progress / target` and a counter
    // that runs to 86,400 against a target of 3,600 reads as broken.
    const next = Math.min(current + amount, config.target);
    if (next === current) return task;
    changed = true;
    return { ...task, progress: String(next) };
  });
  return changed ? { ...state, tasks } : state;
}

/**
 * The task states for one day, in config order, dropping unknown ids and adding
 * missing ones. A save written before a task existed therefore gains it at the
 * next roll rather than being rejected.
 */
export function createDailyTaskStates(): DailyTaskState[] {
  return DAILY_TASK_CONFIGS.map((config) => ({
    taskConfigId: config.id,
    progress: "0",
    claimedAt: null,
  }));
}

function dailyProgressNumber(progress: BigNumberString): number {
  const parsed = Number(progress);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}
