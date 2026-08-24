/**
 * The opening three ids keep their `newcomer.` prefix even though the chain now
 * runs to Lv.100. Renaming them would force the migration to rewrite existing
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
 * minutes, sparse past Lv.30 where each level is hours.
 */
const LEVEL_TASK_LEVELS = [
  12, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100,
] as const;

/** Pushes the player at the tower rather than tracking it floor by floor. */
const TOWER_TASK_FLOORS = [1, 5, 10, 15, 20, 25, 30] as const;

const TOWER_BREAKTHROUGH_PILL_FROM_FLOOR = 15;
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
  (floor) => ({
    id: `progression.trial_tower_floor_${floor}`,
    title: `登临试炼塔第 ${floor} 层`,
    description: `在试炼塔中通过第 ${floor} 层`,
    condition: { kind: "trial_tower_floor", floor },
    reward: {
      spiritStone: 0,
      items:
        floor >= TOWER_BREAKTHROUGH_PILL_FROM_FLOOR
          ? [
              { itemConfigId: "exp_pill_large", quantity: 1 },
              { itemConfigId: "breakthrough_pill", quantity: 1 },
            ]
          : [{ itemConfigId: "exp_pill_large", quantity: 1 }],
    },
  }),
);

export const PROGRESSION_TASK_CONFIGS: readonly ProgressionTaskConfig[] = [
  ...OPENING_TASKS,
  ...LEVEL_TASKS,
  ...TOWER_TASKS,
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
