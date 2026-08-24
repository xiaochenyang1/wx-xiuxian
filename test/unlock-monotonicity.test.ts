import {
  CAVE_UNLOCK_LEVEL,
  PARTNER_UNLOCK_LEVEL,
  TRIAL_TOWER_UNLOCK_LEVEL,
} from "@cultivation-diary/shared";
import { describe, expect, it, afterEach, vi } from "vitest";
import { refreshSnapshot } from "../assets/scripts/services/local-game-snapshot";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const START = new Date("2026-01-01T00:00:00.000Z");

type MutableSave = Record<string, any>;

afterEach(() => vi.useRealTimers());

/**
 * A save parked at `level` with an empty bar, which is the only self-consistent
 * way to move a character without replaying the whole climb. The clock is frozen
 * at the save's own timestamp so no mutation settles idle time on the way in.
 */
function saveAtLevel(
  level: number,
  mutate?: (save: MutableSave) => void,
): LocalGameService {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  const platform = new FakePlatformAdapter();
  const seeder = new LocalGameService(platform);
  seeder.initialize(START);
  const raw = platform.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected an initial save");
  const save = JSON.parse(raw) as MutableSave;
  save.snapshot.progress.level = level;
  save.snapshot.progress.experience = "0";
  save.snapshot.progress.status = "gaining";
  mutate?.(save);
  const reader = new FakePlatformAdapter();
  reader.seed(SAVE_KEY, save);
  const service = new LocalGameService(reader);
  expect(service.initialize(START).created).toBe(false);
  return service;
}

describe("unlock thresholds", () => {
  it("opens the three systems at their own levels rather than all at once", () => {
    expect([
      CAVE_UNLOCK_LEVEL,
      TRIAL_TOWER_UNLOCK_LEVEL,
      PARTNER_UNLOCK_LEVEL,
    ]).toEqual([11, 15, 20]);
    expect(CAVE_UNLOCK_LEVEL).toBeLessThan(TRIAL_TOWER_UNLOCK_LEVEL);
    expect(TRIAL_TOWER_UNLOCK_LEVEL).toBeLessThan(PARTNER_UNLOCK_LEVEL);
  });

  it("grants each entrance exactly at its threshold and not before", () => {
    expect(saveAtLevel(CAVE_UNLOCK_LEVEL - 1).snapshot.unlocks).toEqual({
      partner: false,
      cave: false,
      trialTower: false,
    });
    expect(saveAtLevel(CAVE_UNLOCK_LEVEL).snapshot.unlocks).toEqual({
      partner: false,
      cave: true,
      trialTower: false,
    });
    expect(saveAtLevel(TRIAL_TOWER_UNLOCK_LEVEL).snapshot.unlocks).toEqual({
      partner: false,
      cave: true,
      trialTower: true,
    });
    expect(saveAtLevel(PARTNER_UNLOCK_LEVEL).snapshot.unlocks).toEqual({
      partner: true,
      cave: true,
      trialTower: true,
    });
  });
});

describe("unlock monotonicity", () => {
  it("does not revoke a stored bit whose threshold has since risen", () => {
    // A Lv.15 save from the era when the partner opened at Lv.11: the bit is on
    // disk and below the new threshold, which is exactly the case that a derived
    // `unlocks` would have taken back on the next load.
    const service = saveAtLevel(15, (save) => {
      save.snapshot.unlocks = { partner: true, cave: true, trialTower: false };
    });

    expect(service.snapshot.progress.level).toBeLessThan(PARTNER_UNLOCK_LEVEL);
    expect(service.snapshot.unlocks).toEqual({
      partner: true,
      cave: true,
      trialTower: true,
    });
  });

  it("keeps a bonded partner's page reachable on a below-threshold save", () => {
    const service = saveAtLevel(15, (save) => {
      save.snapshot.unlocks = { partner: true, cave: true, trialTower: false };
      save.snapshot.partner = { partnerId: "jun_rulan", level: 3, bond: 40 };
    });

    expect(service.snapshot.unlocks.partner).toBe(true);
    expect(service.snapshot.partner.partnerId).toBe("jun_rulan");
    expect(service.snapshot.progress.experienceBonusBp).toBeGreaterThan(0);
  });

  it("survives repeated refreshes without any bit flickering off", () => {
    const stored = saveAtLevel(15, (save) => {
      save.snapshot.unlocks = { partner: true, cave: true, trialTower: false };
    }).snapshot;
    const once = refreshSnapshot(stored);
    const twice = refreshSnapshot(refreshSnapshot(once));

    expect(once.unlocks).toEqual(twice.unlocks);
    expect(twice.unlocks).toEqual({
      partner: true,
      cave: true,
      trialTower: true,
    });
  });

  it("still refuses a system whose bit was never stored and whose level is short", () => {
    const service = saveAtLevel(TRIAL_TOWER_UNLOCK_LEVEL);

    expect(service.snapshot.unlocks.partner).toBe(false);
    expect(() => service.choosePartner("jun_rulan")).toThrow(
      `Lv.${PARTNER_UNLOCK_LEVEL}`,
    );
  });
});
