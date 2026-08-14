import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import {
  LocalGameError,
  LocalGameService,
} from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const SIX_HOURS = 21_600;
const SEED = 20_260_101;

function freshService(platform = new FakePlatformAdapter()): LocalGameService {
  const service = new LocalGameService(platform);
  service.initialize(new Date());
  return service;
}

describe("auto salvage settings", () => {
  it("toggles each supported quality independently with a clear result", () => {
    const service = freshService();

    const common = service.toggleAutoSalvage("common");
    expect(common.snapshot.settings).toMatchObject({
      autoSalvageCommon: true,
      autoSalvageUncommon: false,
    });
    expect(common.message).toContain("普通品质自动分解已开启");

    const uncommon = service.toggleAutoSalvage("uncommon");
    expect(uncommon.snapshot.settings).toMatchObject({
      autoSalvageCommon: true,
      autoSalvageUncommon: true,
    });
    expect(uncommon.message).toContain("优秀品质自动分解已开启");

    const disabled = service.toggleAutoSalvage("common");
    expect(disabled.snapshot.settings).toMatchObject({
      autoSalvageCommon: false,
      autoSalvageUncommon: true,
    });
    expect(disabled.message).toContain("普通品质自动分解已关闭");
  });

  it("persists both settings across a reload", () => {
    const platform = new FakePlatformAdapter();
    const service = freshService(platform);
    service.toggleAutoSalvage("common");
    service.toggleAutoSalvage("uncommon");

    const stored = platform.raw(SAVE_KEY);
    expect(stored).toBeDefined();
    const savedAt = JSON.parse(stored!).savedAt as string;
    const reloaded = new LocalGameService(platform);
    const result = reloaded.initialize(new Date(savedAt));

    expect(result.created).toBe(false);
    expect(reloaded.snapshot.settings).toMatchObject({
      autoSalvageCommon: true,
      autoSalvageUncommon: true,
    });
  });

  it("rejects unsupported qualities without changing settings", () => {
    const service = freshService();
    const before = { ...service.snapshot.settings };

    expect(() => service.toggleAutoSalvage("rare" as never)).toThrow(
      new LocalGameError("该品质不支持自动分解"),
    );
    expect(service.snapshot.settings).toEqual(before);
  });

  it("auto-salvages matching future deterministic drops", () => {
    const baseline = freshService();
    const baselineResult = baseline.debugSimulateOffline(SIX_HOURS, SEED);
    const commonCandidates = baselineResult.snapshot.harvestChest.entries.filter(
      (entry) => entry.quality === "common",
    ).length;
    expect(commonCandidates).toBeGreaterThan(0);
    expect(baselineResult.snapshot.offlineSettlement?.drops.autoSalvagedCount).toBe(0);

    const configured = freshService();
    configured.toggleAutoSalvage("common");
    const configuredResult = configured.debugSimulateOffline(SIX_HOURS, SEED);

    expect(
      configuredResult.snapshot.harvestChest.entries.some(
        (entry) => entry.quality === "common",
      ),
    ).toBe(false);
    expect(configuredResult.snapshot.harvestChest.pendingCount).toBe(
      baselineResult.snapshot.harvestChest.pendingCount - commonCandidates,
    );
    expect(
      configuredResult.snapshot.offlineSettlement?.drops.autoSalvagedCount,
    ).toBe(commonCandidates);
  });

  it("does not retroactively process entries already in the harvest chest", () => {
    const service = freshService();
    service.debugSimulateOffline(SIX_HOURS, SEED);
    const entries = service.snapshot.harvestChest.entries;
    const harvestEquipment = service.snapshot.equipment.filter(
      (equipment) => equipment.location === "harvest",
    );

    service.toggleAutoSalvage("common");

    expect(service.snapshot.harvestChest.entries).toEqual(entries);
    expect(
      service.snapshot.equipment.filter(
        (equipment) => equipment.location === "harvest",
      ),
    ).toEqual(harvestEquipment);
  });
});
