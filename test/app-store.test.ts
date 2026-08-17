import { describe, expect, it } from "vitest";
import { AppStore } from "../assets/scripts/state/AppStore";

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
