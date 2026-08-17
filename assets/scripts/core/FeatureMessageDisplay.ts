import type { MainTab } from "./ClientTypes";

const DEFAULT_MAX_CHARACTERS = 64;
const UNLOCK_NOTICE_MAX_CHARACTERS = 28;

const MAIN_MAX_CHARACTERS: Readonly<Record<MainTab, number>> = {
  cultivation: 48,
  partner: 56,
  ranking: 56,
  cave: 56,
};

export interface MainFeatureMessageGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly labelWidth: number;
  readonly labelHeight: number;
}

export type FeatureMessageDisplay =
  | {
      readonly surface: "main";
      readonly tab: MainTab;
      readonly text: string;
      readonly maxLines: 2;
    }
  | {
      readonly surface: "feature-panel";
      readonly text: string;
      readonly maxLines: 2;
    }
  | {
      readonly surface: "partner-unlock";
      readonly text: string;
      readonly maxLines: 1;
    };

export interface FeatureMessageDisplayContext {
  readonly message: string | null;
  readonly selectedTab: MainTab;
  readonly activeFeatureOpen: boolean;
  readonly offlineSettlementOpen: boolean;
  readonly partnerUnlockNoticeOpen: boolean;
}

export function getFeatureMessageDisplay(
  context: FeatureMessageDisplayContext,
): FeatureMessageDisplay | null {
  const normalized = normalizeMessage(context.message);
  if (normalized === null || context.offlineSettlementOpen) return null;

  if (context.partnerUnlockNoticeOpen) {
    return {
      surface: "partner-unlock",
      text: truncateMessage(normalized, UNLOCK_NOTICE_MAX_CHARACTERS),
      maxLines: 1,
    };
  }
  if (context.activeFeatureOpen) {
    return {
      surface: "feature-panel",
      text: truncateMessage(normalized, DEFAULT_MAX_CHARACTERS),
      maxLines: 2,
    };
  }
  return {
    surface: "main",
    tab: context.selectedTab,
    text: truncateMessage(normalized, MAIN_MAX_CHARACTERS[context.selectedTab]),
    maxLines: 2,
  };
}

export function getMainFeatureMessageGeometry(
  tab: MainTab,
): MainFeatureMessageGeometry {
  if (tab === "cultivation") {
    return {
      x: 0,
      y: -207,
      width: 390,
      height: 48,
      labelWidth: 358,
      labelHeight: 40,
    };
  }
  if (tab === "ranking") {
    return {
      x: -56,
      y: -350,
      width: 566,
      height: 48,
      labelWidth: 534,
      labelHeight: 40,
    };
  }
  return {
    x: -56,
    y: -185,
    width: 520,
    height: 54,
    labelWidth: 488,
    labelHeight: 44,
  };
}

function normalizeMessage(message: string | null): string | null {
  if (message === null) return null;
  const normalized = message.trim().replace(/\s+/g, " ");
  return normalized === "" ? null : normalized;
}

function truncateMessage(message: string, maxCharacters: number): string {
  const characters = Array.from(message);
  if (characters.length <= maxCharacters) return message;
  return `${characters.slice(0, maxCharacters - 3).join("")}...`;
}
