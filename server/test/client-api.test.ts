import type {
  ApiFailure,
  ApiSuccess,
  AuthLoginResult,
  CultivationSettleResult,
  RefreshSessionResult,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { ApiClient } from "../../assets/scripts/services/ApiClient";
import type {
  HttpRequest,
  HttpResponse,
  LoginIntent,
} from "../../assets/scripts/core/ClientTypes";
import type { PlatformAdapter } from "../../assets/scripts/platform/PlatformAdapter";
import { bootstrapFixture } from "./fixtures/bootstrap";

describe("Cocos API client", () => {
  it("sends the latest player version and preserves mutation identity across token refresh", async () => {
    const platform = new ScriptedPlatform();
    const client = new ApiClient(platform, "http://game.test");

    await client.authenticate();
    const settled = await client.settleCultivation();

    expect(settled.bootstrap.progress.level).toBe(1);
    const mutationRequests = platform.requests.filter((request) =>
      request.url.endsWith("/api/v1/cultivation/settle"),
    );
    expect(mutationRequests).toHaveLength(2);
    expect(mutationRequests[0]?.headers?.["If-Player-Version"]).toBe("7");
    expect(mutationRequests[1]?.headers?.["If-Player-Version"]).toBe("7");
    expect(mutationRequests[1]?.headers?.["Idempotency-Key"]).toBe(
      mutationRequests[0]?.headers?.["Idempotency-Key"],
    );
    expect(mutationRequests[0]?.headers?.Authorization).toBe("Bearer access-1");
    expect(mutationRequests[1]?.headers?.Authorization).toBe("Bearer access-2");
  });
});

class ScriptedPlatform implements PlatformAdapter {
  readonly kind = "browser" as const;
  readonly requests: HttpRequest[] = [];
  private readonly storage = new Map<string, unknown>();
  private settlementAttempts = 0;

  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    this.requests.push(request);
    if (request.url.endsWith("/api/v1/auth/dev")) {
      return response<T>(200, success<AuthLoginResult>("7", {
        isNewPlayer: true,
        tokens: tokens("1"),
        bootstrap: bootstrapFixture(),
      }));
    }
    if (request.url.endsWith("/api/v1/auth/refresh")) {
      return response<T>(200, success<RefreshSessionResult>("7", {
        tokens: tokens("2"),
        bootstrap: bootstrapFixture(),
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
    throw new Error(`Unexpected request: ${request.url}`);
  }

  async getLoginIntent(): Promise<LoginIntent> {
    return { kind: "development", accountId: "client-version-test" };
  }

  load<T>(key: string): T | null {
    return (this.storage.get(key) as T | undefined) ?? null;
  }

  save<T>(key: string, value: T): void {
    this.storage.set(key, value);
  }

  feedback(): void {}
}

function success<T>(playerVersion: string, data: T): ApiSuccess<T> {
  return {
    requestId: "request-success",
    serverTime: new Date().toISOString(),
    playerVersion,
    data,
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
