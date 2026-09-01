import type { EquipmentBand } from "./assets";

/** One settled payout: what a single hunt actually hands the player. */
export type TreasureHuntReward =
  | {
      readonly kind: "spirit_stone";
      readonly amount: number;
    }
  | {
      readonly kind: "random_material";
      readonly quantity: number;
    }
  | {
      readonly kind: "item";
      readonly itemConfigId: string;
      readonly quantity: number;
    };

/**
 * One row of the table: the weight, plus the quantity each band pays.
 *
 * The quantity is written out per band instead of multiplied by one band table
 * the way every other system on this chain does it, because the three axes a
 * hunt pays out on grow at three different rates between the reference sweep
 * stages — 灵石 ×417, materials ×52, 强化石 ×33 from 凡阶 to 天阶. One
 * multiplier can track one of them and leaves the other two behind.
 *
 * The weight appears once and is shared by all four bands, which is what makes
 * it structurally impossible for the hit rates to drift band to band.
 */
export type TreasureHuntRewardRow =
  | {
      readonly kind: "spirit_stone";
      readonly quantityByBand: Readonly<Record<EquipmentBand, number>>;
      readonly weight: number;
    }
  | {
      readonly kind: "random_material";
      readonly quantityByBand: Readonly<Record<EquipmentBand, number>>;
      readonly weight: number;
    }
  | {
      readonly kind: "item";
      readonly itemConfigId: string;
      readonly quantityByBand: Readonly<Record<EquipmentBand, number>>;
      readonly weight: number;
    };

/**
 * Every row is anchored at half of what that band's best sweep row pays per
 * token — 关 6 / 8 / 10 / 12, the same band-to-stage mapping the enhance stone
 * income design used. Half, because a sweep is deterministic and pays only its
 * own stage's goods while a hunt is a lottery that covers all four axes plus two
 * items sweeps never drop; the player pays 50% of the expected value for that
 * breadth. Staying strictly under the sweep is also what keeps the supply
 * ceilings in the material and enhance stone designs valid without recomputing
 * them, since both already assumed every token went to the best sweep.
 *
 * The last three rows are flat across bands on purpose:
 * - 功法残页 funds a finite lifetime cost (`TECHNIQUE_PAGES_PER_DUPLICATE`
 *   times the duplicate ladder is 175 pages to take one book to ★10), the same
 *   judgement `IDLE_STACK_DROPS` already makes for its own page row.
 * - 大经验丹 settles at the level of the moment it is *used*, so one pill is
 *   always six hours of current idle gain — its value already follows the band.
 * - 改名卡 is cosmetic and has no quantity that could scale.
 */
export const TREASURE_HUNT_REWARD_ROWS: readonly TreasureHuntRewardRow[] = [
  {
    kind: "spirit_stone",
    quantityByBand: { 1: 3_600, 2: 24_000, 3: 180_000, 4: 1_500_000 },
    weight: 4_000,
  },
  {
    kind: "random_material",
    quantityByBand: { 1: 70, 2: 840, 3: 1_680, 4: 3_500 },
    weight: 3_000,
  },
  {
    kind: "item",
    itemConfigId: "technique_page",
    quantityByBand: { 1: 15, 2: 15, 3: 15, 4: 15 },
    weight: 1_500,
  },
  {
    kind: "item",
    itemConfigId: "enhance_stone",
    quantityByBand: { 1: 15, 2: 80, 3: 200, 4: 500 },
    weight: 1_000,
  },
  {
    kind: "item",
    itemConfigId: "exp_pill_large",
    quantityByBand: { 1: 1, 2: 1, 3: 1, 4: 1 },
    weight: 400,
  },
  {
    kind: "item",
    itemConfigId: "rename_card",
    quantityByBand: { 1: 1, 2: 1, 3: 1, 4: 1 },
    weight: 100,
  },
];

export const TREASURE_HUNT_TOTAL_WEIGHT = TREASURE_HUNT_REWARD_ROWS.reduce(
  (total, row) => total + row.weight,
  0,
);

function settleTreasureHuntRow(
  row: TreasureHuntRewardRow,
  band: EquipmentBand,
): TreasureHuntReward {
  const quantity = row.quantityByBand[band];
  if (!quantity) throw new RangeError(`Unknown equipment band: ${band}`);
  if (row.kind === "spirit_stone") return { kind: "spirit_stone", amount: quantity };
  if (row.kind === "random_material") return { kind: "random_material", quantity };
  return { kind: "item", itemConfigId: row.itemConfigId, quantity };
}

export function pickTreasureHuntReward(
  band: EquipmentBand,
  roll: number,
): TreasureHuntReward {
  if (!Number.isSafeInteger(roll) || roll < 0 || roll >= TREASURE_HUNT_TOTAL_WEIGHT) {
    throw new RangeError(`Treasure hunt roll out of range: ${roll}`);
  }
  let remaining = roll;
  for (const row of TREASURE_HUNT_REWARD_ROWS) {
    if (remaining < row.weight) return settleTreasureHuntRow(row, band);
    remaining -= row.weight;
  }
  throw new RangeError(`Treasure hunt roll out of range: ${roll}`);
}

/** The six payouts as `band` would receive them, for the panel to list. */
export function treasureHuntRewards(
  band: EquipmentBand,
): readonly TreasureHuntReward[] {
  return TREASURE_HUNT_REWARD_ROWS.map((row) => settleTreasureHuntRow(row, band));
}
