import type { BootstrapSnapshot } from "@cultivation-diary/shared";

export type MainTab = "cultivation" | "partner" | "ranking" | "cave";
export type StorageStatus = "saved" | "volatile";
export type ImplementedFeaturePanel =
  | "profile"
  | "techniques"
  | "equipment"
  | "inventory"
  | "tasks"
  | "alchemy"
  | "crafting"
  | "sect"
  | "expedition"
  | "trialTower";

export type FeaturePanel = ImplementedFeaturePanel;

export interface AppState {
  phase: "loading" | "ready" | "error";
  storageStatus: StorageStatus;
  lastSavedAt: string | null;
  loadingMessage: string;
  errorMessage: string | null;
  bootstrap: BootstrapSnapshot | null;
  selectedTab: MainTab;
  activeFeature: FeaturePanel | null;
  featureMessage: string | null;
}

export function canRunLocalMutation(state: Readonly<AppState>): boolean {
  return state.phase === "ready" && state.bootstrap !== null;
}

export function shouldShowPartnerUnlockNotice(
  state: Readonly<AppState>,
): boolean {
  return (
    canRunLocalMutation(state) &&
    state.bootstrap!.unlocks.partner &&
    !state.bootstrap!.settings.partnerUnlockNoticeSeen &&
    state.bootstrap!.offlineSettlement === null &&
    state.activeFeature === null
  );
}

export function hasSameBootstrapIdentity(
  current: BootstrapSnapshot | null | undefined,
  incoming: BootstrapSnapshot,
): boolean {
  return (
    current?.account.id === incoming.account.id &&
    current.player.id === incoming.player.id
  );
}
