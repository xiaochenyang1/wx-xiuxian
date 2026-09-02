import type { RealmId, RealmStage } from "../config/realms";
import type { ExpeditionStageId } from "../config/expedition";
import type { DailyState } from "../domain/daily";
import type { ProgressionStatus } from "../domain/progression";
import type { BigNumberString } from "../types";
import type { OfflineSettlementSummary } from "./offline";

export type AvatarVariant = "neutral" | "male" | "female";
export type AutoSalvageQuality = "common" | "uncommon";

export interface BootstrapSnapshot {
  account: {
    id: string;
  };
  player: {
    id: string;
    displayName: string;
    avatarVariant: AvatarVariant;
    freeRenameAvailable: boolean;
  };
  progress: {
    level: number;
    realmId: RealmId;
    realmName: string;
    stage: RealmStage;
    title: string;
    experience: BigNumberString;
    requiredExperience: BigNumberString;
    settledAt: string;
    experienceRemainderMicros: number;
    status: ProgressionStatus;
    totalPower: BigNumberString;
    cultivationReserve: BigNumberString;
    experiencePerSecond: BigNumberString;
    spiritStonePerMinute: BigNumberString;
    loadoutPowerBonusBp: number;
    experienceBonusBp: number;
    spiritStoneBonusBp: number;
    dropBonusBp: number;
  };
  wallet: {
    spiritStone: BigNumberString;
    immortalJade: BigNumberString;
    lifetimeSpiritStoneEarned: BigNumberString;
  };
  inventory: {
    bagCapacity: number;
    stacks: Array<{
      itemConfigId: string;
      displayName: string;
      quantity: BigNumberString;
    }>;
  };
  techniques: Array<{
    techniqueConfigId: string;
    displayName: string;
    quality: string;
    slot: string;
    star: number;
    duplicateCount: number;
    equippedSlot: string | null;
    powerBonusBp: number;
    experienceBonusBp: number;
    spiritStoneBonusBp: number;
    dropBonusBp: number;
    configVersion: string;
  }>;
  equipment: Array<{
    id: string;
    equipmentConfigId: string;
    displayName: string;
    quality: string;
    slot: string;
    powerBonusBp: number;
    enhanceLevel: number;
    /**
     * Affixes stay `stat: string` here and are narrowed in the domain layer,
     * the same way `quality` and `slot` are. Load validation guarantees at most
     * one entry per stat.
     */
    rolledAffixes: Array<{
      stat: string;
      valueBp: number;
    }>;
    location: string;
    equippedSlot: string | null;
    isLocked: boolean;
    configVersion: string;
  }>;
  harvestChest: {
    pendingCount: number;
    entries: Array<{
      id: string;
      entryType: string;
      equipmentInstanceId: string | null;
      techniqueConfigId: string | null;
      assetConfigId: string;
      displayName: string;
      quality: string;
      valueScore: BigNumberString;
      acquiredAt: string;
    }>;
  };
  cave: {
    buildings: Array<{
      buildingConfigId: string;
      level: number;
    }>;
  };
  expedition: {
    clearedStageIds: ExpeditionStageId[];
    sweepCounts: Array<{
      stageConfigId: ExpeditionStageId;
      count: number;
    }>;
  };
  trialTower: {
    /** `0` means no floor has been cleared; the tower is climbed in order. */
    highestFloor: number;
  };
  partner: {
    partnerId: string | null;
    level: number;
    bond: number;
  };
  sect: {
    sectId: string | null;
    level: number;
    contribution: number;
  };
  dao: {
    /**
     * `0` until the level cap is reached: `cultivationReserve`, the only
     * currency this track spends, accrues nowhere else.
     */
    level: number;
  };
  progressionTasks: Array<{
    taskConfigId: string;
    progress: BigNumberString;
    completedAt: string | null;
    claimedAt: string | null;
  }>;
  /**
   * The one block in this snapshot that resets on a calendar day. Unlike
   * `progressionTasks` it carries no completion timestamp: a daily row is
   * cleared at the next local midnight, so when it completed says nothing that
   * `progress` against the config's target does not.
   */
  daily: DailyState;
  unlocks: {
    partner: boolean;
    cave: boolean;
    trialTower: boolean;
  };
  settings: {
    autoSalvageCommon: boolean;
    autoSalvageUncommon: boolean;
    partnerUnlockNoticeSeen: boolean;
    selectedTab: string;
  };
  activeEffects: unknown[];
  config: {
    version: string;
    maxLevel: number;
  };
  offlineSettlement: OfflineSettlementSummary | null;
}
