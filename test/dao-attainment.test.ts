import {
  DAO_MAX_LEVEL,
  MAX_LEVEL,
  affordableDaoLevels,
  calculateDaoBonuses,
  calculateTotalPower,
  daoCumulativeCost,
  daoLevelCost,
  decimal,
  requiredExperienceForLevel,
  spendReserveOnDao,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { refreshSnapshot } from "../assets/scripts/services/local-game-snapshot";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date("2026-01-01T00:00:00.000Z");
const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
// Comfortably past the 819,103,077,163 a full ladder costs, and still a plain
// integer string: the save validator rejects exponent notation.
const BIG_RESERVE = "9".repeat(20);

type MutableSave = Record<string, any>;

afterEach(() => vi.useRealTimers());

/**
 * A save sitting at the version cap with `reserve` banked. Written through the
 * raw save rather than played forward: reaching Lv.1000 is 258 days of idling,
 * and the reserve accrues nowhere else.
 */
function cappedWith(reserve: string, daoLevel = 0, level = MAX_LEVEL): LocalGameService {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  const seeder = new FakePlatformAdapter();
  new LocalGameService(seeder).initialize(START);
  const raw = seeder.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected an initial save");
  const save = JSON.parse(raw) as MutableSave;
  save.savedAt = START.toISOString();
  save.snapshot.progress.settledAt = START.toISOString();
  save.snapshot.progress.level = level;
  save.snapshot.progress.experience = requiredExperienceForLevel(level);
  save.snapshot.progress.status = level === MAX_LEVEL ? "version_cap" : "breakthrough_ready";
  save.snapshot.progress.cultivationReserve = reserve;
  save.snapshot.dao = { level: daoLevel };
  save.snapshot.inventory.stacks = [];
  // Every milestone already claimed, so no task reward lands mid-assertion.
  save.snapshot.progressionTasks = save.snapshot.progressionTasks.map(
    (task: MutableSave) => ({
      ...task,
      progress: String(level),
      completedAt: START.toISOString(),
      claimedAt: START.toISOString(),
    }),
  );
  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  expect(service.initialize(START).created).toBe(false);
  return service;
}

describe("the dao cost curve", () => {
  it("pins the two ends of the ladder", () => {
    expect(DAO_MAX_LEVEL).toBe(50);
    expect(daoLevelCost(1)).toBe("1000000");
    expect(daoLevelCost(2)).toBe("1280000");
    expect(daoLevelCost(DAO_MAX_LEVEL)).toBe("179179579375");
    expect(daoCumulativeCost(0)).toBe("0");
    expect(daoCumulativeCost(DAO_MAX_LEVEL)).toBe("819103077163");
  });

  it("grows strictly and matches the closed form at every level", () => {
    let previous = decimal(0);
    let running = decimal(0);
    for (let level = 1; level <= DAO_MAX_LEVEL; level += 1) {
      const cost = decimal(daoLevelCost(level));
      expect(cost.greaterThan(previous)).toBe(true);
      // Rederived from the literals rather than read back from the config, so a
      // silent change to either constant fails here instead of passing.
      expect(cost.toFixed(0)).toBe(
        decimal(1_000_000)
          .times(decimal("1.28").pow(level - 1))
          .toDecimalPlaces(0, 2)
          .toFixed(0),
      );
      previous = cost;
      running = running.plus(cost);
      expect(daoCumulativeCost(level)).toBe(running.toFixed(0));
    }
  });

  it("rejects levels off the ladder", () => {
    expect(() => daoLevelCost(0)).toThrow(RangeError);
    expect(() => daoLevelCost(DAO_MAX_LEVEL + 1)).toThrow(RangeError);
    expect(() => daoLevelCost(1.5)).toThrow(RangeError);
    expect(() => daoCumulativeCost(-1)).toThrow(RangeError);
    expect(() => daoCumulativeCost(DAO_MAX_LEVEL + 1)).toThrow(RangeError);
  });
});

describe("dao bonuses", () => {
  it("pays nothing at level 0", () => {
    expect(calculateDaoBonuses({ level: 0 })).toEqual({
      powerBonusBp: 0,
      experienceBonusBp: 0,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
    });
  });

  it("pays three axes and never power", () => {
    expect(calculateDaoBonuses({ level: DAO_MAX_LEVEL })).toEqual({
      powerBonusBp: 0,
      experienceBonusBp: 7_500,
      spiritStoneBonusBp: 7_500,
      dropBonusBp: 5_000,
    });
    for (let level = 0; level <= DAO_MAX_LEVEL; level += 1) {
      expect(calculateDaoBonuses({ level }).powerBonusBp).toBe(0);
    }
  });

  it("scales linearly so the compounding experience axis still converges", () => {
    expect(calculateDaoBonuses({ level: 1 }).experienceBonusBp).toBe(150);
    expect(calculateDaoBonuses({ level: 25 }).experienceBonusBp).toBe(3_750);
    expect(calculateDaoBonuses({ level: 25 }).dropBonusBp).toBe(2_500);
  });

  it("rejects levels off the ladder", () => {
    expect(() => calculateDaoBonuses({ level: -1 })).toThrow(RangeError);
    expect(() => calculateDaoBonuses({ level: DAO_MAX_LEVEL + 1 })).toThrow(RangeError);
    expect(() => calculateDaoBonuses({ level: 2.5 })).toThrow(RangeError);
  });
});

describe("spending the reserve", () => {
  it("buys exactly what the reserve covers", () => {
    expect(
      affordableDaoLevels({ level: 0, cultivationReserve: "999999" }),
    ).toBe(0);
    expect(affordableDaoLevels({ level: 0, cultivationReserve: "1000000" })).toBe(1);
    expect(affordableDaoLevels({ level: 0, cultivationReserve: "2279999" })).toBe(1);
    expect(affordableDaoLevels({ level: 0, cultivationReserve: "2280000" })).toBe(2);
    expect(
      affordableDaoLevels({
        level: 0,
        cultivationReserve: daoCumulativeCost(DAO_MAX_LEVEL),
      }),
    ).toBe(DAO_MAX_LEVEL);
  });

  it("never reports more levels than the ladder has left", () => {
    expect(
      affordableDaoLevels({
        level: DAO_MAX_LEVEL,
        cultivationReserve: daoCumulativeCost(DAO_MAX_LEVEL),
      }),
    ).toBe(0);
    expect(
      affordableDaoLevels({ level: DAO_MAX_LEVEL - 1, cultivationReserve: BIG_RESERVE }),
    ).toBe(1);
  });

  it("leaves the exact change behind", () => {
    const bought = spendReserveOnDao({
      level: 0,
      cultivationReserve: "2280007",
      times: 2,
    });
    expect(bought).toEqual({
      level: 2,
      cultivationReserve: "7",
      spent: "2280000",
    });
  });

  it("buys all the levels or none of them", () => {
    // One short of the two-level bill: the whole call fails, so a caller can
    // never observe a partial purchase.
    expect(() =>
      spendReserveOnDao({ level: 0, cultivationReserve: "2279999", times: 2 }),
    ).toThrow(RangeError);
    expect(() =>
      spendReserveOnDao({ level: 0, cultivationReserve: "999999", times: 1 }),
    ).toThrow(RangeError);
  });

  it("refuses to walk off the top of the ladder", () => {
    expect(() =>
      spendReserveOnDao({
        level: DAO_MAX_LEVEL - 1,
        cultivationReserve: BIG_RESERVE,
        times: 2,
      }),
    ).toThrow(RangeError);
    expect(() =>
      spendReserveOnDao({ level: 0, cultivationReserve: BIG_RESERVE, times: 0 }),
    ).toThrow(RangeError);
  });
});

describe("dao bonuses in the snapshot", () => {
  it("moves the three income axes and leaves power untouched", () => {
    const bare = cappedWith("0", 0).snapshot;
    const enlightened = refreshSnapshot({ ...bare, dao: { level: DAO_MAX_LEVEL } });

    expect(enlightened.progress.experienceBonusBp - bare.progress.experienceBonusBp).toBe(
      7_500,
    );
    expect(
      enlightened.progress.spiritStoneBonusBp - bare.progress.spiritStoneBonusBp,
    ).toBe(7_500);
    expect(enlightened.progress.dropBonusBp - bare.progress.dropBonusBp).toBe(5_000);
    // The acceptance point for keeping 道行 out of the power model: the tower's
    // and the task chain's ladders are both derived from this number.
    expect(enlightened.progress.totalPower).toBe(bare.progress.totalPower);
    expect(enlightened.progress.loadoutPowerBonusBp).toBe(
      bare.progress.loadoutPowerBonusBp,
    );
    expect(enlightened.progress.totalPower).toBe(calculateTotalPower(MAX_LEVEL));
  });
});

describe("cultivating the dao", () => {
  it("spends the reserve and raises the level", () => {
    const service = cappedWith("2280000");
    const result = service.cultivateDao(2);

    expect(result.message).toBe("道行提升至 Lv.2");
    expect(result.snapshot.dao.level).toBe(2);
    expect(result.snapshot.progress.cultivationReserve).toBe("0");
    expect(result.snapshot.progress.experienceBonusBp).toBe(300);
  });

  it("caps a batch at the top of the ladder instead of failing", () => {
    const service = cappedWith(daoCumulativeCost(DAO_MAX_LEVEL), DAO_MAX_LEVEL - 1);
    const result = service.cultivateDao(DAO_MAX_LEVEL);

    expect(result.snapshot.dao.level).toBe(DAO_MAX_LEVEL);
    expect(result.snapshot.progress.cultivationReserve).toBe(
      decimal(daoCumulativeCost(DAO_MAX_LEVEL))
        .minus(daoLevelCost(DAO_MAX_LEVEL))
        .toFixed(0),
    );
  });

  it("reports the shortfall and spends nothing", () => {
    const service = cappedWith("999999");
    expect(() => service.cultivateDao()).toThrow("修为储备不足，还需 1");
    expect(service.snapshot.dao.level).toBe(0);
    expect(service.snapshot.progress.cultivationReserve).toBe("999999");
  });

  it("refuses at full attainment", () => {
    const service = cappedWith(BIG_RESERVE, DAO_MAX_LEVEL);
    expect(() => service.cultivateDao()).toThrow("道行已至圆满");
  });

  it("refuses before the level cap, where the reserve cannot exist", () => {
    const service = cappedWith(BIG_RESERVE, 0, 900);
    expect(() => service.cultivateDao()).toThrow("修为储备只在等级封顶后积累");
  });
});
