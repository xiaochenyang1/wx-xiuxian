import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");

function at(offsetSeconds: number): Date {
  return new Date(START.getTime() + offsetSeconds * 1_000);
}

describe("local save round-trip", () => {
  it("restores a freshly written save instead of creating a new one", () => {
    const platform = new FakePlatformAdapter();
    const first = new LocalGameService(platform);
    const created = first.initialize(START);

    expect(created.created).toBe(true);
    expect(created.persisted).toBe(true);

    // A second service reading the same storage must recognise the save.
    const second = new LocalGameService(platform);
    const reloaded = second.initialize(at(10));

    expect(reloaded.created).toBe(false);
    expect(reloaded.snapshot.player.id).toBe(created.snapshot.player.id);
    expect(reloaded.snapshot.account.id).toBe(created.snapshot.account.id);
  });

  it("preserves player-visible progress across a reload", () => {
    const platform = new FakePlatformAdapter();
    const first = new LocalGameService(platform);
    first.initialize(START);
    first.checkpoint(at(3_600));
    const before = first.snapshot;

    const second = new LocalGameService(platform);
    second.initialize(at(3_600));
    const after = second.snapshot;

    expect(after.progress.level).toBe(before.progress.level);
    expect(after.progress.experience).toBe(before.progress.experience);
    expect(after.wallet.spiritStone).toBe(before.wallet.spiritStone);
    expect(after.inventory.bagCapacity).toBe(before.inventory.bagCapacity);
    expect(after.inventory.stacks).toEqual(before.inventory.stacks);
    expect(after.techniques).toEqual(before.techniques);
    expect(after.equipment).toEqual(before.equipment);
    expect(after.harvestChest.entries).toEqual(before.harvestChest.entries);
  });

  it("creates a new save when storage holds unparseable text", () => {
    const platform = new FakePlatformAdapter();
    platform.seedRaw(SAVE_KEY, "{ not json");

    const service = new LocalGameService(platform);
    const result = service.initialize(START);

    expect(result.created).toBe(true);
    expect(result.snapshot.progress.level).toBe(1);
  });

  it("reports a failed write without throwing and keeps the session usable", () => {
    const platform = new FakePlatformAdapter();
    platform.saveShouldFail = true;

    const service = new LocalGameService(platform);
    const result = service.initialize(START);

    expect(result.persisted).toBe(false);
    expect(service.persistenceAvailable).toBe(false);
    // The in-memory session still advances even though nothing reached storage.
    expect(() => service.checkpoint(at(60))).not.toThrow();
    expect(platform.raw(SAVE_KEY)).toBeUndefined();
  });

  it("recovers to a persisted state once storage accepts writes again", () => {
    const platform = new FakePlatformAdapter();
    platform.saveShouldFail = true;
    const service = new LocalGameService(platform);
    service.initialize(START);
    expect(service.persistenceAvailable).toBe(false);

    platform.saveShouldFail = false;
    const recovered = service.checkpoint(at(60));

    expect(recovered.persisted).toBe(true);
    expect(service.persistenceAvailable).toBe(true);
    expect(platform.raw(SAVE_KEY)).toBeDefined();
  });
});
