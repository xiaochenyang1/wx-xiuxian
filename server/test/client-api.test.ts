import type {
  ApiFailure,
  ApiSuccess,
  AuthLoginResult,
  CultivationSettleResult,
  LoadoutMutationResult,
  PlayerAvatarResult,
  PlayerRenameResult,
  RefreshSessionResult,
  SyncHeartbeatResult,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import {
  ApiClient,
  ClientApiError,
  classifyAuthoritativeFailure,
  isClientTransportError,
  isTerminalAuthenticationError,
} from "../../assets/scripts/services/ApiClient";
import { CLIENT_CONFIG } from "../../assets/scripts/core/ClientConfig";
import type {
  HttpRequest,
  HttpResponse,
  LoginIntent,
} from "../../assets/scripts/core/ClientTypes";
import type {
  PlatformAdapter,
  PlatformLifecycleHandlers,
  PlatformNetworkHandlers,
} from "../../assets/scripts/platform/PlatformAdapter";
import { bootstrapFixture } from "./fixtures/bootstrap";

describe("Cocos API client", () => {
  it("sends the latest player version and preserves mutation identity across token refresh", async () => {
    const platform = new ScriptedPlatform();
    const client = new ApiClient(platform, "http://game.test");
    const idempotencyKey = "00000000-0000-4000-8000-000000000099";

    await client.authenticate();
    const settled = await client.settleCultivation({
      idempotencyKey,
      expectedPlayerVersion: "6",
    });

    expect(settled.bootstrap.progress.level).toBe(1);
    const mutationRequests = platform.requests.filter((request) =>
      request.url.endsWith("/api/v1/cultivation/settle"),
    );
    expect(mutationRequests).toHaveLength(2);
    expect(mutationRequests[0]?.headers?.["If-Player-Version"]).toBe("6");
    expect(mutationRequests[1]?.headers?.["If-Player-Version"]).toBe("6");
    expect(mutationRequests[0]?.headers?.["Idempotency-Key"]).toBe(idempotencyKey);
    expect(mutationRequests[1]?.headers?.["Idempotency-Key"]).toBe(idempotencyKey);
    expect(mutationRequests[0]?.headers?.Authorization).toBe("Bearer access-1");
    expect(mutationRequests[1]?.headers?.Authorization).toBe("Bearer access-2");
    expect(platform.load(CLIENT_CONFIG.sessionStorageKey)).toMatchObject({
      accessToken: "access-2",
      accountId: bootstrapFixture().account.id,
      playerId: bootstrapFixture().player.id,
    });
  });

  it("persists player identity after login and backfills it after bootstrap", async () => {
    const loginPlatform = new ScriptedPlatform();
    const loginClient = new ApiClient(loginPlatform, "http://game.test");

    await loginClient.authenticate();

    expect(loginPlatform.load(CLIENT_CONFIG.sessionStorageKey)).toMatchObject({
      accessToken: "access-1",
      accountId: bootstrapFixture().account.id,
      playerId: bootstrapFixture().player.id,
    });

    const bootstrapPlatform = new ScriptedPlatform();
    bootstrapPlatform.save(CLIENT_CONFIG.sessionStorageKey, tokens("legacy"));
    const bootstrapClient = new ApiClient(bootstrapPlatform, "http://game.test");

    await bootstrapClient.authenticate();

    expect(bootstrapPlatform.load(CLIENT_CONFIG.sessionStorageKey)).toMatchObject({
      accessToken: "access-legacy",
      accountId: bootstrapFixture().account.id,
      playerId: bootstrapFixture().player.id,
    });
    expect(bootstrapPlatform.requests.some((request) =>
      request.url.endsWith("/api/v1/bootstrap"),
    )).toBe(true);
  });

  it("ignores and removes malformed stored sessions before login", async () => {
    const platform = new ScriptedPlatform();
    platform.save(CLIENT_CONFIG.sessionStorageKey, {
      accessToken: "access-corrupt",
      refreshToken: "refresh-corrupt",
    });
    const client = new ApiClient(platform, "http://game.test");

    await client.authenticate();

    expect(platform.removedKeys).toContain(CLIENT_CONFIG.sessionStorageKey);
    expect(platform.requests.some((request) =>
      request.url.endsWith("/api/v1/bootstrap"),
    )).toBe(false);
    expect(platform.load(CLIENT_CONFIG.sessionStorageKey)).toMatchObject({
      accessToken: "access-1",
      accountId: bootstrapFixture().account.id,
      playerId: bootstrapFixture().player.id,
    });
  });

  it("advances profile versions and rejects an older replay response", async () => {
    const platform = new ScriptedPlatform();
    const client = new ApiClient(platform, "http://game.test");

    await client.authenticate();
    const avatar = await client.chooseAvatar("female");
    const renamed = await client.renamePlayer("云外客");

    expect(avatar.avatarVariant).toBe("female");
    expect(renamed.displayName).toBe("云外客");

    const avatarRequest = platform.requests.find((request) =>
      request.url.endsWith("/api/v1/player/avatar"),
    );
    expect(avatarRequest).toMatchObject({
      method: "POST",
      body: { avatarVariant: "female" },
      headers: {
        Authorization: "Bearer access-1",
        "Content-Type": "application/json",
        "If-Player-Version": "7",
      },
    });

    const renameRequest = platform.requests.find((request) =>
      request.url.endsWith("/api/v1/player/rename"),
    );
    expect(renameRequest).toMatchObject({
      method: "POST",
      body: { displayName: "云外客" },
      headers: {
        Authorization: "Bearer access-1",
        "Content-Type": "application/json",
        "If-Player-Version": "8",
      },
    });
    expect(avatarRequest?.headers?.["Idempotency-Key"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(renameRequest?.headers?.["Idempotency-Key"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    await expect(client.chooseAvatar("female")).rejects.toMatchObject({
      code: "STALE_PLAYER_RESPONSE",
      retryable: true,
    });
  });

  it("uses the formal heartbeat route and captures its authoritative metadata", async () => {
    const platform = new ScriptedPlatform();
    const client = new ApiClient(platform, "http://game.test");
    const idempotencyKey = "00000000-0000-4000-8000-000000000098";

    await client.authenticate();
    const heartbeat = await client.syncHeartbeat({
      idempotencyKey,
      expectedPlayerVersion: "7",
    });

    expect(heartbeat.bootstrap.progress.experience).toBe("1");
    const request = platform.requests.find((candidate) =>
      candidate.url.endsWith("/api/v1/sync/heartbeat"),
    );
    expect(request).toMatchObject({
      method: "POST",
      body: {},
      headers: {
        Authorization: "Bearer access-1",
        "Content-Type": "application/json",
        "If-Player-Version": "7",
      },
    });
    expect(request?.headers?.["Idempotency-Key"]).toBe(idempotencyKey);
    expect(client.getAuthoritativeSnapshotMetadata()).toEqual({
      playerVersion: "8",
      lastSuccessfulSyncAt: SERVER_TIME,
    });

    const loadoutKey = "00000000-0000-4000-8000-000000000097";
    await client.equipTechnique("quiet_breathing_art", {
      idempotencyKey: loadoutKey,
      expectedPlayerVersion: "8",
    });
    const loadoutRequest = platform.requests.find((candidate) =>
      candidate.url.endsWith("/api/v1/techniques/equip"),
    );
    expect(loadoutRequest).toMatchObject({
      method: "POST",
      body: { techniqueConfigId: "quiet_breathing_art" },
      headers: {
        Authorization: "Bearer access-1",
        "Idempotency-Key": loadoutKey,
        "If-Player-Version": "8",
      },
    });
  });

  it("rejects a historical heartbeat replay after refreshing to a newer version", async () => {
    const platform = new StaleHeartbeatAfterRefreshPlatform();
    const client = new ApiClient(platform, "http://game.test");
    const idempotencyKey = "00000000-0000-4000-8000-000000000095";
    platform.save(CLIENT_CONFIG.sessionStorageKey, {
      ...tokens("stored"),
      accountId: bootstrapFixture().account.id,
      playerId: bootstrapFixture().player.id,
    });

    await expect(client.syncHeartbeat({
      idempotencyKey,
      expectedPlayerVersion: "7",
    })).rejects.toMatchObject({
      code: "STALE_PLAYER_RESPONSE",
      retryable: true,
    });

    const heartbeatRequests = platform.requests.filter((request) =>
      request.url.endsWith("/api/v1/sync/heartbeat"),
    );
    expect(heartbeatRequests).toHaveLength(2);
    for (const request of heartbeatRequests) {
      expect(request.headers?.["Idempotency-Key"]).toBe(idempotencyKey);
      expect(request.headers?.["If-Player-Version"]).toBe("7");
      expect(request.body).toEqual({});
    }
    expect(heartbeatRequests[0]?.headers?.Authorization).toBe(
      "Bearer access-stored",
    );
    expect(heartbeatRequests[1]?.headers?.Authorization).toBe(
      "Bearer access-refreshed",
    );
    expect(client.getAuthoritativeSnapshotMetadata()).toEqual({
      playerVersion: "9",
      lastSuccessfulSyncAt: SERVER_TIME,
    });
    expect(platform.load(CLIENT_CONFIG.sessionStorageKey)).toMatchObject({
      accessToken: "access-refreshed",
      accountId: bootstrapFixture().account.id,
      playerId: bootstrapFixture().player.id,
    });
  });

  it("classifies transport failures without treating HTTP business errors as offline", async () => {
    const offlineClient = new ApiClient(
      new FailurePlatform("login-transport"),
      "http://game.test",
    );
    const offlineError = await offlineClient.authenticate().catch((error: unknown) => error);

    expect(isClientTransportError(offlineError)).toBe(true);
    expect(offlineError).toMatchObject({ code: "NETWORK_UNAVAILABLE", retryable: true });

    const businessClient = new ApiClient(
      new FailurePlatform("login-business"),
      "http://game.test",
    );
    const businessError = await businessClient.authenticate().catch((error: unknown) => error);

    expect(isClientTransportError(businessError)).toBe(false);
    expect(businessError).toMatchObject({ code: "SERVER_MAINTENANCE" });
    expect(classifyAuthoritativeFailure(offlineError)).toBe("offline");
    expect(classifyAuthoritativeFailure(businessError)).toBeNull();
    expect(
      classifyAuthoritativeFailure(
        new ClientApiError("PLAYER_VERSION_CONFLICT", "stale", true),
      ),
    ).toBe("reconnecting");
    expect(
      classifyAuthoritativeFailure(
        new ClientApiError("STALE_PLAYER_RESPONSE", "stale", true),
      ),
    ).toBe("reconnecting");
    expect(classifyAuthoritativeFailure(businessError, true)).toBe("reconnecting");
  });

  it("does not start a new platform login when refresh fails at the transport layer", async () => {
    const platform = new FailurePlatform("refresh-transport");
    const stored = tokens("stored");
    platform.save(CLIENT_CONFIG.sessionStorageKey, stored);
    const client = new ApiClient(platform, "http://game.test");

    await expect(client.authenticate()).rejects.toMatchObject({
      code: "NETWORK_UNAVAILABLE",
    });
    expect(platform.loginIntentCount).toBe(0);
    expect(platform.requests.filter((request) => request.url.endsWith("/api/v1/auth/dev"))).toEqual(
      [],
    );
    expect(platform.load(CLIENT_CONFIG.sessionStorageKey)).toEqual(stored);
    expect(client.consumeRejectedStoredSession()).toBe(false);
  });

  it("removes rejected credentials and reports them when replacement login fails", async () => {
    const platform = new FailurePlatform("login-transport");
    platform.save(CLIENT_CONFIG.sessionStorageKey, tokens("stored"));
    const client = new ApiClient(platform, "http://game.test");

    await expect(client.authenticate()).rejects.toMatchObject({
      code: "NETWORK_UNAVAILABLE",
    });

    expect(platform.load(CLIENT_CONFIG.sessionStorageKey)).toBeNull();
    expect(platform.removedKeys).toEqual([CLIENT_CONFIG.sessionStorageKey]);
    expect(platform.loginIntentCount).toBe(1);
    expect(client.getAuthoritativeSnapshotMetadata()).toBeNull();
    expect(client.consumeRejectedStoredSession()).toBe(true);
    expect(client.consumeRejectedStoredSession()).toBe(false);
  });

  it("invalidates a banned stored identity without attempting replacement login", async () => {
    const platform = new FailurePlatform("refresh-banned");
    platform.save(CLIENT_CONFIG.sessionStorageKey, tokens("stored"));
    const client = new ApiClient(platform, "http://game.test");

    const error = await client.authenticate().catch((failure: unknown) => failure);

    expect(isTerminalAuthenticationError(error)).toBe(true);
    expect(error).toMatchObject({ code: "ACCOUNT_BANNED", retryable: false });
    expect(platform.load(CLIENT_CONFIG.sessionStorageKey)).toBeNull();
    expect(platform.loginIntentCount).toBe(0);
    expect(client.consumeRejectedStoredSession()).toBe(true);
    expect(client.consumeRejectedStoredSession()).toBe(false);
  });

  it("starts a new platform login when the refresh credential is rejected", async () => {
    const platform = new FailurePlatform("refresh-rejected");
    platform.save(CLIENT_CONFIG.sessionStorageKey, tokens("stored"));
    const client = new ApiClient(platform, "http://game.test");

    const bootstrap = await client.authenticate();

    expect(bootstrap.player.displayName).toBe("青岚子");
    expect(platform.loginIntentCount).toBe(1);
    expect(platform.requests.some((request) => request.url.endsWith("/api/v1/auth/dev"))).toBe(
      true,
    );
    expect(platform.load(CLIENT_CONFIG.sessionStorageKey)).toMatchObject({
      accessToken: "access-new-login",
      accountId: bootstrapFixture().account.id,
      playerId: bootstrapFixture().player.id,
    });
    expect(client.consumeRejectedStoredSession()).toBe(true);
    expect(client.consumeRejectedStoredSession()).toBe(false);
  });

  it("accepts a lower player version after rejected credentials switch identity", async () => {
    const platform = new ScriptedPlatform(true);
    const client = new ApiClient(platform, "http://game.test");

    const previous = await client.authenticate();
    expect(previous.account.id).toBe(bootstrapFixture().account.id);
    expect(client.getAuthoritativeSnapshotMetadata()?.playerVersion).toBe("99");

    const replacement = await client.authenticate();

    expect(replacement).toMatchObject({
      account: { id: REPLACEMENT_ACCOUNT_ID },
      player: { id: REPLACEMENT_PLAYER_ID },
    });
    expect(client.getAuthoritativeSnapshotMetadata()?.playerVersion).toBe("1");
    expect(platform.load(CLIENT_CONFIG.sessionStorageKey)).toMatchObject({
      accountId: REPLACEMENT_ACCOUNT_ID,
      playerId: REPLACEMENT_PLAYER_ID,
    });
    expect(client.consumeRejectedStoredSession()).toBe(true);
  });
});

const SERVER_TIME = "2026-08-05T08:00:00.000Z";
const REPLACEMENT_ACCOUNT_ID = "6f8dfe97-11ad-4cd1-8481-6a7d00826357";
const REPLACEMENT_PLAYER_ID = "29cd7452-dc8b-41bf-90d1-dcf58049bded";

class ScriptedPlatform implements PlatformAdapter {
  readonly kind = "browser" as const;
  readonly requests: HttpRequest[] = [];
  readonly removedKeys: string[] = [];
  private readonly storage = new Map<string, unknown>();
  private settlementAttempts = 0;
  private loginAttempts = 0;

  constructor(private readonly switchIdentityAfterFirstLogin = false) {}

  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    this.requests.push(request);
    if (request.url.endsWith("/api/v1/bootstrap")) {
      if (this.switchIdentityAfterFirstLogin) {
        return response<T>(401, failure("UNAUTHENTICATED", "登录状态已过期"));
      }
      return response<T>(200, success("7", bootstrapFixture()));
    }
    if (request.url.endsWith("/api/v1/auth/dev")) {
      this.loginAttempts += 1;
      const bootstrap = bootstrapFixture();
      if (this.switchIdentityAfterFirstLogin && this.loginAttempts > 1) {
        bootstrap.account.id = REPLACEMENT_ACCOUNT_ID;
        bootstrap.player.id = REPLACEMENT_PLAYER_ID;
      }
      const playerVersion = this.switchIdentityAfterFirstLogin
        ? this.loginAttempts === 1
          ? "99"
          : "1"
        : "7";
      return response<T>(200, success<AuthLoginResult>(playerVersion, {
        isNewPlayer: true,
        tokens: tokens(String(this.loginAttempts)),
        bootstrap,
      }));
    }
    if (request.url.endsWith("/api/v1/auth/refresh")) {
      if (this.switchIdentityAfterFirstLogin) {
        return response<T>(401, failure("SESSION_EXPIRED", "会话已过期"));
      }
      return response<T>(200, success<RefreshSessionResult>("7", {
        tokens: tokens("2"),
        bootstrap: bootstrapFixture(),
      }));
    }
    if (request.url.endsWith("/api/v1/player/avatar")) {
      const bootstrap = bootstrapFixture();
      bootstrap.player.avatarVariant = "female";
      return response<T>(200, success<PlayerAvatarResult>("8", {
        operationId: "00000000-0000-4000-8000-000000000002",
        avatarVariant: "female",
        bootstrap,
      }));
    }
    if (request.url.endsWith("/api/v1/player/rename")) {
      const bootstrap = bootstrapFixture();
      bootstrap.player.avatarVariant = "female";
      bootstrap.player.displayName = "云外客";
      bootstrap.player.freeRenameAvailable = false;
      return response<T>(200, success<PlayerRenameResult>("9", {
        operationId: "00000000-0000-4000-8000-000000000003",
        previousDisplayName: "青岚子",
        displayName: "云外客",
        usedFreeRename: true,
        renameCardsConsumed: 0,
        bootstrap,
      }));
    }
    if (request.url.endsWith("/api/v1/sync/heartbeat")) {
      const bootstrap = bootstrapFixture();
      bootstrap.progress.experience = "1";
      return response<T>(200, success<SyncHeartbeatResult>("8", {
        settlement: settlementSummary(),
        bootstrap,
      }));
    }
    if (request.url.endsWith("/api/v1/cultivation/settle")) {
      this.settlementAttempts += 1;
      if (this.settlementAttempts === 1) {
        const failure: ApiFailure = {
          requestId: "request-failed",
          serverTime: new Date().toISOString(),
          error: {
            code: "UNAUTHENTICATED",
            message: "登录状态已过期",
            retryable: false,
            details: {},
          },
        };
        return response<T>(401, failure);
      }
      return response<T>(200, success<CultivationSettleResult>("8", {
        settlement: {
          settlementId: "00000000-0000-4000-8000-000000000001",
          mode: "online",
          efficiencyBp: 10_000,
          elapsedMilliseconds: 1_000,
          experienceGained: "1",
          experienceDiscarded: "0",
          spiritStoneGained: "0",
          dropAttempts: 0,
          drops: emptyDrops(),
          events: [],
          newcomerRewardGranted: false,
          offlineSettlement: null,
        },
        bootstrap: bootstrapFixture(),
      }));
    }
    if (request.url.endsWith("/api/v1/techniques/equip")) {
      const bootstrap = bootstrapFixture();
      return response<T>(200, success<LoadoutMutationResult>("9", {
        operationId: "00000000-0000-4000-8000-000000000096",
        assetType: "technique",
        action: "equip",
        assetId: "quiet_breathing_art",
        equippedSlot: "mind",
        replacedAssetId: null,
        previousTotalPower: "100",
        totalPower: "140",
        powerDelta: "40",
        bootstrap,
      }));
    }
    throw new Error(`Unexpected request: ${request.url}`);
  }

  async getLoginIntent(): Promise<LoginIntent> {
    return { kind: "development", accountId: "client-version-test" };
  }

  load<T>(key: string): T | null {
    return (this.storage.get(key) as T | undefined) ?? null;
  }

  save<T>(key: string, value: T): boolean {
    this.storage.set(key, value);
    return true;
  }

  remove(key: string): void {
    this.removedKeys.push(key);
    this.storage.delete(key);
  }

  subscribeLifecycle(_handlers: PlatformLifecycleHandlers): () => void {
    return () => undefined;
  }

  subscribeNetworkStatus(_handlers: PlatformNetworkHandlers): () => void {
    return () => undefined;
  }

  feedback(): void {}
}

class StaleHeartbeatAfterRefreshPlatform implements PlatformAdapter {
  readonly kind = "browser" as const;
  readonly requests: HttpRequest[] = [];
  private readonly storage = new Map<string, unknown>();
  private heartbeatAttempts = 0;

  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    this.requests.push(request);
    if (request.url.endsWith("/api/v1/auth/refresh")) {
      return response<T>(200, success<RefreshSessionResult>("9", {
        tokens: tokens("refreshed"),
        bootstrap: bootstrapFixture(),
      }));
    }
    if (request.url.endsWith("/api/v1/sync/heartbeat")) {
      this.heartbeatAttempts += 1;
      if (this.heartbeatAttempts === 1) {
        return response<T>(401, failure("UNAUTHENTICATED", "登录状态已过期"));
      }
      return response<T>(200, success<SyncHeartbeatResult>("8", {
        settlement: settlementSummary(),
        bootstrap: bootstrapFixture(),
      }));
    }
    throw new Error(`Unexpected request: ${request.url}`);
  }

  async getLoginIntent(): Promise<LoginIntent> {
    throw new Error("Login should not be requested");
  }

  load<T>(key: string): T | null {
    return (this.storage.get(key) as T | undefined) ?? null;
  }

  save<T>(key: string, value: T): boolean {
    this.storage.set(key, value);
    return true;
  }

  remove(key: string): void {
    this.storage.delete(key);
  }

  subscribeLifecycle(_handlers: PlatformLifecycleHandlers): () => void {
    return () => undefined;
  }

  subscribeNetworkStatus(_handlers: PlatformNetworkHandlers): () => void {
    return () => undefined;
  }

  feedback(): void {}
}

type FailureMode =
  | "login-transport"
  | "login-business"
  | "refresh-transport"
  | "refresh-rejected"
  | "refresh-banned";

class FailurePlatform implements PlatformAdapter {
  readonly kind = "browser" as const;
  readonly requests: HttpRequest[] = [];
  readonly storage = new Map<string, unknown>();
  readonly removedKeys: string[] = [];
  loginIntentCount = 0;

  constructor(private readonly mode: FailureMode) {}

  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    this.requests.push(request);
    if (request.url.endsWith("/api/v1/bootstrap")) {
      return response<T>(401, failure("UNAUTHENTICATED", "登录状态已过期"));
    }
    if (request.url.endsWith("/api/v1/auth/refresh")) {
      if (this.mode === "refresh-transport") throw new Error("connection reset");
      if (this.mode === "refresh-banned") {
        return response<T>(403, failure("ACCOUNT_BANNED", "账号当前无法登录"));
      }
      return response<T>(401, failure("SESSION_EXPIRED", "会话已过期"));
    }
    if (request.url.endsWith("/api/v1/auth/dev")) {
      if (this.mode === "login-transport") throw new Error("network down");
      if (this.mode === "login-business") {
        return response<T>(503, failure("SERVER_MAINTENANCE", "服务器维护中"));
      }
      return response<T>(200, success<AuthLoginResult>("7", {
        isNewPlayer: false,
        tokens: tokens("new-login"),
        bootstrap: bootstrapFixture(),
      }));
    }
    throw new Error(`Unexpected request: ${request.url}`);
  }

  async getLoginIntent(): Promise<LoginIntent> {
    this.loginIntentCount += 1;
    return { kind: "development", accountId: "failure-test" };
  }

  load<T>(key: string): T | null {
    return (this.storage.get(key) as T | undefined) ?? null;
  }

  save<T>(key: string, value: T): boolean {
    this.storage.set(key, value);
    return true;
  }

  remove(key: string): void {
    this.removedKeys.push(key);
    this.storage.delete(key);
  }

  subscribeLifecycle(_handlers: PlatformLifecycleHandlers): () => void {
    return () => undefined;
  }

  subscribeNetworkStatus(_handlers: PlatformNetworkHandlers): () => void {
    return () => undefined;
  }

  feedback(): void {}
}

function success<T>(playerVersion: string, data: T): ApiSuccess<T> {
  return {
    requestId: "request-success",
    serverTime: SERVER_TIME,
    playerVersion,
    data,
  };
}

function failure(code: string, message: string): ApiFailure {
  return {
    requestId: "request-failure",
    serverTime: SERVER_TIME,
    error: { code, message, retryable: false, details: {} },
  };
}

function settlementSummary(): CultivationSettleResult["settlement"] {
  return {
    settlementId: "00000000-0000-4000-8000-000000000004",
    mode: "online",
    efficiencyBp: 10_000,
    elapsedMilliseconds: 1_000,
    experienceGained: "1",
    experienceDiscarded: "0",
    spiritStoneGained: "0",
    dropAttempts: 0,
    drops: emptyDrops(),
    events: [],
    newcomerRewardGranted: false,
    offlineSettlement: null,
  };
}

function response<T>(statusCode: number, data: unknown): HttpResponse<T> {
  return { statusCode, data: data as T };
}

function tokens(suffix: string) {
  return {
    accessToken: `access-${suffix}`,
    accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    refreshToken: `refresh-${suffix}`,
    refreshTokenExpiresAt: new Date(Date.now() + 2_592_000_000).toISOString(),
  };
}

function emptyDrops() {
  return {
    configVersion: "idle-drop-2026-08-05-v1",
    stackItems: [],
    equipmentCount: 0,
    techniqueCount: 0,
    harvestChestAdded: 0,
    techniqueDuplicates: 0,
    autoSalvagedCount: 0,
    mailedCount: 0,
    autoSalvageSpiritStone: "0",
    autoSalvageEnhanceStone: "0",
  };
}
