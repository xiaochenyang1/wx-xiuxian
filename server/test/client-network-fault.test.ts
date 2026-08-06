/// <reference path="../../temp/declarations/cc.env.d.ts" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_CONFIG } from "../../assets/scripts/core/ClientConfig";

const platformModulePath = "../../assets/scripts/platform/PlatformAdapter";

type PlatformModule = typeof import("../../assets/scripts/platform/PlatformAdapter");

async function loadPlatformModule(
  wechat: boolean,
  debug = true,
): Promise<PlatformModule> {
  vi.resetModules();
  vi.doMock("cc/env", () => ({ DEBUG: debug, DEV: true, WECHAT: wechat }));
  return import(platformModulePath);
}

describe("development network fault controller", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("cc/env");
    vi.unstubAllGlobals();
  });

  it("accepts only the fixed development modes and resets to normal", async () => {
    const {
      DEBUG_NETWORK_FAULT_MODES,
      createDebugNetworkFaultController,
      isDebugNetworkFaultMode,
    } = await loadPlatformModule(false);
    const controller = createDebugNetworkFaultController();

    expect(DEBUG_NETWORK_FAULT_MODES).toEqual([
      "normal",
      "delay",
      "timeout",
      "failure",
    ]);
    expect(controller.mode).toBe("normal");

    for (const mode of DEBUG_NETWORK_FAULT_MODES) {
      expect(isDebugNetworkFaultMode(mode)).toBe(true);
      controller.setMode(mode);
      expect(controller.mode).toBe(mode);
    }
    expect(isDebugNetworkFaultMode("delay_1s")).toBe(false);
    expect(isDebugNetworkFaultMode("arbitrary-script")).toBe(false);
    expect(isDebugNetworkFaultMode(null)).toBe(false);

    expect(() => controller.setMode("arbitrary-script" as never)).toThrow(TypeError);
    controller.reset();
    expect(controller.mode).toBe("normal");
  });

  it("hard-disables mode changes and faults when loaded as a release module", async () => {
    const { createDebugNetworkFaultController } = await loadPlatformModule(false, false);
    const controller = createDebugNetworkFaultController();
    const request = vi.fn().mockResolvedValue("release response");

    expect(controller.mode).toBe("normal");
    controller.setMode("failure");
    expect(controller.mode).toBe("normal");
    await expect(controller.run(request)).resolves.toBe("release response");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("passes through normal requests and propagates callback failures", async () => {
    const { createDebugNetworkFaultController } = await loadPlatformModule(false);
    const controller = createDebugNetworkFaultController();
    const request = vi.fn().mockResolvedValue({ ok: true });

    await expect(controller.run(request)).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledTimes(1);

    const failure = new Error("request failed");
    request.mockRejectedValueOnce(failure);
    await expect(controller.run(request)).rejects.toBe(failure);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("delays dispatch by the fixed interval without changing the callback", async () => {
    vi.useFakeTimers();
    const {
      DEBUG_NETWORK_FAULT_DELAY_MILLISECONDS,
      createDebugNetworkFaultController,
    } = await loadPlatformModule(false);
    const controller = createDebugNetworkFaultController();
    controller.setMode("delay");
    const request = vi.fn().mockResolvedValue("response");

    const result = controller.run(request);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEBUG_NETWORK_FAULT_DELAY_MILLISECONDS - 1);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("response");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("fails deterministically without dispatching the request", async () => {
    const { DebugNetworkFaultError, createDebugNetworkFaultController } =
      await loadPlatformModule(false);
    const controller = createDebugNetworkFaultController();
    controller.setMode("failure");
    const request = vi.fn().mockResolvedValue("must not be sent");

    await expect(controller.run(request)).rejects.toBeInstanceOf(DebugNetworkFaultError);
    expect(request).not.toHaveBeenCalled();
  });

  it("times out deterministically without dispatching the request", async () => {
    vi.useFakeTimers();
    const { createDebugNetworkFaultController } = await loadPlatformModule(false);
    // Load the error class after resetting modules so it is the same module
    // instance used by the freshly imported PlatformAdapter.
    const { ClientRequestTimeoutError } = await import(
      "../../assets/scripts/core/ClientTypes"
    );
    const controller = createDebugNetworkFaultController();
    controller.setMode("timeout");
    const request = vi.fn().mockResolvedValue("must not be sent");
    const result = controller.run(request);
    const rejection = expect(result).rejects.toBeInstanceOf(ClientRequestTimeoutError);

    await vi.advanceTimersByTimeAsync(CLIENT_CONFIG.requestTimeoutMilliseconds);
    await rejection;
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps the browser request boundary disabled after reset and restores normal traffic", async () => {
    const { createPlatformAdapter } = await loadPlatformModule(false);
    const platform = createPlatformAdapter();
    expect(platform.kind).toBe("browser");

    const fetchRequest = vi.fn().mockResolvedValue({
      status: 201,
      json: async () => ({ accepted: true }),
    });
    vi.stubGlobal("fetch", fetchRequest);
    const request = {
      method: "POST" as const,
      url: "http://game.test/api/v1/debug/network",
      headers: { "Content-Type": "application/json" },
      body: { probe: "fixed" },
    };

    platform.debugNetworkFault?.setMode("failure");
    await expect(platform.request(request)).rejects.toBeInstanceOf(Error);
    expect(fetchRequest).not.toHaveBeenCalled();

    platform.debugNetworkFault?.reset();
    await expect(platform.request(request)).resolves.toEqual({
      statusCode: 201,
      data: { accepted: true },
    });
    expect(fetchRequest).toHaveBeenCalledTimes(1);
    expect(fetchRequest).toHaveBeenCalledWith(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: expect.any(AbortSignal),
    });
  });

  it("keeps the WeChat request boundary disabled and restores normal traffic", async () => {
    const wechatRequests: Array<{
      options: {
        url: string;
        method: string;
        header?: Record<string, string>;
        data?: unknown;
        success(result: { statusCode: number; data: unknown }): void;
        fail(error: { errMsg?: string }): void;
      };
    }> = [];
    const wx = {
      request(options: (typeof wechatRequests)[number]["options"]): { abort(): void } {
        wechatRequests.push({ options });
        return { abort: vi.fn() };
      },
      login: vi.fn(),
      getStorageSync: vi.fn(() => null),
      setStorageSync: vi.fn(),
      removeStorageSync: vi.fn(),
      onShow: vi.fn(),
      onHide: vi.fn(),
    };
    vi.stubGlobal("wx", wx);
    const { createPlatformAdapter } = await loadPlatformModule(true);
    const platform = createPlatformAdapter();
    expect(platform.kind).toBe("wechat");

    const request = {
      method: "POST" as const,
      url: "https://game.test/api/v1/debug/network",
      headers: { Authorization: "Bearer test" },
      body: { probe: "wechat" },
    };
    platform.debugNetworkFault?.setMode("failure");
    await expect(platform.request(request)).rejects.toBeInstanceOf(Error);
    expect(wechatRequests).toHaveLength(0);

    platform.debugNetworkFault?.reset();
    const response = platform.request(request);
    expect(wechatRequests).toHaveLength(1);
    wechatRequests[0]?.options.success({ statusCode: 202, data: { accepted: true } });
    await expect(response).resolves.toEqual({
      statusCode: 202,
      data: { accepted: true },
    });
    expect(wechatRequests[0]?.options).toMatchObject({
      url: request.url,
      method: request.method,
      header: request.headers,
      data: request.body,
      timeout: CLIENT_CONFIG.requestTimeoutMilliseconds,
    });
  });
});
