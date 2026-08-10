import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");
/** Seed 1 drops a technique carrying an experience bonus within one idle day. */
const SEED = 1;

/**
 * A percentage bonus makes the derived per-second rates fractional. These are
 * the only two snapshot values that are not whole numbers, and a save carrying
 * them has to survive a reload — otherwise equipping a technique silently
 * wipes the player's progress on next launch.
 */
function serviceWithBonus(): { platform: FakePlatformAdapter; saved: any } {
  const platform = new FakePlatformAdapter();
  const service = new LocalGameService(platform);
  service.initialize(START);
  service.debugSimulateOffline(86_400, SEED);
  const technique = service.snapshot.harvestChest.entries.find(
    (entry) => entry.entryType === "technique",
  );
  if (!technique) throw new Error("expected the seeded day to drop a technique");
  service.transferHarvest(technique.id);
  service.equipTechnique(service.snapshot.techniques[0]!.techniqueConfigId);
  const raw = platform.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected a persisted save");
  return { platform, saved: JSON.parse(raw) };
}

function reloadCreated(saved: unknown, savedAt: string): boolean {
  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, saved);
  const service = new LocalGameService(platform);
  return service.initialize(new Date(new Date(savedAt).getTime() + 60_000)).created;
}

describe("fractional cultivation rates survive a reload", () => {
  it("produces a fractional rate once a percentage bonus applies", () => {
    const { saved } = serviceWithBonus();

    expect(saved.snapshot.progress.experienceBonusBp).toBeGreaterThan(0);
    expect(saved.snapshot.progress.experiencePerSecond).toContain(".");
  });

  it("reloads a save whose rates are fractional", () => {
    const { saved } = serviceWithBonus();

    expect(reloadCreated(saved, saved.savedAt)).toBe(false);
  });

  it("keeps the equipped technique and its bonus after the reload", () => {
    const { platform, saved } = serviceWithBonus();

    const reloaded = new LocalGameService(platform);
    reloaded.initialize(new Date(new Date(saved.savedAt).getTime() + 60_000));

    expect(reloaded.snapshot.techniques).toHaveLength(1);
    expect(reloaded.snapshot.techniques[0]!.equippedSlot).not.toBeNull();
    expect(reloaded.snapshot.progress.experienceBonusBp).toBe(
      saved.snapshot.progress.experienceBonusBp,
    );
  });

  it("still rejects rates that are not numeric at all", () => {
    const { saved } = serviceWithBonus();

    for (const bad of ["abc", "1e9", "-10.5", "10..5", "10.", ".5", "10.5.5"]) {
      const tampered = JSON.parse(JSON.stringify(saved));
      tampered.snapshot.progress.experiencePerSecond = bad;
      expect(reloadCreated(tampered, saved.savedAt)).toBe(true);
    }
  });

  it("still requires whole numbers for stored balances", () => {
    const { saved } = serviceWithBonus();

    const wallet = JSON.parse(JSON.stringify(saved));
    wallet.snapshot.wallet.spiritStone = "100.5";
    expect(reloadCreated(wallet, saved.savedAt)).toBe(true);

    const experience = JSON.parse(JSON.stringify(saved));
    experience.snapshot.progress.experience = "10.5";
    expect(reloadCreated(experience, saved.savedAt)).toBe(true);

    const power = JSON.parse(JSON.stringify(saved));
    power.snapshot.progress.totalPower = "2200.5";
    expect(reloadCreated(power, saved.savedAt)).toBe(true);
  });
});
