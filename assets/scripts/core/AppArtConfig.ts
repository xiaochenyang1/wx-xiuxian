import type { ArtCapableFeature } from "./AppNavigation";
import type { MainTab } from "./ClientTypes";

export const MAIN_NAVIGATION_ART_FILES: Readonly<Record<MainTab, string>> = {
  cultivation: "cultivation",
  partner: "partner",
  ranking: "ranking",
  cave: "cave",
};

/**
 * One file name per navigation button that can carry a dropped-in icon. The key
 * set is fixed by `ArtCapableFeature`, so a button added to a rail without a
 * name here fails the typecheck rather than silently keeping its drawn glyph
 * forever. 档案 is not a key: the header avatar shows the player's portrait.
 */
export const FEATURE_NAVIGATION_ART_FILES: Readonly<
  Record<ArtCapableFeature, string>
> = {
  techniques: "technique",
  equipment: "treasure",
  alchemy: "alchemy",
  crafting: "crafting",
  trialTower: "trial-tower",
  sect: "sect",
  expedition: "training",
  inventory: "inventory",
  tasks: "tasks",
};

export function normalizeResourceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\.(?:jpe?g|png|webp)$/, "");
}

export function findNavigationArtName(
  names: readonly string[],
  expectedName: string,
): string | undefined {
  return names.find((name) => {
    const normalized = normalizeResourceName(name);
    return normalized === expectedName || normalized.endsWith(`/${expectedName}`);
  });
}
