import type { AvatarVariant, BootstrapSnapshot } from "./bootstrap";

export type ChosenAvatarVariant = Exclude<AvatarVariant, "neutral">;

export interface PlayerAvatarResult {
  operationId: string;
  avatarVariant: ChosenAvatarVariant;
  bootstrap: BootstrapSnapshot;
}

export interface PlayerRenameResult {
  operationId: string;
  previousDisplayName: string;
  displayName: string;
  usedFreeRename: boolean;
  renameCardsConsumed: 0 | 1;
  bootstrap: BootstrapSnapshot;
}
