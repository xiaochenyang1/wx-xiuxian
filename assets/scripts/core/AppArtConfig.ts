import type { FeaturePanel, MainTab } from "./ClientTypes";

export const MAIN_NAVIGATION_ART_FILES: Readonly<Record<MainTab, string>> = {
  cultivation: "cultivation",
  partner: "partner",
  ranking: "ranking",
  cave: "cave",
};

export const FEATURE_NAVIGATION_ART_FILES: Readonly<
  Partial<Record<FeaturePanel, string>>
> = {
  techniques: "technique",
  equipment: "treasure",
  alchemy: "alchemy",
  crafting: "crafting",
  trialTower: "trial-tower",
  sect: "sect",
  expedition: "training",
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
