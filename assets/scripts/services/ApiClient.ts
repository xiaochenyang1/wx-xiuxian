import type {
  ApiFailure,
  ApiSuccess,
  AuthLoginResult,
  BootstrapSnapshot,
  ChosenAvatarVariant,
  CultivationBreakthroughResult,
  CultivationSettleResult,
  HarvestSalvageResult,
  HarvestTransferResult,
  InventoryExpandResult,
  InventoryUseResult,
  LoadoutMutationResult,
  EquippedEquipmentSlot,
  PlayerAvatarResult,
  PlayerRenameResult,
  RefreshSessionResult,
  SyncHeartbeatResult,
} from "@cultivation-diary/shared";
import { CLIENT_CONFIG } from "../core/ClientConfig";
import type {
  AuthoritativeSnapshotMetadata,
  HttpRequest,
  HttpResponse,
  LoginIntent,
  StoredSession,
} from "../core/ClientTypes";
import { isStoredSession } from "../core/ClientTypes";
import type { PlatformAdapter } from "../platform/PlatformAdapter";

export class ClientApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export function isClientTransportError(error: unknown): error is ClientApiError {
  return error instanceof ClientApiError && error.code === "NETWORK_UNAVAILABLE";
}

export function isTerminalAuthenticationError(
  error: unknown,
): error is ClientApiError {
  return error instanceof ClientApiError && error.code === "ACCOUNT_BANNED";
}

export function requiresAuthoritativeRecovery(error: unknown): error is ClientApiError {
  return (
    error instanceof ClientApiError &&
    (error.code === "PLAYER_VERSION_CONFLICT" ||
      error.code === "UNAUTHENTICATED" ||
      error.code === "SESSION_EXPIRED")
  );
}

export function classifyAuthoritativeFailure(
  error: unknown,
  authoritativeRecoveryFailed = false,
): "offline" | "reconnecting" | null {
  if (isClientTransportError(error)) return "offline";
  if (authoritativeRecoveryFailed || requiresAuthoritativeRecovery(error)) {
    return "reconnecting";
  }
  return null;
}

export class ApiClient {
  private playerVersion: string | null = null;
  private lastSuccessfulSyncAt: string | null = null;
  private rejectedStoredSession = false;

  constructor(
    private readonly platform: PlatformAdapter,
    private readonly baseUrl: string = CLIENT_CONFIG.apiBaseUrl,
  ) {}

  async authenticate(): Promise<BootstrapSnapshot> {
    // Authentication establishes a fresh authoritative baseline and may switch players.
    this.resetAuthoritativeMetadata();
    const stored = this.loadStoredSession();
    if (stored) {
      try {
        const bootstrap = await this.bootstrap(stored.accessToken);
        this.persistSession(stored, bootstrap);
        return bootstrap;
      } catch (error) {
        if (isTerminalAuthenticationError(error)) {
          this.rejectStoredSession();
          throw error;
        }
        if (!(error instanceof ClientApiError) || error.code !== "UNAUTHENTICATED") {
          throw error;
        }

        try {
          const refreshed = await this.refresh(stored.refreshToken);
          this.persistSession(refreshed.tokens, refreshed.bootstrap);
          return refreshed.bootstrap;
        } catch (refreshError) {
          if (isTerminalAuthenticationError(refreshError)) {
            this.rejectStoredSession();
            throw refreshError;
          }
          if (!isRejectedSessionCredential(refreshError)) {
            throw refreshError;
          }
          this.rejectStoredSession();
          // An invalid refresh credential falls through to a new platform login.
        }
      }
    }

    const intent = await this.getLoginIntent();
    const login = await this.login(intent);
    this.persistSession(login.tokens, login.bootstrap);
    return login.bootstrap;
  }

  consumeRejectedStoredSession(): boolean {
    const rejected = this.rejectedStoredSession;
    this.rejectedStoredSession = false;
    return rejected;
  }

  async bootstrap(accessToken: string): Promise<BootstrapSnapshot> {
    const response = await this.send<
      ApiSuccess<BootstrapSnapshot> | ApiFailure
    >({
      method: "GET",
      url: `${this.baseUrl}/api/v1/bootstrap`,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return this.capture(unwrap(response.statusCode, response.data));
  }

  async settleCultivation(): Promise<CultivationSettleResult> {
    return this.authorizedMutation<CultivationSettleResult>(
      "/api/v1/cultivation/settle",
    );
  }

  async syncHeartbeat(): Promise<SyncHeartbeatResult> {
    return this.authorizedMutation<SyncHeartbeatResult>("/api/v1/sync/heartbeat");
  }

  getAuthoritativeSnapshotMetadata(): AuthoritativeSnapshotMetadata | null {
    if (this.playerVersion === null || this.lastSuccessfulSyncAt === null) return null;
    return {
      playerVersion: this.playerVersion,
      lastSuccessfulSyncAt: this.lastSuccessfulSyncAt,
    };
  }

  async breakthrough(): Promise<CultivationBreakthroughResult> {
    return this.authorizedMutation<CultivationBreakthroughResult>(
      "/api/v1/cultivation/breakthrough",
    );
  }

  async chooseAvatar(
    avatarVariant: ChosenAvatarVariant,
  ): Promise<PlayerAvatarResult> {
    return this.authorizedMutation<PlayerAvatarResult>(
      "/api/v1/player/avatar",
      { avatarVariant },
    );
  }

  async renamePlayer(displayName: string): Promise<PlayerRenameResult> {
    return this.authorizedMutation<PlayerRenameResult>(
      "/api/v1/player/rename",
      { displayName },
    );
  }

  async expandInventory(): Promise<InventoryExpandResult> {
    return this.authorizedMutation<InventoryExpandResult>(
      "/api/v1/inventory/expand",
    );
  }

  async useInventoryItem(
    itemConfigId: string,
    quantity = 1,
  ): Promise<InventoryUseResult> {
    return this.authorizedMutation<InventoryUseResult>(
      "/api/v1/inventory/use",
      { itemConfigId, quantity },
    );
  }

  async transferHarvest(entryIds: readonly string[]): Promise<HarvestTransferResult> {
    return this.authorizedMutation<HarvestTransferResult>(
      "/api/v1/harvest/transfer",
      { entryIds },
    );
  }

  async salvageHarvest(
    entryIds: readonly string[],
    confirmHighQuality = false,
  ): Promise<HarvestSalvageResult> {
    return this.authorizedMutation<HarvestSalvageResult>(
      "/api/v1/harvest/salvage",
      { entryIds, confirmHighQuality },
    );
  }

  async equipTechnique(techniqueConfigId: string): Promise<LoadoutMutationResult> {
    return this.authorizedMutation<LoadoutMutationResult>(
      "/api/v1/techniques/equip",
      { techniqueConfigId },
    );
  }

  async unequipTechnique(techniqueConfigId: string): Promise<LoadoutMutationResult> {
    return this.authorizedMutation<LoadoutMutationResult>(
      "/api/v1/techniques/unequip",
      { techniqueConfigId },
    );
  }

  async equipEquipment(
    equipmentInstanceId: string,
    equippedSlot: EquippedEquipmentSlot,
  ): Promise<LoadoutMutationResult> {
    return this.authorizedMutation<LoadoutMutationResult>(
      "/api/v1/equipment/equip",
      { equipmentInstanceId, equippedSlot },
    );
  }

  async unequipEquipment(equipmentInstanceId: string): Promise<LoadoutMutationResult> {
    return this.authorizedMutation<LoadoutMutationResult>(
      "/api/v1/equipment/unequip",
      { equipmentInstanceId },
    );
  }

  private async login(intent: LoginIntent): Promise<AuthLoginResult> {
    const path = intent.kind === "development" ? "/api/v1/auth/dev" : "/api/v1/auth/wechat";
    const body =
      intent.kind === "development"
        ? { accountId: intent.accountId }
        : { code: intent.code };
    const response = await this.send<
      ApiSuccess<AuthLoginResult> | ApiFailure
    >({
      method: "POST",
      url: `${this.baseUrl}${path}`,
      headers: jsonMutationHeaders(),
      body,
    });
    return this.capture(unwrap(response.statusCode, response.data));
  }

  private async refresh(refreshToken: string): Promise<RefreshSessionResult> {
    const response = await this.send<
      ApiSuccess<RefreshSessionResult> | ApiFailure
    >({
      method: "POST",
      url: `${this.baseUrl}/api/v1/auth/refresh`,
      headers: jsonMutationHeaders(),
      body: { refreshToken },
    });
    return this.capture(unwrap(response.statusCode, response.data));
  }

  private async authorizedMutation<T>(path: string, body: unknown = {}): Promise<T> {
    const stored = this.loadStoredSession();
    if (!stored) {
      throw new ClientApiError("UNAUTHENTICATED", "请先登录", false);
    }

    const idempotencyKey = createUuid();
    const expectedPlayerVersion = this.playerVersion;
    const request = async (accessToken: string): Promise<T> => {
      const response = await this.send<ApiSuccess<T> | ApiFailure>({
        method: "POST",
        url: `${this.baseUrl}${path}`,
        headers: {
          ...jsonMutationHeaders(idempotencyKey),
          Authorization: `Bearer ${accessToken}`,
          ...(expectedPlayerVersion === null
            ? {}
            : { "If-Player-Version": expectedPlayerVersion }),
        },
        body,
      });
      return this.capture(unwrap(response.statusCode, response.data));
    };

    try {
      return await request(stored.accessToken);
    } catch (error) {
      if (isTerminalAuthenticationError(error)) {
        this.rejectStoredSession();
        throw error;
      }
      if (!(error instanceof ClientApiError) || error.code !== "UNAUTHENTICATED") {
        throw error;
      }

      try {
        const refreshed = await this.refresh(stored.refreshToken);
        this.persistSession(refreshed.tokens, refreshed.bootstrap);
        return request(refreshed.tokens.accessToken);
      } catch (refreshError) {
        if (
          isRejectedSessionCredential(refreshError) ||
          isTerminalAuthenticationError(refreshError)
        ) {
          this.rejectStoredSession();
        }
        throw refreshError;
      }
    }
  }

  private loadStoredSession(): StoredSession | null {
    const stored = this.platform.load<unknown>(CLIENT_CONFIG.sessionStorageKey);
    if (stored === null) return null;
    if (isStoredSession(stored)) return stored;

    this.platform.remove(CLIENT_CONFIG.sessionStorageKey);
    this.resetAuthoritativeMetadata();
    return null;
  }

  private persistSession(
    session: StoredSession,
    bootstrap: BootstrapSnapshot,
  ): void {
    this.platform.save<StoredSession>(CLIENT_CONFIG.sessionStorageKey, {
      ...session,
      accountId: bootstrap.account.id,
      playerId: bootstrap.player.id,
    });
  }

  private rejectStoredSession(): void {
    this.platform.remove(CLIENT_CONFIG.sessionStorageKey);
    this.resetAuthoritativeMetadata();
    this.rejectedStoredSession = true;
  }

  private resetAuthoritativeMetadata(): void {
    this.playerVersion = null;
    this.lastSuccessfulSyncAt = null;
  }

  private async getLoginIntent(): Promise<LoginIntent> {
    try {
      return await this.platform.getLoginIntent();
    } catch (error) {
      throw toTransportError(error);
    }
  }

  private async send<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    try {
      return await this.platform.request<T>(request);
    } catch (error) {
      throw toTransportError(error);
    }
  }

  private capture<T>(response: ApiSuccess<T>): T {
    if (
      this.playerVersion !== null &&
      comparePlayerVersions(response.playerVersion, this.playerVersion) < 0
    ) {
      throw new ClientApiError(
        "STALE_PLAYER_RESPONSE",
        "已忽略过期的角色数据，请重试",
        true,
      );
    }
    this.playerVersion = response.playerVersion;
    this.lastSuccessfulSyncAt = response.serverTime;
    return response.data;
  }
}

function toTransportError(error: unknown): ClientApiError {
  if (error instanceof ClientApiError) return error;
  return new ClientApiError(
    "NETWORK_UNAVAILABLE",
    "当前网络不可用，请检查连接后重试",
    true,
  );
}

function isRejectedSessionCredential(error: unknown): error is ClientApiError {
  return (
    error instanceof ClientApiError &&
    (error.code === "UNAUTHENTICATED" || error.code === "SESSION_EXPIRED")
  );
}

function comparePlayerVersions(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+(?=\d)/, "");
  const normalizedRight = right.replace(/^0+(?=\d)/, "");
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length < normalizedRight.length ? -1 : 1;
  }
  if (normalizedLeft === normalizedRight) return 0;
  return normalizedLeft < normalizedRight ? -1 : 1;
}

function unwrap<T>(statusCode: number, response: ApiSuccess<T> | ApiFailure): ApiSuccess<T> {
  if (statusCode >= 200 && statusCode < 300 && "data" in response) {
    return response;
  }

  if ("error" in response) {
    throw new ClientApiError(
      response.error.code,
      response.error.message,
      response.error.retryable,
    );
  }
  throw new ClientApiError("NETWORK_ERROR", "服务器返回了无法识别的响应", true);
}

function jsonMutationHeaders(idempotencyKey = createUuid()): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  };
}

function createUuid(): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const value = bytes.map((byte) => `0${byte.toString(16)}`.slice(-2)).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
