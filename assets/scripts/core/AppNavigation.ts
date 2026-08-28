import type { FeaturePanel, MainTab } from "./ClientTypes";

/**
 * Where every screen can be reached from. Kept free of `cc` imports so the
 * tables are the same objects the tests read — a copy of the layout in a test
 * file can only prove the copy is self-consistent.
 *
 * The rule the tables encode: one entry point per panel. Two buttons that open
 * the same panel cost a slot each, and one of them is always the one the player
 * did not learn.
 */

export interface MainTabEntry {
  readonly id: MainTab;
  readonly label: string;
}

export interface FeatureEntry {
  readonly label: string;
  readonly feature: FeaturePanel;
}

/** The count bubble a shortcut carries, resolved to a number by the view. */
export type ShortcutBadge = "tasks" | "harvest";

export interface ShortcutEntry extends FeatureEntry {
  readonly x: number;
  readonly y: number;
  readonly icon: number;
  readonly badge: ShortcutBadge;
}

/** The four pages, on the right rail of every screen. */
export const MAIN_TABS: ReadonlyArray<MainTabEntry> = [
  { id: "cultivation", label: "修炼" },
  { id: "partner", label: "伴侣" },
  { id: "ranking", label: "排行" },
  { id: "cave", label: "洞府" },
];

/**
 * The bottom rail, drawn on every page. Seven slots at a 107px pitch is what a
 * 750px design width holds, so this rail cannot be the home of all ten panels —
 * the two with live counts sit on the cultivation page instead, and 档案 hangs
 * off the header avatar.
 */
export const BOTTOM_FEATURE_RAIL: ReadonlyArray<FeatureEntry> = [
  { label: "功法", feature: "techniques" },
  { label: "法宝", feature: "equipment" },
  { label: "炼丹", feature: "alchemy" },
  { label: "炼器", feature: "crafting" },
  // 灵宠是法宝的一个槽位（月影灵狐），法宝面板已经管着它，这一格留给试炼塔。
  { label: "试炼塔", feature: "trialTower" },
  { label: "宗门", feature: "sect" },
  { label: "历练", feature: "expedition" },
];

/**
 * The left edge of the cultivation page. Both slots earn their space by showing
 * a number the player is waiting on; the right-hand column is left to the main
 * navigation, which is why nothing here needs suppressing behind artwork.
 */
export const CULTIVATION_SHORTCUTS: ReadonlyArray<ShortcutEntry> = [
  { label: "任务", feature: "tasks", x: -322, y: 255, icon: 3, badge: "tasks" },
  { label: "行囊", feature: "inventory", x: -322, y: 150, icon: 2, badge: "harvest" },
];

/** 档案 opens from the header avatar, which every page draws. */
export const HEADER_FEATURE: FeaturePanel = "profile";

/**
 * Every panel that exists, so adding one cannot silently ship without a way in:
 * the assertion below fails to compile until the new panel is listed, and
 * `test/feature-rail.test.ts` fails until exactly one table offers it.
 */
export const ALL_FEATURE_PANELS = [
  "profile",
  "techniques",
  "equipment",
  "inventory",
  "tasks",
  "alchemy",
  "crafting",
  "sect",
  "expedition",
  "trialTower",
] as const satisfies ReadonlyArray<FeaturePanel>;

type ListedFeaturePanel = (typeof ALL_FEATURE_PANELS)[number];
const _everyPanelIsListed: FeaturePanel extends ListedFeaturePanel ? true : never = true;
void _everyPanelIsListed;
