import type {
  CultivationBreakthroughResult,
  CultivationSettleResult,
  SyncHeartbeatResult,
} from "@cultivation-diary/shared";
import { AppError } from "../../common/app-error";
import { hashRequest } from "../../common/hash";
import type { AccessIdentity } from "../auth/token-service";
import { BootstrapService } from "../bootstrap/bootstrap-service";
import {
  CultivationRepository,
  type CultivationMutationCommand,
} from "./cultivation-repository";

const IDEMPOTENCY_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;

export interface CultivationOperationResult<T> {
  playerVersion: string;
  data: T;
}

export interface CultivationSimulationOptions {
  debugElapsedSeconds?: number;
}

export interface CultivationServicePort {
  heartbeat(
    identity: AccessIdentity,
    idempotencyKey: string,
    expectedPlayerVersion?: string,
  ): Promise<CultivationOperationResult<SyncHeartbeatResult>>;
  settle(
    identity: AccessIdentity,
    idempotencyKey: string,
    expectedPlayerVersion?: string,
    options?: CultivationSimulationOptions,
  ): Promise<CultivationOperationResult<CultivationSettleResult>>;
  breakthrough(
    identity: AccessIdentity,
    idempotencyKey: string,
    expectedPlayerVersion?: string,
  ): Promise<CultivationOperationResult<CultivationBreakthroughResult>>;
}

export class CultivationService implements CultivationServicePort {
  constructor(
    private readonly repository: CultivationRepository,
    private readonly bootstrapService: BootstrapService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async heartbeat(
    identity: AccessIdentity,
    idempotencyKey: string,
    expectedPlayerVersion?: string,
  ): Promise<CultivationOperationResult<SyncHeartbeatResult>> {
    const command = this.command(
      identity,
      idempotencyKey,
      expectedPlayerVersion,
      "heartbeat",
    );
    return this.repository.heartbeat(command);
  }

  async settle(
    identity: AccessIdentity,
    idempotencyKey: string,
    expectedPlayerVersion?: string,
    options?: CultivationSimulationOptions,
  ): Promise<CultivationOperationResult<CultivationSettleResult>> {
    const command = this.command(
      identity,
      idempotencyKey,
      expectedPlayerVersion,
      "settle",
      options,
    );
    const settlement = await this.repository.settle(command);
    const bootstrap = await this.bootstrapService.getSnapshot(
      identity.accountId,
      identity.playerId,
    );
    return {
      playerVersion: bootstrap.playerVersion,
      data: {
        settlement,
        bootstrap: {
          ...bootstrap.snapshot,
          offlineSettlement: settlement.offlineSettlement,
        },
      },
    };
  }

  async breakthrough(
    identity: AccessIdentity,
    idempotencyKey: string,
    expectedPlayerVersion?: string,
  ): Promise<CultivationOperationResult<CultivationBreakthroughResult>> {
    const command = this.command(
      identity,
      idempotencyKey,
      expectedPlayerVersion,
      "breakthrough",
    );
    const { offlineSettlement, ...breakthrough } =
      await this.repository.breakthrough(command);
    const bootstrap = await this.bootstrapService.getSnapshot(
      identity.accountId,
      identity.playerId,
    );
    return {
      playerVersion: bootstrap.playerVersion,
      data: {
        ...breakthrough,
        bootstrap: { ...bootstrap.snapshot, offlineSettlement },
      },
    };
  }

  private command(
    identity: AccessIdentity,
    idempotencyKey: string,
    expectedPlayerVersion: string | undefined,
    operation: "heartbeat" | "settle" | "breakthrough",
    options?: CultivationSimulationOptions,
  ): CultivationMutationCommand {
    const now = this.clock();
    const debugElapsedSeconds = normalizeDebugElapsedSeconds(
      options?.debugElapsedSeconds,
    );
    return {
      accountId: identity.accountId,
      playerId: identity.playerId,
      idempotencyKey,
      requestHash: hashRequest({
        operation,
        playerId: identity.playerId,
        expectedPlayerVersion: expectedPlayerVersion ?? null,
        ...(debugElapsedSeconds === undefined ? {} : { debugElapsedSeconds }),
      }),
      ...(expectedPlayerVersion === undefined ? {} : { expectedPlayerVersion }),
      now,
      idempotencyExpiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MILLISECONDS),
      ...(debugElapsedSeconds === undefined
        ? {}
        : { debugElapsedMilliseconds: debugElapsedSeconds * 1_000 }),
    };
  }
}

function normalizeDebugElapsedSeconds(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 1 || value > 86_400) {
    throw new AppError(
      "INVALID_DEBUG_ELAPSED_SECONDS",
      "模拟离线时长必须是 1 到 86400 秒的整数",
      400,
      false,
    );
  }
  return value;
}
