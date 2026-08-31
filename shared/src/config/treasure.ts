export type TreasureHuntReward =
  | {
      readonly kind: "spirit_stone";
      readonly amount: number;
      readonly weight: number;
    }
  | {
      readonly kind: "random_material";
      readonly quantity: number;
      readonly weight: number;
    }
  | {
      readonly kind: "item";
      readonly itemConfigId: string;
      readonly quantity: number;
      readonly weight: number;
    };

export const TREASURE_HUNT_REWARDS: readonly TreasureHuntReward[] = [
  { kind: "spirit_stone", amount: 1_500, weight: 4_000 },
  { kind: "random_material", quantity: 10, weight: 3_000 },
  { kind: "item", itemConfigId: "technique_page", quantity: 5, weight: 1_500 },
  { kind: "item", itemConfigId: "enhance_stone", quantity: 3, weight: 1_000 },
  { kind: "item", itemConfigId: "exp_pill_large", quantity: 1, weight: 400 },
  { kind: "item", itemConfigId: "rename_card", quantity: 1, weight: 100 },
];

export const TREASURE_HUNT_TOTAL_WEIGHT = TREASURE_HUNT_REWARDS.reduce(
  (total, reward) => total + reward.weight,
  0,
);

export function pickTreasureHuntReward(roll: number): TreasureHuntReward {
  if (!Number.isSafeInteger(roll) || roll < 0 || roll >= TREASURE_HUNT_TOTAL_WEIGHT) {
    throw new RangeError(`Treasure hunt roll out of range: ${roll}`);
  }
  let remaining = roll;
  for (const reward of TREASURE_HUNT_REWARDS) {
    if (remaining < reward.weight) return reward;
    remaining -= reward.weight;
  }
  throw new RangeError(`Treasure hunt roll out of range: ${roll}`);
}
