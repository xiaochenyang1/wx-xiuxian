import type {
  EquippedEquipmentSlot,
  LoadoutMutationResult,
} from "@cultivation-diary/shared";
import { hashRequest } from "../../common/hash";
import type { AccessIdentity } from "../auth/token-service";
import { BootstrapService } from "../bootstrap/bootstrap-service";
import {
  LoadoutRepository,
  type LoadoutMutationCommand,
} from "./loadout-repository";

const IDEMPOTENCY_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;

export interface LoadoutOperationResult {
  playerVersion: string;
  data: LoadoutMutationResult;
}

export interface LoadoutServicePort {
  equipTechnique(
    identity: AccessIdentity,
    idempotencyKey: string,
    techniqueConfigId: string,
    expectedPlayerVersion?: string,
  ): Promise<LoadoutOperationResult>;
  unequipTechnique(
    identity: AccessIdentity,
    idempotencyKey: string,
    techniqueConfigId: string,
    expectedPlayerVersion?: string,
  ): Promise<LoadoutOperationResult>;
  equipEquipment(
    identity: AccessIdentity,
    idempotencyKey: string,
    equipmentInstanceId: string,
    equippedSlot: EquippedEquipmentSlot,
    expectedPlayerVersion?: string,
  ): Promise<LoadoutOperationResult>;
  unequipEquipment(
    identity: AccessIdentity,
    idempotencyKey: string,
    equipmentInstanceId: string,
    expectedPlayerVersion?: string,
  ): Promise<LoadoutOperationResult>;
}

export class LoadoutService implements LoadoutServicePort {
  constructor(
    private readonly repository: LoadoutRepository,
    private readonly bootstrapService: BootstrapService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  equipTechnique(
    identity: AccessIdentity,
    idempotencyKey: string,
    techniqueConfigId: string,
    expectedPlayerVersion?: string,
  ): Promise<LoadoutOperationResult> {
    return this.run(
      identity,
      idempotencyKey,
      "techniques.equip",
      { techniqueConfigId },
      expectedPlayerVersion,
      (command) => this.repository.equipTechnique(command, techniqueConfigId),
    );
  }

  unequipTechnique(
    identity: AccessIdentity,
    idempotencyKey: string,
    techniqueConfigId: string,
    expectedPlayerVersion?: string,
  ): Promise<LoadoutOperationResult> {
    return this.run(
      identity,
      idempotencyKey,
      "techniques.unequip",
      { techniqueConfigId },
      expectedPlayerVersion,
      (command) => this.repository.unequipTechnique(command, techniqueConfigId),
    );
  }

  equipEquipment(
    identity: AccessIdentity,
    idempotencyKey: string,
    equipmentInstanceId: string,
    equippedSlot: EquippedEquipmentSlot,
    expectedPlayerVersion?: string,
  ): Promise<LoadoutOperationResult> {
    return this.run(
      identity,
      idempotencyKey,
      "equipment.equip",
      { equipmentInstanceId, equippedSlot },
      expectedPlayerVersion,
      (command) =>
        this.repository.equipEquipment(command, equipmentInstanceId, equippedSlot),
    );
  }

  unequipEquipment(
    identity: AccessIdentity,
    idempotencyKey: string,
    equipmentInstanceId: string,
    expectedPlayerVersion?: string,
  ): Promise<LoadoutOperationResult> {
    return this.run(
      identity,
      idempotencyKey,
      "equipment.unequip",
      { equipmentInstanceId },
      expectedPlayerVersion,
      (command) => this.repository.unequipEquipment(command, equipmentInstanceId),
    );
  }

  private async run(
    identity: AccessIdentity,
    idempotencyKey: string,
    operation: string,
    body: unknown,
    expectedPlayerVersion: string | undefined,
    mutation: (command: LoadoutMutationCommand) => Promise<Omit<LoadoutMutationResult, "bootstrap">>,
  ): Promise<LoadoutOperationResult> {
    const now = this.clock();
    const command: LoadoutMutationCommand = {
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
    const result = await mutation(command);
    const bootstrap = await this.bootstrapService.getSnapshot(
      identity.accountId,
      identity.playerId,
    );
    return {
      playerVersion: bootstrap.playerVersion,
      data: { ...result, bootstrap: bootstrap.snapshot },
    };
  }
}
