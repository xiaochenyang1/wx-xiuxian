export const NEWCOMER_REACH_LEVEL_3_TASK_ID = "newcomer.reach_level_3";
export const NEWCOMER_REACH_LEVEL_5_TASK_ID = "newcomer.reach_level_5";
export const NEWCOMER_REACH_LEVEL_8_TASK_ID = "newcomer.reach_level_8";

export type NewcomerTaskId =
  | typeof NEWCOMER_REACH_LEVEL_3_TASK_ID
  | typeof NEWCOMER_REACH_LEVEL_5_TASK_ID
  | typeof NEWCOMER_REACH_LEVEL_8_TASK_ID;

export interface NewcomerTaskConfig {
  readonly id: NewcomerTaskId;
  readonly title: string;
  readonly description: string;
  readonly targetLevel: number;
  readonly rewardLabel: string | null;
}

export const NEWCOMER_TASK_CONFIGS: readonly NewcomerTaskConfig[] = [
  {
    id: NEWCOMER_REACH_LEVEL_3_TASK_ID,
    title: "修炼至 Lv.3",
    description: "提升等级至 Lv.3",
    targetLevel: 3,
    rewardLabel: null,
  },
  {
    id: NEWCOMER_REACH_LEVEL_5_TASK_ID,
    title: "修炼至 Lv.5",
    description: "提升等级至 Lv.5",
    targetLevel: 5,
    rewardLabel: null,
  },
  {
    id: NEWCOMER_REACH_LEVEL_8_TASK_ID,
    title: "修炼至 Lv.8",
    description: "提升等级至 Lv.8，自动获得首次突破所需的突破丹",
    targetLevel: 8,
    rewardLabel: "突破丹 ×1",
  },
];

export function getNewcomerTaskConfig(
  id: string,
): NewcomerTaskConfig | undefined {
  return NEWCOMER_TASK_CONFIGS.find((config) => config.id === id);
}
