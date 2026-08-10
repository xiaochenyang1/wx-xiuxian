import {
  DEFAULT_DESIGN_SAFE_AREA_LAYOUT,
  type DesignSafeAreaLayout,
} from "../../assets/scripts/core/SafeArea";
import type {
  PlatformAdapter,
  PlatformLifecycleHandlers,
} from "../../assets/scripts/platform/PlatformAdapter";

/**
 * In-memory stand-in for browser `localStorage` / WeChat `wx.*StorageSync`.
 *
 * Values round-trip through `JSON.stringify`/`JSON.parse` exactly as
 * `BrowserPlatformAdapter` does, so a snapshot that only survives by object
 * reference still fails here.
 */
export class FakePlatformAdapter implements PlatformAdapter {
  readonly kind = "browser" as const;

  /** Flip to make every subsequent `save` fail, as a full quota would. */
  saveShouldFail = false;
  saveCallCount = 0;
  feedbackCallCount = 0;

  private readonly store = new Map<string, string>();
  private handlers: PlatformLifecycleHandlers | null = null;

  getSafeAreaLayout(): DesignSafeAreaLayout {
    return DEFAULT_DESIGN_SAFE_AREA_LAYOUT;
  }

  load<T>(key: string): T | null {
    const raw = this.store.get(key);
    if (raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  save<T>(key: string, value: T): boolean {
    this.saveCallCount += 1;
    if (this.saveShouldFail) return false;
    this.store.set(key, JSON.stringify(value));
    return true;
  }

  remove(key: string): void {
    this.store.delete(key);
  }

  subscribeLifecycle(handlers: PlatformLifecycleHandlers): () => void {
    this.handlers = handlers;
    return () => {
      this.handlers = null;
    };
  }

  feedback(): void {
    this.feedbackCallCount += 1;
  }

  // ---- test-only helpers ----

  /** Raw stored text, for asserting on what actually hit storage. */
  raw(key: string): string | undefined {
    return this.store.get(key);
  }

  /** Plant arbitrary (possibly corrupt) data the way a tampered save would look. */
  seed(key: string, value: unknown): void {
    this.store.set(key, JSON.stringify(value));
  }

  /** Plant text that is not valid JSON at all. */
  seedRaw(key: string, value: string): void {
    this.store.set(key, value);
  }

  emitShow(): void {
    this.handlers?.onShow();
  }

  emitHide(): void {
    this.handlers?.onHide();
  }
}
