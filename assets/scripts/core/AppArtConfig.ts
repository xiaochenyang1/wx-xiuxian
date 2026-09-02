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
  daily: "daily",
};

export function normalizeResourceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\.(?:jpe?g|png|webp)$/, "");
}

/**
 * The trailing path segment of a resource name, which is what every asset icon
 * is keyed by: the guide lets an artist drop files into subdirectories, so two
 * icons for the same slot can only be told apart by their own file name.
 */
export function resourceBasename(name: string): string {
  const normalized = normalizeResourceName(name);
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? normalized : normalized.slice(separator + 1);
}

/**
 * Picks the most specific icon an asset row has art for. Candidates are ordered
 * narrowest first — a per-config file, then the slot file its whole slot shares
 * — which is the coexistence `docs/art-asset-guide.md` promises: 方案 A ships
 * the slot files, and a single prized piece may still get its own drawing
 * without the other rows changing.
 */
export function pickAssetIcon<T>(
  icons: Readonly<Record<string, T>>,
  candidates: readonly string[],
): T | undefined {
  for (const candidate of candidates) {
    const icon = icons[candidate];
    if (icon) return icon;
  }
  return undefined;
}

/**
 * The gutter an asset icon is drawn in, measured from the panel's centre. Icons
 * sit beside a list row rather than inside it: the 功法 and 法宝 rows already
 * spend their full 600 px on names, costs and buttons, so the only space left is
 * the strip between the 700 px panel body and the row plate. Putting them there
 * means dropping in art moves no text a player already reads.
 */
export const ROW_ICON_X = -326;

/** Icons for the tall rows — 法宝 at 112 px and 功法 at 108 px. */
export const ROW_ICON_SIZE = 42;

/** Icons for the 46 px stack rows, which a 42 px icon would overhang. */
export const COMPACT_ROW_ICON_SIZE = 36;

export function findNavigationArtName(
  names: readonly string[],
  expectedName: string,
): string | undefined {
  return names.find((name) => {
    const normalized = normalizeResourceName(name);
    return normalized === expectedName || normalized.endsWith(`/${expectedName}`);
  });
}
