import { describe, expect, it } from "vitest";
import { loadAppConfig } from "../src/config/env";
import { createInfrastructure } from "../src/infrastructure";

describe("infrastructure lifecycle", () => {
  it("reports an unavailable Redis dependency without an unhandled error event", async () => {
    const config = loadAppConfig({
      NODE_ENV: "test",
      REDIS_URL: "redis://127.0.0.1:1",
    });
    const infrastructure = createInfrastructure(config);

    expect(infrastructure.redis.listenerCount("error")).toBeGreaterThan(0);
    expect(infrastructure.pool.listenerCount("error")).toBeGreaterThan(0);
    await expect(infrastructure.checkRedis()).rejects.toBeInstanceOf(Error);
    await expect(infrastructure.close()).resolves.toBeUndefined();
  });
});
