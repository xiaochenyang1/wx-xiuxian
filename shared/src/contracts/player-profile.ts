import type { AvatarVariant } from "./bootstrap";

export type ChosenAvatarVariant = Exclude<AvatarVariant, "neutral">;
