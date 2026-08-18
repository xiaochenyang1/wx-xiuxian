import {
  MAX_LEVEL,
  NEWCOMER_REACH_LEVEL_8_TASK_ID,
  NEWCOMER_TASK_CONFIGS,
  addLoadoutBonuses,
  calculateCaveBonuses,
  calculateEquipmentContribution,
  calculateLoadoutBonuses,
  calculateOnlineExperiencePerSecond,
  calculatePartnerBonuses,
  calculateSectBonuses,
  calculateSpiritStonePerMinute,
  calculateTechniqueContribution,
  calculateTotalPower,
  countOccupiedBagSlots,
  createEmptyCaveBuildings,
  decimal,
  getRealmConfigForLevel,
  getRealmStage,
  getRealmTitle,
  getItemConfig,
  isAssetQuality,
  requiredExperienceForLevel,
  type AssetQuality,
  type BootstrapSnapshot,
} from "@cultivation-diary/shared";

export const LOCAL_SAVE_SCHEMA_VERSION = 1 as const;
export const GAME_CONFIG_VERSION = "local-2.3.0";
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
      loadoutFixedPower: "0",
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
    partner: { partnerId: null, level: 0, bond: 0 },
    sect: { sectId: null, level: 0, contribution: 0 },
    newcomerTasks: NEWCOMER_TASK_CONFIGS.map((task) => ({
      taskConfigId: task.id,
      progress: "1",
      completedAt: null,
      claimedAt: null,
    })),
    unlocks: { partner: false, cave: false },
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
      fixedPower: contribution.fixedPower,
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
    return { ...item, fixedPower: contribution.fixedPower };
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
  const level = snapshot.progress.level;
  const realm = getRealmConfigForLevel(level);
  const unlocked = level >= 11;
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
      totalPower: calculateTotalPower(level, { fixedPower: bonuses.fixedPower }),
      experiencePerSecond: calculateOnlineExperiencePerSecond(
        level,
        bonuses.experienceBonusBp,
      ),
      spiritStonePerMinute: calculateSpiritStonePerMinute(
        level,
        bonuses.spiritStoneBonusBp,
      ),
      loadoutFixedPower: bonuses.fixedPower,
      experienceBonusBp: bonuses.experienceBonusBp,
      spiritStoneBonusBp: bonuses.spiritStoneBonusBp,
      dropBonusBp: bonuses.dropBonusBp,
    },
    unlocks: { partner: unlocked, cave: unlocked },
    harvestChest: {
      ...snapshot.harvestChest,
      pendingCount: snapshot.harvestChest.entries.length,
    },
  };
}

export function syncNewcomerTasks(snapshot: BootstrapSnapshot): {
  snapshot: BootstrapSnapshot;
  rewardGranted: boolean;
} {
  const now = new Date().toISOString();
  let rewardGranted = false;
  let inventory = snapshot.inventory;
  const existing = new Map(
    snapshot.newcomerTasks.map((task) => [task.taskConfigId, task] as const),
  );
  const newcomerTasks = NEWCOMER_TASK_CONFIGS.map((config) => {
    const previous = existing.get(config.id);
    const completed = snapshot.progress.level >= config.targetLevel;
    const rewardPending =
      config.id === NEWCOMER_REACH_LEVEL_8_TASK_ID &&
      completed &&
      previous?.claimedAt == null;
    const grantedThisTask =
      rewardPending &&
      hasStackOutputCapacity({ ...snapshot, inventory }, "breakthrough_pill");
    if (grantedThisTask) {
      inventory = addStack(inventory, "breakthrough_pill", 1);
      rewardGranted = true;
    }
    const claimedAt =
      config.id === NEWCOMER_REACH_LEVEL_8_TASK_ID
        ? grantedThisTask
          ? now
          : previous?.claimedAt ?? null
        : previous?.claimedAt ?? null;
    return {
      taskConfigId: config.id,
      progress: Math.min(snapshot.progress.level, config.targetLevel).toString(),
      completedAt: completed ? previous?.completedAt ?? now : null,
      claimedAt,
    };
  });
  return {
    snapshot: { ...snapshot, inventory, newcomerTasks },
    rewardGranted,
  };
}

function hasStackOutputCapacity(
  snapshot: BootstrapSnapshot,
  itemConfigId: string,
): boolean {
  return (
    snapshot.inventory.stacks.some((stack) => stack.itemConfigId === itemConfigId) ||
    countOccupiedBagSlots(snapshot) < snapshot.inventory.bagCapacity
  );
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
