import { randomUUID } from "node:crypto";
import {
  calculateLoadoutBonuses,
  calculateTotalPower,
  getEquipmentConfig,
  getTechniqueConfig,
  isAssetQuality,
  type EquippedEquipmentSlot,
  type LoadoutMutationResult,
} from "@cultivation-diary/shared";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { AppError } from "../../common/app-error";
import {
  assetLedger,
  equipmentInstances,
  idempotencyRecords,
  playerProgress,
  techniqueProgress,
} from "../../db/schema";
import type { GameDatabase } from "../../infrastructure";

export interface LoadoutMutationCommand {
  accountId: string;
  playerId: string;
  idempotencyKey: string;
  requestHash: string;
  expectedPlayerVersion?: string;
  now: Date;
  idempotencyExpiresAt: Date;
}

export type LoadoutPersistenceResult = Omit<LoadoutMutationResult, "bootstrap">;

type GameTransaction = Parameters<Parameters<GameDatabase["transaction"]>[0]>[0];

export class LoadoutRepository {
  constructor(private readonly database: GameDatabase) {}

  async equipTechnique(
    command: LoadoutMutationCommand,
    techniqueConfigId: string,
  ): Promise<LoadoutPersistenceResult> {
    return this.database.transaction(async (transaction) => {
      const state = await lockProgress(transaction, command.playerId);
      const replay = await loadIdempotentResult(
        transaction,
        command,
        "techniques.equip",
      );
      if (replay) return replay;
      assertPlayerVersion(state.version, command.expectedPlayerVersion);

      const config = requestedTechniqueConfig(techniqueConfigId);
      const [target] = await transaction
        .select({ equippedSlot: techniqueProgress.equippedSlot })
        .from(techniqueProgress)
        .where(
          and(
            eq(techniqueProgress.playerId, command.playerId),
            eq(techniqueProgress.techniqueConfigId, techniqueConfigId),
          ),
        )
        .for("update")
        .limit(1);
      if (!target) {
        throw new AppError("TECHNIQUE_NOT_OWNED", "尚未收录这本功法", 409, false, {
          techniqueConfigId,
        });
      }

      if (target.equippedSlot === config.slot) {
        return storeNoChangeResult(transaction, command, "techniques.equip", {
          operationId: randomUUID(),
          assetType: "technique",
          action: "equip",
          assetId: techniqueConfigId,
          equippedSlot: config.slot,
          replacedAssetId: null,
          previousTotalPower: state.totalPower,
          totalPower: state.totalPower,
          powerDelta: "0",
        });
      }

      const [replaced] = await transaction
        .select({ techniqueConfigId: techniqueProgress.techniqueConfigId })
        .from(techniqueProgress)
        .where(
          and(
            eq(techniqueProgress.playerId, command.playerId),
            eq(techniqueProgress.equippedSlot, config.slot),
          ),
        )
        .for("update")
        .limit(1);
      if (replaced) {
        await transaction
          .update(techniqueProgress)
          .set({ equippedSlot: null, updatedAt: command.now })
          .where(
            and(
              eq(techniqueProgress.playerId, command.playerId),
              eq(
                techniqueProgress.techniqueConfigId,
                replaced.techniqueConfigId,
              ),
            ),
          );
      }
      await transaction
        .update(techniqueProgress)
        .set({ equippedSlot: config.slot, updatedAt: command.now })
        .where(
          and(
            eq(techniqueProgress.playerId, command.playerId),
            eq(techniqueProgress.techniqueConfigId, techniqueConfigId),
          ),
        );

      return persistChangedLoadout(transaction, command, "techniques.equip", {
        assetType: "technique",
        action: "equip",
        assetId: techniqueConfigId,
        equippedSlot: config.slot,
        replacedAssetId: replaced?.techniqueConfigId ?? null,
        previousTotalPower: state.totalPower,
        level: state.level,
      });
    });
  }

  async unequipTechnique(
    command: LoadoutMutationCommand,
    techniqueConfigId: string,
  ): Promise<LoadoutPersistenceResult> {
    return this.database.transaction(async (transaction) => {
      const state = await lockProgress(transaction, command.playerId);
      const replay = await loadIdempotentResult(
        transaction,
        command,
        "techniques.unequip",
      );
      if (replay) return replay;
      assertPlayerVersion(state.version, command.expectedPlayerVersion);

      requestedTechniqueConfig(techniqueConfigId);
      const [target] = await transaction
        .select({ equippedSlot: techniqueProgress.equippedSlot })
        .from(techniqueProgress)
        .where(
          and(
            eq(techniqueProgress.playerId, command.playerId),
            eq(techniqueProgress.techniqueConfigId, techniqueConfigId),
          ),
        )
        .for("update")
        .limit(1);
      if (!target || target.equippedSlot === null) {
        throw new AppError(
          "TECHNIQUE_NOT_EQUIPPED",
          "这本功法当前没有装备",
          409,
          false,
          { techniqueConfigId },
        );
      }
      const equippedSlot = target.equippedSlot;
      await transaction
        .update(techniqueProgress)
        .set({ equippedSlot: null, updatedAt: command.now })
        .where(
          and(
            eq(techniqueProgress.playerId, command.playerId),
            eq(techniqueProgress.techniqueConfigId, techniqueConfigId),
          ),
        );

      return persistChangedLoadout(transaction, command, "techniques.unequip", {
        assetType: "technique",
        action: "unequip",
        assetId: techniqueConfigId,
        equippedSlot,
        replacedAssetId: null,
        previousTotalPower: state.totalPower,
        level: state.level,
      });
    });
  }

  async equipEquipment(
    command: LoadoutMutationCommand,
    equipmentInstanceId: string,
    equippedSlot: EquippedEquipmentSlot,
  ): Promise<LoadoutPersistenceResult> {
    return this.database.transaction(async (transaction) => {
      const state = await lockProgress(transaction, command.playerId);
      const replay = await loadIdempotentResult(
        transaction,
        command,
        "equipment.equip",
      );
      if (replay) return replay;
      assertPlayerVersion(state.version, command.expectedPlayerVersion);

      const [target] = await transaction
        .select({
          equipmentConfigId: equipmentInstances.equipmentConfigId,
          location: equipmentInstances.location,
          equippedSlot: equipmentInstances.equippedSlot,
        })
        .from(equipmentInstances)
        .where(
          and(
            eq(equipmentInstances.playerId, command.playerId),
            eq(equipmentInstances.id, equipmentInstanceId),
          ),
        )
        .for("update")
        .limit(1);
      if (!target || (target.location !== "bag" && target.location !== "equipped")) {
        throw new AppError(
          "EQUIPMENT_NOT_AVAILABLE",
          "这件法宝尚未收入行囊或已被处理",
          409,
          false,
          { equipmentInstanceId },
        );
      }
      const config = requestedEquipmentConfig(target.equipmentConfigId);
      if (!isCompatibleEquipmentSlot(config.slot, equippedSlot)) {
        throw new AppError(
          "EQUIPMENT_SLOT_MISMATCH",
          "这件法宝不能装备到所选部位",
          400,
          false,
          { equipmentInstanceId, configuredSlot: config.slot, equippedSlot },
        );
      }
      if (state.level < config.minLevel || state.level > config.maxLevel) {
        throw new AppError(
          "EQUIPMENT_LEVEL_RESTRICTED",
          "当前境界无法装备这件法宝",
          409,
          false,
          { equipmentInstanceId, level: state.level },
        );
      }
      if (target.location === "equipped" && target.equippedSlot === equippedSlot) {
        return storeNoChangeResult(transaction, command, "equipment.equip", {
          operationId: randomUUID(),
          assetType: "equipment",
          action: "equip",
          assetId: equipmentInstanceId,
          equippedSlot,
          replacedAssetId: null,
          previousTotalPower: state.totalPower,
          totalPower: state.totalPower,
          powerDelta: "0",
        });
      }

      const [replaced] = await transaction
        .select({ id: equipmentInstances.id })
        .from(equipmentInstances)
        .where(
          and(
            eq(equipmentInstances.playerId, command.playerId),
            eq(equipmentInstances.location, "equipped"),
            eq(equipmentInstances.equippedSlot, equippedSlot),
          ),
        )
        .for("update")
        .limit(1);

      if (target.location === "equipped") {
        await moveEquipmentToBag(
          transaction,
          command.playerId,
          equipmentInstanceId,
          command.now,
        );
      }
      if (replaced && replaced.id !== equipmentInstanceId) {
        await moveEquipmentToBag(
          transaction,
          command.playerId,
          replaced.id,
          command.now,
        );
      }
      await transaction
        .update(equipmentInstances)
        .set({
          location: "equipped",
          equippedSlot,
          updatedAt: command.now,
        })
        .where(
          and(
            eq(equipmentInstances.playerId, command.playerId),
            eq(equipmentInstances.id, equipmentInstanceId),
          ),
        );

      return persistChangedLoadout(transaction, command, "equipment.equip", {
        assetType: "equipment",
        action: "equip",
        assetId: equipmentInstanceId,
        equippedSlot,
        replacedAssetId:
          replaced && replaced.id !== equipmentInstanceId ? replaced.id : null,
        previousTotalPower: state.totalPower,
        level: state.level,
      });
    });
  }

  async unequipEquipment(
    command: LoadoutMutationCommand,
    equipmentInstanceId: string,
  ): Promise<LoadoutPersistenceResult> {
    return this.database.transaction(async (transaction) => {
      const state = await lockProgress(transaction, command.playerId);
      const replay = await loadIdempotentResult(
        transaction,
        command,
        "equipment.unequip",
      );
      if (replay) return replay;
      assertPlayerVersion(state.version, command.expectedPlayerVersion);

      const [target] = await transaction
        .select({
          location: equipmentInstances.location,
          equippedSlot: equipmentInstances.equippedSlot,
        })
        .from(equipmentInstances)
        .where(
          and(
            eq(equipmentInstances.playerId, command.playerId),
            eq(equipmentInstances.id, equipmentInstanceId),
          ),
        )
        .for("update")
        .limit(1);
      if (!target || target.location !== "equipped" || target.equippedSlot === null) {
        throw new AppError(
          "EQUIPMENT_NOT_EQUIPPED",
          "这件法宝当前没有装备",
          409,
          false,
          { equipmentInstanceId },
        );
      }
      const equippedSlot = target.equippedSlot;
      await moveEquipmentToBag(
        transaction,
        command.playerId,
        equipmentInstanceId,
        command.now,
      );

      return persistChangedLoadout(transaction, command, "equipment.unequip", {
        assetType: "equipment",
        action: "unequip",
        assetId: equipmentInstanceId,
        equippedSlot,
        replacedAssetId: null,
        previousTotalPower: state.totalPower,
        level: state.level,
      });
    });
  }
}

async function lockProgress(
  transaction: GameTransaction,
  playerId: string,
): Promise<{ level: number; totalPower: string; version: bigint }> {
  const [state] = await transaction
    .select({
      level: playerProgress.level,
      totalPower: playerProgress.totalPower,
      version: playerProgress.version,
    })
    .from(playerProgress)
    .where(eq(playerProgress.playerId, playerId))
    .for("update")
    .limit(1);
  if (!state) {
    throw new AppError("UNAUTHENTICATED", "角色状态不存在，请重新登录", 401, false);
  }
  return state;
}

async function persistChangedLoadout(
  transaction: GameTransaction,
  command: LoadoutMutationCommand,
  scope: string,
  input: {
    assetType: "technique" | "equipment";
    action: "equip" | "unequip";
    assetId: string;
    equippedSlot: string;
    replacedAssetId: string | null;
    previousTotalPower: string;
    level: number;
  },
): Promise<LoadoutPersistenceResult> {
  const bonuses = await loadEquippedBonuses(transaction, command.playerId);
  const totalPower = calculateTotalPower(input.level, {
    fixedPower: bonuses.fixedPower,
  });
  const operationId = randomUUID();
  const result: LoadoutPersistenceResult = {
    operationId,
    assetType: input.assetType,
    action: input.action,
    assetId: input.assetId,
    equippedSlot: input.equippedSlot,
    replacedAssetId: input.replacedAssetId,
    previousTotalPower: input.previousTotalPower,
    totalPower,
    powerDelta: (BigInt(totalPower) - BigInt(input.previousTotalPower)).toString(),
  };

  await transaction
    .update(playerProgress)
    .set({
      totalPower,
      version: sql`${playerProgress.version} + 1`,
      updatedAt: command.now,
    })
    .where(eq(playerProgress.playerId, command.playerId));
  await transaction.insert(assetLedger).values({
    id: randomUUID(),
    playerId: command.playerId,
    assetType: input.assetType,
    assetKey: input.assetId,
    delta: "0",
    balanceAfter: null,
    reason: `loadout_${input.action}`,
    referenceType: "loadout_operation",
    referenceId: operationId,
    metadata: {
      equippedSlot: input.equippedSlot,
      replacedAssetId: input.replacedAssetId,
      previousTotalPower: input.previousTotalPower,
      totalPower,
      loadoutBonuses: bonuses,
    },
    createdAt: command.now,
  });
  await storeIdempotentResult(transaction, command, scope, result);
  return result;
}

async function storeNoChangeResult(
  transaction: GameTransaction,
  command: LoadoutMutationCommand,
  scope: string,
  result: LoadoutPersistenceResult,
): Promise<LoadoutPersistenceResult> {
  await storeIdempotentResult(transaction, command, scope, result);
  return result;
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
    equipment: equipment.map((item) => ({
      ...item,
      quality: requireAssetQuality(item.quality),
    })),
  });
}

async function moveEquipmentToBag(
  transaction: GameTransaction,
  playerId: string,
  equipmentInstanceId: string,
  now: Date,
): Promise<void> {
  await transaction
    .update(equipmentInstances)
    .set({ location: "bag", equippedSlot: null, updatedAt: now })
    .where(
      and(
        eq(equipmentInstances.playerId, playerId),
        eq(equipmentInstances.id, equipmentInstanceId),
      ),
    );
}

async function loadIdempotentResult(
  transaction: GameTransaction,
  command: LoadoutMutationCommand,
  scope: string,
): Promise<LoadoutPersistenceResult | null> {
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
      "相同幂等键不能用于不同的装备操作",
      409,
      false,
    );
  }
  return parseStoredResult(record.responseBody);
}

async function storeIdempotentResult(
  transaction: GameTransaction,
  command: LoadoutMutationCommand,
  scope: string,
  result: LoadoutPersistenceResult,
): Promise<void> {
  await transaction.insert(idempotencyRecords).values({
    accountId: command.accountId,
    scope,
    idempotencyKey: command.idempotencyKey,
    requestHash: command.requestHash,
    statusCode: 200,
    responseBody: { kind: "loadout_mutation", result },
    expiresAt: command.idempotencyExpiresAt,
    createdAt: command.now,
  });
}

function parseStoredResult(value: unknown): LoadoutPersistenceResult {
  if (!isRecord(value) || value.kind !== "loadout_mutation" || !isRecord(value.result)) {
    throw new Error("Invalid loadout idempotency response");
  }
  const result = value.result;
  if (
    typeof result.operationId !== "string" ||
    (result.assetType !== "technique" && result.assetType !== "equipment") ||
    (result.action !== "equip" && result.action !== "unequip") ||
    typeof result.assetId !== "string" ||
    typeof result.equippedSlot !== "string" ||
    (result.replacedAssetId !== null && typeof result.replacedAssetId !== "string") ||
    typeof result.previousTotalPower !== "string" ||
    typeof result.totalPower !== "string" ||
    typeof result.powerDelta !== "string"
  ) {
    throw new Error("Invalid loadout idempotency response");
  }
  return result as unknown as LoadoutPersistenceResult;
}

function requestedTechniqueConfig(techniqueConfigId: string) {
  try {
    return getTechniqueConfig(techniqueConfigId);
  } catch {
    throw new AppError("TECHNIQUE_NOT_FOUND", "功法配置不存在", 404, false, {
      techniqueConfigId,
    });
  }
}

function requestedEquipmentConfig(equipmentConfigId: string) {
  try {
    return getEquipmentConfig(equipmentConfigId);
  } catch {
    throw new Error(`Owned equipment references unknown config: ${equipmentConfigId}`);
  }
}

function isCompatibleEquipmentSlot(
  configuredSlot: string,
  equippedSlot: EquippedEquipmentSlot,
): boolean {
  return configuredSlot === "accessory"
    ? equippedSlot === "accessory_left" || equippedSlot === "accessory_right"
    : configuredSlot === equippedSlot;
}

function requireAssetQuality(quality: string) {
  if (!isAssetQuality(quality)) {
    throw new Error(`Unknown stored asset quality: ${quality}`);
  }
  return quality;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
