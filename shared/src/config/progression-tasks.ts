/**
 * The opening three ids keep their `newcomer.` prefix even though the chain now
 * runs to Lv.1000. Renaming them would force the migration to rewrite existing
 * task records, and a slip there would drop the Lv.8 claim mark and re-grant a
 * breakthrough pill. Preserving claim history is worth the mixed prefix.
 */
export const NEWCOMER_REACH_LEVEL_3_TASK_ID = "newcomer.reach_level_3";
export const NEWCOMER_REACH_LEVEL_5_TASK_ID = "newcomer.reach_level_5";
export const NEWCOMER_REACH_LEVEL_8_TASK_ID = "newcomer.reach_level_8";

export type ProgressionTaskCondition =
  | { readonly kind: "level"; readonly level: number }
  | { readonly kind: "trial_tower_floor"; readonly floor: number };

export interface ProgressionTaskRewardItem {
  readonly itemConfigId: string;
  readonly quantity: number;
}

export interface ProgressionTaskReward {
  readonly spiritStone: number;
  readonly items: readonly ProgressionTaskRewardItem[];
}

export interface ProgressionTaskConfig {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly condition: ProgressionTaskCondition;
  /** `null` means the task is a pure milestone marker with nothing to grant. */
  readonly reward: ProgressionTaskReward | null;
}

/**
 * Milestones rather than a dense ladder: dense early where levels arrive in
 * minutes, sparse past Lv.30 where each level is hours. Past Lv.100 every
 * realm's perfect level is a milestone, and the gap keeps the ~1.2-1.5x
 * cumulative-hour ratio the existing tail already settled into.
 */
const LEVEL_TASK_LEVELS = [
  12, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 180, 220, 250, 300,
  350, 400, 500, 600, 700, 800, 900, 1000,
] as const;

/**
 * Pushes the player at the tower rather than tracking it floor by floor, and
 * carries the level each floor first becomes reachable at, which is what the
 * whole chain sorts by.
 *
 * Bare power clears floors 1..70 at these levels. Floors 80 and 90 are out of
 * reach bare at any level (Lv.1000 bare is 1e9, floor 80 asks 1.43e9), so they
 * carry the level a full loadout (+717.74%) clears them at instead — the top of
 * the tower is open to gear, not to time. Spacing is every 10 rather than every
 * 5 past floor 30: at 5 the tower would own nearly half the chain, and pairs
 * like 50/55 or 60/65 land on the same level because the x1.18 threshold step
 * stays inside one realm's power multiplier.
 *
 * `test/progression-task-chain.test.ts` re-derives every level here from
 * `calculateTotalPower` and `trialFloorRequiredPower`, so a power change cannot
 * leave this table quietly stale.
 */
const TOWER_TASK_FLOORS = [
  { floor: 1, achievableAtLevel: 15 },
  { floor: 5, achievableAtLevel: 30 },
  { floor: 10, achievableAtLevel: 31 },
  { floor: 15, achievableAtLevel: 61 },
  { floor: 20, achievableAtLevel: 70 },
  { floor: 25, achievableAtLevel: 101 },
  { floor: 30, achievableAtLevel: 122 },
  { floor: 40, achievableAtLevel: 191 },
  { floor: 50, achievableAtLevel: 301 },
  { floor: 60, achievableAtLevel: 401 },
  { floor: 70, achievableAtLevel: 501 },
  { floor: 80, achievableAtLevel: 501 },
  { floor: 90, achievableAtLevel: 917 },
] as const;

export const TRIAL_TOWER_TASK_ACHIEVABLE_LEVELS: Readonly<
  Record<number, number>
> = Object.fromEntries(
  TOWER_TASK_FLOORS.map((entry) => [entry.floor, entry.achievableAtLevel]),
);

const TOWER_BREAKTHROUGH_PILL_FROM_FLOOR = 15;
/**
 * Floor 70's earliest achiever is Lv.501, already in 真仙期, whose
 * `breakthroughPillCost` is `null` — a pill there is dead weight. Floor 60's
 * Lv.401 still owes 500 pills for the Lv.500 breakthrough, so it keeps its.
 */
const TOWER_BREAKTHROUGH_PILL_TO_FLOOR = 60;
/** One large pill at floor 30, then one more per ten floors above it. */
const TOWER_EXP_PILL_BASE_FLOOR = 30;
const TOWER_EXP_PILL_FLOORS_PER_EXTRA = 10;
const LEVEL_TASK_SPIRIT_STONE_PER_LEVEL = 500;
const LEVEL_TASK_ENHANCE_STONE_PER_TEN_LEVELS = 10;

const OPENING_TASKS: readonly ProgressionTaskConfig[] = [
  {
    id: NEWCOMER_REACH_LEVEL_3_TASK_ID,
    title: "修炼至 Lv.3",
    description: "提升等级至 Lv.3",
    condition: { kind: "level", level: 3 },
    reward: null,
  },
  {
    id: NEWCOMER_REACH_LEVEL_5_TASK_ID,
    title: "修炼至 Lv.5",
    description: "提升等级至 Lv.5",
    condition: { kind: "level", level: 5 },
    reward: null,
  },
  {
    id: NEWCOMER_REACH_LEVEL_8_TASK_ID,
    title: "修炼至 Lv.8",
    description: "提升等级至 Lv.8，自动获得首次突破所需的突破丹",
    condition: { kind: "level", level: 8 },
    reward: {
      spiritStone: 0,
      items: [{ itemConfigId: "breakthrough_pill", quantity: 1 }],
    },
  },
];

const LEVEL_TASKS: readonly ProgressionTaskConfig[] = LEVEL_TASK_LEVELS.map(
  (level) => ({
    id: `progression.reach_level_${level}`,
    title: `修炼至 Lv.${level}`,
    description: `提升等级至 Lv.${level}`,
    condition: { kind: "level", level },
    reward: {
      spiritStone: level * LEVEL_TASK_SPIRIT_STONE_PER_LEVEL,
      items: [
        {
          itemConfigId: "enhance_stone",
          quantity: Math.ceil(level / LEVEL_TASK_ENHANCE_STONE_PER_TEN_LEVELS),
        },
      ],
    },
  }),
);

const TOWER_TASKS: readonly ProgressionTaskConfig[] = TOWER_TASK_FLOORS.map(
  ({ floor }) => ({
    id: `progression.trial_tower_floor_${floor}`,
    title: `登临试炼塔第 ${floor} 层`,
    description: `在试炼塔中通过第 ${floor} 层`,
    condition: { kind: "trial_tower_floor", floor },
    reward: {
      spiritStone: 0,
      items: towerRewardItems(floor),
    },
  }),
);

function towerRewardItems(floor: number): readonly ProgressionTaskRewardItem[] {
  const items: ProgressionTaskRewardItem[] = [
    {
      itemConfigId: "exp_pill_large",
      quantity:
        1 +
        Math.max(
          0,
          Math.floor(
            (floor - TOWER_EXP_PILL_BASE_FLOOR) / TOWER_EXP_PILL_FLOORS_PER_EXTRA,
          ),
        ),
    },
  ];
  if (
    floor >= TOWER_BREAKTHROUGH_PILL_FROM_FLOOR &&
    floor <= TOWER_BREAKTHROUGH_PILL_TO_FLOOR
  ) {
    items.push({ itemConfigId: "breakthrough_pill", quantity: 1 });
  }
  return items;
}

/**
 * The chain reads in the order milestones become achievable, so level and tower
 * rows alternate and the "idle to a level, then go climb" rhythm survives past
 * the early game. A level task sorts on its own level, a tower task on the
 * level its floor first becomes reachable at. Ties keep levels ahead of floors
 * and floors in floor order, and the opening three stay a hard prefix.
 *
 * Reordering is safe for existing saves: `isProgressionTaskList` checks the
 * count, the id set, and each field's shape, never a position, and
 * `padProgressionTasks` rebuilds the stored list in this order while carrying
 * claim marks along by id.
 */
const MILESTONE_TASKS: readonly ProgressionTaskConfig[] = [
  ...LEVEL_TASKS.map((config, index) => ({
    config,
    achievableAtLevel: LEVEL_TASK_LEVELS[index]!,
    towerRank: -1,
  })),
  ...TOWER_TASKS.map((config, index) => ({
    config,
    achievableAtLevel: TOWER_TASK_FLOORS[index]!.achievableAtLevel,
    towerRank: index,
  })),
]
  .sort(
    (left, right) =>
      left.achievableAtLevel - right.achievableAtLevel ||
      left.towerRank - right.towerRank,
  )
  .map((entry) => entry.config);

export const PROGRESSION_TASK_CONFIGS: readonly ProgressionTaskConfig[] = [
  ...OPENING_TASKS,
  ...MILESTONE_TASKS,
];

export function getProgressionTaskConfig(
  id: string,
): ProgressionTaskConfig | undefined {
  return PROGRESSION_TASK_CONFIGS.find((config) => config.id === id);
}

/** The condition's own target, used for both progress display and completion. */
export function progressionTaskTarget(config: ProgressionTaskConfig): number {
  return config.condition.kind === "level"
    ? config.condition.level
    : config.condition.floor;
}
