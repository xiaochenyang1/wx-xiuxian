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

const MAIN_BACKGROUND_RESOURCE_DIR = "art/backgrounds";

let cachedMainBackgroundArt: MainBackgroundArt | null = null;
let mainBackgroundLoadInFlight: Promise<MainBackgroundArt> | null = null;

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

function resolveMainBackgroundKey(name: string): MainBackgroundKey | null {
  const normalized = name
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\.(?:jpe?g|png|webp)$/, "");
  for (const key of MAIN_BACKGROUND_KEYS) {
    if (normalized === key || normalized.endsWith(`/${key}`)) return key;
  }
  return null;
}
