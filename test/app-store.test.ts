import type { BootstrapSnapshot } from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { AppStore } from "../assets/scripts/state/AppStore";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date("2026-01-01T00:00:00.000Z");

/** A real snapshot rewritten to the saved tab and unlock bits under test. */
function readySnapshot(
  selectedTab: string,
  unlocks: { partner?: boolean; cave?: boolean } = {},
  playerId?: string,
): BootstrapSnapshot {
  const service = new LocalGameService(new FakePlatformAdapter());
  service.initialize(START);
  const base = service.snapshot;
  return {
    ...base,
    ...(playerId ? { player: { ...base.player, id: playerId } } : {}),
    settings: { ...base.settings, selectedTab },
    unlocks: {
      ...base.unlocks,
      partner: unlocks.partner ?? false,
      cave: unlocks.cave ?? false,
    },
  };
}

function readyStore(...args: Parameters<typeof readySnapshot>): AppStore {
  const store = new AppStore();
  store.setReady(readySnapshot(...args), START.toISOString());
  return store;
}

describe("app store feature feedback", () => {
  it("clears stale operation feedback when the main tab changes", () => {
    const store = new AppStore();
    store.setFeatureMessage("洞府升级成功");

    store.selectTab("cave");

    expect(store.snapshot.selectedTab).toBe("cave");
    expect(store.snapshot.featureMessage).toBeNull();
  });

  it("keeps current feedback when selecting the already active tab", () => {
    const store = new AppStore();
    store.setFeatureMessage("操作未完成");

    store.selectTab("cultivation");

    expect(store.snapshot.featureMessage).toBe("操作未完成");
  });
});

describe("the restored main tab", () => {
  it("opens on the tab the save was left on", () => {
    expect(readyStore("ranking").snapshot.selectedTab).toBe("ranking");
  });

  it("falls back to cultivation when the saved tab is still locked", () => {
    expect(readyStore("cave").snapshot.selectedTab).toBe("cultivation");
    expect(readyStore("cave", { cave: true }).snapshot.selectedTab).toBe("cave");
    expect(readyStore("partner").snapshot.selectedTab).toBe("cultivation");
    expect(readyStore("partner", { partner: true }).snapshot.selectedTab).toBe(
      "partner",
    );
  });

  it("falls back to cultivation on a tab it cannot interpret", () => {
    // Validation rejects such a save before it ever reaches the store; this
    // pins that resolving does not assume its input is already legal.
    expect(readyStore("shop").snapshot.selectedTab).toBe("cultivation");
  });

  it("reads the incoming save's tab when the player changes", () => {
    const store = readyStore("ranking");
    store.openFeature("profile");
    store.setFeatureMessage("存档已恢复");

    store.setReady(
      readySnapshot("cave", { cave: true }, "another-player"),
      START.toISOString(),
    );

    expect(store.snapshot.selectedTab).toBe("cave");
    expect(store.snapshot.activeFeature).toBeNull();
    expect(store.snapshot.featureMessage).toBeNull();
  });
});
