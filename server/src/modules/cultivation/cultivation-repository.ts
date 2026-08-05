import { randomUUID } from "node:crypto";
import {
  BASIS_POINTS,
  calculateLoadoutBonuses,
  calculateTotalPower,
  completeBreakthrough,
  getRealmConfigForLevel,
  isAssetQuality,
  settleCultivation as calculateCultivationSettlement,
  type CultivationSettlementMode,
  type CultivationSettlementSummary,
  type DropRewardSummary,
  type OfflineSettlementSummary,
  type ProgressionStatus,
} from "@cultivation-diary/shared";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { AppError } from "../../common/app-error";
import {
  ACTIVE_GAME_CONFIG_VERSION,
  ACTIVE_IDLE_DROP_TABLE,
  BASE_OFFLINE_EFFICIENCY_BP,
  ONLINE_HEARTBEAT_GRACE_MILLISECONDS,
} from "../../config/game-config";
import {
  assetLedger,
  equipmentInstances,
  idempotencyRecords,
  inventoryStacks,
  offlineSettlements,
  playerProgress,
  playerWallets,
  techniqueProgress,
} from "../../db/schema";
import type { GameDatabase } from "../../infrastructure";
import {
  emptyDropRewardSummary,
  persistIdleDrops,
  type DropRandomInt,
} from "./drop-rewards";
import {
  BREAKTHROUGH_PILL_ITEM_ID,
  grantLevelEightRewardIfNeeded,
} from "./progression-rewards";

export {
  BREAKTHROUGH_PILL_ITEM_ID,
  REACH_LEVEL_EIGHT_TASK_ID,
} from "./progression-rewards";

const MAX_SETTLEMENT_MILLISECONDS = 86_400_000;

export interface CultivationMutationCommand {
  accountId: string;
  playerId: string;
  idempotencyKey: string;
  requestHash: string;
  expectedPlayerVersion?: string;
  now: Date;
  idempotencyExpiresAt: Date;
}

export interface BreakthroughPersistenceResult {
  breakthroughId: string;
  fromLevel: number;
  toLevel: number;
  consumedPills: number;
  offlineSettlement: OfflineSettlementSummary | null;
}

export class CultivationRepository {
  constructor(
    private readonly database: GameDatabase,
    private readonly randomInt?: DropRandomInt,
  ) {}

  async settle(
    command: CultivationMutationCommand,
  ): Promise<CultivationSettlementSummary> {
    return this.database.transaction(async (transaction) => {
      const [state] = await transaction
        .select({
          level: playerProgress.level,
          realmKey: playerProgress.realmKey,
          experience: playerProgress.exp,
          experienceRemainderMicros: playerProgress.expRemainderMicros,
          progressionState: playerProgress.progressionState,
          cultivationReserve: playerProgress.cultivationReserve,
          lastSettledAt: playerProgress.lastSettledAt,
          lastHeartbeatAt: playerProgress.lastHeartbeatAt,
          dropClockRemainderMicros: playerProgress.dropClockRemainderMicros,
          version: playerProgress.version,
          spiritStoneRemainderMicros: playerWallets.stoneRemainderMicros,
        })
        .from(playerProgress)
        .innerJoin(playerWallets, eq(playerWallets.playerId, playerProgress.playerId))
        .where(eq(playerProgress.playerId, command.playerId))
        .for("update")
        .limit(1);

      if (!state) throw missingPlayerState();
      const replay = await loadIdempotentResult(
        transaction,
        command,
        "cultivation.settle",
        parseStoredSettlement,
      );
      if (replay) return replay;
      assertPlayerVersion(state.version, command.expectedPlayerVersion);

      const configuredRealm = getRealmConfigForLevel(state.level);
      if (configuredRealm.id !== state.realmKey) {
        throw new Error(`Player realm does not match level for player ${command.playerId}`);
      }
      const loadoutBonuses = await loadEquippedBonuses(transaction, command.playerId);

      const settlementWindow = getSettlementWindow(
        state.lastSettledAt,
        state.lastHeartbeatAt,
        command.now,
      );
      const { elapsedMilliseconds } = settlementWindow;
      const calculated = calculateCultivationSettlement({
        progress: {
          level: state.level,
          experience: state.experience,
          cultivationReserve: state.cultivationReserve,
          status: state.progressionState as ProgressionStatus,
        },
        elapsedMilliseconds,
        experienceRemainderMicros: state.experienceRemainderMicros,
        spiritStoneRemainderMicros: state.spiritStoneRemainderMicros,
        dropClockRemainderMicros: state.dropClockRemainderMicros,
        efficiencyBp: settlementWindow.efficiencyBp,
        experienceBonusBp: loadoutBonuses.experienceBonusBp,
        spiritStoneBonusBp: loadoutBonuses.spiritStoneBonusBp,
        dropBonusBp: loadoutBonuses.dropBonusBp,
      });
      const nextRealm = getRealmConfigForLevel(calculated.progress.level);
      const settlementId = randomUUID();

      await transaction
        .update(playerProgress)
        .set({
          level: calculated.progress.level,
          realmKey: nextRealm.id,
          exp: calculated.progress.experience,
          expRemainderMicros: calculated.experienceRemainderMicros,
          progressionState: calculated.progress.status,
          totalPower: calculateTotalPower(calculated.progress.level, {
            fixedPower: loadoutBonuses.fixedPower,
          }),
          cultivationReserve: calculated.progress.cultivationReserve,
          lastSettledAt: settlementWindow.settledAt,
          lastHeartbeatAt: settlementWindow.settledAt,
          dropClockRemainderMicros: calculated.dropClockRemainderMicros,
          version: sql`${playerProgress.version} + 1`,
          updatedAt: command.now,
        })
        .where(eq(playerProgress.playerId, command.playerId));

      const [wallet] = await transaction
        .update(playerWallets)
        .set({
          spiritStone: sql`${playerWallets.spiritStone} + ${calculated.spiritStoneGained}`,
          lifetimeSpiritStoneEarned: sql`${playerWallets.lifetimeSpiritStoneEarned} + ${calculated.spiritStoneGained}`,
          stoneRemainderMicros: calculated.spiritStoneRemainderMicros,
          updatedAt: command.now,
        })
        .where(eq(playerWallets.playerId, command.playerId))
        .returning({ spiritStone: playerWallets.spiritStone });

      if (!wallet) throw missingPlayerState();

      if (calculated.spiritStoneGained !== "0") {
        await transaction.insert(assetLedger).values({
          id: randomUUID(),
          playerId: command.playerId,
          assetType: "currency",
          assetKey: "spirit_stone",
          delta: calculated.spiritStoneGained,
          balanceAfter: wallet.spiritStone,
          reason:
            settlementWindow.mode === "offline"
              ? "offline_cultivation_settlement"
              : "cultivation_settlement",
          referenceType:
            settlementWindow.mode === "offline"
              ? "offline_settlement"
              : "settlement",
          referenceId: settlementId,
          metadata: {
            elapsedMilliseconds,
            mode: settlementWindow.mode,
            efficiencyBp: settlementWindow.efficiencyBp,
          },
          createdAt: command.now,
        });
      }

      const settlementReferenceType =
        settlementWindow.mode === "offline"
          ? ("offline_settlement" as const)
          : ("settlement" as const);
      const drops = await persistIdleDrops(transaction, {
        playerId: command.playerId,
        level: calculated.progress.level,
        attempts: calculated.dropAttempts,
        referenceId: settlementId,
        referenceType: settlementReferenceType,
        reason:
          settlementWindow.mode === "offline"
            ? "offline_idle_drop"
            : "idle_drop",
        now: command.now,
        ...(this.randomInt ? { randomInt: this.randomInt } : {}),
      });

      const newcomerRewardGranted = await grantLevelEightRewardIfNeeded(
        transaction,
        command.playerId,
        calculated.progress.level,
        settlementId,
        settlementReferenceType,
        command.now,
      );
      const offlineSettlement = await recordOfflineSettlementIfNeeded(
        transaction,
        command.playerId,
        settlementId,
        settlementWindow,
        {
          experienceGained: calculated.experienceGained,
          experienceDiscarded: calculated.experienceDiscarded,
          spiritStoneGained: calculated.spiritStoneGained,
          dropAttempts: calculated.dropAttempts,
          drops,
          events: calculated.events,
          newcomerRewardGranted,
        },
        command.now,
      );
      const result: CultivationSettlementSummary = {
        settlementId,
        mode: settlementWindow.mode,
        efficiencyBp: settlementWindow.efficiencyBp,
        elapsedMilliseconds,
        experienceGained: calculated.experienceGained,
        experienceDiscarded: calculated.experienceDiscarded,
        spiritStoneGained: calculated.spiritStoneGained,
        dropAttempts: calculated.dropAttempts,
        drops,
        events: calculated.events,
        newcomerRewardGranted,
        offlineSettlement,
      };

      await storeIdempotentResult(
        transaction,
        command,
        "cultivation.settle",
        { kind: "cultivation_settlement", result },
      );
      return result;
    });
  }

  async breakthrough(
    command: CultivationMutationCommand,
  ): Promise<BreakthroughPersistenceResult> {
    return this.database.transaction(async (transaction) => {
      const [state] = await transaction
        .select({
          level: playerProgress.level,
          realmKey: playerProgress.realmKey,
          experience: playerProgress.exp,
          experienceRemainderMicros: playerProgress.expRemainderMicros,
          cultivationReserve: playerProgress.cultivationReserve,
          progressionState: playerProgress.progressionState,
          lastSettledAt: playerProgress.lastSettledAt,
          lastHeartbeatAt: playerProgress.lastHeartbeatAt,
          dropClockRemainderMicros: playerProgress.dropClockRemainderMicros,
          version: playerProgress.version,
          spiritStoneRemainderMicros: playerWallets.stoneRemainderMicros,
        })
        .from(playerProgress)
        .innerJoin(playerWallets, eq(playerWallets.playerId, playerProgress.playerId))
        .where(eq(playerProgress.playerId, command.playerId))
        .for("update")
        .limit(1);

      if (!state) throw missingPlayerState();
      const replay = await loadIdempotentResult(
        transaction,
        command,
        "cultivation.breakthrough",
        parseStoredBreakthrough,
      );
      if (replay) return replay;
      assertPlayerVersion(state.version, command.expectedPlayerVersion);

      const configuredRealm = getRealmConfigForLevel(state.level);
      if (configuredRealm.id !== state.realmKey) {
        throw new Error(`Player realm does not match level for player ${command.playerId}`);
      }
      const loadoutBonuses = await loadEquippedBonuses(transaction, command.playerId);

      let completed: ReturnType<typeof completeBreakthrough>;
      try {
        completed = completeBreakthrough({
          level: state.level,
          experience: state.experience,
          cultivationReserve: state.cultivationReserve,
          status: state.progressionState as ProgressionStatus,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "BREAKTHROUGH_NOT_READY") {
          throw new AppError(
            "BREAKTHROUGH_NOT_READY",
            "当前修为尚未达到突破条件",
            409,
            false,
          );
        }
        throw error;
      }

      const settlementWindow = getSettlementWindow(
        state.lastSettledAt,
        state.lastHeartbeatAt,
        command.now,
      );
      const pendingSettlement = calculateCultivationSettlement({
        progress: {
          level: state.level,
          experience: state.experience,
          cultivationReserve: state.cultivationReserve,
          status: state.progressionState as ProgressionStatus,
        },
        elapsedMilliseconds: settlementWindow.elapsedMilliseconds,
        experienceRemainderMicros: state.experienceRemainderMicros,
        spiritStoneRemainderMicros: state.spiritStoneRemainderMicros,
        dropClockRemainderMicros: state.dropClockRemainderMicros,
        efficiencyBp: settlementWindow.efficiencyBp,
        experienceBonusBp: loadoutBonuses.experienceBonusBp,
        spiritStoneBonusBp: loadoutBonuses.spiritStoneBonusBp,
        dropBonusBp: loadoutBonuses.dropBonusBp,
      });
      const breakthroughId = randomUUID();

      const [pillStack] = await transaction
        .select({ quantity: inventoryStacks.quantity })
        .from(inventoryStacks)
        .where(
          and(
            eq(inventoryStacks.playerId, command.playerId),
            eq(inventoryStacks.itemConfigId, BREAKTHROUGH_PILL_ITEM_ID),
          ),
        )
        .for("update")
        .limit(1);
      const currentPills = BigInt(pillStack?.quantity ?? "0");
      const requiredPills = BigInt(completed.requiredPills);
      if (currentPills < requiredPills) {
        throw new AppError("INSUFFICIENT_ITEM", "突破丹不足", 409, false, {
          itemConfigId: BREAKTHROUGH_PILL_ITEM_ID,
          required: completed.requiredPills,
          current: currentPills.toString(),
        });
      }

      const remainingPills = currentPills - requiredPills;
      if (remainingPills === 0n) {
        await transaction
          .delete(inventoryStacks)
          .where(
            and(
              eq(inventoryStacks.playerId, command.playerId),
              eq(inventoryStacks.itemConfigId, BREAKTHROUGH_PILL_ITEM_ID),
            ),
          );
      } else {
        await transaction
          .update(inventoryStacks)
          .set({ quantity: remainingPills.toString(), updatedAt: command.now })
          .where(
            and(
              eq(inventoryStacks.playerId, command.playerId),
              eq(inventoryStacks.itemConfigId, BREAKTHROUGH_PILL_ITEM_ID),
            ),
          );
      }

      const nextRealm = getRealmConfigForLevel(completed.progress.level);
      const [wallet] = await transaction
        .update(playerWallets)
        .set({
          spiritStone: sql`${playerWallets.spiritStone} + ${pendingSettlement.spiritStoneGained}`,
          lifetimeSpiritStoneEarned: sql`${playerWallets.lifetimeSpiritStoneEarned} + ${pendingSettlement.spiritStoneGained}`,
          stoneRemainderMicros: pendingSettlement.spiritStoneRemainderMicros,
          updatedAt: command.now,
        })
        .where(eq(playerWallets.playerId, command.playerId))
        .returning({ spiritStone: playerWallets.spiritStone });

      if (!wallet) throw missingPlayerState();

      await transaction
        .update(playerProgress)
        .set({
          level: completed.progress.level,
          realmKey: nextRealm.id,
          exp: completed.progress.experience,
          expRemainderMicros: 0,
          progressionState: completed.progress.status,
          totalPower: calculateTotalPower(completed.progress.level, {
            fixedPower: loadoutBonuses.fixedPower,
          }),
          cultivationReserve: completed.progress.cultivationReserve,
          lastSettledAt: settlementWindow.settledAt,
          lastHeartbeatAt: settlementWindow.settledAt,
          dropClockRemainderMicros: pendingSettlement.dropClockRemainderMicros,
          version: sql`${playerProgress.version} + 1`,
          updatedAt: command.now,
        })
        .where(eq(playerProgress.playerId, command.playerId));

      if (pendingSettlement.spiritStoneGained !== "0") {
        await transaction.insert(assetLedger).values({
          id: randomUUID(),
          playerId: command.playerId,
          assetType: "currency",
          assetKey: "spirit_stone",
          delta: pendingSettlement.spiritStoneGained,
          balanceAfter: wallet.spiritStone,
          reason: "cultivation_settlement_before_breakthrough",
          referenceType: "breakthrough",
          referenceId: breakthroughId,
          metadata: {
            elapsedMilliseconds: settlementWindow.elapsedMilliseconds,
            level: state.level,
            mode: settlementWindow.mode,
            efficiencyBp: settlementWindow.efficiencyBp,
          },
          createdAt: command.now,
        });
      }

      await transaction.insert(assetLedger).values({
        id: randomUUID(),
        playerId: command.playerId,
        assetType: "item",
        assetKey: BREAKTHROUGH_PILL_ITEM_ID,
        delta: (-completed.requiredPills).toString(),
        balanceAfter: remainingPills.toString(),
        reason: "cultivation_breakthrough",
        referenceType: "breakthrough",
        referenceId: breakthroughId,
        metadata: { fromLevel: state.level, toLevel: completed.progress.level },
        createdAt: command.now,
      });

      const drops = await persistIdleDrops(transaction, {
        playerId: command.playerId,
        level: state.level,
        attempts: pendingSettlement.dropAttempts,
        referenceId: breakthroughId,
        referenceType: "breakthrough",
        reason: "idle_drop_before_breakthrough",
        now: command.now,
        ...(this.randomInt ? { randomInt: this.randomInt } : {}),
      });

      const offlineSettlement = await recordOfflineSettlementIfNeeded(
        transaction,
        command.playerId,
        breakthroughId,
        settlementWindow,
        {
          experienceGained: pendingSettlement.experienceGained,
          experienceDiscarded: pendingSettlement.experienceDiscarded,
          spiritStoneGained: pendingSettlement.spiritStoneGained,
          dropAttempts: pendingSettlement.dropAttempts,
          drops,
          events: pendingSettlement.events,
          newcomerRewardGranted: false,
        },
        command.now,
      );

      const result: BreakthroughPersistenceResult = {
        breakthroughId,
        fromLevel: state.level,
        toLevel: completed.progress.level,
        consumedPills: completed.requiredPills,
        offlineSettlement,
      };
      await storeIdempotentResult(
        transaction,
        command,
        "cultivation.breakthrough",
        { kind: "cultivation_breakthrough", result },
      );
      return result;
    });
  }
}

type GameTransaction = Parameters<Parameters<GameDatabase["transaction"]>[0]>[0];

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

interface SettlementWindow {
  fromTime: Date;
  toTime: Date;
  elapsedMilliseconds: number;
  settledAt: Date;
  mode: CultivationSettlementMode;
  efficiencyBp: number;
}

interface SettlementRewardsSnapshot {
  experienceGained: string;
  experienceDiscarded: string;
  spiritStoneGained: string;
  dropAttempts: number;
  drops: DropRewardSummary;
  events: CultivationSettlementSummary["events"];
  newcomerRewardGranted: boolean;
}

async function recordOfflineSettlementIfNeeded(
  transaction: GameTransaction,
  playerId: string,
  settlementId: string,
  window: SettlementWindow,
  rewards: SettlementRewardsSnapshot,
  now: Date,
): Promise<OfflineSettlementSummary | null> {
  if (window.mode !== "offline" || window.elapsedMilliseconds === 0) {
    return null;
  }

  const summary: OfflineSettlementSummary = {
    id: settlementId,
    fromTime: window.fromTime.toISOString(),
    toTime: window.toTime.toISOString(),
    effectiveSeconds: Math.floor(window.elapsedMilliseconds / 1_000),
    efficiencyBp: window.efficiencyBp,
    ...rewards,
  };
  await transaction.insert(offlineSettlements).values({
    id: settlementId,
    playerId,
    fromTime: window.fromTime,
    toTime: window.toTime,
    effectiveSeconds: summary.effectiveSeconds,
    offlineEfficiencyBp: window.efficiencyBp,
    rewardSnapshot: rewards,
    configVersions: {
      game: ACTIVE_GAME_CONFIG_VERSION,
      idleDrop: ACTIVE_IDLE_DROP_TABLE.version,
    },
    baseCreditedAt: now,
    createdAt: now,
  });
  return summary;
}

function getSettlementWindow(
  lastSettledAt: Date,
  lastHeartbeatAt: Date | null,
  now: Date,
): SettlementWindow {
  const lastSettledTime = lastSettledAt.getTime();
  const targetTime = Math.max(lastSettledAt.getTime(), now.getTime());
  const elapsedMilliseconds = Math.min(
    MAX_SETTLEMENT_MILLISECONDS,
    targetTime - lastSettledTime,
  );
  const lastActivityTime = Math.max(
    lastSettledTime,
    lastHeartbeatAt?.getTime() ?? lastSettledTime,
  );
  const mode: CultivationSettlementMode =
    elapsedMilliseconds > 0 &&
    targetTime - lastActivityTime > ONLINE_HEARTBEAT_GRACE_MILLISECONDS
      ? "offline"
      : "online";
  return {
    fromTime: new Date(lastSettledTime),
    toTime: new Date(targetTime),
    elapsedMilliseconds,
    settledAt: new Date(targetTime),
    mode,
    efficiencyBp:
      mode === "offline" ? BASE_OFFLINE_EFFICIENCY_BP : BASIS_POINTS,
  };
}

async function loadIdempotentResult<T>(
  transaction: GameTransaction,
  command: CultivationMutationCommand,
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
      "相同幂等键不能用于不同修炼请求",
      409,
      false,
    );
  }
  return parse(record.responseBody);
}

async function storeIdempotentResult(
  transaction: GameTransaction,
  command: CultivationMutationCommand,
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

function parseStoredSettlement(value: unknown): CultivationSettlementSummary {
  if (!isRecord(value) || value.kind !== "cultivation_settlement" || !isRecord(value.result)) {
    throw new Error("Invalid cultivation settlement idempotency response");
  }
  const result = value.result;
  if (
    typeof result.settlementId !== "string" ||
    typeof result.elapsedMilliseconds !== "number" ||
    typeof result.experienceGained !== "string" ||
    typeof result.experienceDiscarded !== "string" ||
    typeof result.spiritStoneGained !== "string" ||
    typeof result.dropAttempts !== "number" ||
    !Array.isArray(result.events) ||
    typeof result.newcomerRewardGranted !== "boolean"
  ) {
    throw new Error("Invalid cultivation settlement idempotency response");
  }
  const mode =
    result.mode === "offline" || result.mode === "online"
      ? result.mode
      : "online";
  const efficiencyBp =
    typeof result.efficiencyBp === "number"
      ? result.efficiencyBp
      : BASIS_POINTS;
  const offlineSettlement =
    result.offlineSettlement === undefined || result.offlineSettlement === null
      ? null
      : parseOfflineSettlement(result.offlineSettlement);
  const drops = parseDropRewardSummary(result.drops);
  return {
    settlementId: result.settlementId,
    mode,
    efficiencyBp,
    elapsedMilliseconds: result.elapsedMilliseconds,
    experienceGained: result.experienceGained,
    experienceDiscarded: result.experienceDiscarded,
    spiritStoneGained: result.spiritStoneGained,
    dropAttempts: result.dropAttempts,
    drops,
    events: result.events as CultivationSettlementSummary["events"],
    newcomerRewardGranted: result.newcomerRewardGranted,
    offlineSettlement,
  };
}

function parseStoredBreakthrough(value: unknown): BreakthroughPersistenceResult {
  if (!isRecord(value) || value.kind !== "cultivation_breakthrough" || !isRecord(value.result)) {
    throw new Error("Invalid cultivation breakthrough idempotency response");
  }
  const result = value.result;
  if (
    typeof result.breakthroughId !== "string" ||
    typeof result.fromLevel !== "number" ||
    typeof result.toLevel !== "number" ||
    typeof result.consumedPills !== "number"
  ) {
    throw new Error("Invalid cultivation breakthrough idempotency response");
  }
  return {
    breakthroughId: result.breakthroughId,
    fromLevel: result.fromLevel,
    toLevel: result.toLevel,
    consumedPills: result.consumedPills,
    offlineSettlement:
      result.offlineSettlement === undefined || result.offlineSettlement === null
        ? null
        : parseOfflineSettlement(result.offlineSettlement),
  };
}

function parseOfflineSettlement(value: unknown): OfflineSettlementSummary {
  if (!isRecord(value)) {
    throw new Error("Invalid offline settlement idempotency response");
  }
  if (
    typeof value.id !== "string" ||
    typeof value.fromTime !== "string" ||
    typeof value.toTime !== "string" ||
    typeof value.effectiveSeconds !== "number" ||
    typeof value.efficiencyBp !== "number" ||
    typeof value.experienceGained !== "string" ||
    typeof value.experienceDiscarded !== "string" ||
    typeof value.spiritStoneGained !== "string" ||
    typeof value.dropAttempts !== "number" ||
    !Array.isArray(value.events) ||
    typeof value.newcomerRewardGranted !== "boolean"
  ) {
    throw new Error("Invalid offline settlement idempotency response");
  }
  return {
    ...(value as unknown as OfflineSettlementSummary),
    drops: parseDropRewardSummary(value.drops),
  };
}

function parseDropRewardSummary(value: unknown): DropRewardSummary {
  if (value === undefined) return emptyDropRewardSummary();
  if (
    !isRecord(value) ||
    typeof value.configVersion !== "string" ||
    !Array.isArray(value.stackItems) ||
    typeof value.equipmentCount !== "number" ||
    typeof value.techniqueCount !== "number" ||
    typeof value.harvestChestAdded !== "number" ||
    typeof value.techniqueDuplicates !== "number" ||
    typeof value.autoSalvagedCount !== "number" ||
    typeof value.mailedCount !== "number" ||
    typeof value.autoSalvageSpiritStone !== "string" ||
    typeof value.autoSalvageEnhanceStone !== "string"
  ) {
    throw new Error("Invalid drop reward idempotency response");
  }
  const stackItems = value.stackItems.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.itemConfigId !== "string" ||
      typeof item.quantity !== "string"
    ) {
      throw new Error("Invalid drop reward idempotency response");
    }
    return { itemConfigId: item.itemConfigId, quantity: item.quantity };
  });
  return { ...value, stackItems } as DropRewardSummary;
}

function assertPlayerVersion(actual: bigint, expected?: string): void {
  if (expected !== undefined && actual.toString() !== expected) {
    throw new AppError("PLAYER_VERSION_CONFLICT", "角色数据版本已更新，请刷新后重试", 409, false, {
      currentPlayerVersion: actual.toString(),
    });
  }
}

function missingPlayerState(): AppError {
  return new AppError("UNAUTHENTICATED", "角色状态不存在，请重新登录", 401, false);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
