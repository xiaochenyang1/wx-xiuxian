import type { AvatarVariant } from "@cultivation-diary/shared";
import { hashRequest } from "../../common/hash";
import type { AccessIdentity } from "../auth/token-service";
import { validatePlayerName } from "../auth/player-name";
import {
  PlayerProfileRepository,
  type ChosenAvatarVariant,
  type PlayerAvatarPersistenceResult,
  type PlayerProfilePersistenceResult,
  type PlayerProfileMutationCommand,
  type PlayerRenamePersistenceResult,
} from "./player-profile-repository";

const IDEMPOTENCY_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;

export interface PlayerProfileServicePort {
  chooseAvatar(
    identity: AccessIdentity,
    idempotencyKey: string,
    avatarVariant: ChosenAvatarVariant,
    expectedPlayerVersion?: string,
  ): Promise<PlayerProfilePersistenceResult<PlayerAvatarPersistenceResult>>;
  rename(
    identity: AccessIdentity,
    idempotencyKey: string,
    displayName: string,
    expectedPlayerVersion?: string,
  ): Promise<PlayerProfilePersistenceResult<PlayerRenamePersistenceResult>>;
}

export class PlayerProfileService implements PlayerProfileServicePort {
  constructor(
    private readonly repository: PlayerProfileRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async chooseAvatar(
    identity: AccessIdentity,
    idempotencyKey: string,
    avatarVariant: ChosenAvatarVariant,
    expectedPlayerVersion?: string,
  ): Promise<PlayerProfilePersistenceResult<PlayerAvatarPersistenceResult>> {
    return this.repository.chooseAvatar(
      this.command(
        identity,
        idempotencyKey,
        "player.avatar",
        { avatarVariant },
        expectedPlayerVersion,
      ),
      avatarVariant,
    );
  }

  async rename(
    identity: AccessIdentity,
    idempotencyKey: string,
    displayName: string,
    expectedPlayerVersion?: string,
  ): Promise<PlayerProfilePersistenceResult<PlayerRenamePersistenceResult>> {
    const name = validatePlayerName(displayName);
    return this.repository.rename(
      this.command(
        identity,
        idempotencyKey,
        "player.rename",
        name,
        expectedPlayerVersion,
      ),
      name,
    );
  }

  private command(
    identity: AccessIdentity,
    idempotencyKey: string,
    operation: string,
    body: unknown,
    expectedPlayerVersion?: string,
  ): PlayerProfileMutationCommand {
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

export function isChosenAvatarVariant(
  value: AvatarVariant,
): value is ChosenAvatarVariant {
  return value === "male" || value === "female";
}
