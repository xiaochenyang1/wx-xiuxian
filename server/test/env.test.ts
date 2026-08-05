import { describe, expect, it } from "vitest";
import { loadAppConfig } from "../src/config/env";

describe("environment configuration", () => {
  it("enables mock auth only by default in development", () => {
    expect(loadAppConfig({ NODE_ENV: "development" }).enableDevAuth).toBe(true);
    expect(loadAppConfig({ NODE_ENV: "test" }).enableDevAuth).toBe(false);
  });

  it("rejects development auth in production", () => {
    expect(() =>
      loadAppConfig({ NODE_ENV: "production", ENABLE_DEV_AUTH: "true" }),
    ).toThrow("ENABLE_DEV_AUTH must be false in production");
  });

  it("validates the configured port", () => {
    expect(() => loadAppConfig({ NODE_ENV: "test", PORT: "70000" })).toThrow(
      "PORT must be an integer between 1 and 65535",
    );
  });

  it("requires independent signing secrets in production", () => {
    expect(() =>
      loadAppConfig({ NODE_ENV: "production", ENABLE_DEV_AUTH: "false" }),
    ).toThrow("ACCESS_TOKEN_SECRET must contain at least 32 characters");

    expect(
      loadAppConfig({
        NODE_ENV: "production",
        ENABLE_DEV_AUTH: "false",
        ACCESS_TOKEN_SECRET: "a".repeat(32),
        REFRESH_TOKEN_SECRET: "b".repeat(32),
      }),
    ).toMatchObject({
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 2_592_000,
    });
  });

  it("requires the WeChat credentials as a pair", () => {
    expect(() =>
      loadAppConfig({ NODE_ENV: "test", WECHAT_APP_ID: "wx-app-id" }),
    ).toThrow("WECHAT_APP_ID and WECHAT_APP_SECRET must be configured together");
  });

  it("requires refresh sessions to outlive access tokens", () => {
    expect(() =>
      loadAppConfig({
        NODE_ENV: "test",
        ACCESS_TOKEN_TTL_SECONDS: "900",
        REFRESH_TOKEN_TTL_SECONDS: "900",
      }),
    ).toThrow("REFRESH_TOKEN_TTL_SECONDS must be greater than ACCESS_TOKEN_TTL_SECONDS");
  });

  it("parses explicit CORS origins without accepting paths or wildcards", () => {
    expect(
      loadAppConfig({
        NODE_ENV: "test",
        CORS_ALLOWED_ORIGINS: "https://game.example.com,http://127.0.0.1:7456",
      }).corsAllowedOrigins,
    ).toEqual(["https://game.example.com", "http://127.0.0.1:7456"]);
    expect(() =>
      loadAppConfig({ NODE_ENV: "test", CORS_ALLOWED_ORIGINS: "*" }),
    ).toThrow("Invalid CORS origin");
    expect(() =>
      loadAppConfig({
        NODE_ENV: "test",
        CORS_ALLOWED_ORIGINS: "https://game.example.com/path",
      }),
    ).toThrow("Invalid CORS origin");
  });
});
