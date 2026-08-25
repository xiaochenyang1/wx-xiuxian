import { assertValidLevel } from "./realms";

export type AssetQuality =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic"
  | "primordial";

export type ItemCategory =
  | "consumable"
  | "material"
  | "token"
  | "special";

export interface SimulatedOnlineExperienceEffect {
  type: "simulated_online_experience";
  durationSeconds: number;
}

export type ItemUseEffect = SimulatedOnlineExperienceEffect;

export type TechniqueSlot = "mind" | "movement" | "divine" | "secret";

export type EquipmentSlot =
  | "weapon"
  | "armor"
  | "accessory"
  | "mount"
  | "pet";

export type EquippedEquipmentSlot =
  | "weapon"
  | "armor"
  | "accessory_left"
  | "accessory_right"
  | "mount"
  | "pet";

export interface ItemConfig {
  id: string;
  displayName: string;
  category: ItemCategory;
  useEffect?: ItemUseEffect;
}

export interface TechniqueConfig {
  id: string;
  displayName: string;
  slot: TechniqueSlot;
  quality: AssetQuality;
  valueScore: number;
  fixedPower: number;
  experienceBonusBp: number;
  spiritStoneBonusBp: number;
  dropBonusBp: number;
}

export interface EquipmentConfig {
  id: string;
  displayName: string;
  slot: EquipmentSlot;
  minLevel: number;
  maxLevel: number;
  basePower: number;
}

export const ASSET_QUALITY_ORDER: Readonly<Record<AssetQuality, number>> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
  primordial: 6,
};

/**
 * Turns an asset's base power into a percentage of the player's base power.
 * Calibrated so a Lv.11 loadout keeps the total it had under the older
 * fixed-power model, which is why early-game numbers needed no retuning.
 */
export const LOADOUT_POWER_SCALE_BP = 45_000;

export const ASSET_QUALITY_MULTIPLIER_BP: Readonly<
  Record<AssetQuality, number>
> = {
  common: 10_000,
  uncommon: 15_000,
  rare: 25_000,
  epic: 40_000,
  legendary: 70_000,
  mythic: 120_000,
  primordial: 200_000,
};

export const ASSET_QUALITY_DISPLAY_NAMES: Readonly<Record<AssetQuality, string>> = {
  common: "普通",
  uncommon: "优秀",
  rare: "稀有",
  epic: "史诗",
  legendary: "传说",
  mythic: "神话",
  primordial: "洪荒",
};

/**
 * How many affixes an equipment piece of each quality rolls, and the center of
 * the value each affix rolls around. Written as a Record instead of a ternary
 * chain so adding a quality is a compile error rather than a silent zero.
 *
 * The centers for uncommon through legendary are the values those qualities
 * used to award deterministically, so existing content keeps its expected
 * yield and only gains variance.
 */
export const EQUIPMENT_AFFIX_ROLL: Readonly<
  Record<AssetQuality, { readonly count: number; readonly centerBp: number }>
> = {
  common: { count: 0, centerBp: 0 },
  uncommon: { count: 1, centerBp: 100 },
  rare: { count: 1, centerBp: 180 },
  epic: { count: 2, centerBp: 250 },
  legendary: { count: 3, centerBp: 350 },
  mythic: { count: 3, centerBp: 500 },
  primordial: { count: 3, centerBp: 700 },
};

/** Affixes roll within 40% of their quality's center value. */
export const EQUIPMENT_AFFIX_SPREAD_BP = 4_000;

/**
 * How much each band stretches the affix centers. Affixes only feed the idle
 * bonuses (experience per second, spirit stone per minute, drop efficiency) and
 * never combat power, so this is the one axis a band is allowed to grow along
 * without disturbing the power calibration.
 *
 * Band 1 is exactly 10,000, which is what keeps every stored affix and every
 * score on an old save byte-identical.
 */
export const EQUIPMENT_AFFIX_BAND_MULTIPLIER_BP: Readonly<
  Record<EquipmentBand, number>
> = {
  1: 10_000,
  2: 12_000,
  3: 14_500,
  4: 17_500,
};

export interface EquipmentAffixRange {
  readonly count: number;
  readonly minValueBp: number;
  readonly maxValueBp: number;
}

/**
 * The window one affix of this quality rolls in, on a piece of this band. The
 * band scales the center and the spread is taken from the scaled center, so a
 * 天阶 legendary rolls 368..856 where a 凡阶 one rolls 210..490.
 */
export function equipmentAffixRange(
  quality: AssetQuality,
  band: EquipmentBand,
): EquipmentAffixRange {
  const roll = EQUIPMENT_AFFIX_ROLL[quality];
  if (!roll) throw new RangeError(`Unknown equipment quality: ${quality}`);
  const multiplierBp = EQUIPMENT_AFFIX_BAND_MULTIPLIER_BP[band];
  if (!multiplierBp) throw new RangeError(`Unknown equipment band: ${band}`);
  if (roll.count === 0) {
    return { count: 0, minValueBp: 0, maxValueBp: 0 };
  }
  const centerBp = Math.floor((roll.centerBp * multiplierBp) / 10_000);
  const spread = (centerBp * EQUIPMENT_AFFIX_SPREAD_BP) / 10_000;
  return {
    count: roll.count,
    minValueBp: Math.ceil(centerBp - spread),
    maxValueBp: Math.floor(centerBp + spread),
  };
}

export const ITEM_CONFIGS: readonly ItemConfig[] = [
  {
    id: "exp_pill_small",
    displayName: "经验丹（小）",
    category: "consumable",
    useEffect: {
      type: "simulated_online_experience",
      durationSeconds: 60 * 60,
    },
  },
  {
    id: "exp_pill_large",
    displayName: "经验丹（大）",
    category: "consumable",
    useEffect: {
      type: "simulated_online_experience",
      durationSeconds: 6 * 60 * 60,
    },
  },
  {
    id: "breakthrough_pill",
    displayName: "突破丹",
    category: "consumable",
  },
  {
    id: "enhance_stone",
    displayName: "强化石",
    category: "material",
  },
  {
    id: "treasure_token",
    displayName: "寻宝令",
    category: "token",
  },
  {
    id: "technique_page",
    displayName: "功法残页",
    category: "material",
  },
  {
    id: "rename_card",
    displayName: "改名卡",
    category: "special",
  },
  {
    id: "dual_cultivation_pill",
    displayName: "双修丹",
    category: "consumable",
  },
  {
    id: "wood",
    displayName: "木材",
    category: "material",
  },
  {
    id: "stone",
    displayName: "石材",
    category: "material",
  },
  {
    id: "spiritual_soil",
    displayName: "灵土",
    category: "material",
  },
  {
    id: "spiritual_herb",
    displayName: "灵草",
    category: "material",
  },
  {
    id: "ore",
    displayName: "矿石",
    category: "material",
  },
];

export const TECHNIQUE_CONFIGS: readonly TechniqueConfig[] = [
  {
    id: "quiet_breathing_art",
    displayName: "静息诀",
    slot: "mind",
    quality: "common",
    valueScore: 100,
    fixedPower: 40,
    experienceBonusBp: 200,
    spiritStoneBonusBp: 0,
    dropBonusBp: 0,
  },
  {
    id: "azure_cloud_heart_manual",
    displayName: "青云心法",
    slot: "mind",
    quality: "uncommon",
    valueScore: 240,
    fixedPower: 100,
    experienceBonusBp: 500,
    spiritStoneBonusBp: 0,
    dropBonusBp: 0,
  },
  {
    id: "light_step_art",
    displayName: "轻身步",
    slot: "movement",
    quality: "common",
    valueScore: 90,
    fixedPower: 35,
    experienceBonusBp: 0,
    spiritStoneBonusBp: 0,
    dropBonusBp: 0,
  },
  {
    id: "drifting_cloud_steps",
    displayName: "流云步",
    slot: "movement",
    quality: "uncommon",
    valueScore: 220,
    fixedPower: 90,
    experienceBonusBp: 0,
    spiritStoneBonusBp: 0,
    dropBonusBp: 0,
  },
  {
    id: "flame_finger",
    displayName: "离火指",
    slot: "divine",
    quality: "common",
    valueScore: 120,
    fixedPower: 55,
    experienceBonusBp: 0,
    spiritStoneBonusBp: 0,
    dropBonusBp: 0,
  },
  {
    id: "thunder_seal",
    displayName: "引雷印",
    slot: "divine",
    quality: "uncommon",
    valueScore: 280,
    fixedPower: 125,
    experienceBonusBp: 0,
    spiritStoneBonusBp: 0,
    dropBonusBp: 0,
  },
  {
    id: "spirit_gathering_secret",
    displayName: "聚灵秘术",
    slot: "secret",
    quality: "common",
    valueScore: 110,
    fixedPower: 45,
    experienceBonusBp: 0,
    spiritStoneBonusBp: 100,
    dropBonusBp: 100,
  },
  {
    id: "star_observing_secret",
    displayName: "观星秘术",
    slot: "secret",
    quality: "uncommon",
    valueScore: 260,
    fixedPower: 110,
    experienceBonusBp: 0,
    spiritStoneBonusBp: 250,
    dropBonusBp: 250,
  },
];

/**
 * Equipment is banded by level so drops and crafting keep introducing new
 * pieces across all 1,000 levels.
 *
 * A band never changes what a piece is worth in power: every slot's four
 * configs share one `basePower`. `LOADOUT_POWER_SCALE_BP` is solved from a
 * maxed and a starter endpoint at the same time, which pins the top band's base
 * sum to exactly today's 450 and leaves the starter band only the window
 * `[225, 698)` — a band ratio above ~1.18 breaks one endpoint or the other. So
 * bands carry identity, the quality a piece is likely to roll, and the size of
 * its affixes, and power keeps coming from quality and enhancement.
 */
export type EquipmentBand = 1 | 2 | 3 | 4;

export interface EquipmentBandConfig {
  readonly band: EquipmentBand;
  readonly displayName: string;
  readonly minLevel: number;
  readonly maxLevel: number;
}

/** Boundaries align to realms and cover Lv.1..1000 with no gap or overlap. */
export const EQUIPMENT_BAND_CONFIGS: readonly EquipmentBandConfig[] = [
  { band: 1, displayName: "凡阶", minLevel: 1, maxLevel: 60 },
  { band: 2, displayName: "灵阶", minLevel: 61, maxLevel: 150 },
  { band: 3, displayName: "玄阶", minLevel: 151, maxLevel: 300 },
  { band: 4, displayName: "天阶", minLevel: 301, maxLevel: 1_000 },
];

export const EQUIPMENT_CONFIGS: readonly EquipmentConfig[] = [
  {
    id: "ironwood_sword",
    displayName: "玄木剑",
    slot: "weapon",
    minLevel: 1,
    maxLevel: 60,
    basePower: 80,
  },
  {
    id: "cloudweave_robe",
    displayName: "流云法袍",
    slot: "armor",
    minLevel: 1,
    maxLevel: 60,
    basePower: 75,
  },
  {
    id: "jade_spirit_ring",
    displayName: "蕴灵玉环",
    slot: "accessory",
    minLevel: 1,
    maxLevel: 60,
    basePower: 55,
  },
  {
    id: "mist_crane_mount",
    displayName: "踏雾灵鹤",
    slot: "mount",
    minLevel: 1,
    maxLevel: 60,
    basePower: 95,
  },
  {
    id: "moonfox_companion",
    displayName: "月影灵狐",
    slot: "pet",
    minLevel: 1,
    maxLevel: 60,
    basePower: 90,
  },
  {
    id: "azure_edge_sword",
    displayName: "青锋灵剑",
    slot: "weapon",
    minLevel: 61,
    maxLevel: 150,
    basePower: 80,
  },
  {
    id: "starpattern_robe",
    displayName: "星纹道袍",
    slot: "armor",
    minLevel: 61,
    maxLevel: 150,
    basePower: 75,
  },
  {
    id: "spirit_gathering_beads",
    displayName: "聚灵珠链",
    slot: "accessory",
    minLevel: 61,
    maxLevel: 150,
    basePower: 55,
  },
  {
    id: "windrider_luan_mount",
    displayName: "御风青鸾",
    slot: "mount",
    minLevel: 61,
    maxLevel: 150,
    basePower: 95,
  },
  {
    id: "crimson_fire_rat",
    displayName: "赤炎火鼠",
    slot: "pet",
    minLevel: 61,
    maxLevel: 150,
    basePower: 90,
  },
  {
    id: "violet_thunder_blade",
    displayName: "紫电玄锋",
    slot: "weapon",
    minLevel: 151,
    maxLevel: 300,
    basePower: 80,
  },
  {
    id: "blackturtle_plate",
    displayName: "玄龟重铠",
    slot: "armor",
    minLevel: 151,
    maxLevel: 300,
    basePower: 75,
  },
  {
    id: "nine_radiance_pendant",
    displayName: "九曜灵佩",
    slot: "accessory",
    minLevel: 151,
    maxLevel: 300,
    basePower: 55,
  },
  {
    id: "starstep_qilin_mount",
    displayName: "踏星麒麟",
    slot: "mount",
    minLevel: 151,
    maxLevel: 300,
    basePower: 95,
  },
  {
    id: "ninetail_sky_fox",
    displayName: "九尾天狐",
    slot: "pet",
    minLevel: 151,
    maxLevel: 300,
    basePower: 90,
  },
  {
    id: "void_immortal_sword",
    displayName: "太虚斩仙剑",
    slot: "weapon",
    minLevel: 301,
    maxLevel: 1_000,
    basePower: 80,
  },
  {
    id: "void_heaven_vestment",
    displayName: "太虚天衣",
    slot: "armor",
    minLevel: 301,
    maxLevel: 1_000,
    basePower: 75,
  },
  {
    id: "void_dao_seal",
    displayName: "太虚道印",
    slot: "accessory",
    minLevel: 301,
    maxLevel: 1_000,
    basePower: 55,
  },
  {
    id: "void_candle_dragon_mount",
    displayName: "太虚烛龙",
    slot: "mount",
    minLevel: 301,
    maxLevel: 1_000,
    basePower: 95,
  },
  {
    id: "void_golden_crow",
    displayName: "太虚金乌",
    slot: "pet",
    minLevel: 301,
    maxLevel: 1_000,
    basePower: 90,
  },
];

/**
 * The quality an idle drop rolls, per band. The drop rate itself is unchanged —
 * bands decide what comes out of the roll, not how often it happens. Band 1
 * repeats the old fixed `7_500 / 2_500` split so early-game drops feel the same.
 */
export const EQUIPMENT_DROP_QUALITY_WEIGHTS: Readonly<
  Record<
    EquipmentBand,
    readonly { readonly quality: AssetQuality; readonly weight: number }[]
  >
> = {
  1: [
    { quality: "common", weight: 7_500 },
    { quality: "uncommon", weight: 2_500 },
  ],
  2: [
    { quality: "common", weight: 5_000 },
    { quality: "uncommon", weight: 4_000 },
    { quality: "rare", weight: 1_000 },
  ],
  3: [
    { quality: "common", weight: 2_500 },
    { quality: "uncommon", weight: 4_500 },
    { quality: "rare", weight: 2_500 },
    { quality: "epic", weight: 500 },
  ],
  4: [
    { quality: "common", weight: 1_000 },
    { quality: "uncommon", weight: 3_500 },
    { quality: "rare", weight: 3_500 },
    { quality: "epic", weight: 1_700 },
    { quality: "legendary", weight: 300 },
  ],
};

export function getItemConfig(id: string): ItemConfig {
  const config = ITEM_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown item config: ${id}`);
  return config;
}

export function getTechniqueConfig(id: string): TechniqueConfig {
  const config = TECHNIQUE_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown technique config: ${id}`);
  return config;
}

export function getEquipmentConfig(id: string): EquipmentConfig {
  const config = EQUIPMENT_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new RangeError(`Unknown equipment config: ${id}`);
  return config;
}

export function getEquipmentBandConfig(band: EquipmentBand): EquipmentBandConfig {
  const config = EQUIPMENT_BAND_CONFIGS.find(
    (candidate) => candidate.band === band,
  );
  if (!config) throw new RangeError(`Unknown equipment band: ${band}`);
  return config;
}

export function equipmentBandForLevel(level: number): EquipmentBand {
  assertValidLevel(level);
  const config = EQUIPMENT_BAND_CONFIGS.find(
    (candidate) => level >= candidate.minLevel && level <= candidate.maxLevel,
  );
  if (!config) throw new RangeError(`No equipment band for level ${level}`);
  return config.band;
}

/**
 * A piece keeps its band for life, so the band is read off the config rather
 * than off whoever is holding it. A 天阶 sword found at Lv.301 is still a 天阶
 * sword in a save that was rolled back to Lv.5.
 */
export function equipmentBandForConfig(equipmentConfigId: string): EquipmentBand {
  return equipmentBandForLevel(getEquipmentConfig(equipmentConfigId).minLevel);
}

export function equipmentConfigsForBand(
  band: EquipmentBand,
): readonly EquipmentConfig[] {
  const bandConfig = getEquipmentBandConfig(band);
  return EQUIPMENT_CONFIGS.filter(
    (candidate) => candidate.minLevel === bandConfig.minLevel,
  );
}

export function equipmentConfigForSlotAndBand(
  slot: EquipmentSlot,
  band: EquipmentBand,
): EquipmentConfig {
  const config = equipmentConfigsForBand(band).find(
    (candidate) => candidate.slot === slot,
  );
  if (!config) {
    throw new RangeError(`No ${slot} equipment config in band ${band}`);
  }
  return config;
}

export function equipmentDropQualityWeights(
  band: EquipmentBand,
): readonly { readonly quality: AssetQuality; readonly weight: number }[] {
  const weights = EQUIPMENT_DROP_QUALITY_WEIGHTS[band];
  if (!weights) throw new RangeError(`Unknown equipment band: ${band}`);
  return weights;
}

export function isAssetQuality(value: string): value is AssetQuality {
  return Object.prototype.hasOwnProperty.call(ASSET_QUALITY_ORDER, value);
}
