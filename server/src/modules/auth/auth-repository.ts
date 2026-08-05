import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { AppError } from "../../common/app-error";
import {
  accounts,
  authSessions,
  idempotencyRecords,
  playerProgress,
  playerSettings,
  playerWallets,
  players,
  reservedPlayerNames,
} from "../../db/schema";
import type { GameDatabase } from "../../infrastructure";
import {
  PLAYER_NAME_ADVISORY_LOCK_ID,
  PlayerNameGenerator,
} from "./player-name";

const MAX_NAME_ATTEMPTS = 256;

export interface ExternalIdentity {
  openId: string;
  unionId: string | null;
}

export interface LoginPersistenceCommand {
  identity: ExternalIdentity;
  idempotencyKey: string;
  requestHash: string;
  deviceKeyHash: string | null;
  now: Date;
  sessionExpiresAt: Date;
  idempotencyExpiresAt: Date;
  createRefreshTokenHash(sessionId: string): string;
}

export interface PersistedSession {
  sessionId: string;
  accountId: string;
  playerId: string;
  createdAt: Date;
  refreshExpiresAt: Date;
}

export interface LoginPersistenceResult {
  session: PersistedSession;
  isNewPlayer: boolean;
}

export interface RefreshPersistenceCommand {
  currentSessionId: string;
  currentRefreshTokenHash: string;
  idempotencyKey: string;
  requestHash: string;
  now: Date;
  sessionExpiresAt: Date;
  idempotencyExpiresAt: Date;
  createRefreshTokenHash(sessionId: string): string;
}

interface IdempotencyAuthResponse {
  sessionId: string;
  isNewPlayer: boolean;
}

export class AuthRepository {
  constructor(
    private readonly database: GameDatabase,
    private readonly nameGenerator = new PlayerNameGenerator(),
  ) {}

  async login(command: LoginPersistenceCommand): Promise<LoginPersistenceResult> {
    return this.database.transaction(async (transaction) => {
      const accountValues = {
        id: randomUUID(),
        wxOpenid: command.identity.openId,
        wxUnionid: command.identity.unionId,
        lastLoginAt: command.now,
      };
      const updateValues = command.identity.unionId
        ? { lastLoginAt: command.now, wxUnionid: command.identity.unionId }
        : { lastLoginAt: command.now };
      const [upsertedAccount] = await transaction
        .insert(accounts)
        .values(accountValues)
        .onConflictDoUpdate({
          target: accounts.wxOpenid,
          set: updateValues,
        })
        .returning({ id: accounts.id });

      if (!upsertedAccount) {
        throw new Error("Account upsert did not return a row");
      }

      await transaction.execute(sql`select ${accounts.id} from ${accounts} where ${accounts.id} = ${upsertedAccount.id} for update`);
      const [account] = await transaction
        .select({ id: accounts.id, status: accounts.status })
        .from(accounts)
        .where(eq(accounts.id, upsertedAccount.id))
        .limit(1);

      if (!account) {
        throw new Error("Account disappeared during login transaction");
      }
      if (account.status === "banned") {
        throw new AppError("ACCOUNT_BANNED", "账号当前无法登录", 403, false);
      }
      if (account.status !== "active") {
        throw new AppError("UNAUTHENTICATED", "账号状态无效", 401, false);
      }

      let [player] = await transaction
        .select({ id: players.id, status: players.status })
        .from(players)
        .where(eq(players.accountId, account.id))
        .limit(1);
      let isNewPlayer = false;

      if (!player) {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(${PLAYER_NAME_ADVISORY_LOCK_ID})`,
        );
        await transaction
          .delete(reservedPlayerNames)
          .where(lte(reservedPlayerNames.releaseAt, command.now));

        for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt += 1) {
          const name = this.nameGenerator.candidate(attempt);
          const [reservation] = await transaction
            .select({ displayNameKey: reservedPlayerNames.displayNameKey })
            .from(reservedPlayerNames)
            .where(
              and(
                eq(reservedPlayerNames.displayNameKey, name.displayNameKey),
                gt(reservedPlayerNames.releaseAt, command.now),
              ),
            )
            .limit(1);
          if (reservation) continue;

          const [createdPlayer] = await transaction
            .insert(players)
            .values({
              id: randomUUID(),
              accountId: account.id,
              displayName: name.displayName,
              displayNameKey: name.displayNameKey,
            })
            .onConflictDoNothing()
            .returning({ id: players.id, status: players.status });

          if (createdPlayer) {
            player = createdPlayer;
            isNewPlayer = true;
            break;
          }
        }

        if (!player) {
          throw new Error("Unable to allocate a unique player name");
        }

        await transaction.insert(playerProgress).values({ playerId: player.id });
        await transaction.insert(playerWallets).values({ playerId: player.id });
        await transaction.insert(playerSettings).values({ playerId: player.id });
      }

      if (player.status === "banned") {
        throw new AppError("ACCOUNT_BANNED", "角色当前无法登录", 403, false);
      }
      if (player.status !== "active") {
        throw new AppError("UNAUTHENTICATED", "角色状态无效", 401, false);
      }

      const scope = "auth.login";
      const [idempotency] = await transaction
        .select({
          requestHash: idempotencyRecords.requestHash,
          responseBody: idempotencyRecords.responseBody,
          expiresAt: idempotencyRecords.expiresAt,
        })
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.accountId, account.id),
            eq(idempotencyRecords.scope, scope),
            eq(idempotencyRecords.idempotencyKey, command.idempotencyKey),
          ),
        )
        .limit(1);

      if (idempotency && idempotency.expiresAt > command.now) {
        if (idempotency.requestHash !== command.requestHash) {
          throw new AppError(
            "IDEMPOTENCY_KEY_REUSED",
            "相同幂等键不能用于不同登录请求",
            409,
            false,
          );
        }

        const stored = parseIdempotencyResponse(idempotency.responseBody);
        const session = await this.loadSession(
          transaction,
          stored.sessionId,
          account.id,
          player.id,
          command.now,
        );
        return { session, isNewPlayer: stored.isNewPlayer };
      }

      if (idempotency) {
        await transaction
          .delete(idempotencyRecords)
          .where(
            and(
              eq(idempotencyRecords.accountId, account.id),
              eq(idempotencyRecords.scope, scope),
              eq(idempotencyRecords.idempotencyKey, command.idempotencyKey),
            ),
          );
      }

      const sessionId = randomUUID();
      const [session] = await transaction
        .insert(authSessions)
        .values({
          id: sessionId,
          accountId: account.id,
          refreshTokenHash: command.createRefreshTokenHash(sessionId),
          deviceKeyHash: command.deviceKeyHash,
          expiresAt: command.sessionExpiresAt,
          createdAt: command.now,
        })
        .returning({
          sessionId: authSessions.id,
          accountId: authSessions.accountId,
          createdAt: authSessions.createdAt,
          refreshExpiresAt: authSessions.expiresAt,
        });

      if (!session) {
        throw new Error("Session insert did not return a row");
      }

      await transaction.insert(idempotencyRecords).values({
        accountId: account.id,
        scope,
        idempotencyKey: command.idempotencyKey,
        requestHash: command.requestHash,
        statusCode: 200,
        responseBody: { sessionId, isNewPlayer },
        expiresAt: command.idempotencyExpiresAt,
        createdAt: command.now,
      });

      return {
        session: { ...session, playerId: player.id },
        isNewPlayer,
      };
    });
  }

  async assertActiveSession(identity: {
    sessionId: string;
    accountId: string;
    playerId: string;
  }): Promise<void> {
    const [session] = await this.database
      .select({ id: authSessions.id })
      .from(authSessions)
      .innerJoin(accounts, eq(accounts.id, authSessions.accountId))
      .innerJoin(players, eq(players.accountId, accounts.id))
      .where(
        and(
          eq(authSessions.id, identity.sessionId),
          eq(accounts.id, identity.accountId),
          eq(players.id, identity.playerId),
          eq(accounts.status, "active"),
          eq(players.status, "active"),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!session) {
      throw new AppError("UNAUTHENTICATED", "登录状态无效，请重新登录", 401, false);
    }
  }

  async refresh(command: RefreshPersistenceCommand): Promise<PersistedSession> {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select({
          sessionId: authSessions.id,
          accountId: authSessions.accountId,
          refreshTokenHash: authSessions.refreshTokenHash,
          refreshExpiresAt: authSessions.expiresAt,
          revokedAt: authSessions.revokedAt,
          deviceKeyHash: authSessions.deviceKeyHash,
          accountStatus: accounts.status,
          playerId: players.id,
          playerStatus: players.status,
        })
        .from(authSessions)
        .innerJoin(accounts, eq(accounts.id, authSessions.accountId))
        .innerJoin(players, eq(players.accountId, accounts.id))
        .where(eq(authSessions.id, command.currentSessionId))
        .for("update")
        .limit(1);

      if (!current || current.refreshTokenHash !== command.currentRefreshTokenHash) {
        throw new AppError("SESSION_EXPIRED", "会话已过期，请重新登录", 401, false);
      }
      if (current.accountStatus === "banned" || current.playerStatus === "banned") {
        throw new AppError("ACCOUNT_BANNED", "账号当前无法登录", 403, false);
      }
      if (current.accountStatus !== "active" || current.playerStatus !== "active") {
        throw new AppError("SESSION_EXPIRED", "会话已过期，请重新登录", 401, false);
      }

      const scope = "auth.refresh";
      const [idempotency] = await transaction
        .select({
          requestHash: idempotencyRecords.requestHash,
          responseBody: idempotencyRecords.responseBody,
          expiresAt: idempotencyRecords.expiresAt,
        })
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.accountId, current.accountId),
            eq(idempotencyRecords.scope, scope),
            eq(idempotencyRecords.idempotencyKey, command.idempotencyKey),
          ),
        )
        .limit(1);

      if (idempotency && idempotency.expiresAt > command.now) {
        if (idempotency.requestHash !== command.requestHash) {
          throw new AppError(
            "IDEMPOTENCY_KEY_REUSED",
            "相同幂等键不能用于不同刷新请求",
            409,
            false,
          );
        }

        const stored = parseIdempotencyResponse(idempotency.responseBody);
        return this.loadSession(
          transaction,
          stored.sessionId,
          current.accountId,
          current.playerId,
          command.now,
        );
      }

      if (idempotency) {
        await transaction
          .delete(idempotencyRecords)
          .where(
            and(
              eq(idempotencyRecords.accountId, current.accountId),
              eq(idempotencyRecords.scope, scope),
              eq(idempotencyRecords.idempotencyKey, command.idempotencyKey),
            ),
          );
      }

      if (current.revokedAt || current.refreshExpiresAt <= command.now) {
        throw new AppError("SESSION_EXPIRED", "会话已过期，请重新登录", 401, false);
      }

      const sessionId = randomUUID();
      const [nextSession] = await transaction
        .insert(authSessions)
        .values({
          id: sessionId,
          accountId: current.accountId,
          refreshTokenHash: command.createRefreshTokenHash(sessionId),
          deviceKeyHash: current.deviceKeyHash,
          expiresAt: command.sessionExpiresAt,
          createdAt: command.now,
        })
        .returning({
          sessionId: authSessions.id,
          accountId: authSessions.accountId,
          createdAt: authSessions.createdAt,
          refreshExpiresAt: authSessions.expiresAt,
        });

      if (!nextSession) {
        throw new Error("Refreshed session insert did not return a row");
      }

      await transaction
        .update(authSessions)
        .set({ revokedAt: command.now })
        .where(eq(authSessions.id, current.sessionId));
      await transaction.insert(idempotencyRecords).values({
        accountId: current.accountId,
        scope,
        idempotencyKey: command.idempotencyKey,
        requestHash: command.requestHash,
        statusCode: 200,
        responseBody: { sessionId, isNewPlayer: false },
        expiresAt: command.idempotencyExpiresAt,
        createdAt: command.now,
      });

      return { ...nextSession, playerId: current.playerId };
    });
  }

  private async loadSession(
    transaction: Parameters<Parameters<GameDatabase["transaction"]>[0]>[0],
    sessionId: string,
    accountId: string,
    playerId: string,
    now: Date,
  ): Promise<PersistedSession> {
    const [session] = await transaction
      .select({
        sessionId: authSessions.id,
        accountId: authSessions.accountId,
        createdAt: authSessions.createdAt,
        refreshExpiresAt: authSessions.expiresAt,
      })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.id, sessionId),
          eq(authSessions.accountId, accountId),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, now),
        ),
      )
      .limit(1);

    if (!session) {
      throw new AppError("SESSION_EXPIRED", "登录会话已过期", 401, false);
    }

    return { ...session, playerId };
  }
}

function parseIdempotencyResponse(value: unknown): IdempotencyAuthResponse {
  if (
    typeof value !== "object" ||
    value === null ||
    !("sessionId" in value) ||
    !("isNewPlayer" in value) ||
    typeof value.sessionId !== "string" ||
    typeof value.isNewPlayer !== "boolean"
  ) {
    throw new Error("Invalid auth idempotency response");
  }

  return { sessionId: value.sessionId, isNewPlayer: value.isNewPlayer };
}
