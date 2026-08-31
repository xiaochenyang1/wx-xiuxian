import { WECHAT } from "cc/env";
import {
  DEFAULT_DESIGN_SAFE_AREA_LAYOUT,
  hasUsableViewportDimensions,
  resolveDesignSafeAreaLayout,
  type DesignSafeAreaLayout,
} from "../core/SafeArea";

interface WechatApi {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  onShow(callback: () => void): void;
  onHide(callback: () => void): void;
  offShow?(callback: () => void): void;
  offHide?(callback: () => void): void;
  vibrateShort?(options: { type: "light" }): void;
  getWindowInfo?(): unknown;
  getSystemInfoSync?(): unknown;
  getMenuButtonBoundingClientRect?(): unknown;
  setClipboardData?(options: {
    data: string;
    success?: () => void;
    fail?: () => void;
  }): void;
  getClipboardData?(options: {
    success?: (result: { data?: unknown }) => void;
    fail?: () => void;
  }): void;
}

export interface PlatformLifecycleHandlers {
  onShow(): void;
  onHide(): void;
}

export interface PlatformAdapter {
  readonly kind: "browser" | "wechat";
  getSafeAreaLayout(): DesignSafeAreaLayout;
  load<T>(key: string): T | null;
  save<T>(key: string, value: T): boolean;
  remove(key: string): void;
  writeClipboard(value: string): Promise<boolean>;
  readClipboard(): Promise<string | null>;
  subscribeLifecycle(handlers: PlatformLifecycleHandlers): () => void;
  feedback(): void;
}

export function createPlatformAdapter(): PlatformAdapter {
  const api = WECHAT ? getWechatApi() : null;
  return api ? new WechatPlatformAdapter(api) : new BrowserPlatformAdapter();
}

class BrowserPlatformAdapter implements PlatformAdapter {
  readonly kind = "browser" as const;

  getSafeAreaLayout(): DesignSafeAreaLayout {
    if (
      typeof window === "undefined" ||
      !Number.isFinite(window.innerWidth) ||
      !Number.isFinite(window.innerHeight) ||
      window.innerWidth <= 0 ||
      window.innerHeight <= 0
    ) {
      return DEFAULT_DESIGN_SAFE_AREA_LAYOUT;
    }
    return resolveDesignSafeAreaLayout({
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    });
  }

  load<T>(key: string): T | null {
    try {
      const value = localStorage.getItem(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch {
      return null;
    }
  }

  save<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage cleanup is best-effort.
    }
  }

  async writeClipboard(value: string): Promise<boolean> {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // Fall through to the legacy browser copy path.
    }
    if (typeof document === "undefined" || !document.body) return false;
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      input.remove();
    }
  }

  async readClipboard(): Promise<string | null> {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
        return null;
      }
      return await navigator.clipboard.readText();
    } catch {
      return null;
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
    const onPageShow = (): void =>
      updateVisibility(document.visibilityState !== "hidden");
    const onPageHide = (): void => updateVisibility(false);

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
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
}

class WechatPlatformAdapter implements PlatformAdapter {
  readonly kind = "wechat" as const;

  constructor(private readonly api: WechatApi) {}

  getSafeAreaLayout(): DesignSafeAreaLayout {
    const windowInfo = this.readWindowInfo();
    let menuButton: unknown = null;
    try {
      menuButton = this.api.getMenuButtonBoundingClientRect?.() ?? null;
    } catch {
      // A missing capsule API is non-fatal on older base libraries.
    }
    return resolveDesignSafeAreaLayout({
      ...(isRecord(windowInfo) ? windowInfo : {}),
      menuButton,
    });
  }

  load<T>(key: string): T | null {
    try {
      const value = this.api.getStorageSync(key);
      return value === undefined || value === null || value === ""
        ? null
        : (value as T);
    } catch {
      return null;
    }
  }

  save<T>(key: string, value: T): boolean {
    try {
      this.api.setStorageSync(key, value);
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): void {
    try {
      this.api.removeStorageSync(key);
    } catch {
      // Storage cleanup is best-effort.
    }
  }

  writeClipboard(value: string): Promise<boolean> {
    return new Promise((resolve) => {
      const write = this.api.setClipboardData;
      if (!write) {
        resolve(false);
        return;
      }
      try {
        write.call(this.api, {
          data: value,
          success: () => resolve(true),
          fail: () => resolve(false),
        });
      } catch {
        resolve(false);
      }
    });
  }

  readClipboard(): Promise<string | null> {
    return new Promise((resolve) => {
      const read = this.api.getClipboardData;
      if (!read) {
        resolve(null);
        return;
      }
      try {
        read.call(this.api, {
          success: (result) =>
            resolve(typeof result.data === "string" ? result.data : null),
          fail: () => resolve(null),
        });
      } catch {
        resolve(null);
      }
    });
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

  private readWindowInfo(): unknown {
    try {
      const current = this.api.getWindowInfo?.();
      if (hasUsableViewportDimensions(current)) return current;
    } catch {
      // Older base libraries do not expose getWindowInfo.
    }
    try {
      return this.api.getSystemInfoSync?.() ?? null;
    } catch {
      return null;
    }
  }
}

function getWechatApi(): WechatApi | null {
  const candidate = (globalThis as { wx?: unknown }).wx;
  return candidate && typeof candidate === "object" ? (candidate as WechatApi) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
