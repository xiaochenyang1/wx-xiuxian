import type { AssetQuality, EquipmentBand } from "./assets";

/**
 * The idle drop table. One attempt is granted per minute of effective idle time
 * and every reward below is resolved from that single attempt.
 *
 * Every chance in this file is measured against `IDLE_DROP_ROLL_SPAN`, and the
 * draws happen in the order the table is read. Both facts are load-bearing: the
 * drop stream is seeded from the save, so reordering the table or spending an
 * extra draw changes what a given seed produces.
 */
export const IDLE_DROP_ROLL_SPAN = 1_000_000;

/** The five crafting materials, drawn uniformly. Order fixes the draw index. */
export const IDLE_MATERIAL_ITEM_IDS: readonly string[] = [
  "wood",
  "stone",
  "spiritual_soil",
  "spiritual_herb",
  "ore",
];

export interface IdleStackDrop {
  /**
   * Drawn uniformly when there is more than one. A single id must not spend a
   * draw, because there is nothing to choose.
   */
  readonly itemConfigIds: readonly string[];
  readonly minQuantity: number;
  readonly maxQuantity: number;
  readonly weight: number;
  /**
   * Whether the rolled quantity is multiplied by the holder's band. Declared on
   * the row rather than inferred from the ids so the table states which rewards
   * scale: only the materials do. Pages fund a finite lifetime cost and tokens
   * gate the sweep tables, so both stay flat on purpose.
   */
  readonly scalesWithBand: boolean;
}

/**
 * At most one stack reward per attempt, decided by a single draw over the whole
 * span: the three entries are mutually exclusive and the unweighted remainder
 * (644,000 of 1,000,000) is the attempt paying out no stack at all.
 */
export const IDLE_STACK_DROPS: readonly IdleStackDrop[] = [
  {
    itemConfigIds: IDLE_MATERIAL_ITEM_IDS,
    minQuantity: 1,
    maxQuantity: 3,
    weight: 350_000,
    scalesWithBand: true,
  },
  {
    itemConfigIds: ["technique_page"],
    minQuantity: 1,
    maxQuantity: 1,
    weight: 5_000,
    scalesWithBand: false,
  },
  {
    itemConfigIds: ["treasure_token"],
    minQuantity: 1,
    maxQuantity: 1,
    weight: 1_000,
    scalesWithBand: false,
  },
];

/**
 * How much a band multiplies a material drop's quantity. Materials are the one
 * income in the game that never grew with progress, while every level of a
 * band's demand did: 977 breakthrough pills cost 19,540 spiritual herb, and a
 * full 洪荒 loadout costs 2,250 crafts on top. At the flat rate the 灵阶 bill
 * (2,150 herb) needs 256 hours inside a band the player clears in 206 — and
 * experience bonuses only shorten the band, never the bill, so optimising for
 * levels was what made the wall arrive sooner.
 *
 * The curve decelerates (×3, ×2, ×1.67) on purpose: materials are the mid-game
 * pacing axis, and the late game hands pacing back to cultivation time. It also
 * stays below crafting's ×30 spirit stone so materials remain the scarce side.
 *
 * Band 1 is exactly 1, which is what keeps early-game pacing and every seeded
 * drop test byte-identical.
 */
export const IDLE_MATERIAL_BAND_MULTIPLIER: Readonly<
  Record<EquipmentBand, number>
> = {
  1: 1,
  2: 3,
  3: 6,
  4: 10,
};

/**
 * Applied to the quantity *after* it is drawn. Never fold this into
 * `minQuantity` / `maxQuantity`: that widens the draw and a seeded stream turns
 * a different draw width into a different day's loot.
 */
export function idleStackDropBandMultiplier(
  drop: IdleStackDrop,
  band: EquipmentBand,
): number {
  if (!drop.scalesWithBand) return 1;
  const multiplier = IDLE_MATERIAL_BAND_MULTIPLIER[band];
  if (!multiplier) throw new RangeError(`Unknown equipment band: ${band}`);
  return multiplier;
}

/** `null` when the draw fell in the span's unweighted remainder. */
export function pickIdleStackDrop(roll: number): IdleStackDrop | null {
  if (!Number.isSafeInteger(roll) || roll < 0 || roll >= IDLE_DROP_ROLL_SPAN) {
    throw new RangeError(`Idle stack drop roll out of range: ${roll}`);
  }
  let remaining = roll;
  for (const drop of IDLE_STACK_DROPS) {
    if (remaining < drop.weight) return drop;
    remaining -= drop.weight;
  }
  return null;
}

/**
 * How wide a draw the quantity needs. `1` means the quantity is fixed and the
 * caller must not draw at all, for the same reason a single id must not: an
 * unnecessary draw shifts every later reward of the same seed.
 */
export function idleStackDropQuantitySpan(drop: IdleStackDrop): number {
  return drop.maxQuantity - drop.minQuantity + 1;
}

export interface IdleItemDrop {
  readonly itemConfigId: string;
  readonly quantity: number;
  /** Out of `IDLE_DROP_ROLL_SPAN`, drawn independently of every other entry. */
  readonly chance: number;
}

/** Independent of the stack table and of each other: an attempt can pay both. */
export const IDLE_ITEM_DROPS: readonly IdleItemDrop[] = [
  { itemConfigId: "enhance_stone", quantity: 1, chance: 10_000 },
  { itemConfigId: "breakthrough_pill", quantity: 1, chance: 500 },
];

/**
 * Which band an equipment drop comes from and the quality it rolls are decided
 * by the band tables in `assets.ts`; this is only how often the roll happens,
 * and it deliberately does not move with the band.
 */
export const IDLE_EQUIPMENT_DROP_CHANCE = 4_000;

export const IDLE_TECHNIQUE_DROP_CHANCE = 1_200;

/** Techniques have no bands, so their drop quality is one fixed split. */
export const IDLE_TECHNIQUE_DROP_QUALITY_WEIGHTS: readonly {
  readonly quality: AssetQuality;
  readonly weight: number;
}[] = [
  { quality: "common", weight: 8_000 },
  { quality: "uncommon", weight: 2_000 },
];

/** What one unit of a stack reward is worth when the bag cannot hold it. */
export const IDLE_STACK_OVERFLOW_SPIRIT_STONE_VALUE = 100;

/**
 * How many uncollected candidates the harvest chest holds. Past it every new
 * candidate is salvaged on arrival regardless of quality or settings, which is
 * what stops an unattended save from growing without bound.
 */
export const HARVEST_CHEST_CAPACITY = 100;
