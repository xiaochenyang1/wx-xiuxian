import { describe, expect, it } from "vitest";
import { loadAppConfig } from "../src/config/env";
import { TokenService, type SessionIdentity } from "../src/modules/auth/token-service";

const config = loadAppConfig({ NODE_ENV: "test" });

function session(): SessionIdentity {
  const createdAt = new Date();
  return {
    sessionId: "a3db73cb-2c09-456f-91ea-61dd46b7f825",
    accountId: "bc830a7d-c6b7-4918-883e-f1b835c8100e",
    playerId: "9430bd13-5c38-43ef-8ff6-43aac1a17e33",
    createdAt,
    refreshExpiresAt: new Date(createdAt.getTime() + config.refreshTokenTtlSeconds * 1000),
  };
}

describe("token service", () => {
  it("issues verifiable access and deterministic refresh tokens", () => {
    const service = new TokenService(config);
    const identity = session();
    const first = service.issue(identity);
    const second = service.issue(identity);

    expect(second).toEqual(first);
    expect(service.verifyAccessToken(first.accessToken)).toEqual({
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      playerId: identity.playerId,
    });
    expect(service.parseRefreshToken(first.refreshToken)).toEqual({
      sessionId: identity.sessionId,
      tokenHash: service.hashRefreshToken(first.refreshToken),
    });
  });

  it("rejects tampered access and refresh tokens", () => {
    const service = new TokenService(config);
    const tokens = service.issue(session());

    expect(() => service.verifyAccessToken(`${tokens.accessToken}x`)).toThrow(
      "登录状态无效",
    );
    expect(() => service.parseRefreshToken(`${tokens.refreshToken}x`)).toThrow(
      "会话已过期",
    );
  });
});
