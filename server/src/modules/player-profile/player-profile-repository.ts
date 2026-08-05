import { randomUUID } from "node:crypto";
import type { BootstrapSnapshot } from "@cultivation-diary/shared";
import { and, eq, gt, sql } from "drizzle-orm";
import { AppError } from "../../common/app-error";
import {
  assetLedger,
  idempotencyRecords,
  inventoryStacks,
  playerProgress,
  players,
  reservedPlayerNames,
} from "../../db/schema";
import type { GameDatabase } from "../../infrastructure";
import { PLAYER_NAME_ADVISORY_LOCK_ID } from "../auth/player-name";
import { BootstrapService } from "../bootstrap/bootstrap-service";

const RENAME_CARD_CONFIG_ID = "rename_card";

export type ChosenAvatarVariant = "male" | "female";

export interface PlayerProfileMutationCommand {
  accountId: string;
  playerId: string;
  idempotencyKey: string;
  requestHash: string;
  expectedPlayerVersion?: string;
  now: Date;
  idempotencyExpiresAt: Date;
}

export interface PlayerAvatarPersistenceResult {
  operationId: string;
  avatarVariant: ChosenAvatarVariant;
}

export interface PlayerRenamePersistenceResult {
  operationId: string;
  previousDisplayName: string;
  displayName: string;
  usedFreeRename: boolean;
  renameCardsConsumed: 0 | 1;
}

export interface PlayerProfilePersistenceResult<T> {
  playerVersion: string;
  data: T & { bootstrap: BootstrapSnapshot };
}

type GameTransaction = Parameters<Parameters<GameDatabase["transaction"]>[0]>[0];

export class PlayerProfileRepository {
  constructor(private readonly database: GameDatabase) {}

  async chooseAvatar(
    command: PlayerProfileMutationCommand,
    avatarVariant: ChosenAvatarVariant,
  ): Promise<PlayerProfilePersistenceResult<PlayerAvatarPersistenceResult>> {
    return this.database.transaction(async (transaction) => {
      const version = await lockPlayerVersion(transaction, command.playerId);
      const replay = await loadIdempotentResult(
        transaction,
        command,
        "player.avatar",
        parseAvatarResult,
      );
      if (replay) return replay;
      assertPlayerVersion(version, command.expectedPlayerVersion);

      const [player] = await transaction
        .select({ avatarVariant: players.avatarVariant })
        .from(players)
        .where(eq(players.id, command.playerId))
        .for("update")
        .limit(1);
      if (!player) throw missingPlayerState();
      if (player.avatarVariant !== "neutral") {
        throw new AppError(
          "AVATAR_ALREADY_SELECTED",
          "主角形象已经选择，当前阶段不能再次修改",
          409,
          false,
          { currentAvatarVariant: player.avatarVariant },
        );
      }

      const result: PlayerAvatarPersistenceResult = {
        operationId: randomUUID(),
        avatarVariant,
      };
      await transaction
        .update(players)
        .set({ avatarVariant, updatedAt: command.now })
        .where(eq(players.id, command.playerId));
      await incrementPlayerVersion(transaction, command.playerId, command.now);
      return completeMutation(
        transaction,
        command,
        "player.avatar",
        "player_avatar",
        result,
      );
    });
  }

  async rename(
    command: PlayerProfileMutationCommand,
    name: { displayName: string; displayNameKey: string },
  ): Promise<PlayerProfilePersistenceResult<PlayerRenamePersistenceResult>> {
    try {
      return await this.database.transaction(async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(${PLAYER_NAME_ADVISORY_LOCK_ID})`,
        );
        const version = await lockPlayerVersion(transaction, command.playerId);
        const replay = await loadIdempotentResult(
          transaction,
          command,
          "player.rename",
          parseRenameResult,
        );
        if (replay) return replay;
        assertPlayerVersion(version, command.expectedPlayerVersion);

        const [player] = await transaction
          .select({
            displayName: players.displayName,
            displayNameKey: players.displayNameKey,
            freeRenameAvailable: players.freeRenameAvailable,
          })
          .from(players)
          .where(eq(players.id, command.playerId))
          .for("update")
          .limit(1);
        if (!player) throw missingPlayerState();
        if (player.displayNameKey === name.displayNameKey) {
          throw new AppError(
            "NAME_UNCHANGED",
            "新道号与当前道号相同",
            409,
            false,
          );
        }

        const [owner] = await transaction
          .select({ id: players.id })
          .from(players)
          .where(eq(players.displayNameKey, name.displayNameKey))
          .limit(1);
        if (owner) throw nameUnavailable();

        const [reservation] = await transaction
          .select({ releaseAt: reservedPlayerNames.releaseAt })
          .from(reservedPlayerNames)
          .where(eq(reservedPlayerNames.displayNameKey, name.displayNameKey))
          .limit(1);
        if (reservation?.releaseAt && reservation.releaseAt > command.now) {
          throw nameUnavailable(reservation.releaseAt);
        }
        if (reservation) {
          await transaction
            .delete(reservedPlayerNames)
            .where(eq(reservedPlayerNames.displayNameKey, name.displayNameKey));
        }

        const operationId = randomUUID();
        const usedFreeRename = player.freeRenameAvailable;
        if (!usedFreeRename) {
          await consumeRenameCard(transaction, command, operationId);
        }

        await transaction
          .insert(reservedPlayerNames)
          .values({
            displayNameKey: player.displayNameKey,
            previousPlayerId: command.playerId,
            releaseAt: new Date(command.now.getTime() + 7 * 24 * 60 * 60 * 1_000),
            createdAt: command.now,
          })
          .onConflictDoUpdate({
            target: reservedPlayerNames.displayNameKey,
            set: {
              previousPlayerId: command.playerId,
              releaseAt: new Date(
                command.now.getTime() + 7 * 24 * 60 * 60 * 1_000,
              ),
              createdAt: command.now,
            },
          });
        await transaction
          .update(players)
          .set({
            displayName: name.displayName,
            displayNameKey: name.displayNameKey,
            freeRenameAvailable: false,
            updatedAt: command.now,
          })
          .where(eq(players.id, command.playerId));
        await incrementPlayerVersion(transaction, command.playerId, command.now);

        const result: PlayerRenamePersistenceResult = {
          operationId,
          previousDisplayName: player.displayName,
          displayName: name.displayName,
          usedFreeRename,
          renameCardsConsumed: usedFreeRename ? 0 : 1,
        };
        return completeMutation(
          transaction,
          command,
          "player.rename",
          "player_rename",
          result,
        );
      });
    } catch (error) {
      if (isDisplayNameUniqueViolation(error)) throw nameUnavailable();
      throw error;
    }
  }
}

async function lockPlayerVersion(
  transaction: GameTransaction,
  playerId: string,
): Promise<bigint> {
  const [progress] = await transaction
    .select({ version: playerProgress.version })
    .from(playerProgress)
    .where(eq(playerProgress.playerId, playerId))
    .for("update")
    .limit(1);
  if (!progress) throw missingPlayerState();
  return progress.version;
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

async function consumeRenameCard(
  transaction: GameTransaction,
  command: PlayerProfileMutationCommand,
  operationId: string,
): Promise<void> {
  const [stack] = await transaction
    .select({ quantity: inventoryStacks.quantity })
    .from(inventoryStacks)
    .where(
      and(
        eq(inventoryStacks.playerId, command.playerId),
        eq(inventoryStacks.itemConfigId, RENAME_CARD_CONFIG_ID),
      ),
    )
    .for("update")
    .limit(1);
  const currentQuantity = BigInt(stack?.quantity ?? "0");
  if (currentQuantity < 1n) {
    throw new AppError("INSUFFICIENT_ITEM", "改名卡数量不足", 409, false, {
      itemConfigId: RENAME_CARD_CONFIG_ID,
      required: 1,
      current: currentQuantity.toString(),
    });
  }

  const remainingQuantity = currentQuantity - 1n;
  if (remainingQuantity === 0n) {
    await transaction
      .delete(inventoryStacks)
      .where(
        and(
          eq(inventoryStacks.playerId, command.playerId),
          eq(inventoryStacks.itemConfigId, RENAME_CARD_CONFIG_ID),
        ),
      );
  } else {
    await transaction
      .update(inventoryStacks)
      .set({ quantity: remainingQuantity.toString(), updatedAt: command.now })
      .where(
        and(
          eq(inventoryStacks.playerId, command.playerId),
          eq(inventoryStacks.itemConfigId, RENAME_CARD_CONFIG_ID),
        ),
      );
  }

  await transaction.insert(assetLedger).values({
    id: randomUUID(),
    playerId: command.playerId,
    assetType: "item",
    assetKey: RENAME_CARD_CONFIG_ID,
    delta: "-1",
    balanceAfter: remainingQuantity.toString(),
    reason: "player_rename",
    referenceType: "player_profile",
    referenceId: operationId,
    metadata: {},
    createdAt: command.now,
  });
}

async function loadIdempotentResult<T>(
  transaction: GameTransaction,
  command: PlayerProfileMutationCommand,
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
      "相同幂等键不能用于不同的角色资料操作",
      409,
      false,
    );
  }
  return parse(record.responseBody);
}

async function storeIdempotentResult(
  transaction: GameTransaction,
  command: PlayerProfileMutationCommand,
  scope: string,
  kind: string,
  result: unknown,
): Promise<void> {
  await transaction.insert(idempotencyRecords).values({
    accountId: command.accountId,
    scope,
    idempotencyKey: command.idempotencyKey,
    requestHash: command.requestHash,
    statusCode: 200,
    responseBody: { kind, result },
    expiresAt: command.idempotencyExpiresAt,
    createdAt: command.now,
  });
}

async function completeMutation<
  T extends PlayerAvatarPersistenceResult | PlayerRenamePersistenceResult,
>(
  transaction: GameTransaction,
  command: PlayerProfileMutationCommand,
  scope: string,
  kind: string,
  result: T,
): Promise<PlayerProfilePersistenceResult<T>> {
  const bootstrap = await new BootstrapService(transaction, true).getSnapshot(
    command.accountId,
    command.playerId,
  );
  const response: PlayerProfilePersistenceResult<T> = {
    playerVersion: bootstrap.playerVersion,
    data: { ...result, bootstrap: bootstrap.snapshot },
  };
  await storeIdempotentResult(
    transaction,
    command,
    scope,
    kind,
    response,
  );
  return response;
}

function parseAvatarResult(
  value: unknown,
): PlayerProfilePersistenceResult<PlayerAvatarPersistenceResult> {
  const result = parseStoredResult(value, "player_avatar");
  const data = parseOperationData(result);
  if (
    typeof data.operationId !== "string" ||
    (data.avatarVariant !== "male" && data.avatarVariant !== "female")
  ) {
    throw invalidStoredResult();
  }
  return result as unknown as PlayerProfilePersistenceResult<PlayerAvatarPersistenceResult>;
}

function parseRenameResult(
  value: unknown,
): PlayerProfilePersistenceResult<PlayerRenamePersistenceResult> {
  const result = parseStoredResult(value, "player_rename");
  const data = parseOperationData(result);
  if (
    typeof data.operationId !== "string" ||
    typeof data.previousDisplayName !== "string" ||
    typeof data.displayName !== "string" ||
    typeof data.usedFreeRename !== "boolean" ||
    (data.renameCardsConsumed !== 0 && data.renameCardsConsumed !== 1)
  ) {
    throw invalidStoredResult();
  }
  return result as unknown as PlayerProfilePersistenceResult<PlayerRenamePersistenceResult>;
}

function parseOperationData(result: Record<string, unknown>): Record<string, unknown> {
  if (
    typeof result.playerVersion !== "string" ||
    !isRecord(result.data) ||
    !isRecord(result.data.bootstrap)
  ) {
    throw invalidStoredResult();
  }
  return result.data;
}

function parseStoredResult(value: unknown, kind: string): Record<string, unknown> {
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

function nameUnavailable(releaseAt?: Date): AppError {
  return new AppError(
    "NAME_ALREADY_TAKEN",
    "该道号已被使用或暂时保留",
    409,
    false,
    releaseAt ? { releaseAt: releaseAt.toISOString() } : {},
  );
}

export function isDisplayNameUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 5 && isRecord(current); depth += 1) {
    if (
      current.code === "23505" &&
      current.constraint === "players_display_name_key_uq"
    ) {
      return true;
    }
    if (seen.has(current)) return false;
    seen.add(current);
    current = current.cause;
  }
  return false;
}

function missingPlayerState(): AppError {
  return new AppError("UNAUTHENTICATED", "角色状态不存在，请重新登录", 401, false);
}

function invalidStoredResult(): Error {
  return new Error("Invalid player profile idempotency response");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
