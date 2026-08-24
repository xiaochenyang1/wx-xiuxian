import {
  TRIAL_TOWER_MAX_FLOOR,
  TRIAL_TOWER_UNLOCK_LEVEL,
  evaluateTrialFloor,
  getItemConfig,
  isTrialTowerCleared,
  trialFloorRequiredPower,
  trialFloorRewards,
  type BootstrapSnapshot,
  type TrialFloorStatus,
} from "@cultivation-diary/shared";
import { formatLargeNumber } from "./ClientNumber";

/** Rows the tower panel has room for: the next floor plus the rungs above it. */
export const VISIBLE_TRIAL_FLOOR_COUNT = 5;

export interface TrialFloorDisplay {
  readonly floor: number;
  readonly status: TrialFloorStatus;
  readonly titleText: string;
  readonly requirementText: string;
  readonly rewardText: string;
  readonly statusText: string;
  readonly actionText: string;
  readonly actionEnabled: boolean;
}

export function getTrialTowerSummary(snapshot: BootstrapSnapshot): string {
  const highest = snapshot.trialTower.highestFloor;
  const climbed = `已登临 ${highest}/${TRIAL_TOWER_MAX_FLOOR} 层`;
  const power = `战力 ${formatLargeNumber(snapshot.progress.totalPower)}`;
  if (!snapshot.unlocks.trialTower) {
    return `${climbed} · ${power} · 需 Lv.${TRIAL_TOWER_UNLOCK_LEVEL} 开启`;
  }
  if (isTrialTowerCleared(highest)) return `${climbed} · ${power} · 全塔通关`;
  return `${climbed} · ${power} · 下一层第 ${highest + 1} 层`;
}

/**
 * The window starts at the next floor rather than the first, because 90 floors
 * never fit on a phone and the only rung a player can act on is the next one.
 * It slides back at the top of the tower so the last screen is still full.
 */
export function selectVisibleTrialFloors(
  highestFloor: number,
  count = VISIBLE_TRIAL_FLOOR_COUNT,
): readonly number[] {
  const start = Math.min(
    highestFloor + 1,
    Math.max(1, TRIAL_TOWER_MAX_FLOOR - count + 1),
  );
  const end = Math.min(TRIAL_TOWER_MAX_FLOOR, start + count - 1);
  const floors: number[] = [];
  for (let floor = start; floor <= end; floor += 1) floors.push(floor);
  return floors;
}

export function getTrialFloorDisplay(
  snapshot: BootstrapSnapshot,
  floor: number,
): TrialFloorDisplay {
  const evaluation = evaluateTrialFloor(
    snapshot.trialTower.highestFloor,
    floor,
    snapshot.progress.totalPower,
  );
  const unlocked = snapshot.unlocks.trialTower;
  const statusCopy: Record<
    TrialFloorStatus,
    Pick<TrialFloorDisplay, "statusText" | "actionText" | "actionEnabled">
  > = {
    cleared: { statusText: "已通过", actionText: "已通过", actionEnabled: false },
    locked: { statusText: "尚未开放", actionText: "未开放", actionEnabled: false },
    underpowered: {
      statusText: `尚差 ${formatLargeNumber(evaluation.powerDeficit)} 战力`,
      actionText: "挑战",
      actionEnabled: false,
    },
    ready: { statusText: "可以挑战", actionText: "挑战", actionEnabled: true },
  };
  return {
    floor,
    status: evaluation.status,
    titleText: `第 ${floor} 层`,
    requirementText: `战力 ${formatLargeNumber(trialFloorRequiredPower(floor))}`,
    rewardText: formatTrialFloorReward(floor),
    ...statusCopy[evaluation.status],
    ...(unlocked
      ? {}
      : {
          statusText: `需 Lv.${TRIAL_TOWER_UNLOCK_LEVEL}`,
          actionEnabled: false,
        }),
  };
}

function formatTrialFloorReward(floor: number): string {
  const rewards = trialFloorRewards(floor);
  const items = rewards.itemRewards
    .map(
      (reward) =>
        `${getItemConfig(reward.itemConfigId).displayName}x${reward.quantity}`,
    )
    .join(" · ");
  return `灵石 ${formatLargeNumber(rewards.spiritStone)} · ${items}`;
}
