import type { BootstrapSnapshot } from "@cultivation-diary/shared";

export type MainTab = "cultivation" | "partner" | "ranking" | "cave";
export type StorageStatus = "saved" | "volatile";
export type ImplementedFeaturePanel =
  | "profile"
  | "techniques"
  | "equipment"
  | "inventory"
  | "tasks"
  | "daily"
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

export function isMainTab(value: unknown): value is MainTab {
  return (
    value === "cultivation" ||
    value === "partner" ||
    value === "ranking" ||
    value === "cave"
  );
}

/**
 * The tab a save says it was left on, falling back to cultivation.
 *
 * `settings.selectedTab` is a `string` in the contract because `shared` cannot
 * depend on `assets/`, so the narrowing happens here. Two of the four tabs are
 * gated, and a locked one is legitimately reachable — the locked page is
 * tappable — so a save can hold `cave` while `unlocks.cave` is false. Opening
 * onto a "筑基后开启" placeholder is the worst possible first screen, so those
 * fall back too. Unlock bits are never revoked, so this only ever catches a
 * save that genuinely has not reached the threshold yet.
 */
export function resolveRestoredTab(bootstrap: BootstrapSnapshot): MainTab {
  const saved = bootstrap.settings.selectedTab;
  if (!isMainTab(saved)) return "cultivation";
  if (saved === "partner" && !bootstrap.unlocks.partner) return "cultivation";
  if (saved === "cave" && !bootstrap.unlocks.cave) return "cultivation";
  return saved;
}
