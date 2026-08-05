import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClientRequestTimeoutError,
  withRequestTimeout,
} from "../../assets/scripts/core/ClientTypes";

describe("Cocos request timeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("rejects a stalled request and runs timeout cleanup", async () => {
    const cleanup = vi.fn(() => {
      throw new Error("cleanup failed");
    });
    const request = withRequestTimeout(
      new Promise<never>(() => undefined),
      10_000,
      cleanup,
    );
    const rejection = expect(request).rejects.toBeInstanceOf(ClientRequestTimeoutError);

    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("clears the timeout after the request resolves", async () => {
    const cleanup = vi.fn();
    const request = withRequestTimeout(Promise.resolve("ok"), 10_000, cleanup);

    await expect(request).resolves.toBe("ok");

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(cleanup).not.toHaveBeenCalled();
  });
});
