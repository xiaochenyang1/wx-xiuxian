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

export interface EquipmentAffixRange {
  readonly count: number;
  readonly minValueBp: number;
  readonly maxValueBp: number;
}

export function equipmentAffixRange(quality: AssetQuality): EquipmentAffixRange {
  const roll = EQUIPMENT_AFFIX_ROLL[quality];
  if (!roll) throw new RangeError(`Unknown equipment quality: ${quality}`);
  if (roll.count === 0) {
    return { count: 0, minValueBp: 0, maxValueBp: 0 };
  }
  const spread = (roll.centerBp * EQUIPMENT_AFFIX_SPREAD_BP) / 10_000;
  return {
    count: roll.count,
    minValueBp: Math.ceil(roll.centerBp - spread),
    maxValueBp: Math.floor(roll.centerBp + spread),
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

export const EQUIPMENT_CONFIGS: readonly EquipmentConfig[] = [
  {
    id: "ironwood_sword",
    displayName: "玄木剑",
    slot: "weapon",
    minLevel: 1,
    maxLevel: 1_000,
    basePower: 80,
  },
  {
    id: "cloudweave_robe",
    displayName: "流云法袍",
    slot: "armor",
    minLevel: 1,
    maxLevel: 1_000,
    basePower: 75,
  },
  {
    id: "jade_spirit_ring",
    displayName: "蕴灵玉环",
    slot: "accessory",
    minLevel: 1,
    maxLevel: 1_000,
    basePower: 55,
  },
  {
    id: "mist_crane_mount",
    displayName: "踏雾灵鹤",
    slot: "mount",
    minLevel: 1,
    maxLevel: 1_000,
    basePower: 95,
  },
  {
    id: "moonfox_companion",
    displayName: "月影灵狐",
    slot: "pet",
    minLevel: 1,
    maxLevel: 1_000,
    basePower: 90,
  },
];

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

export function isAssetQuality(value: string): value is AssetQuality {
  return Object.prototype.hasOwnProperty.call(ASSET_QUALITY_ORDER, value);
}
