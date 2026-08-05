import type {
  CultivationBreakthroughResult,
  CultivationSettleResult,
} from "@cultivation-diary/shared";
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

export interface CultivationServicePort {
  settle(
    identity: AccessIdentity,
    idempotencyKey: string,
    expectedPlayerVersion?: string,
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

  async settle(
    identity: AccessIdentity,
    idempotencyKey: string,
    expectedPlayerVersion?: string,
  ): Promise<CultivationOperationResult<CultivationSettleResult>> {
    const command = this.command(
      identity,
      idempotencyKey,
      expectedPlayerVersion,
      "settle",
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
    operation: "settle" | "breakthrough",
  ): CultivationMutationCommand {
    const now = this.clock();
    return {
      accountId: identity.accountId,
      playerId: identity.playerId,
      idempotencyKey,
      requestHash: hashRequest({
        operation,
        playerId: identity.playerId,
        expectedPlayerVersion: expectedPlayerVersion ?? null,
      }),
      ...(expectedPlayerVersion === undefined ? {} : { expectedPlayerVersion }),
      now,
      idempotencyExpiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MILLISECONDS),
    };
  }
}
