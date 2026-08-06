import { DEBUG, DEV, WECHAT } from "cc/env";
import { CLIENT_CONFIG } from "../core/ClientConfig";
import { withRequestTimeout } from "../core/ClientTypes";
import type {
  HttpRequest,
  HttpResponse,
  LoginIntent,
} from "../core/ClientTypes";

interface WechatRequestOptions {
  url: string;
  method: "GET" | "POST";
  header?: Record<string, string>;
  data?: unknown;
  timeout?: number;
  success(result: { statusCode: number; data: unknown }): void;
  fail(error: { errMsg?: string }): void;
}

interface WechatRequestTask {
  abort?(): void;
}

interface WechatApi {
  request(options: WechatRequestOptions): WechatRequestTask | void;
  login(options: {
    success(result: { code?: string }): void;
    fail(error: { errMsg?: string }): void;
  }): void;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  onShow(callback: () => void): void;
  onHide(callback: () => void): void;
  offShow?(callback: () => void): void;
  offHide?(callback: () => void): void;
  onNetworkStatusChange?(callback: (result: { isConnected: boolean }) => void): void;
  offNetworkStatusChange?(callback: (result: { isConnected: boolean }) => void): void;
  vibrateShort?(options: { type: "light" }): void;
}

export interface PlatformLifecycleHandlers {
  onShow(): void;
  onHide(): void;
}

export interface PlatformNetworkHandlers {
  onOnline(): void;
  onOffline(): void;
}

/**
 * Fixed network fault modes exposed by the development diagnostics surface.
 * The request layer always treats these as disabled when Cocos builds with
 * DEBUG=false, even if a caller still holds a controller reference.
 */
export const DEBUG_NETWORK_FAULT_MODES = [
  "normal",
  "delay",
  "timeout",
  "failure",
] as const;

export type DebugNetworkFaultMode = (typeof DEBUG_NETWORK_FAULT_MODES)[number];

export const DEBUG_NETWORK_FAULT_DELAY_MILLISECONDS = 1_000;

export function isDebugNetworkFaultMode(value: unknown): value is DebugNetworkFaultMode {
  return (
    value === "normal" ||
    value === "delay" ||
    value === "timeout" ||
    value === "failure"
  );
}

export class DebugNetworkFaultError extends Error {
  constructor() {
    super("Debug network failure");
    this.name = "DebugNetworkFaultError";
  }
}

/**
 * Applies one deterministic fault to a request. The controller deliberately
 * accepts a request callback so delayed/blocked modes do not construct or
 * dispatch a platform request until the selected behavior allows it.
 */
export class DebugNetworkFaultController {
  private currentMode: DebugNetworkFaultMode = "normal";

  get mode(): DebugNetworkFaultMode {
    return DEBUG ? this.currentMode : "normal";
  }

  setMode(mode: DebugNetworkFaultMode): void {
    if (!DEBUG) return;
    if (!isDebugNetworkFaultMode(mode)) {
      throw new TypeError("Unsupported debug network fault mode");
    }
    this.currentMode = mode;
  }

  reset(): void {
    this.currentMode = "normal";
  }

  run<T>(request: () => Promise<T>): Promise<T> {
    // Keep this check at the request boundary. A release build must not be
    // able to activate a fault through a stale/debug-only UI reference.
    if (!DEBUG) return invokeRequest(request);

    switch (this.currentMode) {
      case "normal":
        return invokeRequest(request);
      case "delay":
        return new Promise<T>((resolve, reject) => {
          setTimeout(() => {
            invokeRequest(request).then(resolve, reject);
          }, DEBUG_NETWORK_FAULT_DELAY_MILLISECONDS);
        });
      case "timeout":
        return withRequestTimeout(
          new Promise<T>(() => undefined),
          CLIENT_CONFIG.requestTimeoutMilliseconds,
        );
      case "failure":
        return Promise.reject(new DebugNetworkFaultError());
      default:
        // Treat an impossible/corrupted mode as normal traffic.
        return invokeRequest(request);
    }
  }
}

export function createDebugNetworkFaultController(): DebugNetworkFaultController {
  return new DebugNetworkFaultController();
}

export interface PlatformAdapter {
  readonly kind: "browser" | "wechat";
  /** Present on real adapters; test doubles and custom integrations may omit it. */
  readonly debugNetworkFault?: DebugNetworkFaultController;
  request<T>(request: HttpRequest): Promise<HttpResponse<T>>;
  getLoginIntent(): Promise<LoginIntent>;
  load<T>(key: string): T | null;
  save<T>(key: string, value: T): boolean;
  remove(key: string): void;
  subscribeLifecycle(handlers: PlatformLifecycleHandlers): () => void;
  subscribeNetworkStatus(handlers: PlatformNetworkHandlers): () => void;
  feedback(): void;
}

export function createPlatformAdapter(): PlatformAdapter {
  if (WECHAT && getWechatApi()) {
    return new WechatPlatformAdapter(getWechatApi()!);
  }
  return new BrowserPlatformAdapter();
}

class BrowserPlatformAdapter implements PlatformAdapter {
  readonly kind = "browser" as const;
  readonly debugNetworkFault = createDebugNetworkFaultController();

  request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    return this.debugNetworkFault.run(() => {
      const controller =
        typeof AbortController === "undefined" ? null : new AbortController();
      return withRequestTimeout(
        (async (): Promise<HttpResponse<T>> => {
          const fetchResponse = await fetch(request.url, {
            method: request.method,
            ...(request.headers === undefined ? {} : { headers: request.headers }),
            ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
            ...(controller ? { signal: controller.signal } : {}),
          });
          return {
            statusCode: fetchResponse.status,
            data: (await fetchResponse.json()) as T,
          };
        })(),
        CLIENT_CONFIG.requestTimeoutMilliseconds,
        () => controller?.abort(),
      );
    });
  }

  async getLoginIntent(): Promise<LoginIntent> {
    return {
      kind: "development",
      accountId: this.getOrCreateDevelopmentAccount("browser-preview"),
    };
  }

  load<T>(key: string): T | null {
    try {
      const value = localStorage.getItem(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  save<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      // Storage can be unavailable in privacy mode; login still works for the current session.
      return false;
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage cleanup is best-effort; callers still discard the loaded value.
    }
  }

  subscribeLifecycle(handlers: PlatformLifecycleHandlers): () => void {
    let visible = document.visibilityState !== "hidden";
    let disposed = false;
    const updateVisibility = (nextVisible: boolean): void => {
      if (disposed || visible === nextVisible) return;
      visible = nextVisible;
      if (nextVisible) handlers.onShow();
      else handlers.onHide();
    };
    const onVisibilityChange = (): void =>
      updateVisibility(document.visibilityState !== "hidden");
    const onPageShow = (): void => updateVisibility(document.visibilityState !== "hidden");
    const onPageHide = (): void => updateVisibility(false);

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    if (!visible) handlers.onHide();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
    };
  }

  subscribeNetworkStatus(handlers: PlatformNetworkHandlers): () => void {
    let online = navigator.onLine;
    let disposed = false;
    const update = (nextOnline: boolean): void => {
      if (disposed || online === nextOnline) return;
      online = nextOnline;
      if (nextOnline) handlers.onOnline();
      else handlers.onOffline();
    };
    const onOnline = (): void => update(true);
    const onOffline = (): void => update(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }

  feedback(): void {
    // Browser preview keeps feedback visual-only.
  }

  private getOrCreateDevelopmentAccount(prefix: string): string {
    const existing = this.load<string>(CLIENT_CONFIG.developmentAccountStorageKey);
    if (existing) return existing;

    const accountId = `${prefix}-${randomFragment()}`;
    this.save(CLIENT_CONFIG.developmentAccountStorageKey, accountId);
    return accountId;
  }
}

class WechatPlatformAdapter implements PlatformAdapter {
  readonly kind = "wechat" as const;
  readonly debugNetworkFault = createDebugNetworkFaultController();

  constructor(private readonly api: WechatApi) {}

  request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    return this.debugNetworkFault.run(() => {
      let requestTask: WechatRequestTask | void;
      return withRequestTimeout(
        new Promise((resolve, reject) => {
          requestTask = this.api.request({
            url: request.url,
            method: request.method,
            timeout: CLIENT_CONFIG.requestTimeoutMilliseconds,
            ...(request.headers === undefined ? {} : { header: request.headers }),
            ...(request.body === undefined ? {} : { data: request.body }),
            success: (result) => {
              resolve({ statusCode: result.statusCode, data: result.data as T });
            },
            fail: (error) => {
              reject(new Error(error.errMsg || "网络请求失败"));
            },
          });
        }),
        CLIENT_CONFIG.requestTimeoutMilliseconds,
        () => requestTask?.abort?.(),
      );
    });
  }

  async getLoginIntent(): Promise<LoginIntent> {
    if (DEV) {
      const key = CLIENT_CONFIG.developmentAccountStorageKey;
      const stored = this.load<string>(key);
      if (stored) return { kind: "development", accountId: stored };

      const accountId = `wechat-preview-${randomFragment()}`;
      this.save(key, accountId);
      return { kind: "development", accountId };
    }

    const code = await withRequestTimeout(
      new Promise<string>((resolve, reject) => {
        this.api.login({
          success: (result) => {
            if (result.code) resolve(result.code);
            else reject(new Error("微信登录未返回有效凭证"));
          },
          fail: (error) => reject(new Error(error.errMsg || "微信登录失败")),
        });
      }),
      CLIENT_CONFIG.requestTimeoutMilliseconds,
    );
    return { kind: "wechat", code };
  }

  load<T>(key: string): T | null {
    try {
      const value = this.api.getStorageSync(key);
      return value ? (value as T) : null;
    } catch {
      return null;
    }
  }

  save<T>(key: string, value: T): boolean {
    try {
      this.api.setStorageSync(key, value);
      return true;
    } catch {
      // Storage failures are non-fatal; the player can authenticate again.
      return false;
    }
  }

  remove(key: string): void {
    try {
      this.api.removeStorageSync(key);
    } catch {
      // Storage cleanup is best-effort; callers still discard the loaded value.
    }
  }

  subscribeLifecycle(handlers: PlatformLifecycleHandlers): () => void {
    let visible = true;
    let disposed = false;
    const onShow = (): void => {
      if (disposed || visible) return;
      visible = true;
      handlers.onShow();
    };
    const onHide = (): void => {
      if (disposed || !visible) return;
      visible = false;
      handlers.onHide();
    };

    this.api.onShow(onShow);
    this.api.onHide(onHide);
    return () => {
      disposed = true;
      this.api.offShow?.(onShow);
      this.api.offHide?.(onHide);
    };
  }

  subscribeNetworkStatus(handlers: PlatformNetworkHandlers): () => void {
    if (!this.api.onNetworkStatusChange) return () => undefined;

    let connected: boolean | null = null;
    let disposed = false;
    const onStatusChange = (result: { isConnected: boolean }): void => {
      if (disposed || connected === result.isConnected) return;
      connected = result.isConnected;
      if (result.isConnected) handlers.onOnline();
      else handlers.onOffline();
    };

    this.api.onNetworkStatusChange(onStatusChange);
    return () => {
      disposed = true;
      this.api.offNetworkStatusChange?.(onStatusChange);
    };
  }

  feedback(): void {
    this.api.vibrateShort?.({ type: "light" });
  }
}

function getWechatApi(): WechatApi | null {
  const candidate = (globalThis as { wx?: unknown }).wx;
  return candidate && typeof candidate === "object" ? (candidate as WechatApi) : null;
}

function randomFragment(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function invokeRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return request();
  } catch (error) {
    return Promise.reject(error);
  }
}
