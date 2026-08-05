import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_CACHE_SCHEMA_VERSION,
  isStoredBootstrapCacheEnvelope,
} from "../../assets/scripts/core/ClientTypes";
import {
  LifecycleSyncCoordinator,
  type LifecycleSyncReason,
} from "../../assets/scripts/core/LifecycleSyncCoordinator";
import { bootstrapFixture } from "./fixtures/bootstrap";

describe("Cocos lifecycle sync coordinator", () => {
  it("persists before the best-effort hide sync and deduplicates lifecycle events", async () => {
    const events: string[] = [];
    const accepted: Array<{ result: string; allowRender: boolean }> = [];
    const coordinator = new LifecycleSyncCoordinator<string>({
      intervalSeconds: 30,
      schedule: () => events.push("schedule"),
      unschedule: () => events.push("unschedule"),
      persistCurrentSnapshot: () => events.push("persist"),
      canStartSync: () => true,
      setSyncInFlight: (inFlight) => events.push(`busy:${inFlight}`),
      sync: async (reason) => {
        events.push(`sync:${reason}`);
        return reason;
      },
      recover: async () => null,
      accept: (result, allowRender) => accepted.push({ result, allowRender }),
    });

    coordinator.start();
    const foregroundRenderToken = coordinator.captureRenderToken();
    coordinator.handleHide();
    coordinator.handleHide();
    await flushPromises();

    expect(events.slice(0, 5)).toEqual([
      "schedule",
      "unschedule",
      "persist",
      "busy:true",
      "sync:hide",
    ]);
    expect(events.filter((event) => event === "persist")).toHaveLength(1);
    expect(accepted).toEqual([{ result: "hide", allowRender: false }]);
    expect(coordinator.canRender(foregroundRenderToken)).toBe(false);

    coordinator.handleShow();
    coordinator.handleShow();
    await flushPromises();

    expect(events.filter((event) => event === "schedule")).toHaveLength(2);
    expect(accepted.at(-1)).toEqual({ result: "show", allowRender: true });
  });

  it("queues a foreground sync behind an in-flight hide request without overlap", async () => {
    const requests: Array<Deferred<string>> = [];
    const reasons: LifecycleSyncReason[] = [];
    const accepted: Array<{ result: string; allowRender: boolean }> = [];
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const coordinator = new LifecycleSyncCoordinator<string>({
      intervalSeconds: 30,
      schedule: () => undefined,
      unschedule: () => undefined,
      persistCurrentSnapshot: () => undefined,
      canStartSync: () => true,
      setSyncInFlight: () => undefined,
      sync: (reason) => {
        reasons.push(reason);
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        const request = deferred<string>();
        requests.push(request);
        return request.promise.finally(() => {
          activeRequests -= 1;
        });
      },
      recover: async () => null,
      accept: (result, allowRender) => accepted.push({ result, allowRender }),
    });

    coordinator.start();
    coordinator.handleHide();
    coordinator.handleShow();
    expect(reasons).toEqual(["hide"]);

    requests[0]?.resolve("hidden-result");
    await flushPromises();
    expect(reasons).toEqual(["hide", "show"]);
    expect(maxActiveRequests).toBe(1);

    requests[1]?.resolve("shown-result");
    await flushPromises();
    expect(accepted).toEqual([
      { result: "hidden-result", allowRender: false },
      { result: "shown-result", allowRender: true },
    ]);
  });

  it("waits for an external mutation and ignores late responses after destroy", async () => {
    let available = false;
    const requests: Array<Deferred<string>> = [];
    let syncCount = 0;
    let unscheduleCount = 0;
    const accepted: string[] = [];
    const coordinator = new LifecycleSyncCoordinator<string>({
      intervalSeconds: 30,
      schedule: () => undefined,
      unschedule: () => {
        unscheduleCount += 1;
      },
      persistCurrentSnapshot: () => undefined,
      canStartSync: () => available,
      setSyncInFlight: () => undefined,
      sync: () => {
        syncCount += 1;
        const request = deferred<string>();
        requests.push(request);
        return request.promise;
      },
      recover: async () => null,
      accept: (result) => accepted.push(result),
    });

    coordinator.start();
    coordinator.handleHide();
    coordinator.handleShow();
    expect(syncCount).toBe(0);

    available = true;
    coordinator.notifySyncAvailable();
    expect(syncCount).toBe(1);
    coordinator.destroy();
    requests[0]?.resolve("late-result");
    await flushPromises();

    expect(accepted).toEqual([]);
    expect(unscheduleCount).toBe(2);
  });
});

describe("Cocos bootstrap cache schema", () => {
  it("accepts the versioned authoritative snapshot envelope", () => {
    const cache = {
      schemaVersion: BOOTSTRAP_CACHE_SCHEMA_VERSION,
      playerVersion: "18",
      lastSuccessfulSyncAt: "2026-08-05T08:00:00.000Z",
      bootstrap: bootstrapFixture(),
    };

    expect(isStoredBootstrapCacheEnvelope(cache)).toBe(true);
    expect(isStoredBootstrapCacheEnvelope({ ...cache, schemaVersion: 2 })).toBe(false);
    expect(isStoredBootstrapCacheEnvelope({ ...cache, playerVersion: "latest" })).toBe(
      false,
    );
    expect(
      isStoredBootstrapCacheEnvelope({
        ...cache,
        lastSuccessfulSyncAt: "yesterday",
      }),
    ).toBe(false);
    expect(isStoredBootstrapCacheEnvelope({ ...cache, bootstrap: {} })).toBe(false);
  });
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
