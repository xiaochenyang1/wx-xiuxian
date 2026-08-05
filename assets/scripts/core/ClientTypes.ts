import type { AuthTokens, BootstrapSnapshot } from "@cultivation-diary/shared";

export const BOOTSTRAP_CACHE_SCHEMA_VERSION = 2 as const;

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

export interface StoredSession extends AuthTokens {
  accountId?: string;
  playerId?: string;
}

export interface AuthoritativeSnapshotMetadata {
  playerVersion: string;
  lastSuccessfulSyncAt: string;
}

export interface StoredBootstrapCache extends AuthoritativeSnapshotMetadata {
  schemaVersion: typeof BOOTSTRAP_CACHE_SCHEMA_VERSION;
  accountId: string;
  playerId: string;
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

export function hasSameBootstrapIdentity(
  current: BootstrapSnapshot | null | undefined,
  incoming: BootstrapSnapshot,
): boolean {
  return (
    current?.account.id === incoming.account.id &&
    current.player.id === incoming.player.id
  );
}

export function shouldInstallDeferredIdentityPreview(
  current: BootstrapSnapshot | null | undefined,
  incoming: BootstrapSnapshot,
  allowRender: boolean,
): boolean {
  return !allowRender && !hasSameBootstrapIdentity(current, incoming);
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

export function isStoredBootstrapCacheEnvelope(
  value: unknown,
): value is StoredBootstrapCache {
  if (!isRecord(value) || value.schemaVersion !== BOOTSTRAP_CACHE_SCHEMA_VERSION) {
    return false;
  }
  if (
    !isUuidString(value.accountId) ||
    !isUuidString(value.playerId) ||
    !isUnsignedIntegerString(value.playerVersion) ||
    !isIsoTimestampValue(value.lastSuccessfulSyncAt) ||
    !isBootstrapSnapshot(value.bootstrap)
  ) {
    return false;
  }

  return (
    value.accountId === value.bootstrap.account.id &&
    value.playerId === value.bootstrap.player.id
  );
}

export function isStoredSession(value: unknown): value is StoredSession {
  if (!isRecord(value)) return false;
  const hasAccountId = value.accountId !== undefined;
  const hasPlayerId = value.playerId !== undefined;
  return (
    isTokenString(value.accessToken) &&
    isIsoTimestampValue(value.accessTokenExpiresAt) &&
    isTokenString(value.refreshToken) &&
    isIsoTimestampValue(value.refreshTokenExpiresAt) &&
    hasAccountId === hasPlayerId &&
    (!hasAccountId ||
      (isUuidString(value.accountId) && isUuidString(value.playerId)))
  );
}

export function getRestorableBootstrapCache(
  storedSession: unknown,
  storedCache: unknown,
  currentTimeMilliseconds = Date.now(),
): StoredBootstrapCache | null {
  if (
    !Number.isFinite(currentTimeMilliseconds) ||
    !isStoredSession(storedSession) ||
    !storedSession.accountId ||
    !storedSession.playerId ||
    Date.parse(storedSession.refreshTokenExpiresAt) <= currentTimeMilliseconds ||
    !isStoredBootstrapCacheEnvelope(storedCache)
  ) {
    return null;
  }
  return storedSession.accountId === storedCache.accountId &&
    storedSession.playerId === storedCache.playerId
    ? storedCache
    : null;
}

export function createStoredBootstrapCache(
  bootstrap: BootstrapSnapshot,
  metadata: AuthoritativeSnapshotMetadata,
  visibleBootstrap: BootstrapSnapshot | null,
): StoredBootstrapCache | null {
  const sameVisibleIdentity = hasSameBootstrapIdentity(
    visibleBootstrap,
    bootstrap,
  );
  const pendingOfflineSettlement =
    bootstrap.offlineSettlement ??
    (sameVisibleIdentity && visibleBootstrap
      ? visibleBootstrap.offlineSettlement
      : null);
  const cachedBootstrap =
    pendingOfflineSettlement === bootstrap.offlineSettlement
      ? bootstrap
      : { ...bootstrap, offlineSettlement: pendingOfflineSettlement };
  const cache: StoredBootstrapCache = {
    schemaVersion: BOOTSTRAP_CACHE_SCHEMA_VERSION,
    accountId: bootstrap.account.id,
    playerId: bootstrap.player.id,
    ...metadata,
    bootstrap: cachedBootstrap,
  };
  return isStoredBootstrapCacheEnvelope(cache) ? cache : null;
}

export function dismissCachedOfflineSettlement(
  cache: StoredBootstrapCache,
  identity: {
    accountId: string;
    playerId: string;
    settlementId: string;
  },
): StoredBootstrapCache {
  if (
    cache.accountId !== identity.accountId ||
    cache.playerId !== identity.playerId ||
    cache.bootstrap.offlineSettlement?.id !== identity.settlementId
  ) {
    return cache;
  }
  return {
    ...cache,
    bootstrap: { ...cache.bootstrap, offlineSettlement: null },
  };
}

function isBootstrapSnapshot(value: unknown): value is BootstrapSnapshot {
  // Local storage is untrusted. These bounds intentionally form a stricter
  // cache-safe subset of the transport contract before data reaches the UI.
  if (!isRecord(value)) return false;
  const account = value.account;
  const player = value.player;
  const progress = value.progress;
  const wallet = value.wallet;
  const inventory = value.inventory;
  const harvestChest = value.harvestChest;
  const unlocks = value.unlocks;
  const settings = value.settings;
  const config = value.config;

  return (
    isRecord(account) &&
    isUuidString(account.id) &&
    isRecord(player) &&
    isUuidString(player.id) &&
    isBoundedString(player.displayName) &&
    isAvatarVariant(player.avatarVariant) &&
    typeof player.freeRenameAvailable === "boolean" &&
    isProgressSnapshot(progress) &&
    isWalletSnapshot(wallet) &&
    isInventorySnapshot(inventory) &&
    isBoundedArray(value.techniques, 2_048, isTechniqueSnapshot) &&
    isBoundedArray(value.equipment, 200, isEquipmentSnapshot) &&
    isHarvestChestSnapshot(harvestChest) &&
    isBoundedArray(value.newcomerTasks, 512, isNewcomerTaskSnapshot) &&
    isRecord(unlocks) &&
    typeof unlocks.partner === "boolean" &&
    typeof unlocks.cave === "boolean" &&
    isRecord(settings) &&
    typeof settings.autoSalvageCommon === "boolean" &&
    typeof settings.autoSalvageUncommon === "boolean" &&
    typeof settings.partnerUnlockNoticeSeen === "boolean" &&
    isBoundedString(settings.selectedTab) &&
    isBoundedArray(value.activeEffects, 512, () => true) &&
    isRecord(config) &&
    isBoundedString(config.version) &&
    (value.offlineSettlement === null ||
      isOfflineSettlementSummary(value.offlineSettlement))
  );
}

function isProgressSnapshot(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isIntegerInRange(value.level, 1, 1_000) &&
    isBoundedString(value.realmId) &&
    isBoundedString(value.realmName) &&
    isOneOf(value.stage, ["early", "middle", "late", "perfect"]) &&
    isBoundedString(value.title) &&
    isDecimalString(value.experience) &&
    isDecimalString(value.requiredExperience) &&
    isOneOf(value.status, ["gaining", "breakthrough_ready", "version_cap"]) &&
    isDecimalString(value.totalPower) &&
    isDecimalString(value.cultivationReserve) &&
    isDecimalString(value.experiencePerSecond) &&
    isDecimalString(value.spiritStonePerMinute) &&
    isDecimalString(value.loadoutFixedPower) &&
    isNonNegativeInteger(value.experienceBonusBp) &&
    isNonNegativeInteger(value.spiritStoneBonusBp) &&
    isNonNegativeInteger(value.dropBonusBp)
  );
}

function isWalletSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDecimalString(value.spiritStone) &&
    isDecimalString(value.immortalJade) &&
    isDecimalString(value.lifetimeSpiritStoneEarned)
  );
}

function isInventorySnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    isIntegerInRange(value.bagCapacity, 50, 200) &&
    isBoundedArray(value.stacks, 200, (entry) =>
      isRecord(entry) &&
      isBoundedString(entry.itemConfigId) &&
      isBoundedString(entry.displayName) &&
      isDecimalString(entry.quantity),
    )
  );
}

function isTechniqueSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.techniqueConfigId) &&
    isBoundedString(value.displayName) &&
    isBoundedString(value.quality) &&
    isBoundedString(value.slot) &&
    isNonNegativeInteger(value.star) &&
    isNonNegativeInteger(value.duplicateCount) &&
    isNullableBoundedString(value.equippedSlot) &&
    isDecimalString(value.fixedPower) &&
    isNonNegativeInteger(value.experienceBonusBp) &&
    isNonNegativeInteger(value.spiritStoneBonusBp) &&
    isNonNegativeInteger(value.dropBonusBp) &&
    isBoundedString(value.configVersion)
  );
}

function isEquipmentSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    isUuidString(value.id) &&
    isBoundedString(value.equipmentConfigId) &&
    isBoundedString(value.displayName) &&
    isBoundedString(value.quality) &&
    isBoundedString(value.slot) &&
    isDecimalString(value.fixedPower) &&
    isNonNegativeInteger(value.enhanceLevel) &&
    Object.prototype.hasOwnProperty.call(value, "rolledAffixes") &&
    isBoundedString(value.location) &&
    isNullableBoundedString(value.equippedSlot) &&
    typeof value.isLocked === "boolean" &&
    isBoundedString(value.configVersion)
  );
}

function isHarvestChestSnapshot(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isIntegerInRange(value.pendingCount, 0, 100) ||
    !isBoundedArray(value.entries, 100, (entry) =>
      isRecord(entry) &&
      isUuidString(entry.id) &&
      isBoundedString(entry.entryType) &&
      isNullableBoundedString(entry.equipmentInstanceId) &&
      isNullableBoundedString(entry.techniqueConfigId) &&
      isBoundedString(entry.assetConfigId) &&
      isBoundedString(entry.displayName) &&
      isBoundedString(entry.quality) &&
      isDecimalString(entry.valueScore) &&
      isIsoTimestampValue(entry.acquiredAt),
    )
  ) {
    return false;
  }
  return value.pendingCount === value.entries.length;
}

function isNewcomerTaskSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.taskConfigId) &&
    isDecimalString(value.progress) &&
    isNullableIsoTimestamp(value.completedAt) &&
    isNullableIsoTimestamp(value.claimedAt)
  );
}

function isOfflineSettlementSummary(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.drops)) return false;
  const drops = value.drops;
  return (
    isUuidString(value.id) &&
    isIsoTimestampValue(value.fromTime) &&
    isIsoTimestampValue(value.toTime) &&
    isIntegerInRange(value.effectiveSeconds, 0, 86_400) &&
    isNonNegativeInteger(value.efficiencyBp) &&
    isDecimalString(value.experienceGained) &&
    isDecimalString(value.experienceDiscarded) &&
    isDecimalString(value.spiritStoneGained) &&
    isNonNegativeInteger(value.dropAttempts) &&
    isBoundedString(drops.configVersion) &&
    isBoundedArray(drops.stackItems, 2_048, (entry) =>
      isRecord(entry) &&
      isBoundedString(entry.itemConfigId) &&
      isDecimalString(entry.quantity),
    ) &&
    isNonNegativeInteger(drops.equipmentCount) &&
    isNonNegativeInteger(drops.techniqueCount) &&
    isNonNegativeInteger(drops.harvestChestAdded) &&
    isNonNegativeInteger(drops.techniqueDuplicates) &&
    isNonNegativeInteger(drops.autoSalvagedCount) &&
    isNonNegativeInteger(drops.mailedCount) &&
    isDecimalString(drops.autoSalvageSpiritStone) &&
    isDecimalString(drops.autoSalvageEnhanceStone) &&
    isBoundedArray(value.events, 2_048, isProgressionEvent) &&
    typeof value.newcomerRewardGranted === "boolean"
  );
}

function isProgressionEvent(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === "level_up") {
    return isNonNegativeInteger(value.fromLevel) && isNonNegativeInteger(value.toLevel);
  }
  return (
    (value.type === "breakthrough_ready" || value.type === "version_cap_reached") &&
    isNonNegativeInteger(value.level)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBoundedArray(
  value: unknown,
  maximumLength: number,
  predicate: (entry: unknown) => boolean,
): value is unknown[] {
  return (
    Array.isArray(value) &&
    value.length <= maximumLength &&
    value.every(predicate)
  );
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function isUuidString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isTokenString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 16_384;
}

function isNullableBoundedString(value: unknown): value is string | null {
  return value === null || isBoundedString(value);
}

function isUnsignedIntegerString(value: unknown): value is string {
  return typeof value === "string" && value.length <= 160 && /^(?:0|[1-9]\d*)$/.test(value);
}

function isDecimalString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 160 &&
    /^(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d{1,6})?$/i.test(value)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): boolean {
  return isNonNegativeInteger(value) && value >= minimum && value <= maximum;
}

function isOneOf<T extends string>(value: unknown, candidates: readonly T[]): value is T {
  return typeof value === "string" && candidates.indexOf(value as T) !== -1;
}

function isAvatarVariant(value: unknown): value is BootstrapSnapshot["player"]["avatarVariant"] {
  return isOneOf(value, ["neutral", "male", "female"]);
}

function isNullableIsoTimestamp(value: unknown): value is string | null {
  return value === null || isIsoTimestampValue(value);
}

function isIsoTimestampValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
