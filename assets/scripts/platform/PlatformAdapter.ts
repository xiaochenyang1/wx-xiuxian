import { DEV, WECHAT } from "cc/env";
import { CLIENT_CONFIG } from "../core/ClientConfig";
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
  success(result: { statusCode: number; data: unknown }): void;
  fail(error: { errMsg?: string }): void;
}

interface WechatApi {
  request(options: WechatRequestOptions): void;
  login(options: {
    success(result: { code?: string }): void;
    fail(error: { errMsg?: string }): void;
  }): void;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  onShow(callback: () => void): void;
  onHide(callback: () => void): void;
  offShow?(callback: () => void): void;
  offHide?(callback: () => void): void;
  vibrateShort?(options: { type: "light" }): void;
}

export interface PlatformLifecycleHandlers {
  onShow(): void;
  onHide(): void;
}

export interface PlatformAdapter {
  readonly kind: "browser" | "wechat";
  request<T>(request: HttpRequest): Promise<HttpResponse<T>>;
  getLoginIntent(): Promise<LoginIntent>;
  load<T>(key: string): T | null;
  save<T>(key: string, value: T): void;
  subscribeLifecycle(handlers: PlatformLifecycleHandlers): () => void;
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

  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    const response = await fetch(request.url, {
      method: request.method,
      ...(request.headers === undefined ? {} : { headers: request.headers }),
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
    return {
      statusCode: response.status,
      data: (await response.json()) as T,
    };
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

  save<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable in privacy mode; login still works for the current session.
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

  constructor(private readonly api: WechatApi) {}

  request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    return new Promise((resolve, reject) => {
      this.api.request({
        url: request.url,
        method: request.method,
        ...(request.headers === undefined ? {} : { header: request.headers }),
        ...(request.body === undefined ? {} : { data: request.body }),
        success: (result) => {
          resolve({ statusCode: result.statusCode, data: result.data as T });
        },
        fail: (error) => {
          reject(new Error(error.errMsg || "网络请求失败"));
        },
      });
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

    const code = await new Promise<string>((resolve, reject) => {
      this.api.login({
        success: (result) => {
          if (result.code) resolve(result.code);
          else reject(new Error("微信登录未返回有效凭证"));
        },
        fail: (error) => reject(new Error(error.errMsg || "微信登录失败")),
      });
    });
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

  save<T>(key: string, value: T): void {
    try {
      this.api.setStorageSync(key, value);
    } catch {
      // Storage failures are non-fatal; the player can authenticate again.
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
