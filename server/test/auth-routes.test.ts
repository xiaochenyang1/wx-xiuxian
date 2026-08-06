import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildApp, type ReadinessChecks } from "../src/app";
import { loadAppConfig } from "../src/config/env";
import type { AuthServicePort } from "../src/modules/auth/auth-service";
import type { CultivationServicePort } from "../src/modules/cultivation/cultivation-service";
import type { InventoryServicePort } from "../src/modules/inventory/inventory-service";
import { bootstrapFixture } from "./fixtures/bootstrap";

function readiness(): ReadinessChecks {
  return {
    checkDatabase: vi.fn().mockResolvedValue(undefined),
    checkRedis: vi.fn().mockResolvedValue(undefined),
  };
}

function authService(): AuthServicePort {
  const snapshot = bootstrapFixture();
  const tokens = {
    accessToken: "access-token",
    accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    refreshToken: "refresh-token",
    refreshTokenExpiresAt: new Date(Date.now() + 2_592_000_000).toISOString(),
  };

  return {
    loginDev: vi.fn().mockResolvedValue({
      playerVersion: "1",
      data: { isNewPlayer: true, tokens, bootstrap: snapshot },
    }),
    loginWechat: vi.fn().mockResolvedValue({
      playerVersion: "1",
      data: { isNewPlayer: true, tokens, bootstrap: snapshot },
    }),
    refresh: vi.fn().mockResolvedValue({
      playerVersion: "1",
      data: { tokens, bootstrap: snapshot },
    }),
    bootstrap: vi.fn().mockResolvedValue({ playerVersion: "1", data: snapshot }),
    authenticate: vi.fn().mockResolvedValue({
      sessionId: "session-id",
      accountId: snapshot.account.id,
      playerId: snapshot.player.id,
    }),
  };
}

function cultivationService(): CultivationServicePort {
  const snapshot = bootstrapFixture();
  const settlement = {
    settlementId: randomUUID(),
    mode: "online" as const,
    efficiencyBp: 10_000,
    elapsedMilliseconds: 1_000,
    experienceGained: "1",
    experienceDiscarded: "0",
    spiritStoneGained: "0",
    dropAttempts: 0,
    drops: {
      configVersion: "test",
      stackItems: [],
      equipmentCount: 0,
      techniqueCount: 0,
      harvestChestAdded: 0,
      techniqueDuplicates: 0,
      autoSalvagedCount: 0,
      mailedCount: 0,
      autoSalvageSpiritStone: "0",
      autoSalvageEnhanceStone: "0",
    },
    events: [],
    newcomerRewardGranted: false,
    offlineSettlement: null,
  };
  return {
    heartbeat: vi.fn().mockResolvedValue({
      playerVersion: "2",
      data: { settlement, bootstrap: snapshot },
    }),
    settle: vi.fn().mockResolvedValue({
      playerVersion: "2",
      data: { settlement, bootstrap: snapshot },
    }),
    breakthrough: vi.fn().mockResolvedValue({
      playerVersion: "3",
      data: {
        breakthroughId: randomUUID(),
        fromLevel: 10,
        toLevel: 11,
        consumedPills: 1,
        bootstrap: snapshot,
      },
    }),
  };
}

function inventoryService(): InventoryServicePort {
  const snapshot = bootstrapFixture();
  return {
    useItem: vi.fn(),
    debugGrant: vi.fn().mockImplementation((_identity, _key, target) =>
      Promise.resolve({
        playerVersion: "2",
        data: {
          operationId: randomUUID(),
          target,
          grantedAmount: "107",
          balanceAfter: "0",
          fromLevel: 1,
          toLevel: 2,
          reachedBreakthrough: false,
          newcomerRewardGranted: false,
          events: [{ type: "level_up", fromLevel: 1, toLevel: 2 }],
          bootstrap: snapshot,
        },
      }),
    ),
    expandBag: vi.fn(),
    transferHarvest: vi.fn(),
    salvageHarvest: vi.fn(),
  };
}

function services() {
  return {
    authService: authService(),
    cultivationService: cultivationService(),
    inventoryService: inventoryService(),
  };
}

describe("authentication routes", () => {
  it("maps schema failures to the stable INVALID_REQUEST envelope", async () => {
    const service = authService();
    const app = await buildApp({
      config: loadAppConfig({ NODE_ENV: "development" }),
      readiness: readiness(),
      services: { authService: service, cultivationService: cultivationService() },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/dev",
      payload: { accountId: "local-player" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST", retryable: false },
    });
    expect(service.loginDev).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns the complete login envelope for a valid development login", async () => {
    const service = authService();
    const app = await buildApp({
      config: loadAppConfig({ NODE_ENV: "development" }),
      readiness: readiness(),
      services: { authService: service, cultivationService: cultivationService() },
    });
    const idempotencyKey = randomUUID();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/dev",
      headers: { "idempotency-key": idempotencyKey },
      payload: { accountId: "local-player" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      playerVersion: "1",
      data: {
        isNewPlayer: true,
        bootstrap: { progress: { level: 1 }, unlocks: { partner: false, cave: false } },
      },
    });
    expect(service.loginDev).toHaveBeenCalledWith(
      { accountId: "local-player" },
      idempotencyKey,
    );
    await app.close();
  });

  it("publishes the registered authentication schemas through OpenAPI", async () => {
    const app = await buildApp({
      config: loadAppConfig({ NODE_ENV: "development" }),
      readiness: readiness(),
      services: services(),
    });

    const response = await app.inject({ method: "GET", url: "/openapi.json" });
    const document = response.json() as { paths: Record<string, unknown> };

    expect(response.statusCode).toBe(200);
    expect(document.paths).toHaveProperty("/api/v1/auth/dev");
    expect(document.paths).toHaveProperty("/api/v1/auth/wechat");
    expect(document.paths).toHaveProperty("/api/v1/auth/refresh");
    expect(document.paths).toHaveProperty("/api/v1/bootstrap");
    expect(document.paths).toHaveProperty("/api/v1/sync/heartbeat");
    expect(document.paths).toHaveProperty("/api/v1/cultivation/settle");
    expect(document.paths).toHaveProperty("/api/v1/debug/cultivation/settle");
    expect(document.paths).toHaveProperty("/api/v1/debug/inventory/grant");
    expect(document.paths).toHaveProperty("/api/v1/cultivation/breakthrough");
    await app.close();
  });

  it("forwards bounded development resource grants with strict mutation guards", async () => {
    const auth = authService();
    const inventory = inventoryService();
    const app = await buildApp({
      config: loadAppConfig({ NODE_ENV: "development" }),
      readiness: readiness(),
      services: {
        authService: auth,
        cultivationService: cultivationService(),
        inventoryService: inventory,
      },
    });
    const idempotencyKey = randomUUID();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/debug/inventory/grant",
      headers: {
        authorization: "Bearer access-token",
        "idempotency-key": idempotencyKey,
        "if-player-version": "1",
      },
      payload: { target: "fill_experience" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      playerVersion: "2",
      data: {
        target: "fill_experience",
        grantedAmount: "107",
        fromLevel: 1,
        toLevel: 2,
      },
    });
    expect(inventory.debugGrant).toHaveBeenCalledWith(
      {
        sessionId: "session-id",
        accountId: bootstrapFixture().account.id,
        playerId: bootstrapFixture().player.id,
      },
      idempotencyKey,
      "fill_experience",
      "1",
    );

    for (const [index, invalid] of [
      { headers: {}, payload: { target: "spirit_stone" } },
      {
        headers: { "if-player-version": "1" },
        payload: { target: "immortal_jade" },
      },
    ].entries()) {
      const invalidResponse = await app.inject({
        method: "POST",
        url: "/api/v1/debug/inventory/grant",
        headers: {
          authorization: "Bearer access-token",
          "idempotency-key": randomUUID(),
          ...invalid.headers,
        },
        payload: invalid.payload,
      });
      expect(invalidResponse.statusCode, `invalid grant case ${index}`).toBe(400);
      expect(invalidResponse.json()).toMatchObject({
        error: { code: "INVALID_REQUEST", retryable: false },
      });
    }
    expect(inventory.debugGrant).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("forwards development-only offline simulation requests", async () => {
    const auth = authService();
    const cultivation = cultivationService();
    const app = await buildApp({
      config: loadAppConfig({ NODE_ENV: "development" }),
      readiness: readiness(),
      services: { authService: auth, cultivationService: cultivation },
    });
    const idempotencyKey = randomUUID();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/debug/cultivation/settle",
      headers: {
        authorization: "Bearer access-token",
        "idempotency-key": idempotencyKey,
        "if-player-version": "1",
      },
      payload: { elapsedSeconds: 3_600 },
    });

    expect(response.statusCode).toBe(200);
    expect(cultivation.settle).toHaveBeenCalledWith(
      {
        sessionId: "session-id",
        accountId: bootstrapFixture().account.id,
        playerId: bootstrapFixture().player.id,
      },
      idempotencyKey,
      "1",
      { debugElapsedSeconds: 3_600 },
    );

    for (const elapsedSeconds of [0, 86_401, 1.5]) {
      const invalid = await app.inject({
        method: "POST",
        url: "/api/v1/debug/cultivation/settle",
        headers: {
          authorization: "Bearer access-token",
          "idempotency-key": randomUUID(),
        },
        payload: { elapsedSeconds },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({
        error: { code: "INVALID_REQUEST", retryable: false },
      });
    }
    expect(cultivation.settle).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("authenticates heartbeat requests and forwards mutation guards", async () => {
    const auth = authService();
    const cultivation = cultivationService();
    const app = await buildApp({
      config: loadAppConfig({ NODE_ENV: "development" }),
      readiness: readiness(),
      services: { authService: auth, cultivationService: cultivation },
    });
    const idempotencyKey = randomUUID();

    const missingIdempotencyKey = await app.inject({
      method: "POST",
      url: "/api/v1/sync/heartbeat",
      headers: { authorization: "Bearer access-token" },
      payload: {},
    });
    expect(missingIdempotencyKey.statusCode).toBe(400);
    expect(missingIdempotencyKey.json()).toMatchObject({
      error: { code: "INVALID_REQUEST", retryable: false },
    });
    expect(cultivation.heartbeat).not.toHaveBeenCalled();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sync/heartbeat",
      headers: {
        authorization: "Bearer access-token",
        "idempotency-key": idempotencyKey,
        "if-player-version": "1",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      playerVersion: "2",
      data: {
        settlement: { mode: "online" },
        bootstrap: { progress: { level: 1 } },
      },
    });
    expect(auth.authenticate).toHaveBeenCalledWith("Bearer access-token");
    expect(cultivation.heartbeat).toHaveBeenCalledWith(
      {
        sessionId: "session-id",
        accountId: bootstrapFixture().account.id,
        playerId: bootstrapFixture().player.id,
      },
      idempotencyKey,
      "1",
    );
    await app.close();
  });

  it("allows local Cocos browser previews without opening arbitrary origins", async () => {
    const app = await buildApp({
      config: loadAppConfig({ NODE_ENV: "development" }),
      readiness: readiness(),
      services: services(),
    });
    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/auth/dev",
      headers: {
        origin: "http://localhost:7456",
        "access-control-request-method": "POST",
      },
    });
    const denied = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/auth/dev",
      headers: {
        origin: "https://untrusted.example",
        "access-control-request-method": "POST",
      },
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:7456");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("does not register development authentication in production", async () => {
    const app = await buildApp({
      config: loadAppConfig({
        NODE_ENV: "production",
        ENABLE_DEV_AUTH: "false",
        ACCESS_TOKEN_SECRET: "a".repeat(32),
        REFRESH_TOKEN_SECRET: "b".repeat(32),
      }),
      readiness: readiness(),
      services: services(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/dev",
      headers: { "idempotency-key": randomUUID() },
      payload: { accountId: "must-not-exist" },
    });

    expect(response.statusCode).toBe(404);

    const debugResponse = await app.inject({
      method: "POST",
      url: "/api/v1/debug/cultivation/settle",
      headers: { "idempotency-key": randomUUID() },
      payload: { elapsedSeconds: 3_600 },
    });

    expect(debugResponse.statusCode).toBe(404);

    const debugGrantResponse = await app.inject({
      method: "POST",
      url: "/api/v1/debug/inventory/grant",
      headers: {
        "idempotency-key": randomUUID(),
        "if-player-version": "1",
      },
      payload: { target: "spirit_stone" },
    });

    expect(debugGrantResponse.statusCode).toBe(404);
    await app.close();
  });
});
