import {
  EQUIPMENT_CONFIGS,
  ITEM_CONFIGS,
  TECHNIQUE_CONFIGS,
  type EquipmentSlot,
  type TechniqueSlot,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import {
  COMPACT_ROW_ICON_SIZE,
  pickAssetIcon,
  resourceBasename,
  ROW_ICON_SIZE,
  ROW_ICON_X,
} from "../assets/scripts/core/AppArtConfig";

/**
 * The files `docs/art-asset-guide.md` 方案 A promises, written as `satisfies` maps
 * so a new slot fails this file's typecheck rather than silently shipping a row
 * that can never find an icon. The keys are the slot names the save carries and
 * the values are the basenames an artist delivers — identical by design, which is
 * what lets a row look itself up without a translation table.
 */
const EQUIPMENT_SLOT_FILES = {
  weapon: "weapon",
  armor: "armor",
  accessory: "accessory",
  mount: "mount",
  pet: "pet",
} satisfies Record<EquipmentSlot, string>;

const TECHNIQUE_SLOT_FILES = {
  mind: "mind",
  movement: "movement",
  divine: "divine",
  secret: "secret",
} satisfies Record<TechniqueSlot, string>;

/** Stands in for a loaded directory: basename -> the file it came from. */
function deliveredIcons(
  resourceDir: string,
  basenames: readonly string[],
): Readonly<Record<string, string>> {
  const icons: Record<string, string> = {};
  for (const basename of basenames) {
    const path = `${resourceDir}/${basename}.png`;
    icons[resourceBasename(path)] = path;
  }
  return icons;
}

describe("asset icon resource names", () => {
  it("keys an icon by its own file name, whatever directory it arrived in", () => {
    expect(resourceBasename("art/items/Wood.PNG")).toBe("wood");
    expect(resourceBasename("Art\\Slots\\Equipment\\Weapon.png")).toBe("weapon");
    expect(resourceBasename("spiritual_herb")).toBe("spiritual_herb");
  });

  it("prefers a per-config drawing over the slot file it shares", () => {
    const icons = {
      weapon: "slots/weapon.png",
      void_immortal_sword: "slots/void_immortal_sword.png",
    };
    expect(pickAssetIcon(icons, ["void_immortal_sword", "weapon"])).toBe(
      "slots/void_immortal_sword.png",
    );
    expect(pickAssetIcon(icons, ["mortal_iron_sword", "weapon"])).toBe(
      "slots/weapon.png",
    );
  });

  it("returns nothing when neither granularity was delivered", () => {
    expect(pickAssetIcon({}, ["mortal_iron_sword", "weapon"])).toBeUndefined();
    expect(pickAssetIcon({ armor: "a.png" }, ["weapon"])).toBeUndefined();
    expect(pickAssetIcon({ weapon: "w.png" }, [])).toBeUndefined();
  });
});

describe("asset icon coverage", () => {
  it("finds an icon for every equipment piece in the configs", () => {
    const icons = deliveredIcons(
      "art/slots/equipment",
      Object.values(EQUIPMENT_SLOT_FILES),
    );
    for (const config of EQUIPMENT_CONFIGS) {
      expect(pickAssetIcon(icons, [config.id, config.slot])).toBeDefined();
    }
  });

  it("finds an icon for every technique book in the configs", () => {
    const icons = deliveredIcons(
      "art/slots/technique",
      Object.values(TECHNIQUE_SLOT_FILES),
    );
    for (const config of TECHNIQUE_CONFIGS) {
      expect(pickAssetIcon(icons, [config.id, config.slot])).toBeDefined();
    }
  });

  it("finds an icon for every item, which is drawn per config", () => {
    // Items have no slot to fall back to, so 方案 A ships one file per id — 13 of
    // them. A new item without a drawing is a text-only row, not a broken one.
    const itemIds = ITEM_CONFIGS.map((config) => config.id);
    expect(itemIds).toHaveLength(13);
    const icons = deliveredIcons("art/items", itemIds);
    for (const id of itemIds) {
      expect(pickAssetIcon(icons, [id])).toBeDefined();
    }
  });

  it("spends one slot file per slot, so no two slots share a drawing", () => {
    expect(new Set(Object.values(EQUIPMENT_SLOT_FILES)).size).toBe(5);
    expect(new Set(Object.values(TECHNIQUE_SLOT_FILES)).size).toBe(4);
  });
});

describe("asset icon gutter", () => {
  // `AppView.ts` draws `FeaturePanelBody` 700 wide and the three lists draw their
  // row plates 600 wide, both centred on the panel — so an icon has a 50 px gutter
  // per side to live in, and staying inside it is what keeps every row's existing
  // text exactly where it is today.
  const PANEL_BODY_HALF_WIDTH = 350;
  const ROW_HALF_WIDTH = 300;

  it.each([
    ["tall rows", ROW_ICON_SIZE],
    ["stack rows", COMPACT_ROW_ICON_SIZE],
  ] as const)("keeps the %s icon in the gutter", (_label, size) => {
    expect(ROW_ICON_X - size / 2).toBeGreaterThan(-PANEL_BODY_HALF_WIDTH);
    expect(ROW_ICON_X + size / 2).toBeLessThanOrEqual(-ROW_HALF_WIDTH);
  });

  it("sizes each icon under the row it sits beside", () => {
    // 46 px is the 堆叠道具 row; 108 px is 功法, the shorter of the two tall rows.
    expect(COMPACT_ROW_ICON_SIZE).toBeLessThan(46);
    expect(ROW_ICON_SIZE).toBeLessThan(108);
    expect(COMPACT_ROW_ICON_SIZE).toBeLessThan(ROW_ICON_SIZE);
  });
});
