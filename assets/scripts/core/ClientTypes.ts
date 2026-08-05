import type { AuthTokens, BootstrapSnapshot } from "@cultivation-diary/shared";

export const BOOTSTRAP_CACHE_SCHEMA_VERSION = 1 as const;

export type MainTab = "cultivation" | "partner" | "ranking" | "cave";
export type SyncStatus = "online" | "reconnecting" | "offline";
export type FeaturePanel =
  | "profile"
  | "techniques"
  | "equipment"
  | "inventory"
  | "tasks";

export type LoginIntent =
  | { kind: "development"; accountId: string }
  | { kind: "wechat"; code: string };

export interface StoredSession extends AuthTokens {}

export interface AuthoritativeSnapshotMetadata {
  playerVersion: string;
  lastSuccessfulSyncAt: string;
}

export interface StoredBootstrapCache extends AuthoritativeSnapshotMetadata {
  schemaVersion: typeof BOOTSTRAP_CACHE_SCHEMA_VERSION;
  bootstrap: BootstrapSnapshot;
}

export interface AppState {
  phase: "loading" | "ready" | "error";
  syncStatus: SyncStatus;
  lastSuccessfulSyncAt: string | null;
  loadingMessage: string;
  errorMessage: string | null;
  bootstrap: BootstrapSnapshot | null;
  selectedTab: MainTab;
  activeFeature: FeaturePanel | null;
  featureMessage: string | null;
}

export function canRunAuthoritativeMutation(state: Readonly<AppState>): boolean {
  return state.phase === "ready" && state.bootstrap !== null && state.syncStatus === "online";
}

export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse<T> {
  statusCode: number;
  data: T;
}

export class ClientRequestTimeoutError extends Error {
  constructor() {
    super("网络请求超时");
    this.name = "ClientRequestTimeoutError";
  }
}

export function withRequestTimeout<T>(
  request: Promise<T>,
  timeoutMilliseconds: number,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        onTimeout?.();
      } catch {
        // Cleanup must not replace the timeout failure seen by the caller.
      }
      reject(new ClientRequestTimeoutError());
    }, timeoutMilliseconds);

    request.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type StoredBootstrapCacheEnvelope = Omit<
  StoredBootstrapCache,
  "bootstrap"
> & {
  bootstrap: Record<string, unknown>;
};

export function isStoredBootstrapCacheEnvelope(
  value: unknown,
): value is StoredBootstrapCacheEnvelope {
  if (!isRecord(value) || value.schemaVersion !== BOOTSTRAP_CACHE_SCHEMA_VERSION) {
    return false;
  }
  if (
    typeof value.playerVersion !== "string" ||
    !/^\d+$/.test(value.playerVersion) ||
    typeof value.lastSuccessfulSyncAt !== "string" ||
    !isIsoTimestamp(value.lastSuccessfulSyncAt)
  ) {
    return false;
  }

  const bootstrap = value.bootstrap;
  return (
    isRecord(bootstrap) &&
    isRecord(bootstrap.account) &&
    typeof bootstrap.account.id === "string" &&
    isRecord(bootstrap.player) &&
    typeof bootstrap.player.id === "string" &&
    typeof bootstrap.player.displayName === "string" &&
    isRecord(bootstrap.progress) &&
    typeof bootstrap.progress.level === "number" &&
    typeof bootstrap.progress.experience === "string" &&
    isRecord(bootstrap.wallet) &&
    typeof bootstrap.wallet.spiritStone === "string" &&
    isRecord(bootstrap.inventory) &&
    Array.isArray(bootstrap.inventory.stacks) &&
    Array.isArray(bootstrap.techniques) &&
    Array.isArray(bootstrap.equipment) &&
    isRecord(bootstrap.harvestChest) &&
    Array.isArray(bootstrap.harvestChest.entries) &&
    Array.isArray(bootstrap.newcomerTasks) &&
    isRecord(bootstrap.unlocks) &&
    isRecord(bootstrap.settings) &&
    Array.isArray(bootstrap.activeEffects) &&
    isRecord(bootstrap.config) &&
    typeof bootstrap.config.version === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
