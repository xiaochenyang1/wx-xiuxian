import {
  NEWCOMER_REACH_LEVEL_8_TASK_ID,
  countOccupiedBagSlots,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date("2026-01-01T00:00:00.000Z");
const DAY_SECONDS = 86_400;
const SEED = 20_260_101;

type MutableSave = Record<string, any>;

afterEach(() => vi.useRealTimers());

function freshService(): LocalGameService {
  const service = new LocalGameService(new FakePlatformAdapter());
  service.initialize(START);
  return service;
}

/** Simulate a full day of idle time under a fixed drop seed. */
function simulateDay(seed = SEED, seconds = DAY_SECONDS): LocalGameService {
  const service = freshService();
  service.debugSimulateOffline(seconds, seed);
  return service;
}

function fullEquipmentBag(): {
  service: LocalGameService;
  platform: FakePlatformAdapter;
} {
  const platform = new FakePlatformAdapter();
  const writer = new LocalGameService(platform);
  writer.initialize(START);
  const raw = platform.raw(CLIENT_CONFIG.localSaveStorageKey);
  if (raw === undefined) throw new Error("expected a persisted save");
  const save = JSON.parse(raw) as MutableSave;
  save.savedAt = START.toISOString();
  save.snapshot.progress.settledAt = START.toISOString();
  save.snapshot.inventory = { bagCapacity: 50, stacks: [] };
  save.snapshot.equipment = Array.from({ length: 50 }, (_, index) => ({
    id: `full-bag-${index}`,
    equipmentConfigId: "ironwood_sword",
    displayName: "玄木剑",
    quality: "common",
    slot: "weapon",
    powerBonusBp: 0,
    enhanceLevel: 0,
    rolledAffixes: [],
    location: "bag",
    equippedSlot: null,
    isLocked: false,
    configVersion: "local-idle-drop-v1",
  }));
  platform.seed(CLIENT_CONFIG.localSaveStorageKey, save);
  const service = new LocalGameService(platform);
  expect(service.initialize(START).created).toBe(false);
  expect(countOccupiedBagSlots(service.snapshot)).toBe(50);
  return { service, platform };
}

describe("seeded drop determinism", () => {
  it("produces an identical result for the same seed", () => {
    const first = simulateDay();
    const second = simulateDay();

    const a = first.snapshot;
    const b = second.snapshot;

    expect(b.harvestChest.entries.map((entry) => entry.assetConfigId)).toEqual(
      a.harvestChest.entries.map((entry) => entry.assetConfigId),
    );
    expect(b.harvestChest.pendingCount).toBe(a.harvestChest.pendingCount);
    expect(b.inventory.stacks).toEqual(a.inventory.stacks);
    expect(b.wallet.spiritStone).toBe(a.wallet.spiritStone);
    expect(b.offlineSettlement?.drops).toEqual(a.offlineSettlement?.drops);
  });

  it("produces a different result for a different seed", () => {
    const a = simulateDay(1).snapshot.offlineSettlement;
    const b = simulateDay(2).snapshot.offlineSettlement;

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(JSON.stringify(b!.drops)).not.toBe(JSON.stringify(a!.drops));
  });

  it("rejects a seed outside the 32-bit unsigned range", () => {
    expect(() => freshService().debugSimulateOffline(60, -1)).toThrow();
    expect(() => freshService().debugSimulateOffline(60, 2 ** 32)).toThrow();
    expect(() => freshService().debugSimulateOffline(60, 1.5)).toThrow();
  });

  it("rejects a simulated duration outside one second to one day", () => {
    expect(() => freshService().debugSimulateOffline(0, SEED)).toThrow();
    expect(() => freshService().debugSimulateOffline(DAY_SECONDS + 1, SEED)).toThrow();
  });
});

describe("drop clock", () => {
  it("awards no drop attempts below one minute of effective time", () => {
    const service = freshService();
    const before = service.snapshot;

    // Under the 60s notice floor no summary is surfaced, so assert on the
    // snapshot itself: 30s at 70% efficiency cannot fill a one-minute clock.
    service.debugSimulateOffline(30, SEED);

    expect(service.snapshot.offlineSettlement).toBeNull();
    expect(service.snapshot.harvestChest.entries).toEqual(
      before.harvestChest.entries,
    );
    expect(service.snapshot.inventory.stacks).toEqual(before.inventory.stacks);
  });

  it("scales attempts with effective time, not wall-clock time", () => {
    const service = freshService();
    // 70% offline efficiency means an hour of absence buys 42 minutes of clock.
    service.debugSimulateOffline(3_600, SEED);

    expect(service.snapshot.offlineSettlement?.dropAttempts).toBe(42);
  });

  it("keeps the sub-minute remainder so attempts do not drift", () => {
    const stepwise = freshService();
    for (let index = 0; index < 60; index += 1) {
      stepwise.debugSimulateOffline(60, SEED);
    }
    const stepwiseAttempts = countAttempts(stepwise, 60, 60);

    const single = freshService();
    single.debugSimulateOffline(3_600, SEED);

    expect(stepwiseAttempts).toBe(single.snapshot.offlineSettlement!.dropAttempts);
  });
});

/** Replay the same schedule while summing every reported attempt count. */
function countAttempts(
  _service: LocalGameService,
  chunkSeconds: number,
  chunks: number,
): number {
  const replay = freshService();
  let total = 0;
  for (let index = 0; index < chunks; index += 1) {
    total += replay.debugSimulateOffline(chunkSeconds, SEED).snapshot.offlineSettlement!
      .dropAttempts;
  }
  return total;
}

describe("harvest chest capacity", () => {
  it("never exceeds its hundred-entry capacity across repeated idle days", () => {
    const service = freshService();
    for (let day = 0; day < 30; day += 1) {
      service.debugSimulateOffline(DAY_SECONDS, SEED + day);
      expect(service.snapshot.harvestChest.entries.length).toBeLessThanOrEqual(100);
    }
  });

  it("keeps pendingCount in step with the stored entries", () => {
    const service = freshService();
    for (let day = 0; day < 10; day += 1) {
      service.debugSimulateOffline(DAY_SECONDS, SEED + day);
      expect(service.snapshot.harvestChest.pendingCount).toBe(
        service.snapshot.harvestChest.entries.length,
      );
    }
  });

  it("converts overflow into spirit stones instead of dropping it silently", () => {
    const service = freshService();
    let sawAutoSalvage = false;
    for (let day = 0; day < 30 && !sawAutoSalvage; day += 1) {
      const result = service.debugSimulateOffline(DAY_SECONDS, SEED + day);
      const summary = result.snapshot.offlineSettlement!.drops;
      if (summary.autoSalvagedCount > 0) {
        sawAutoSalvage = true;
        expect(Number(summary.autoSalvageSpiritStone)).toBeGreaterThan(0);
      }
    }
    expect(sawAutoSalvage).toBe(true);
  });
});

describe("drop results stay persistable", () => {
  it("keeps a save reloadable after a month of accumulated drops", () => {
    const platform = new FakePlatformAdapter();
    const service = new LocalGameService(platform);
    service.initialize(START);
    for (let day = 0; day < 30; day += 1) {
      service.debugSimulateOffline(DAY_SECONDS, SEED + day);
    }
    const before = service.snapshot;

    const reloaded = new LocalGameService(platform);
    const result = reloaded.initialize(new Date(START.getTime() + DAY_SECONDS * 1_000));

    expect(result.created).toBe(false);
    expect(reloaded.snapshot.harvestChest.entries).toEqual(before.harvestChest.entries);
    expect(reloaded.snapshot.inventory.stacks).toEqual(before.inventory.stacks);
    expect(reloaded.snapshot.equipment).toEqual(before.equipment);
    expect(reloaded.snapshot.techniques).toEqual(before.techniques);
  });

  it("holds the bag within its capacity while stacks accumulate", () => {
    const service = freshService();
    for (let day = 0; day < 30; day += 1) {
      service.debugSimulateOffline(DAY_SECONDS, SEED + day);
      expect(service.snapshot.inventory.stacks.length).toBeLessThanOrEqual(
        service.snapshot.inventory.bagCapacity,
      );
    }
  });

  it("compensates a new stack from seed 0 instead of writing a 51-slot save", () => {
    const { service, platform } = fullEquipmentBag();
    const accountId = service.snapshot.account.id;

    const result = service.debugSimulateOffline(86, 0);
    const summary = result.snapshot.offlineSettlement!.drops;

    expect(countOccupiedBagSlots(service.snapshot)).toBe(50);
    expect(service.snapshot.inventory.stacks).toEqual([]);
    expect(summary.stackItems).toEqual([]);
    expect(summary.autoSalvagedCount).toBeGreaterThan(0);
    expect(summary.autoSalvageSpiritStone).toBe(
      String(summary.autoSalvagedCount * 100),
    );
    expect(service.snapshot.wallet.lifetimeSpiritStoneEarned).toBe(
      service.snapshot.wallet.spiritStone,
    );

    const reloaded = new LocalGameService(platform);
    const load = reloaded.initialize(new Date(service.savedAt));
    expect(load.created).toBe(false);
    expect(reloaded.snapshot.account.id).toBe(accountId);
    expect(countOccupiedBagSlots(reloaded.snapshot)).toBe(50);
  });
});

describe("automatic and debug stack rewards at full capacity", () => {
  it("keeps the level 8 pill pending, then grants it once space is available", () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    const { service, platform } = fullEquipmentBag();

    for (let level = 1; level < 8; level += 1) {
      service.debugGrant("fill_experience");
    }

    const pendingTask = service.snapshot.progressionTasks.find(
      (task) => task.taskConfigId === NEWCOMER_REACH_LEVEL_8_TASK_ID,
    );
    expect(pendingTask).toBeDefined();
    expect(service.snapshot.progress.level).toBe(8);
    expect(countOccupiedBagSlots(service.snapshot)).toBe(50);
    expect(
      service.snapshot.inventory.stacks.some(
        (stack) => stack.itemConfigId === "breakthrough_pill",
      ),
    ).toBe(false);
    expect(pendingTask!.completedAt).not.toBeNull();
    expect(pendingTask!.claimedAt).toBeNull();

    const reloaded = new LocalGameService(platform);
    expect(reloaded.initialize(START).created).toBe(false);
    reloaded.debugGrant("spirit_stone");
    reloaded.expandInventory();
    reloaded.checkpoint(new Date(START.getTime() + 1_000));

    const claimedTask = reloaded.snapshot.progressionTasks.find(
      (task) => task.taskConfigId === NEWCOMER_REACH_LEVEL_8_TASK_ID,
    );
    expect(claimedTask).toBeDefined();
    expect(
      reloaded.snapshot.inventory.stacks.find(
        (stack) => stack.itemConfigId === "breakthrough_pill",
      )?.quantity,
    ).toBe("1");
    expect(claimedTask!.claimedAt).not.toBeNull();
    reloaded.checkpoint(new Date(START.getTime() + 2_000));
    expect(
      reloaded.snapshot.inventory.stacks.find(
        (stack) => stack.itemConfigId === "breakthrough_pill",
      )?.quantity,
    ).toBe("1");
  });

  it("rejects a debug pill grant without corrupting the full save", () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    const { service, platform } = fullEquipmentBag();

    expect(() => service.debugGrant("breakthrough_pill")).toThrow(
      "行囊空间不足",
    );
    expect(countOccupiedBagSlots(service.snapshot)).toBe(50);
    expect(service.snapshot.inventory.stacks).toEqual([]);

    const reloaded = new LocalGameService(platform);
    expect(reloaded.initialize(START).created).toBe(false);
    expect(countOccupiedBagSlots(reloaded.snapshot)).toBe(50);
  });
});
