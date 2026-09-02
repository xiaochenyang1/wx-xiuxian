import {
  CAVE_UNLOCK_LEVEL,
  MAX_LEVEL,
  PARTNER_UNLOCK_LEVEL,
  PROGRESSION_TASK_CONFIGS,
  TRIAL_TOWER_UNLOCK_LEVEL,
  addLoadoutBonuses,
  calculateCaveBonuses,
  calculateDaoBonuses,
  calculateEquipmentContribution,
  calculateLoadoutBonuses,
  calculateOnlineExperiencePerSecond,
  calculatePartnerBonuses,
  calculateSectBonuses,
  calculateSpiritStonePerMinute,
  calculateTechniqueContribution,
  calculateTotalPower,
  countOccupiedBagSlots,
  createDailyState,
  createEmptyCaveBuildings,
  decimal,
  getRealmConfigForLevel,
  getRealmStage,
  getRealmTitle,
  getItemConfig,
  isAssetQuality,
  localDayIndex,
  progressionTaskTarget,
  requiredExperienceForLevel,
  type AssetQuality,
  type BootstrapSnapshot,
  type ProgressionTaskConfig,
  type ProgressionTaskRewardItem,
} from "@cultivation-diary/shared";

export const LOCAL_SAVE_SCHEMA_VERSION = 1 as const;
export const GAME_CONFIG_VERSION = "local-2.17.0";
export const GAME_CONFIG_VERSION_PRE_DAILY_LOOP = "local-2.16.0";
export const GAME_CONFIG_VERSION_PRE_TREASURE_HUNT_BANDS = "local-2.15.0";
export const GAME_CONFIG_VERSION_PRE_ALCHEMY_BANDS = "local-2.14.0";
export const GAME_CONFIG_VERSION_PRE_CAPPED_SYSTEM_BANDS = "local-2.13.0";
export const GAME_CONFIG_VERSION_PRE_TECHNIQUE_BANDS = "local-2.12.0";
export const GAME_CONFIG_VERSION_PRE_DAO = "local-2.11.0";
export const GAME_CONFIG_VERSION_PRE_REALM_SPLIT = "local-2.10.0";
export const GAME_CONFIG_VERSION_PRE_ENHANCE_STONE_CURVE = "local-2.9.0";
export const GAME_CONFIG_VERSION_PRE_TASK_CHAIN = "local-2.8.0";
export const GAME_CONFIG_VERSION_PRE_MATERIAL_CURVE = "local-2.7.0";
export const GAME_CONFIG_VERSION_PRE_EQUIPMENT_BANDS = "local-2.6.0";
export const GAME_CONFIG_VERSION_PRE_AFFIX_ROLL = "local-2.5.0";
export const GAME_CONFIG_VERSION_PRE_TRIAL_TOWER = "local-2.4.0";
export const GAME_CONFIG_VERSION_PRE_POWER_MODEL = "local-2.3.0";
export const GAME_CONFIG_VERSION_PRE_EQUIPMENT_MANAGEMENT = "local-2.2.0";
export const GAME_CONFIG_VERSION_PRE_EXPEDITION_SWEEPS = "local-2.1.0";
export const GAME_CONFIG_VERSION_PRE_ITEM_COMPLETION = "local-2.0.0";
export const GAME_CONFIG_VERSION_PRE_FEATURE_COMPLETION = "local-1.2.0";
export const GAME_CONFIG_VERSION_PRE_EXPEDITION = "local-1.1.0";
export const GAME_CONFIG_VERSION_PRE_CAVE = "local-1.0.0";
export const DROP_CONFIG_VERSION = "local-idle-drop-v1";
const BAG_INITIAL_CAPACITY = 50;

export interface LocalGameSave {
  readonly schemaVersion: typeof LOCAL_SAVE_SCHEMA_VERSION;
  readonly savedAt: string;
  readonly spiritStoneRemainderMicros: number;
  readonly dropClockRemainderMicros: number;
  readonly snapshot: BootstrapSnapshot;
}

export function createInitialSave(now: Date): LocalGameSave {
  const nowIso = now.toISOString();
  const snapshot = refreshSnapshot({
    account: { id: createLocalId() },
    player: {
      id: createLocalId(),
      displayName: "青岚子",
      avatarVariant: "neutral",
      freeRenameAvailable: true,
    },
    progress: {
      level: 1,
      realmId: "qi_refining",
      realmName: "练气期",
      stage: "early",
      title: "练气初期",
      experience: "0",
      requiredExperience: requiredExperienceForLevel(1),
      settledAt: nowIso,
      experienceRemainderMicros: 0,
      status: "gaining",
      totalPower: "100",
      cultivationReserve: "0",
      experiencePerSecond: "1",
      spiritStonePerMinute: "1",
      loadoutPowerBonusBp: 0,
      experienceBonusBp: 0,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
    },
    wallet: {
      spiritStone: "0",
      immortalJade: "0",
      lifetimeSpiritStoneEarned: "0",
    },
    inventory: { bagCapacity: BAG_INITIAL_CAPACITY, stacks: [] },
    techniques: [],
    equipment: [],
    harvestChest: { pendingCount: 0, entries: [] },
    cave: { buildings: createEmptyCaveBuildings() },
    expedition: { clearedStageIds: [], sweepCounts: [] },
    trialTower: { highestFloor: 0 },
    partner: { partnerId: null, level: 0, bond: 0 },
    sect: { sectId: null, level: 0, contribution: 0 },
    dao: { level: 0 },
    progressionTasks: PROGRESSION_TASK_CONFIGS.map((task) => ({
      taskConfigId: task.id,
      progress: task.condition.kind === "level" ? "1" : "0",
      completedAt: null,
      claimedAt: null,
    })),
    daily: createDailyState(localDayIndex(now)),
    unlocks: { partner: false, cave: false, trialTower: false },
    settings: {
      autoSalvageCommon: false,
      autoSalvageUncommon: false,
      partnerUnlockNoticeSeen: false,
      selectedTab: "cultivation",
    },
    activeEffects: [],
    config: { version: GAME_CONFIG_VERSION, maxLevel: MAX_LEVEL },
    offlineSettlement: null,
  });
  return {
    schemaVersion: LOCAL_SAVE_SCHEMA_VERSION,
    savedAt: nowIso,
    spiritStoneRemainderMicros: 0,
    dropClockRemainderMicros: 0,
    snapshot,
  };
}

export function refreshSnapshot(snapshot: BootstrapSnapshot): BootstrapSnapshot {
  const techniques = snapshot.techniques.map((item) => {
    const contribution = calculateTechniqueContribution({
      techniqueConfigId: item.techniqueConfigId,
      star: item.star,
    });
    return {
      ...item,
      powerBonusBp: contribution.powerBonusBp,
      experienceBonusBp: contribution.experienceBonusBp,
      spiritStoneBonusBp: contribution.spiritStoneBonusBp,
      dropBonusBp: contribution.dropBonusBp,
    };
  });
  const equipment = snapshot.equipment.map((item) => {
    if (!isAssetQuality(item.quality)) return item;
    const contribution = calculateEquipmentContribution({
      equipmentConfigId: item.equipmentConfigId,
      quality: item.quality,
      enhanceLevel: item.enhanceLevel,
      rolledAffixes: item.rolledAffixes,
    });
    return { ...item, powerBonusBp: contribution.powerBonusBp };
  });
  const loadout = calculateLoadoutBonuses({
    techniques: techniques
      .filter((item) => item.equippedSlot !== null)
      .map((item) => ({ techniqueConfigId: item.techniqueConfigId, star: item.star })),
    equipment: equipment
      .filter((item) => item.equippedSlot !== null && isAssetQuality(item.quality))
      .map((item) => ({
        equipmentConfigId: item.equipmentConfigId,
        quality: item.quality as AssetQuality,
        enhanceLevel: item.enhanceLevel,
        rolledAffixes: item.rolledAffixes,
      })),
  });
  let bonuses = addLoadoutBonuses(
    loadout,
    calculateCaveBonuses(snapshot.cave.buildings),
  );
  bonuses = addLoadoutBonuses(bonuses, calculatePartnerBonuses(snapshot.partner));
  bonuses = addLoadoutBonuses(bonuses, calculateSectBonuses(snapshot.sect));
  bonuses = addLoadoutBonuses(bonuses, calculateDaoBonuses(snapshot.dao));
  const level = snapshot.progress.level;
  const realm = getRealmConfigForLevel(level);
  return {
    ...snapshot,
    techniques,
    equipment,
    progress: {
      ...snapshot.progress,
      realmId: realm.id,
      realmName: realm.displayName,
      stage: getRealmStage(level),
      title: getRealmTitle(level),
      requiredExperience: requiredExperienceForLevel(level),
      totalPower: calculateTotalPower(level, {
        percentBonusBp: bonuses.powerBonusBp,
      }),
      experiencePerSecond: calculateOnlineExperiencePerSecond(
        level,
        bonuses.experienceBonusBp,
      ),
      spiritStonePerMinute: calculateSpiritStonePerMinute(
        level,
        bonuses.spiritStoneBonusBp,
      ),
      loadoutPowerBonusBp: bonuses.powerBonusBp,
      experienceBonusBp: bonuses.experienceBonusBp,
      spiritStoneBonusBp: bonuses.spiritStoneBonusBp,
      dropBonusBp: bonuses.dropBonusBp,
    },
    // Unlocks are stored, not derived: each bit latches on and is never taken
    // back. Recomputing them from the current level alone would revoke an
    // entrance the moment its threshold moved, which is exactly what raising
    // the partner to Lv.20 would have done to every Lv.11-19 save.
    unlocks: {
      partner: snapshot.unlocks.partner || level >= PARTNER_UNLOCK_LEVEL,
      cave: snapshot.unlocks.cave || level >= CAVE_UNLOCK_LEVEL,
      trialTower:
        snapshot.unlocks.trialTower || level >= TRIAL_TOWER_UNLOCK_LEVEL,
    },
    harvestChest: {
      ...snapshot.harvestChest,
      pendingCount: snapshot.harvestChest.entries.length,
    },
  };
}

export function syncProgressionTasks(snapshot: BootstrapSnapshot): {
  snapshot: BootstrapSnapshot;
  rewardGranted: boolean;
} {
  const now = new Date().toISOString();
  let rewardGranted = false;
  let inventory = snapshot.inventory;
  let wallet = snapshot.wallet;
  const existing = new Map(
    snapshot.progressionTasks.map((task) => [task.taskConfigId, task] as const),
  );
  const progressionTasks = PROGRESSION_TASK_CONFIGS.map((config) => {
    const previous = existing.get(config.id);
    const target = progressionTaskTarget(config);
    const current = taskProgress(snapshot, config);
    const completed = current >= target;
    const reward = config.reward;
    // Tasks are reached passively, so a full bag must not throw the reward
    // away: record the completion, leave it unclaimed, and let a later
    // checkpoint grant it once a slot frees up.
    const granted =
      reward !== null &&
      completed &&
      previous?.claimedAt == null &&
      hasStackOutputCapacity({ ...snapshot, inventory }, reward.items);
    if (granted) {
      for (const item of reward.items) {
        inventory = addStack(inventory, item.itemConfigId, item.quantity);
      }
      if (reward.spiritStone > 0) {
        wallet = addSpiritStone(wallet, reward.spiritStone);
      }
      rewardGranted = true;
    }
    return {
      taskConfigId: config.id,
      progress: Math.min(current, target).toString(),
      completedAt: completed ? previous?.completedAt ?? now : null,
      claimedAt: granted ? now : previous?.claimedAt ?? null,
    };
  });
  return {
    snapshot: { ...snapshot, wallet, inventory, progressionTasks },
    rewardGranted,
  };
}

function taskProgress(
  snapshot: BootstrapSnapshot,
  config: ProgressionTaskConfig,
): number {
  return config.condition.kind === "level"
    ? snapshot.progress.level
    : snapshot.trialTower.highestFloor;
}

/**
 * All of a task's items land together or none do. Items already held as a stack
 * cost no slot, so only the distinct new ids are charged against capacity.
 */
function hasStackOutputCapacity(
  snapshot: BootstrapSnapshot,
  items: readonly ProgressionTaskRewardItem[],
): boolean {
  const newStackIds = new Set(
    items
      .map((item) => item.itemConfigId)
      .filter(
        (itemConfigId) =>
          !snapshot.inventory.stacks.some(
            (stack) => stack.itemConfigId === itemConfigId,
          ),
      ),
  );
  return (
    countOccupiedBagSlots(snapshot) + newStackIds.size <=
    snapshot.inventory.bagCapacity
  );
}

function addSpiritStone(
  wallet: BootstrapSnapshot["wallet"],
  amount: number,
): BootstrapSnapshot["wallet"] {
  return {
    ...wallet,
    spiritStone: decimal(wallet.spiritStone).plus(amount).toFixed(0),
    lifetimeSpiritStoneEarned: decimal(wallet.lifetimeSpiritStoneEarned)
      .plus(amount)
      .toFixed(0),
  };
}

function addStack(
  inventory: BootstrapSnapshot["inventory"],
  itemConfigId: string,
  quantity: number,
): BootstrapSnapshot["inventory"] {
  const existing = inventory.stacks.find((stack) => stack.itemConfigId === itemConfigId);
  if (existing) {
    return {
      ...inventory,
      stacks: inventory.stacks.map((stack) =>
        stack.itemConfigId === itemConfigId
          ? {
              ...stack,
              quantity: decimal(stack.quantity).plus(quantity).toFixed(0),
            }
          : stack,
      ),
    };
  }
  return {
    ...inventory,
    stacks: [
      ...inventory.stacks,
      {
        itemConfigId,
        displayName: getItemConfig(itemConfigId).displayName,
        quantity: String(quantity),
      },
    ],
  };
}

function createLocalId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map((value) => (`0${value.toString(16)}`).slice(-2)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
