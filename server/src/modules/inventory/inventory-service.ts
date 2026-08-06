import type {
  BootstrapSnapshot,
  DebugGrantResult,
  DebugGrantTarget,
  HarvestSalvageResult,
  HarvestTransferResult,
  InventoryExpandResult,
  InventoryUseResult,
  ItemUseEffect,
} from "@cultivation-diary/shared";
import { getItemConfig } from "@cultivation-diary/shared";
import { AppError } from "../../common/app-error";
import { hashRequest } from "../../common/hash";
import type { AccessIdentity } from "../auth/token-service";
import { BootstrapService } from "../bootstrap/bootstrap-service";
import {
  InventoryRepository,
  type InventoryMutationCommand,
} from "./inventory-repository";

const IDEMPOTENCY_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;

export interface InventoryOperationResult<T> {
  playerVersion: string;
  data: T;
}

export interface InventoryServicePort {
  useItem(
    identity: AccessIdentity,
    idempotencyKey: string,
    itemConfigId: string,
    quantity: number,
    expectedPlayerVersion?: string,
  ): Promise<InventoryOperationResult<InventoryUseResult>>;
  debugGrant(
    identity: AccessIdentity,
    idempotencyKey: string,
    target: DebugGrantTarget,
    expectedPlayerVersion: string,
  ): Promise<InventoryOperationResult<DebugGrantResult>>;
  expandBag(
    identity: AccessIdentity,
    idempotencyKey: string,
    expectedPlayerVersion?: string,
  ): Promise<InventoryOperationResult<InventoryExpandResult>>;
  transferHarvest(
    identity: AccessIdentity,
    idempotencyKey: string,
    entryIds: readonly string[],
    expectedPlayerVersion?: string,
  ): Promise<InventoryOperationResult<HarvestTransferResult>>;
  salvageHarvest(
    identity: AccessIdentity,
    idempotencyKey: string,
    entryIds: readonly string[],
    confirmHighQuality: boolean,
    expectedPlayerVersion?: string,
  ): Promise<InventoryOperationResult<HarvestSalvageResult>>;
}

export class InventoryService implements InventoryServicePort {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly bootstrapService: BootstrapService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async useItem(
    identity: AccessIdentity,
    idempotencyKey: string,
    itemConfigId: string,
    quantity: number,
    expectedPlayerVersion?: string,
  ): Promise<InventoryOperationResult<InventoryUseResult>> {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new AppError(
        "INVALID_ITEM_QUANTITY",
        "使用数量必须是 1 到 99 的整数",
        400,
        false,
      );
    }
    const effect = getUsableItemEffect(itemConfigId);
    const result = await this.repository.useItem(
      this.command(
        identity,
        idempotencyKey,
        "inventory.use",
        { itemConfigId, quantity },
        expectedPlayerVersion,
      ),
      itemConfigId,
      quantity,
      effect,
    );
    return this.withBootstrap(identity, result);
  }

  async debugGrant(
    identity: AccessIdentity,
    idempotencyKey: string,
    target: DebugGrantTarget,
    expectedPlayerVersion: string,
  ): Promise<InventoryOperationResult<DebugGrantResult>> {
    if (!isDebugGrantTarget(target)) {
      throw new AppError(
        "INVALID_DEBUG_GRANT_TARGET",
        "不支持该调试注入类型",
        400,
        false,
      );
    }
    const result = await this.repository.debugGrant(
      this.command(
        identity,
        idempotencyKey,
        "debug.grant",
        { target },
        expectedPlayerVersion,
      ),
      target,
    );
    return this.withBootstrap(identity, result);
  }

  async expandBag(
    identity: AccessIdentity,
    idempotencyKey: string,
    expectedPlayerVersion?: string,
  ): Promise<InventoryOperationResult<InventoryExpandResult>> {
    const result = await this.repository.expandBag(
      this.command(
        identity,
        idempotencyKey,
        "inventory.expand",
        {},
        expectedPlayerVersion,
      ),
    );
    return this.withBootstrap(identity, result);
  }

  async transferHarvest(
    identity: AccessIdentity,
    idempotencyKey: string,
    entryIds: readonly string[],
    expectedPlayerVersion?: string,
  ): Promise<InventoryOperationResult<HarvestTransferResult>> {
    const result = await this.repository.transferHarvest(
      this.command(
        identity,
        idempotencyKey,
        "harvest.transfer",
        { entryIds },
        expectedPlayerVersion,
      ),
      entryIds,
    );
    return this.withBootstrap(identity, result);
  }

  async salvageHarvest(
    identity: AccessIdentity,
    idempotencyKey: string,
    entryIds: readonly string[],
    confirmHighQuality: boolean,
    expectedPlayerVersion?: string,
  ): Promise<InventoryOperationResult<HarvestSalvageResult>> {
    const result = await this.repository.salvageHarvest(
      this.command(
        identity,
        idempotencyKey,
        "harvest.salvage",
        { entryIds, confirmHighQuality },
        expectedPlayerVersion,
      ),
      entryIds,
      confirmHighQuality,
    );
    return this.withBootstrap(identity, result);
  }

  private async withBootstrap<T>(
    identity: AccessIdentity,
    result: T,
  ): Promise<InventoryOperationResult<T & { bootstrap: BootstrapSnapshot }>> {
    const bootstrap = await this.bootstrapService.getSnapshot(
      identity.accountId,
      identity.playerId,
    );
    return {
      playerVersion: bootstrap.playerVersion,
      data: { ...result, bootstrap: bootstrap.snapshot },
    };
  }

  private command(
    identity: AccessIdentity,
    idempotencyKey: string,
    operation: string,
    body: unknown,
    expectedPlayerVersion?: string,
  ): InventoryMutationCommand {
    const now = this.clock();
    return {
      accountId: identity.accountId,
      playerId: identity.playerId,
      idempotencyKey,
      requestHash: hashRequest({
        operation,
        playerId: identity.playerId,
        body,
        expectedPlayerVersion: expectedPlayerVersion ?? null,
      }),
      ...(expectedPlayerVersion === undefined ? {} : { expectedPlayerVersion }),
      now,
      idempotencyExpiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MILLISECONDS),
    };
  }
}

function getUsableItemEffect(itemConfigId: string): ItemUseEffect {
  try {
    const config = getItemConfig(itemConfigId);
    if (config.useEffect) return config.useEffect;
  } catch {
    // Unknown identifiers use the same public error as configured non-usable items.
  }
  throw new AppError(
    "ITEM_NOT_USABLE",
    "该道具当前不能直接使用",
    400,
    false,
    { itemConfigId },
  );
}

function isDebugGrantTarget(value: unknown): value is DebugGrantTarget {
  return (
    value === "fill_experience" ||
    value === "spirit_stone" ||
    value === "breakthrough_pill"
  );
}
