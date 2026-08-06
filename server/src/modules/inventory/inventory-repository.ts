import { randomUUID } from "node:crypto";
import {
  ASSET_QUALITY_ORDER,
  applyWholeExperience,
  calculateLoadoutBonuses,
  calculateTotalPower,
  getRealmConfigForLevel,
  isAssetQuality,
  requiredExperienceForLevel,
  simulateOnlineExperience,
  type AssetQuality,
  type DebugGrantTarget,
  type ItemUseEffect,
  type ProgressionEvent,
  type ProgressionStatus,
} from "@cultivation-diary/shared";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { AppError } from "../../common/app-error";
import {
  BAG_EXPANSION_SIZE,
  BAG_MAX_CAPACITY,
  bagExpansionCostForCapacity,
} from "../../config/game-config";
import {
  assetLedger,
  equipmentInstances,
  harvestChestEntries,
  idempotencyRecords,
  inventoryStacks,
  playerProgress,
  playerSettings,
  playerWallets,
  techniqueProgress,
} from "../../db/schema";
import type { GameDatabase } from "../../infrastructure";
import { getSalvageYield } from "../cultivation/drop-rewards";
import { grantLevelEightRewardIfNeeded } from "../cultivation/progression-rewards";

export interface InventoryMutationCommand {
  accountId: string;
  playerId: string;
  idempotencyKey: string;
  requestHash: string;
  expectedPlayerVersion?: string;
  now: Date;
  idempotencyExpiresAt: Date;
}

export interface InventoryExpandPersistenceResult {
  operationId: string;
  expandedBy: number;
  cost: string;
  nextCost: string | null;
}

export interface InventoryUsePersistenceResult {
  operationId: string;
  itemConfigId: string;
  consumedQuantity: number;
  remainingQuantity: string;
  effectType: "simulated_online_experience";
  experienceGained: string;
  experienceDiscarded: string;
  fromLevel: number;
  toLevel: number;
  reachedBreakthrough: boolean;
  newcomerRewardGranted: boolean;
  events: ProgressionEvent[];
}

export interface DebugGrantPersistenceResult {
  operationId: string;
  target: DebugGrantTarget;
  grantedAmount: string;
  balanceAfter: string;
  fromLevel: number;
  toLevel: number;
  reachedBreakthrough: boolean;
  newcomerRewardGranted: boolean;
  events: ProgressionEvent[];
}

export interface HarvestTransferPersistenceResult {
  operationId: string;
  transferredEquipment: number;
  collectedTechniques: number;
  techniqueDuplicates: number;
}

export interface HarvestSalvagePersistenceResult {
  operationId: string;
  salvagedCount: number;
  spiritStoneGained: string;
  enhanceStoneGained: string;
}

type GameTransaction = Parameters<Parameters<GameDatabase["transaction"]>[0]>[0];

export class InventoryRepository {
  constructor(private readonly database: GameDatabase) {}

  async useItem(
    command: InventoryMutationCommand,
    itemConfigId: string,
    quantity: number,
    effect: ItemUseEffect,
  ): Promise<InventoryUsePersistenceResult> {
    return this.database.transaction(async (transaction) => {
      const [state] = await transaction
        .select({
          version: playerProgress.version,
          level: playerProgress.level,
          realmKey: playerProgress.realmKey,
          experience: playerProgress.exp,
          experienceRemainderMicros: playerProgress.expRemainderMicros,
          progressionState: playerProgress.progressionState,
          cultivationReserve: playerProgress.cultivationReserve,
        })
        .from(playerProgress)
        .where(eq(playerProgress.playerId, command.playerId))
        .for("update")
        .limit(1);
      if (!state) throw missingPlayerState();

      const replay = await loadIdempotentResult(
        transaction,
        command,
        "inventory.use",
        parseUseResult,
      );
      if (replay) return replay;
      assertPlayerVersion(state.version, command.expectedPlayerVersion);

      const configuredRealm = getRealmConfigForLevel(state.level);
      if (configuredRealm.id !== state.realmKey) {
        throw new Error(`Player realm does not match level for player ${command.playerId}`);
      }
      if (state.progressionState === "breakthrough_ready") {
        throw new AppError(
          "ITEM_USE_BLOCKED",
          "当前已达境界瓶颈，请突破后再使用经验丹",
          409,
          false,
          { itemConfigId, progressionState: state.progressionState },
        );
      }

      const [stack] = await transaction
        .select({ quantity: inventoryStacks.quantity })
        .from(inventoryStacks)
        .where(
          and(
            eq(inventoryStacks.playerId, command.playerId),
            eq(inventoryStacks.itemConfigId, itemConfigId),
          ),
        )
        .for("update")
        .limit(1);
      const currentQuantity = BigInt(stack?.quantity ?? "0");
      const requestedQuantity = BigInt(quantity);
      if (currentQuantity < requestedQuantity) {
        throw new AppError("INSUFFICIENT_ITEM", "道具数量不足", 409, false, {
          itemConfigId,
          required: quantity,
          current: currentQuantity.toString(),
        });
      }

      const loadoutBonuses = await loadEquippedBonuses(
        transaction,
        command.playerId,
      );
      const simulated = simulateOnlineExperience({
        progress: {
          level: state.level,
          experience: state.experience,
          cultivationReserve: state.cultivationReserve,
          status: state.progressionState as ProgressionStatus,
        },
        elapsedMilliseconds: effect.durationSeconds * 1_000 * quantity,
        experienceBonusBp: loadoutBonuses.experienceBonusBp,
      });
      const remainingQuantity = currentQuantity - requestedQuantity;
      const operationId = randomUUID();

      if (remainingQuantity === 0n) {
        await transaction
          .delete(inventoryStacks)
          .where(
            and(
              eq(inventoryStacks.playerId, command.playerId),
              eq(inventoryStacks.itemConfigId, itemConfigId),
            ),
          );
      } else {
        await transaction
          .update(inventoryStacks)
          .set({
            quantity: remainingQuantity.toString(),
            updatedAt: command.now,
          })
          .where(
            and(
              eq(inventoryStacks.playerId, command.playerId),
              eq(inventoryStacks.itemConfigId, itemConfigId),
            ),
          );
      }

      const nextRealm = getRealmConfigForLevel(simulated.progress.level);
      await transaction
        .update(playerProgress)
        .set({
          level: simulated.progress.level,
          realmKey: nextRealm.id,
          exp: simulated.progress.experience,
          expRemainderMicros:
            simulated.progress.status === "breakthrough_ready"
              ? 0
              : state.experienceRemainderMicros,
          progressionState: simulated.progress.status,
          totalPower: calculateTotalPower(simulated.progress.level, {
            fixedPower: loadoutBonuses.fixedPower,
          }),
          cultivationReserve: simulated.progress.cultivationReserve,
          version: sql`${playerProgress.version} + 1`,
          updatedAt: command.now,
        })
        .where(eq(playerProgress.playerId, command.playerId));

      const newcomerRewardGranted = await grantLevelEightRewardIfNeeded(
        transaction,
        command.playerId,
        simulated.progress.level,
        operationId,
        "inventory_operation",
        command.now,
      );
      await transaction.insert(assetLedger).values({
        id: randomUUID(),
        playerId: command.playerId,
        assetType: "item",
        assetKey: itemConfigId,
        delta: (-quantity).toString(),
        balanceAfter: remainingQuantity.toString(),
        reason: "inventory_use",
        referenceType: "inventory_operation",
        referenceId: operationId,
        metadata: {
          effectType: effect.type,
          durationSeconds: effect.durationSeconds * quantity,
          experienceGained: simulated.experienceGained,
          experienceDiscarded: simulated.experienceDiscarded,
          fromLevel: state.level,
          toLevel: simulated.progress.level,
        },
        createdAt: command.now,
      });

      const result: InventoryUsePersistenceResult = {
        operationId,
        itemConfigId,
        consumedQuantity: quantity,
        remainingQuantity: remainingQuantity.toString(),
        effectType: effect.type,
        experienceGained: simulated.experienceGained,
        experienceDiscarded: simulated.experienceDiscarded,
        fromLevel: state.level,
        toLevel: simulated.progress.level,
        reachedBreakthrough:
          simulated.progress.status === "breakthrough_ready",
        newcomerRewardGranted,
        events: simulated.events,
      };
      await storeIdempotentResult(
        transaction,
        command,
        "inventory.use",
        { kind: "inventory_use", result },
      );
      return result;
    });
  }

  async debugGrant(
    command: InventoryMutationCommand,
    target: DebugGrantTarget,
  ): Promise<DebugGrantPersistenceResult> {
    return this.database.transaction(async (transaction) => {
      const [state] = await transaction
        .select({
          version: playerProgress.version,
          level: playerProgress.level,
          realmKey: playerProgress.realmKey,
          experience: playerProgress.exp,
          experienceRemainderMicros: playerProgress.expRemainderMicros,
          progressionState: playerProgress.progressionState,
          cultivationReserve: playerProgress.cultivationReserve,
        })
        .from(playerProgress)
        .where(eq(playerProgress.playerId, command.playerId))
        .for("update")
        .limit(1);
      if (!state) throw missingPlayerState();

      const replay = await loadIdempotentResult(
        transaction,
        command,
        "debug.grant",
        parseDebugGrantResult,
      );
      if (replay) return replay;
      assertPlayerVersion(state.version, command.expectedPlayerVersion);

      const operationId = randomUUID();
      let result: DebugGrantPersistenceResult;
      if (target === "fill_experience") {
        if (state.progressionState !== "gaining") {
          throw new AppError(
            "DEBUG_EXPERIENCE_GRANT_BLOCKED",
            "当前修为状态不能继续注入经验",
            409,
            false,
            { progressionState: state.progressionState },
          );
        }
        const configuredRealm = getRealmConfigForLevel(state.level);
        if (configuredRealm.id !== state.realmKey) {
          throw new Error(`Player realm does not match level for player ${command.playerId}`);
        }
        const grantedAmount =
          BigInt(requiredExperienceForLevel(state.level)) - BigInt(state.experience);
        if (grantedAmount <= 0n) {
          throw new Error(`Player experience is not below the level requirement for ${command.playerId}`);
        }
        const applied = applyWholeExperience(
          {
            level: state.level,
            experience: state.experience,
            cultivationReserve: state.cultivationReserve,
            status: state.progressionState as ProgressionStatus,
          },
          grantedAmount.toString(),
        );
        const loadoutBonuses = await loadEquippedBonuses(
          transaction,
          command.playerId,
        );
        const nextRealm = getRealmConfigForLevel(applied.progress.level);
        await transaction
          .update(playerProgress)
          .set({
            level: applied.progress.level,
            realmKey: nextRealm.id,
            exp: applied.progress.experience,
            expRemainderMicros:
              applied.progress.status === "breakthrough_ready"
                ? 0
                : state.experienceRemainderMicros,
            progressionState: applied.progress.status,
            totalPower: calculateTotalPower(applied.progress.level, {
              fixedPower: loadoutBonuses.fixedPower,
            }),
            cultivationReserve: applied.progress.cultivationReserve,
            version: sql`${playerProgress.version} + 1`,
            updatedAt: command.now,
          })
          .where(eq(playerProgress.playerId, command.playerId));
        const newcomerRewardGranted = await grantLevelEightRewardIfNeeded(
          transaction,
          command.playerId,
          applied.progress.level,
          operationId,
          "debug_operation",
          command.now,
        );
        result = {
          operationId,
          target,
          grantedAmount: grantedAmount.toString(),
          balanceAfter: applied.progress.experience,
          fromLevel: state.level,
          toLevel: applied.progress.level,
          reachedBreakthrough:
            applied.progress.status === "breakthrough_ready",
          newcomerRewardGranted,
          events: applied.events,
        };
      } else if (target === "spirit_stone") {
        const grantedAmount = 10_000n;
        const [wallet] = await transaction
          .update(playerWallets)
          .set({
            spiritStone: sql`${playerWallets.spiritStone} + ${grantedAmount.toString()}`,
            lifetimeSpiritStoneEarned: sql`${playerWallets.lifetimeSpiritStoneEarned} + ${grantedAmount.toString()}`,
            updatedAt: command.now,
          })
          .where(eq(playerWallets.playerId, command.playerId))
          .returning({ spiritStone: playerWallets.spiritStone });
        if (!wallet) throw missingPlayerState();
        await incrementPlayerVersion(transaction, command.playerId, command.now);
        await transaction.insert(assetLedger).values({
          id: randomUUID(),
          playerId: command.playerId,
          assetType: "currency",
          assetKey: "spirit_stone",
          delta: grantedAmount.toString(),
          balanceAfter: wallet.spiritStone,
          reason: "debug_grant",
          referenceType: "debug_operation",
          referenceId: operationId,
          metadata: { target },
          createdAt: command.now,
        });
        result = {
          operationId,
          target,
          grantedAmount: grantedAmount.toString(),
          balanceAfter: wallet.spiritStone,
          fromLevel: state.level,
          toLevel: state.level,
          reachedBreakthrough: false,
          newcomerRewardGranted: false,
          events: [],
        };
      } else {
        const grantedAmount = 1n;
        const balanceAfter = await addInventoryStack(
          transaction,
          command.playerId,
          "breakthrough_pill",
          grantedAmount,
          command.now,
        );
        await incrementPlayerVersion(transaction, command.playerId, command.now);
        await transaction.insert(assetLedger).values({
          id: randomUUID(),
          playerId: command.playerId,
          assetType: "item",
          assetKey: "breakthrough_pill",
          delta: grantedAmount.toString(),
          balanceAfter,
          reason: "debug_grant",
          referenceType: "debug_operation",
          referenceId: operationId,
          metadata: { target },
          createdAt: command.now,
        });
        result = {
          operationId,
          target,
          grantedAmount: grantedAmount.toString(),
          balanceAfter,
          fromLevel: state.level,
          toLevel: state.level,
          reachedBreakthrough: false,
          newcomerRewardGranted: false,
          events: [],
        };
      }

      await storeIdempotentResult(
        transaction,
        command,
        "debug.grant",
        { kind: "debug_grant", result },
      );
      return result;
    });
  }

  async expandBag(
    command: InventoryMutationCommand,
  ): Promise<InventoryExpandPersistenceResult> {
    return this.database.transaction(async (transaction) => {
      const [state] = await transaction
        .select({
          version: playerProgress.version,
          bagCapacity: playerSettings.bagCapacity,
          spiritStone: playerWallets.spiritStone,
        })
        .from(playerProgress)
        .innerJoin(
          playerSettings,
          eq(playerSettings.playerId, playerProgress.playerId),
        )
        .innerJoin(
          playerWallets,
          eq(playerWallets.playerId, playerProgress.playerId),
        )
        .where(eq(playerProgress.playerId, command.playerId))
        .for("update")
        .limit(1);
      if (!state) throw missingPlayerState();

      const replay = await loadIdempotentResult(
        transaction,
        command,
        "inventory.expand",
        parseExpandResult,
      );
      if (replay) return replay;
      assertPlayerVersion(state.version, command.expectedPlayerVersion);

      const cost = bagExpansionCostForCapacity(state.bagCapacity);
      if (cost === null || state.bagCapacity >= BAG_MAX_CAPACITY) {
        throw new AppError("BAG_CAPACITY_MAX", "行囊容量已达到上限", 409, false, {
          bagCapacity: state.bagCapacity,
        });
      }
      if (BigInt(state.spiritStone) < BigInt(cost)) {
        throw new AppError("INSUFFICIENT_CURRENCY", "灵石不足，无法扩展行囊", 409, false, {
          currency: "spirit_stone",
          required: cost,
          current: state.spiritStone,
        });
      }

      const operationId = randomUUID();
      const nextCapacity = state.bagCapacity + BAG_EXPANSION_SIZE;
      const [wallet] = await transaction
        .update(playerWallets)
        .set({
          spiritStone: sql`${playerWallets.spiritStone} - ${cost}`,
          updatedAt: command.now,
        })
        .where(eq(playerWallets.playerId, command.playerId))
        .returning({ spiritStone: playerWallets.spiritStone });
      if (!wallet) throw missingPlayerState();
      await transaction
        .update(playerSettings)
        .set({ bagCapacity: nextCapacity, updatedAt: command.now })
        .where(eq(playerSettings.playerId, command.playerId));
      await incrementPlayerVersion(transaction, command.playerId, command.now);
      await transaction.insert(assetLedger).values({
        id: randomUUID(),
        playerId: command.playerId,
        assetType: "currency",
        assetKey: "spirit_stone",
        delta: (-BigInt(cost)).toString(),
        balanceAfter: wallet.spiritStone,
        reason: "inventory_expand",
        referenceType: "inventory_operation",
        referenceId: operationId,
        metadata: {
          fromCapacity: state.bagCapacity,
          toCapacity: nextCapacity,
          purchaseIndex:
            (state.bagCapacity - 50) / BAG_EXPANSION_SIZE + 1,
        },
        createdAt: command.now,
      });

      const result: InventoryExpandPersistenceResult = {
        operationId,
        expandedBy: BAG_EXPANSION_SIZE,
        cost,
        nextCost: bagExpansionCostForCapacity(nextCapacity),
      };
      await storeIdempotentResult(
        transaction,
        command,
        "inventory.expand",
        { kind: "inventory_expand", result },
      );
      return result;
    });
  }

  async transferHarvest(
    command: InventoryMutationCommand,
    entryIds: readonly string[],
  ): Promise<HarvestTransferPersistenceResult> {
    return this.database.transaction(async (transaction) => {
      const state = await lockInventoryState(transaction, command.playerId);
      const replay = await loadIdempotentResult(
        transaction,
        command,
        "harvest.transfer",
        parseTransferResult,
      );
      if (replay) return replay;
      assertPlayerVersion(state.version, command.expectedPlayerVersion);

      const entries = await loadPendingEntries(
        transaction,
        command.playerId,
        entryIds,
      );
      const equipmentToTransfer = entries.filter(
        (entry) => entry.entryType === "equipment",
      ).length;
      const [stackUsage] = await transaction
        .select({ count: sql<number>`count(*)::integer` })
        .from(inventoryStacks)
        .where(eq(inventoryStacks.playerId, command.playerId));
      const [equipmentUsage] = await transaction
        .select({ count: sql<number>`count(*)::integer` })
        .from(equipmentInstances)
        .where(
          and(
            eq(equipmentInstances.playerId, command.playerId),
            inArray(equipmentInstances.location, ["bag", "equipped"]),
          ),
        );
      const usedSlots = (stackUsage?.count ?? 0) + (equipmentUsage?.count ?? 0);
      if (usedSlots + equipmentToTransfer > state.bagCapacity) {
        throw new AppError("BAG_FULL", "行囊空间不足，请先整理或扩容", 409, false, {
          bagCapacity: state.bagCapacity,
          usedSlots,
          requiredSlots: equipmentToTransfer,
        });
      }

      const operationId = randomUUID();
      let transferredEquipment = 0;
      let collectedTechniques = 0;
      let techniqueDuplicates = 0;
      const ownedTechniqueRows = await transaction
        .select({ techniqueConfigId: techniqueProgress.techniqueConfigId })
        .from(techniqueProgress)
        .where(eq(techniqueProgress.playerId, command.playerId))
        .for("update");
      const ownedTechniques = new Set(
        ownedTechniqueRows.map((row) => row.techniqueConfigId),
      );

      for (const entry of entries) {
        if (entry.entryType === "equipment") {
          if (!entry.equipmentInstanceId) throw corruptedHarvestEntry(entry.id);
          await transaction
            .update(equipmentInstances)
            .set({ location: "bag", equippedSlot: null, updatedAt: command.now })
            .where(
              and(
                eq(equipmentInstances.id, entry.equipmentInstanceId),
                eq(equipmentInstances.playerId, command.playerId),
              ),
            );
          transferredEquipment += 1;
        } else {
          if (!entry.techniqueConfigId) throw corruptedHarvestEntry(entry.id);
          if (ownedTechniques.has(entry.techniqueConfigId)) {
            await transaction
              .update(techniqueProgress)
              .set({
                duplicateCount: sql`${techniqueProgress.duplicateCount} + 1`,
                updatedAt: command.now,
              })
              .where(
                and(
                  eq(techniqueProgress.playerId, command.playerId),
                  eq(
                    techniqueProgress.techniqueConfigId,
                    entry.techniqueConfigId,
                  ),
                ),
              );
            techniqueDuplicates += 1;
          } else {
            await transaction.insert(techniqueProgress).values({
              playerId: command.playerId,
              techniqueConfigId: entry.techniqueConfigId,
              configVersion: entry.configVersion,
              acquiredAt: entry.acquiredAt,
              updatedAt: command.now,
            });
            ownedTechniques.add(entry.techniqueConfigId);
            collectedTechniques += 1;
          }
        }
        await transaction
          .update(harvestChestEntries)
          .set({ status: "transferred", processedAt: command.now })
          .where(
            and(
              eq(harvestChestEntries.id, entry.id),
              eq(harvestChestEntries.playerId, command.playerId),
            ),
          );
        await transaction.insert(assetLedger).values({
          id: randomUUID(),
          playerId: command.playerId,
          assetType: entry.entryType,
          assetKey:
            entry.equipmentInstanceId ?? entry.techniqueConfigId ?? "unknown",
          delta: "0",
          balanceAfter: null,
          reason: "harvest_transfer",
          referenceType: "harvest_operation",
          referenceId: operationId,
          metadata: { harvestEntryId: entry.id },
          createdAt: command.now,
        });
      }

      await incrementPlayerVersion(transaction, command.playerId, command.now);
      const result: HarvestTransferPersistenceResult = {
        operationId,
        transferredEquipment,
        collectedTechniques,
        techniqueDuplicates,
      };
      await storeIdempotentResult(
        transaction,
        command,
        "harvest.transfer",
        { kind: "harvest_transfer", result },
      );
      return result;
    });
  }

  async salvageHarvest(
    command: InventoryMutationCommand,
    entryIds: readonly string[],
    confirmHighQuality: boolean,
  ): Promise<HarvestSalvagePersistenceResult> {
    return this.database.transaction(async (transaction) => {
      const state = await lockInventoryState(transaction, command.playerId);
      const replay = await loadIdempotentResult(
        transaction,
        command,
        "harvest.salvage",
        parseSalvageResult,
      );
      if (replay) return replay;
      assertPlayerVersion(state.version, command.expectedPlayerVersion);

      const entries = await loadPendingEntries(
        transaction,
        command.playerId,
        entryIds,
      );
      const highQualityEntries = entries.filter(
        (entry) => ASSET_QUALITY_ORDER[entry.quality] >= ASSET_QUALITY_ORDER.rare,
      );
      if (highQualityEntries.length > 0 && !confirmHighQuality) {
        throw new AppError(
          "HIGH_QUALITY_CONFIRMATION_REQUIRED",
          "稀有及以上收获需要再次确认后才能分解",
          409,
          false,
          { entryIds: highQualityEntries.map((entry) => entry.id) },
        );
      }

      const operationId = randomUUID();
      let spiritStone = 0n;
      let enhanceStone = 0n;
      for (const entry of entries) {
        const reward = getSalvageYield(entry.entryType, entry.quality);
        spiritStone += reward.spiritStone;
        enhanceStone += reward.enhanceStone;
        if (entry.equipmentInstanceId) {
          await transaction
            .update(equipmentInstances)
            .set({ location: "consumed", updatedAt: command.now })
            .where(
              and(
                eq(equipmentInstances.id, entry.equipmentInstanceId),
                eq(equipmentInstances.playerId, command.playerId),
              ),
            );
        }
        await transaction
          .update(harvestChestEntries)
          .set({ status: "salvaged", processedAt: command.now })
          .where(
            and(
              eq(harvestChestEntries.id, entry.id),
              eq(harvestChestEntries.playerId, command.playerId),
            ),
          );
        await transaction.insert(assetLedger).values({
          id: randomUUID(),
          playerId: command.playerId,
          assetType: entry.entryType,
          assetKey:
            entry.equipmentInstanceId ?? entry.techniqueConfigId ?? "unknown",
          delta: "-1",
          balanceAfter: null,
          reason: "harvest_salvage",
          referenceType: "harvest_operation",
          referenceId: operationId,
          metadata: {
            harvestEntryId: entry.id,
            quality: entry.quality,
            spiritStoneReturned: reward.spiritStone.toString(),
            enhanceStoneReturned: reward.enhanceStone.toString(),
          },
          createdAt: command.now,
        });
      }

      if (spiritStone > 0n) {
        const [wallet] = await transaction
          .update(playerWallets)
          .set({
            spiritStone: sql`${playerWallets.spiritStone} + ${spiritStone.toString()}`,
            lifetimeSpiritStoneEarned: sql`${playerWallets.lifetimeSpiritStoneEarned} + ${spiritStone.toString()}`,
            updatedAt: command.now,
          })
          .where(eq(playerWallets.playerId, command.playerId))
          .returning({ spiritStone: playerWallets.spiritStone });
        if (!wallet) throw missingPlayerState();
        await transaction.insert(assetLedger).values({
          id: randomUUID(),
          playerId: command.playerId,
          assetType: "currency",
          assetKey: "spirit_stone",
          delta: spiritStone.toString(),
          balanceAfter: wallet.spiritStone,
          reason: "harvest_salvage",
          referenceType: "harvest_operation",
          referenceId: operationId,
          metadata: { salvagedCount: entries.length },
          createdAt: command.now,
        });
      }
      if (enhanceStone > 0n) {
        const balanceAfter = await addInventoryStack(
          transaction,
          command.playerId,
          "enhance_stone",
          enhanceStone,
          command.now,
        );
        await transaction.insert(assetLedger).values({
          id: randomUUID(),
          playerId: command.playerId,
          assetType: "item",
          assetKey: "enhance_stone",
          delta: enhanceStone.toString(),
          balanceAfter,
          reason: "harvest_salvage",
          referenceType: "harvest_operation",
          referenceId: operationId,
          metadata: { salvagedCount: entries.length },
          createdAt: command.now,
        });
      }

      await incrementPlayerVersion(transaction, command.playerId, command.now);
      const result: HarvestSalvagePersistenceResult = {
        operationId,
        salvagedCount: entries.length,
        spiritStoneGained: spiritStone.toString(),
        enhanceStoneGained: enhanceStone.toString(),
      };
      await storeIdempotentResult(
        transaction,
        command,
        "harvest.salvage",
        { kind: "harvest_salvage", result },
      );
      return result;
    });
  }
}

interface StoredHarvestEntry {
  id: string;
  entryType: "equipment" | "technique";
  equipmentInstanceId: string | null;
  techniqueConfigId: string | null;
  quality: AssetQuality;
  configVersion: string;
  acquiredAt: Date;
}

async function loadEquippedBonuses(
  transaction: GameTransaction,
  playerId: string,
) {
  const [techniques, equipment] = await Promise.all([
    transaction
      .select({
        techniqueConfigId: techniqueProgress.techniqueConfigId,
        star: techniqueProgress.star,
      })
      .from(techniqueProgress)
      .where(
        and(
          eq(techniqueProgress.playerId, playerId),
          isNotNull(techniqueProgress.equippedSlot),
        ),
      ),
    transaction
      .select({
        equipmentConfigId: equipmentInstances.equipmentConfigId,
        quality: equipmentInstances.quality,
        enhanceLevel: equipmentInstances.enhanceLevel,
        rolledAffixes: equipmentInstances.rolledAffixes,
      })
      .from(equipmentInstances)
      .where(
        and(
          eq(equipmentInstances.playerId, playerId),
          eq(equipmentInstances.location, "equipped"),
        ),
      ),
  ]);
  return calculateLoadoutBonuses({
    techniques,
    equipment: equipment.map((item) => {
      if (!isAssetQuality(item.quality)) {
        throw new Error(`Unknown stored asset quality: ${item.quality}`);
      }
      return { ...item, quality: item.quality };
    }),
  });
}

async function lockInventoryState(
  transaction: GameTransaction,
  playerId: string,
): Promise<{ version: bigint; bagCapacity: number }> {
  const [state] = await transaction
    .select({
      version: playerProgress.version,
      bagCapacity: playerSettings.bagCapacity,
    })
    .from(playerProgress)
    .innerJoin(
      playerSettings,
      eq(playerSettings.playerId, playerProgress.playerId),
    )
    .where(eq(playerProgress.playerId, playerId))
    .for("update")
    .limit(1);
  if (!state) throw missingPlayerState();
  return state;
}

async function loadPendingEntries(
  transaction: GameTransaction,
  playerId: string,
  entryIds: readonly string[],
): Promise<StoredHarvestEntry[]> {
  const rows = await transaction
    .select({
      id: harvestChestEntries.id,
      entryType: harvestChestEntries.entryType,
      equipmentInstanceId: harvestChestEntries.equipmentInstanceId,
      techniqueConfigId: harvestChestEntries.techniqueConfigId,
      quality: harvestChestEntries.quality,
      configVersion: harvestChestEntries.configVersion,
      acquiredAt: harvestChestEntries.acquiredAt,
    })
    .from(harvestChestEntries)
    .where(
      and(
        eq(harvestChestEntries.playerId, playerId),
        eq(harvestChestEntries.status, "pending"),
        inArray(harvestChestEntries.id, [...entryIds]),
      ),
    )
    .for("update");
  if (rows.length !== entryIds.length) {
    throw new AppError(
      "HARVEST_ENTRY_NOT_AVAILABLE",
      "部分收获已处理或不存在，请刷新后重试",
      409,
      false,
    );
  }
  const order = new Map(entryIds.map((id, index) => [id, index]));
  return rows
    .map((row) => ({
      ...row,
      entryType: parseEntryType(row.entryType),
      quality: parseQuality(row.quality),
    }))
    .sort((left, right) =>
      (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
    );
}

async function incrementPlayerVersion(
  transaction: GameTransaction,
  playerId: string,
  now: Date,
): Promise<void> {
  await transaction
    .update(playerProgress)
    .set({
      version: sql`${playerProgress.version} + 1`,
      updatedAt: now,
    })
    .where(eq(playerProgress.playerId, playerId));
}

async function addInventoryStack(
  transaction: GameTransaction,
  playerId: string,
  itemConfigId: string,
  quantity: bigint,
  now: Date,
): Promise<string> {
  const [stack] = await transaction
    .insert(inventoryStacks)
    .values({ playerId, itemConfigId, quantity: quantity.toString(), updatedAt: now })
    .onConflictDoUpdate({
      target: [inventoryStacks.playerId, inventoryStacks.itemConfigId],
      set: {
        quantity: sql`${inventoryStacks.quantity} + ${quantity.toString()}`,
        updatedAt: now,
      },
    })
    .returning({ quantity: inventoryStacks.quantity });
  if (!stack) throw new Error("Inventory stack upsert did not return a row");
  return stack.quantity;
}

async function loadIdempotentResult<T>(
  transaction: GameTransaction,
  command: InventoryMutationCommand,
  scope: string,
  parse: (value: unknown) => T,
): Promise<T | null> {
  const [record] = await transaction
    .select({
      requestHash: idempotencyRecords.requestHash,
      responseBody: idempotencyRecords.responseBody,
      expiresAt: idempotencyRecords.expiresAt,
    })
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.accountId, command.accountId),
        eq(idempotencyRecords.scope, scope),
        eq(idempotencyRecords.idempotencyKey, command.idempotencyKey),
      ),
    )
    .limit(1);
  if (!record) return null;
  if (record.expiresAt <= command.now) {
    await transaction
      .delete(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.accountId, command.accountId),
          eq(idempotencyRecords.scope, scope),
          eq(idempotencyRecords.idempotencyKey, command.idempotencyKey),
        ),
      );
    return null;
  }
  if (record.requestHash !== command.requestHash) {
    throw new AppError(
      "IDEMPOTENCY_KEY_REUSED",
      "相同幂等键不能用于不同的行囊操作",
      409,
      false,
    );
  }
  return parse(record.responseBody);
}

async function storeIdempotentResult(
  transaction: GameTransaction,
  command: InventoryMutationCommand,
  scope: string,
  responseBody: unknown,
): Promise<void> {
  await transaction.insert(idempotencyRecords).values({
    accountId: command.accountId,
    scope,
    idempotencyKey: command.idempotencyKey,
    requestHash: command.requestHash,
    statusCode: 200,
    responseBody,
    expiresAt: command.idempotencyExpiresAt,
    createdAt: command.now,
  });
}

function parseExpandResult(value: unknown): InventoryExpandPersistenceResult {
  const result = parseStoredResult(value, "inventory_expand");
  if (
    typeof result.operationId !== "string" ||
    typeof result.expandedBy !== "number" ||
    typeof result.cost !== "string" ||
    (result.nextCost !== null && typeof result.nextCost !== "string")
  ) {
    throw invalidStoredResult();
  }
  return result as unknown as InventoryExpandPersistenceResult;
}

function parseUseResult(value: unknown): InventoryUsePersistenceResult {
  const result = parseStoredResult(value, "inventory_use");
  if (
    typeof result.operationId !== "string" ||
    typeof result.itemConfigId !== "string" ||
    typeof result.consumedQuantity !== "number" ||
    typeof result.remainingQuantity !== "string" ||
    result.effectType !== "simulated_online_experience" ||
    typeof result.experienceGained !== "string" ||
    typeof result.experienceDiscarded !== "string" ||
    typeof result.fromLevel !== "number" ||
    typeof result.toLevel !== "number" ||
    typeof result.reachedBreakthrough !== "boolean" ||
    typeof result.newcomerRewardGranted !== "boolean" ||
    !Array.isArray(result.events)
  ) {
    throw invalidStoredResult();
  }
  return result as unknown as InventoryUsePersistenceResult;
}

function parseDebugGrantResult(value: unknown): DebugGrantPersistenceResult {
  const result = parseStoredResult(value, "debug_grant");
  if (
    typeof result.operationId !== "string" ||
    !isDebugGrantTarget(result.target) ||
    typeof result.grantedAmount !== "string" ||
    typeof result.balanceAfter !== "string" ||
    typeof result.fromLevel !== "number" ||
    typeof result.toLevel !== "number" ||
    typeof result.reachedBreakthrough !== "boolean" ||
    typeof result.newcomerRewardGranted !== "boolean" ||
    !Array.isArray(result.events)
  ) {
    throw invalidStoredResult();
  }
  return result as unknown as DebugGrantPersistenceResult;
}

function parseTransferResult(value: unknown): HarvestTransferPersistenceResult {
  const result = parseStoredResult(value, "harvest_transfer");
  if (
    typeof result.operationId !== "string" ||
    typeof result.transferredEquipment !== "number" ||
    typeof result.collectedTechniques !== "number" ||
    typeof result.techniqueDuplicates !== "number"
  ) {
    throw invalidStoredResult();
  }
  return result as unknown as HarvestTransferPersistenceResult;
}

function parseSalvageResult(value: unknown): HarvestSalvagePersistenceResult {
  const result = parseStoredResult(value, "harvest_salvage");
  if (
    typeof result.operationId !== "string" ||
    typeof result.salvagedCount !== "number" ||
    typeof result.spiritStoneGained !== "string" ||
    typeof result.enhanceStoneGained !== "string"
  ) {
    throw invalidStoredResult();
  }
  return result as unknown as HarvestSalvagePersistenceResult;
}

function parseStoredResult(
  value: unknown,
  kind: string,
): Record<string, unknown> {
  if (!isRecord(value) || value.kind !== kind || !isRecord(value.result)) {
    throw invalidStoredResult();
  }
  return value.result;
}

function assertPlayerVersion(actual: bigint, expected?: string): void {
  if (expected !== undefined && actual.toString() !== expected) {
    throw new AppError(
      "PLAYER_VERSION_CONFLICT",
      "角色数据版本已更新，请刷新后重试",
      409,
      false,
      { currentPlayerVersion: actual.toString() },
    );
  }
}

function parseQuality(value: string): AssetQuality {
  if (!isAssetQuality(value)) throw new Error(`Unknown stored asset quality: ${value}`);
  return value;
}

function parseEntryType(value: string): "equipment" | "technique" {
  if (value !== "equipment" && value !== "technique") {
    throw new Error(`Unknown harvest entry type: ${value}`);
  }
  return value;
}

function isDebugGrantTarget(value: unknown): value is DebugGrantTarget {
  return (
    value === "fill_experience" ||
    value === "spirit_stone" ||
    value === "breakthrough_pill"
  );
}

function corruptedHarvestEntry(entryId: string): Error {
  return new Error(`Harvest entry ${entryId} does not reference its asset`);
}

function invalidStoredResult(): Error {
  return new Error("Invalid inventory idempotency response");
}

function missingPlayerState(): AppError {
  return new AppError("UNAUTHENTICATED", "角色状态不存在，请重新登录", 401, false);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
