import { describe, expect, it, vi } from "vitest";
import { buildApp, type ReadinessChecks } from "../src/app";
import { loadAppConfig } from "../src/config/env";

function readyChecks(overrides: Partial<ReadinessChecks> = {}): ReadinessChecks {
  return {
    checkDatabase: vi.fn().mockResolvedValue(undefined),
    checkRedis: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("server health API", () => {
  it("returns a liveness envelope without external dependencies", async () => {
    const app = await buildApp({
      config: loadAppConfig({ NODE_ENV: "test" }),
      readiness: readyChecks(),
    });

    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { status: "ok", service: "cultivation-diary-server" },
    });

    await app.close();
  });

  it("reports readiness only when PostgreSQL and Redis both respond", async () => {
    const app = await buildApp({
      config: loadAppConfig({ NODE_ENV: "test" }),
      readiness: readyChecks({
        checkRedis: vi.fn().mockRejectedValue(new Error("redis unavailable")),
      }),
    });

    const response = await app.inject({ method: "GET", url: "/health/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      data: {
        status: "not_ready",
        checks: { postgres: true, redis: false },
      },
    });

    await app.close();
  });

  it("uses the stable error envelope for unknown routes", async () => {
    const app = await buildApp({
      config: loadAppConfig({ NODE_ENV: "test" }),
      readiness: readyChecks(),
    });

    const response = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: "ROUTE_NOT_FOUND", retryable: false },
    });

    await app.close();
  });
});
