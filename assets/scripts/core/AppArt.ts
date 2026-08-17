import type { ChosenAvatarVariant } from "@cultivation-diary/shared";
import { resources, SpriteFrame } from "cc";

export const MAIN_BACKGROUND_KEYS = [
  "cultivation",
  "partner",
  "ranking",
  "cave",
] as const;

export type MainBackgroundKey = (typeof MAIN_BACKGROUND_KEYS)[number];

export type MainBackgroundArt = Readonly<
  Partial<Record<MainBackgroundKey, SpriteFrame>>
>;

export type AvatarSpriteFrames = Readonly<
  Partial<Record<ChosenAvatarVariant, SpriteFrame>>
>;

export interface SupplementalArt {
  readonly cultivators: AvatarSpriteFrames;
  readonly playerAvatars: AvatarSpriteFrames;
}

const MAIN_BACKGROUND_RESOURCE_DIR = "art/backgrounds";

let cachedMainBackgroundArt: MainBackgroundArt | null = null;
let mainBackgroundLoadInFlight: Promise<MainBackgroundArt> | null = null;
let cachedSupplementalArt: SupplementalArt | null = null;
let supplementalArtLoadInFlight: Promise<SupplementalArt> | null = null;

export function loadMainBackgroundArt(): Promise<MainBackgroundArt> {
  if (cachedMainBackgroundArt) {
    return Promise.resolve(cachedMainBackgroundArt);
  }
  if (mainBackgroundLoadInFlight) return mainBackgroundLoadInFlight;

  const request = new Promise<MainBackgroundArt>((resolve, reject) => {
    resources.loadDir<SpriteFrame>(
      MAIN_BACKGROUND_RESOURCE_DIR,
      SpriteFrame,
      (error, spriteFrames) => {
        if (error) {
          reject(error);
          return;
        }

        const loaded: Partial<Record<MainBackgroundKey, SpriteFrame>> = {};
        for (const spriteFrame of spriteFrames) {
          const key = resolveMainBackgroundKey(spriteFrame.name);
          if (key && !loaded[key]) loaded[key] = spriteFrame;
        }
        const art: MainBackgroundArt = Object.freeze(loaded);
        cachedMainBackgroundArt = art;
        resolve(art);
      },
    );
  });
  mainBackgroundLoadInFlight = request;
  void request.then(
    () => {
      mainBackgroundLoadInFlight = null;
    },
    () => {
      mainBackgroundLoadInFlight = null;
    },
  );
  return request;
}

export function loadSupplementalArt(): Promise<SupplementalArt> {
  if (cachedSupplementalArt) return Promise.resolve(cachedSupplementalArt);
  if (supplementalArtLoadInFlight) return supplementalArtLoadInFlight;

  const request = Promise.all([
    loadOptionalSpriteFrames("art/characters"),
    loadOptionalSpriteFrames("art/avatars"),
  ]).then(([characters, avatars]) => {
    const art: SupplementalArt = Object.freeze({
      cultivators: collectAvatarSpriteFrames(characters, "cultivator"),
      playerAvatars: collectAvatarSpriteFrames(avatars, "player"),
    });
    cachedSupplementalArt = art;
    return art;
  });
  supplementalArtLoadInFlight = request;
  void request.then(
    () => {
      supplementalArtLoadInFlight = null;
    },
    () => {
      supplementalArtLoadInFlight = null;
    },
  );
  return request;
}

function collectAvatarSpriteFrames(
  spriteFrames: readonly SpriteFrame[],
  prefix: string,
): AvatarSpriteFrames {
  const loaded: Partial<Record<ChosenAvatarVariant, SpriteFrame>> = {};
  for (const variant of ["male", "female"] as const) {
    const spriteFrame = findSpriteFrame(spriteFrames, `${prefix}-${variant}`);
    if (spriteFrame) loaded[variant] = spriteFrame;
  }
  return Object.freeze(loaded);
}

function loadOptionalSpriteFrames(resourceDir: string): Promise<readonly SpriteFrame[]> {
  return new Promise((resolve) => {
    resources.loadDir<SpriteFrame>(resourceDir, SpriteFrame, (error, spriteFrames) => {
      resolve(error ? [] : spriteFrames);
    });
  });
}

function findSpriteFrame(
  spriteFrames: readonly SpriteFrame[],
  expectedName: string,
): SpriteFrame | undefined {
  return spriteFrames.find((spriteFrame) => {
    const normalized = normalizeResourceName(spriteFrame.name);
    return normalized === expectedName || normalized.endsWith(`/${expectedName}`);
  });
}

function resolveMainBackgroundKey(name: string): MainBackgroundKey | null {
  const normalized = normalizeResourceName(name);
  for (const key of MAIN_BACKGROUND_KEYS) {
    if (normalized === key || normalized.endsWith(`/${key}`)) return key;
  }
  return null;
}

function normalizeResourceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\.(?:jpe?g|png|webp)$/, "");
}
