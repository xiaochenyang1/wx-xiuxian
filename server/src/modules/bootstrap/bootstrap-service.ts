import {
  calculateEquipmentContribution,
  calculateLoadoutBonuses,
  calculateOnlineExperiencePerSecond,
  calculateSpiritStonePerMinute,
  calculateTechniqueContribution,
  getRealmConfigForLevel,
  getRealmStage,
  getRealmTitle,
  getEquipmentConfig,
  getItemConfig,
  getTechniqueConfig,
  isAssetQuality,
  requiredExperienceForLevel,
  type AvatarVariant,
  type BootstrapSnapshot,
  type ProgressionStatus,
} from "@cultivation-diary/shared";
import { and, eq, inArray } from "drizzle-orm";
import { AppError } from "../../common/app-error";
import { ACTIVE_GAME_CONFIG_VERSION } from "../../config/game-config";
import {
  accounts,
  equipmentInstances,
  harvestChestEntries,
  inventoryStacks,
  newcomerTaskProgress,
  playerProgress,
  playerSettings,
  playerWallets,
  players,
  techniqueProgress,
} from "../../db/schema";
import type { GameDatabase } from "../../infrastructure";

type BootstrapDatabase = Pick<GameDatabase, "select">;

export interface BootstrapResult {
  playerVersion: string;
  snapshot: BootstrapSnapshot;
}

export class BootstrapService {
  constructor(
    private readonly database: BootstrapDatabase,
    private readonly serializeCollectionQueries = false,
  ) {}

  async getSnapshot(accountId: string, playerId: string): Promise<BootstrapResult> {
    const [core] = await this.database
      .select({
        accountId: accounts.id,
        accountStatus: accounts.status,
        playerId: players.id,
        playerStatus: players.status,
        displayName: players.displayName,
        avatarVariant: players.avatarVariant,
        freeRenameAvailable: players.freeRenameAvailable,
        level: playerProgress.level,
        realmKey: playerProgress.realmKey,
        experience: playerProgress.exp,
        progressionState: playerProgress.progressionState,
        totalPower: playerProgress.totalPower,
        cultivationReserve: playerProgress.cultivationReserve,
        playerVersion: playerProgress.version,
        spiritStone: playerWallets.spiritStone,
        immortalJade: playerWallets.immortalJade,
        lifetimeSpiritStoneEarned: playerWallets.lifetimeSpiritStoneEarned,
        bagCapacity: playerSettings.bagCapacity,
        autoSalvageCommon: playerSettings.autoSalvageCommon,
        autoSalvageUncommon: playerSettings.autoSalvageUncommon,
        partnerUnlockNoticeSeen: playerSettings.partnerUnlockNoticeSeen,
        selectedTab: playerSettings.selectedTab,
      })
      .from(accounts)
      .innerJoin(players, eq(players.accountId, accounts.id))
      .innerJoin(playerProgress, eq(playerProgress.playerId, players.id))
      .innerJoin(playerWallets, eq(playerWallets.playerId, players.id))
      .innerJoin(playerSettings, eq(playerSettings.playerId, players.id))
      .where(and(eq(accounts.id, accountId), eq(players.id, playerId)))
      .limit(1);

    if (!core || core.accountStatus !== "active" || core.playerStatus !== "active") {
      throw new AppError("UNAUTHENTICATED", "登录状态无效，请重新登录", 401, false);
    }

    const realm = getRealmConfigForLevel(core.level);
    if (realm.id !== core.realmKey) {
      throw new Error(`Player realm does not match level for player ${core.playerId}`);
    }

    const [stacks, techniques, equipment, harvestEntries, tasks] =
      await executeQueries(
        this.serializeCollectionQueries,
        [
          () =>
            this.database
              .select({
                itemConfigId: inventoryStacks.itemConfigId,
                quantity: inventoryStacks.quantity,
              })
              .from(inventoryStacks)
              .where(eq(inventoryStacks.playerId, playerId))
              .orderBy(inventoryStacks.itemConfigId),
          () =>
            this.database
              .select({
                techniqueConfigId: techniqueProgress.techniqueConfigId,
                star: techniqueProgress.star,
                duplicateCount: techniqueProgress.duplicateCount,
                equippedSlot: techniqueProgress.equippedSlot,
                configVersion: techniqueProgress.configVersion,
              })
              .from(techniqueProgress)
              .where(eq(techniqueProgress.playerId, playerId))
              .orderBy(
                techniqueProgress.acquiredAt,
                techniqueProgress.techniqueConfigId,
              ),
          () =>
            this.database
              .select({
                id: equipmentInstances.id,
                equipmentConfigId: equipmentInstances.equipmentConfigId,
                quality: equipmentInstances.quality,
                enhanceLevel: equipmentInstances.enhanceLevel,
                rolledAffixes: equipmentInstances.rolledAffixes,
                location: equipmentInstances.location,
                equippedSlot: equipmentInstances.equippedSlot,
                isLocked: equipmentInstances.isLocked,
                configVersion: equipmentInstances.configVersion,
              })
              .from(equipmentInstances)
              .where(
                and(
                  eq(equipmentInstances.playerId, playerId),
                  inArray(equipmentInstances.location, ["bag", "equipped"]),
                ),
              )
              .orderBy(equipmentInstances.acquiredAt, equipmentInstances.id),
          () =>
            this.database
              .select({
                id: harvestChestEntries.id,
                entryType: harvestChestEntries.entryType,
                equipmentInstanceId: harvestChestEntries.equipmentInstanceId,
                techniqueConfigId: harvestChestEntries.techniqueConfigId,
                equipmentConfigId: equipmentInstances.equipmentConfigId,
                quality: harvestChestEntries.quality,
                valueScore: harvestChestEntries.valueScore,
                acquiredAt: harvestChestEntries.acquiredAt,
              })
              .from(harvestChestEntries)
              .leftJoin(
                equipmentInstances,
                eq(equipmentInstances.id, harvestChestEntries.equipmentInstanceId),
              )
              .where(
                and(
                  eq(harvestChestEntries.playerId, playerId),
                  eq(harvestChestEntries.status, "pending"),
                ),
              )
              .orderBy(harvestChestEntries.acquiredAt, harvestChestEntries.id),
          () =>
            this.database
              .select({
                taskConfigId: newcomerTaskProgress.taskConfigId,
                progress: newcomerTaskProgress.progress,
                completedAt: newcomerTaskProgress.completedAt,
                claimedAt: newcomerTaskProgress.claimedAt,
              })
              .from(newcomerTaskProgress)
              .where(eq(newcomerTaskProgress.playerId, playerId)),
        ] as const,
      );

    const loadoutBonuses = calculateLoadoutBonuses({
      techniques: techniques
        .filter((technique) => technique.equippedSlot !== null)
        .map((technique) => ({
          techniqueConfigId: technique.techniqueConfigId,
          star: technique.star,
        })),
      equipment: equipment
        .filter((item) => item.location === "equipped")
        .map((item) => ({
          equipmentConfigId: item.equipmentConfigId,
          quality: requireAssetQuality(item.quality),
          enhanceLevel: item.enhanceLevel,
          rolledAffixes: item.rolledAffixes,
        })),
    });

    const unlockedFoundationFeatures = core.level >= 11;
    const snapshot: BootstrapSnapshot = {
      account: { id: core.accountId },
      player: {
        id: core.playerId,
        displayName: core.displayName,
        avatarVariant: core.avatarVariant as AvatarVariant,
        freeRenameAvailable: core.freeRenameAvailable,
      },
      progress: {
        level: core.level,
        realmId: realm.id,
        realmName: realm.displayName,
        stage: getRealmStage(core.level),
        title: getRealmTitle(core.level),
        experience: core.experience,
        requiredExperience: requiredExperienceForLevel(core.level),
        status: core.progressionState as ProgressionStatus,
        totalPower: core.totalPower,
        cultivationReserve: core.cultivationReserve,
        experiencePerSecond: calculateOnlineExperiencePerSecond(
          core.level,
          loadoutBonuses.experienceBonusBp,
        ),
        spiritStonePerMinute: calculateSpiritStonePerMinute(
          core.level,
          loadoutBonuses.spiritStoneBonusBp,
        ),
        loadoutFixedPower: loadoutBonuses.fixedPower,
        experienceBonusBp: loadoutBonuses.experienceBonusBp,
        spiritStoneBonusBp: loadoutBonuses.spiritStoneBonusBp,
        dropBonusBp: loadoutBonuses.dropBonusBp,
      },
      wallet: {
        spiritStone: core.spiritStone,
        immortalJade: core.immortalJade,
        lifetimeSpiritStoneEarned: core.lifetimeSpiritStoneEarned,
      },
      inventory: {
        bagCapacity: core.bagCapacity,
        stacks: stacks.map((stack) => ({
          ...stack,
          displayName: safeItemName(stack.itemConfigId),
        })),
      },
      techniques: techniques.map((technique) => {
        const config = safeTechniqueConfig(technique.techniqueConfigId);
        const contribution = calculateTechniqueContribution({
          techniqueConfigId: technique.techniqueConfigId,
          star: technique.star,
        });
        return {
          ...technique,
          displayName: config.displayName,
          quality: config.quality,
          slot: config.slot,
          ...contribution,
        };
      }),
      equipment: equipment.map((item) => {
        const config = safeEquipmentConfig(item.equipmentConfigId);
        const contribution = calculateEquipmentContribution({
          equipmentConfigId: item.equipmentConfigId,
          quality: requireAssetQuality(item.quality),
          enhanceLevel: item.enhanceLevel,
          rolledAffixes: item.rolledAffixes,
        });
        return {
          ...item,
          displayName: config.displayName,
          slot: config.slot,
          fixedPower: contribution.fixedPower,
        };
      }),
      harvestChest: {
        pendingCount: harvestEntries.length,
        entries: harvestEntries.map((entry) => ({
          id: entry.id,
          entryType: entry.entryType,
          equipmentInstanceId: entry.equipmentInstanceId,
          techniqueConfigId: entry.techniqueConfigId,
          assetConfigId:
            entry.equipmentConfigId ??
            entry.techniqueConfigId ??
            "unknown_asset",
          displayName: safeAssetName(
            entry.entryType,
            entry.equipmentConfigId ??
              entry.techniqueConfigId ??
              "unknown_asset",
          ),
          quality: entry.quality,
          valueScore: entry.valueScore,
          acquiredAt: entry.acquiredAt.toISOString(),
        })),
      },
      newcomerTasks: tasks.map((task) => ({
        ...task,
        completedAt: task.completedAt?.toISOString() ?? null,
        claimedAt: task.claimedAt?.toISOString() ?? null,
      })),
      unlocks: {
        partner: unlockedFoundationFeatures,
        cave: unlockedFoundationFeatures,
      },
      settings: {
        autoSalvageCommon: core.autoSalvageCommon,
        autoSalvageUncommon: core.autoSalvageUncommon,
        partnerUnlockNoticeSeen: core.partnerUnlockNoticeSeen,
        selectedTab: core.selectedTab,
      },
      activeEffects: [],
      config: { version: ACTIVE_GAME_CONFIG_VERSION },
      offlineSettlement: null,
    };

    return {
      playerVersion: core.playerVersion.toString(),
      snapshot,
    };
  }
}

function safeItemName(itemConfigId: string): string {
  try {
    return getItemConfig(itemConfigId).displayName;
  } catch {
    return itemConfigId;
  }
}

function safeTechniqueConfig(techniqueConfigId: string): {
  displayName: string;
  quality: string;
  slot: string;
  fixedPower: number;
  experienceBonusBp: number;
  spiritStoneBonusBp: number;
  dropBonusBp: number;
} {
  try {
    const config = getTechniqueConfig(techniqueConfigId);
    return config;
  } catch {
    return {
      displayName: techniqueConfigId,
      quality: "common",
      slot: "unknown",
      fixedPower: 0,
      experienceBonusBp: 0,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
    };
  }
}

function safeEquipmentConfig(equipmentConfigId: string): {
  displayName: string;
  slot: string;
  basePower: number;
} {
  try {
    return getEquipmentConfig(equipmentConfigId);
  } catch {
    return { displayName: equipmentConfigId, slot: "unknown", basePower: 0 };
  }
}

function safeEquipmentName(equipmentConfigId: string): string {
  return safeEquipmentConfig(equipmentConfigId).displayName;
}

function requireAssetQuality(quality: string) {
  if (!isAssetQuality(quality)) {
    throw new Error(`Unknown stored asset quality: ${quality}`);
  }
  return quality;
}

function safeAssetName(entryType: string, assetConfigId: string): string {
  return entryType === "equipment"
    ? safeEquipmentName(assetConfigId)
    : safeTechniqueConfig(assetConfigId).displayName;
}

async function executeQueries<const T extends readonly unknown[]>(
  serial: boolean,
  loaders: { [K in keyof T]: () => PromiseLike<T[K]> },
): Promise<T> {
  if (!serial) {
    return (await Promise.all(loaders.map((load) => load()))) as unknown as T;
  }

  const results: unknown[] = [];
  for (const load of loaders) results.push(await load());
  return results as unknown as T;
}
