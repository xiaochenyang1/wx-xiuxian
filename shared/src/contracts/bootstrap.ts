import type { RealmId, RealmStage } from "../config/realms";
import type { ProgressionStatus } from "../domain/progression";
import type { BigNumberString } from "../types";
import type { OfflineSettlementSummary } from "./offline";

export type AvatarVariant = "neutral" | "male" | "female";

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
    status: ProgressionStatus;
    totalPower: BigNumberString;
    cultivationReserve: BigNumberString;
    experiencePerSecond: BigNumberString;
    spiritStonePerMinute: BigNumberString;
    loadoutFixedPower: BigNumberString;
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
    fixedPower: BigNumberString;
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
    fixedPower: BigNumberString;
    enhanceLevel: number;
    rolledAffixes: unknown;
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
  newcomerTasks: Array<{
    taskConfigId: string;
    progress: BigNumberString;
    completedAt: string | null;
    claimedAt: string | null;
  }>;
  unlocks: {
    partner: boolean;
    cave: boolean;
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
  };
  offlineSettlement: OfflineSettlementSummary | null;
}
