import {
  BASIS_POINTS,
  DAILY_CHECK_IN_JADE,
  DAILY_IMMORTAL_JADE_TOTAL,
  DAILY_LOOP_UNLOCK_LEVEL,
  DAILY_TASK_CONFIGS,
  DAILY_TASK_JADE,
  IMMORTAL_JADE_MINUTES_PER_UNIT,
  IMMORTAL_JADE_SHOP_ROWS,
  NEVER_ROLLED_DAY_INDEX,
  countPendingDailyRewards,
  createDailyState,
  getDailyTaskConfig,
  getImmortalJadeShopRow,
  getItemConfig,
  immortalJadeCostForMinutes,
  isDailyTaskClaimable,
  localDayIndex,
  rollDailyState,
  type DailyState,
  type DailyTaskState,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import {
  getDailyCheckInDisplay,
  getDailyTaskDisplay,
  getImmortalJadeShopDisplay,
} from "../assets/scripts/core/DailyDisplay";
import {
  LocalGameError,
  LocalGameService,
} from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
/**
 * A *local* 06:00, not a UTC instant: every span this file settles has to stay
 * inside one local calendar day in whatever timezone the suite runs in, and
 * "04:00Z plus six hours" crosses midnight at UTC+14.
 */
const NOW = new Date(2026, 7, 13, 6, 0, 0, 0);
const HOUR = 3_600_000;
const HARVEST_ENTRY_ID = "00000000-0000-4000-8000-000000000501";

type MutableSave = Record<string, any>;

afterEach(() => {
  vi.useRealTimers();
});

/**
 * A save parked at the unlock level with `settledAt` exactly at `NOW`, so the
 * load that follows settles nothing and every idle second in a test comes from a
 * span the test itself advances. Fake timers are on because each mutation
 * settles against `new Date()` before it runs.
 */
function seededService(mutate: (save: MutableSave) => void = () => {}): {
  service: LocalGameService;
  platform: FakePlatformAdapter;
} {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const platform = new FakePlatformAdapter();
  const initial = new LocalGameService(platform);
  initial.initialize(NOW);
  const raw = platform.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected an initial save");
  const save = JSON.parse(raw) as MutableSave;
  save.snapshot.progress.level = DAILY_LOOP_UNLOCK_LEVEL;
  save.snapshot.progress.experience = "0";
  save.snapshot.progress.status = "gaining";
  mutate(save);
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  expect(service.initialize(NOW).created).toBe(false);
  return { service, platform };
}

/** Enough spirit stone and material for one brew, one forge and one harvest. */
function readyToAct(save: MutableSave): void {
  save.snapshot.wallet.spiritStone = "50000";
  setStack(save, "spiritual_herb", "灵草", 20);
  setStack(save, "spiritual_soil", "灵土", 20);
  setStack(save, "wood", "木材", 20);
  setStack(save, "ore", "矿石", 20);
  save.snapshot.harvestChest = {
    pendingCount: 1,
    entries: [harvestTechnique(HARVEST_ENTRY_ID)],
  };
}

function setStack(
  save: MutableSave,
  itemConfigId: string,
  displayName: string,
  quantity: number,
): void {
  save.snapshot.inventory.stacks.push({
    itemConfigId,
    displayName,
    quantity: String(quantity),
  });
}

/** A technique entry, so handling it needs no equipment instance to match. */
function harvestTechnique(id: string): MutableSave {
  return {
    id,
    entryType: "technique",
    equipmentInstanceId: null,
    techniqueConfigId: "quiet_breathing_art",
    assetConfigId: "quiet_breathing_art",
    displayName: "静息诀",
    quality: "common",
    valueScore: "100",
    acquiredAt: NOW.toISOString(),
  };
}

function bagEquipment(index: number): MutableSave {
  return {
    id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
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
  };
}

function taskState(service: LocalGameService, id: string): DailyTaskState {
  const state = service.snapshot.daily.tasks.find(
    (task) => task.taskConfigId === id,
  );
  if (!state) throw new Error(`expected a daily task row: ${id}`);
  return state;
}

function quantityOf(service: LocalGameService, itemConfigId: string): string {
  return (
    service.snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === itemConfigId,
    )?.quantity ?? "0"
  );
}

/** Advances both the fake clock and the save's settlement to `NOW + hours`. */
function idleFor(service: LocalGameService, hours: number): void {
  const at = new Date(NOW.getTime() + hours * HOUR);
  vi.setSystemTime(at);
  service.checkpoint(at);
}

describe("daily jade budget", () => {
  it("hands back exactly the online time a capped offline day loses", () => {
    // Both sides read from config. Writing the 25,920 seconds down would let the
    // budget drift the moment someone changed the offline efficiency.
    const compensatedSeconds =
      DAILY_IMMORTAL_JADE_TOTAL * IMMORTAL_JADE_MINUTES_PER_UNIT * 60;
    const lostSeconds =
      (CLIENT_CONFIG.maxOfflineSeconds *
        (BASIS_POINTS - CLIENT_CONFIG.offlineEfficiencyBp)) /
      BASIS_POINTS;

    expect(compensatedSeconds).toBe(lostSeconds);
  });

  it("splits the total into the check-in and five equal tasks", () => {
    expect(DAILY_TASK_CONFIGS).toHaveLength(5);
    expect(DAILY_TASK_CONFIGS.map((config) => config.jade)).toEqual(
      DAILY_TASK_CONFIGS.map(() => DAILY_TASK_JADE),
    );
    expect(DAILY_IMMORTAL_JADE_TOTAL).toBe(
      DAILY_CHECK_IN_JADE +
        DAILY_TASK_CONFIGS.reduce((total, config) => total + config.jade, 0),
    );
  });

  it("prices every time-budget row at the duration it simulates", () => {
    const priced = IMMORTAL_JADE_SHOP_ROWS.filter(
      (row) => row.countsTowardTimeBudget,
    );
    expect(priced).not.toHaveLength(0);
    for (const row of priced) {
      const durationSeconds =
        getItemConfig(row.itemConfigId).useEffect?.durationSeconds;
      expect(durationSeconds).toBeDefined();
      expect(row.jadeCost).toBe(
        immortalJadeCostForMinutes((durationSeconds ?? 0) / 60) * row.quantity,
      );
    }
    // 改名卡 is the only sink outside the criterion, so it is the only row that
    // may opt out of the derivation above (§6 of the design).
    expect(
      IMMORTAL_JADE_SHOP_ROWS.filter((row) => !row.countsTowardTimeBudget).map(
        (row) => row.id,
      ),
    ).toEqual(["jade.rename_card"]);
  });
});

describe("localDayIndex", () => {
  it("gives one index to a whole local day", () => {
    const midnight = new Date(2026, 7, 13, 0, 0, 0, 0);
    expect(localDayIndex(new Date(2026, 7, 13, 12, 0, 0, 0))).toBe(
      localDayIndex(midnight),
    );
    expect(localDayIndex(new Date(2026, 7, 13, 23, 59, 59, 999))).toBe(
      localDayIndex(midnight),
    );
  });

  it("moves by one across local midnight, a month and a year", () => {
    const midnight = new Date(2026, 7, 13, 0, 0, 0, 0);
    expect(
      localDayIndex(midnight) - localDayIndex(new Date(midnight.getTime() - 1)),
    ).toBe(1);
    expect(
      localDayIndex(new Date(2026, 8, 1, 0, 30, 0, 0)) -
        localDayIndex(new Date(2026, 7, 31, 23, 30, 0, 0)),
    ).toBe(1);
    expect(
      localDayIndex(new Date(2027, 0, 1, 0, 30, 0, 0)) -
        localDayIndex(new Date(2026, 11, 31, 23, 30, 0, 0)),
    ).toBe(1);
  });

  it("refuses an invalid date rather than returning NaN", () => {
    expect(() => localDayIndex(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe("rollDailyState", () => {
  it("returns the very same object when the day has not changed", () => {
    const state = createDailyState(localDayIndex(NOW));
    expect(rollDailyState(state, localDayIndex(NOW))).toBe(state);
  });

  it("clears the day but keeps the lifetime check-in count", () => {
    const state: DailyState = {
      dayIndex: localDayIndex(NOW),
      checkedInAt: NOW.toISOString(),
      checkInCount: 7,
      tasks: [
        {
          taskConfigId: "daily.idle_hour",
          progress: "3600",
          claimedAt: NOW.toISOString(),
        },
      ],
    };

    const rolled = rollDailyState(state, localDayIndex(NOW) + 1);

    expect(rolled.dayIndex).toBe(localDayIndex(NOW) + 1);
    expect(rolled.checkedInAt).toBeNull();
    expect(rolled.checkInCount).toBe(7);
    expect(rolled.tasks.map((task) => task.progress)).toEqual(
      DAILY_TASK_CONFIGS.map(() => "0"),
    );
    expect(rolled.tasks.every((task) => task.claimedAt === null)).toBe(true);
  });

  it("always builds the rows for a never-rolled save", () => {
    const migrated: DailyState = {
      dayIndex: NEVER_ROLLED_DAY_INDEX,
      checkedInAt: null,
      checkInCount: 0,
      tasks: [],
    };

    const rolled = rollDailyState(migrated, localDayIndex(NOW));

    expect(rolled.tasks.map((task) => task.taskConfigId)).toEqual(
      DAILY_TASK_CONFIGS.map((config) => config.id),
    );
  });
});

describe("daily check-in", () => {
  it("stays shut one level below the unlock", () => {
    const { service } = seededService((save) => {
      save.snapshot.progress.level = DAILY_LOOP_UNLOCK_LEVEL - 1;
    });

    expect(() => service.checkInDaily()).toThrow(
      new LocalGameError(`修为达到 Lv.${DAILY_LOOP_UNLOCK_LEVEL} 才能开启日常`),
    );
    expect(service.snapshot.wallet.immortalJade).toBe("0");
  });

  it("pays once a day and refuses the second tap", () => {
    const { service } = seededService();

    const result = service.checkInDaily();

    expect(result.snapshot.wallet.immortalJade).toBe(String(DAILY_CHECK_IN_JADE));
    expect(result.snapshot.daily.checkInCount).toBe(1);
    expect(result.message).toBe(`签到成功，获得仙玉 ${DAILY_CHECK_IN_JADE}`);
    expect(() => service.checkInDaily()).toThrow(
      new LocalGameError("今日已经签到"),
    );
    expect(service.snapshot.wallet.immortalJade).toBe(String(DAILY_CHECK_IN_JADE));
  });

  it("opens again after a local midnight and keeps counting days", () => {
    const { service } = seededService();
    service.checkInDaily();

    idleFor(service, 24);

    expect(service.snapshot.daily.checkedInAt).toBeNull();
    const result = service.checkInDaily();
    expect(result.snapshot.daily.checkInCount).toBe(2);
    expect(result.snapshot.wallet.immortalJade).toBe(
      String(DAILY_CHECK_IN_JADE * 2),
    );
  });
});

describe("daily tasks", () => {
  it("credits one brew and pays for it exactly once", () => {
    const { service } = seededService(readyToAct);

    service.brewAlchemy("small_experience_pill");

    expect(taskState(service, "daily.alchemy").progress).toBe("1");
    const result = service.claimDailyTask("daily.alchemy");
    expect(result.snapshot.wallet.immortalJade).toBe(String(DAILY_TASK_JADE));
    expect(result.message).toBe(
      `${getDailyTaskConfig("daily.alchemy").title}完成，获得仙玉 ${DAILY_TASK_JADE}`,
    );
    expect(() => service.claimDailyTask("daily.alchemy")).toThrow(
      new LocalGameError("该日常今日已领取"),
    );
    expect(service.snapshot.wallet.immortalJade).toBe(String(DAILY_TASK_JADE));
  });

  it("credits one forge", () => {
    const { service } = seededService(readyToAct);

    service.craftEquipment("forge_weapon");

    expect(taskState(service, "daily.crafting").progress).toBe("1");
    expect(
      service.claimDailyTask("daily.crafting").snapshot.wallet.immortalJade,
    ).toBe(String(DAILY_TASK_JADE));
  });

  it("credits one handled harvest", () => {
    const { service } = seededService(readyToAct);

    service.transferHarvest(HARVEST_ENTRY_ID);

    expect(taskState(service, "daily.harvest").progress).toBe("1");
    expect(
      service.claimDailyTask("daily.harvest").snapshot.wallet.immortalJade,
    ).toBe(String(DAILY_TASK_JADE));
  });

  it("refuses an unfinished row, an unknown id and a row today does not carry", () => {
    const { service } = seededService((save) => {
      save.snapshot.daily.tasks = save.snapshot.daily.tasks.filter(
        (task: MutableSave) => task.taskConfigId !== "daily.harvest",
      );
    });

    expect(() => service.claimDailyTask("daily.alchemy")).toThrow(
      new LocalGameError(`${getDailyTaskConfig("daily.alchemy").title}尚未完成`),
    );
    expect(() => service.claimDailyTask("daily.nope")).toThrow(
      new LocalGameError("未知的日常任务"),
    );
    expect(() => service.claimDailyTask("daily.harvest")).toThrow(
      new LocalGameError("该日常任务今日尚未开启"),
    );
    expect(service.snapshot.wallet.immortalJade).toBe("0");
  });
});

describe("idle daily rows", () => {
  it("advances both thresholds off one counter", () => {
    const { service } = seededService();

    idleFor(service, 1);

    // One counter, two thresholds: the hour is full and clamped there while the
    // six-hour row holds the same 3,600 seconds against its own target.
    expect(taskState(service, "daily.idle_hour").progress).toBe("3600");
    expect(taskState(service, "daily.idle_six_hours").progress).toBe("3600");
    expect(isDailyTaskClaimable(taskState(service, "daily.idle_hour"))).toBe(true);
    expect(isDailyTaskClaimable(taskState(service, "daily.idle_six_hours"))).toBe(
      false,
    );
    expect(() => service.claimDailyTask("daily.idle_six_hours")).toThrow(
      new LocalGameError(
        `${getDailyTaskConfig("daily.idle_six_hours").title}尚未完成`,
      ),
    );

    idleFor(service, 6);

    expect(taskState(service, "daily.idle_six_hours").progress).toBe("21600");
    expect(
      service.claimDailyTask("daily.idle_six_hours").snapshot.wallet
        .immortalJade,
    ).toBe(String(DAILY_TASK_JADE));
    expect(
      service.claimDailyTask("daily.idle_hour").snapshot.wallet.immortalJade,
    ).toBe(String(DAILY_TASK_JADE * 2));
  });
});

describe("immortal jade exchange", () => {
  it("turns a day's jade into one large experience pill", () => {
    const row = getImmortalJadeShopRow("jade.exp_pill_large");
    const { service } = seededService((save) => {
      save.snapshot.wallet.immortalJade = String(row.jadeCost);
    });

    const result = service.exchangeImmortalJade(row.id);

    expect(result.snapshot.wallet.immortalJade).toBe("0");
    expect(quantityOf(service, "exp_pill_large")).toBe(String(row.quantity));
    expect(result.message).toBe(
      `兑换 经验丹（大） x${row.quantity}，消耗仙玉 ${row.jadeCost}`,
    );
  });

  it("names the shortfall when one jade short", () => {
    const row = getImmortalJadeShopRow("jade.exp_pill_large");
    const { service } = seededService((save) => {
      save.snapshot.wallet.immortalJade = String(row.jadeCost - 1);
    });

    expect(() => service.exchangeImmortalJade(row.id)).toThrow(
      new LocalGameError("仙玉不足，还需 1 枚"),
    );
    expect(service.snapshot.wallet.immortalJade).toBe(String(row.jadeCost - 1));
  });

  it("rejects an unknown row and a full bag without spending jade", () => {
    const row = getImmortalJadeShopRow("jade.exp_pill_large");
    const { service } = seededService((save) => {
      save.snapshot.wallet.immortalJade = String(row.jadeCost);
      save.snapshot.equipment = Array.from(
        { length: save.snapshot.inventory.bagCapacity },
        (_unused, index) => bagEquipment(index + 1),
      );
    });

    expect(() => service.exchangeImmortalJade("jade.nope")).toThrow(
      new LocalGameError("未知的仙玉兑换项"),
    );
    expect(() => service.exchangeImmortalJade(row.id)).toThrow(
      new LocalGameError("行囊空间不足，无法兑换"),
    );
    expect(service.snapshot.wallet.immortalJade).toBe(String(row.jadeCost));
    expect(quantityOf(service, "exp_pill_large")).toBe("0");
  });
});

describe("a day's ceiling", () => {
  it("pays the daily total once and nothing on a second sweep", () => {
    const { service } = seededService(readyToAct);

    service.checkInDaily();
    service.brewAlchemy("small_experience_pill");
    service.craftEquipment("forge_weapon");
    service.transferHarvest(HARVEST_ENTRY_ID);
    idleFor(service, 6);
    for (const config of DAILY_TASK_CONFIGS) service.claimDailyTask(config.id);

    expect(service.snapshot.wallet.immortalJade).toBe(
      String(DAILY_IMMORTAL_JADE_TOTAL),
    );
    // Pinned, because the whole design hangs off this number being 72 (§3.1).
    expect(DAILY_IMMORTAL_JADE_TOTAL).toBe(72);

    for (const config of DAILY_TASK_CONFIGS) {
      expect(() => service.claimDailyTask(config.id)).toThrow(
        new LocalGameError("该日常今日已领取"),
      );
    }
    expect(() => service.checkInDaily()).toThrow(
      new LocalGameError("今日已经签到"),
    );
    expect(service.snapshot.wallet.immortalJade).toBe(
      String(DAILY_IMMORTAL_JADE_TOTAL),
    );
  });
});

describe("the rail badge", () => {
  it("counts the check-in plus every completed row still unclaimed", () => {
    const { service } = seededService(readyToAct);

    // One on a fresh day, not six: the badge counts what can be tapped right
    // now, and five untouched rows are not rewards waiting (§10.1).
    expect(countPendingDailyRewards(service.snapshot.daily)).toBe(1);

    service.checkInDaily();
    expect(countPendingDailyRewards(service.snapshot.daily)).toBe(0);

    service.brewAlchemy("small_experience_pill");
    service.craftEquipment("forge_weapon");
    service.transferHarvest(HARVEST_ENTRY_ID);
    idleFor(service, 6);
    expect(countPendingDailyRewards(service.snapshot.daily)).toBe(
      DAILY_TASK_CONFIGS.length,
    );

    for (const config of DAILY_TASK_CONFIGS) service.claimDailyTask(config.id);
    expect(countPendingDailyRewards(service.snapshot.daily)).toBe(0);
  });
});

describe("daily panel copy", () => {
  it("prints the header and the check-in row on both sides of a tap", () => {
    const { service } = seededService();

    const before = getDailyCheckInDisplay(service.snapshot);
    expect(before.headerText).toBe("仙玉 0 · 累计签到 0 天");
    expect(before.description).toBe("每日首次登录即可领取");
    expect(before.buttonText).toBe("签到 12");
    expect(before.canCheckIn).toBe(true);
    expect(before.lockedText).toBeNull();

    service.checkInDaily();

    const after = getDailyCheckInDisplay(service.snapshot);
    expect(after.headerText).toBe("仙玉 12 · 累计签到 1 天");
    expect(after.description).toBe("今日已签到");
    expect(after.buttonText).toBe("今日已签到");
    expect(after.canCheckIn).toBe(false);
  });

  it("spells out the lock below the unlock level", () => {
    const { service } = seededService((save) => {
      save.snapshot.progress.level = DAILY_LOOP_UNLOCK_LEVEL - 1;
    });

    const display = getDailyCheckInDisplay(service.snapshot);

    expect(display.canCheckIn).toBe(false);
    expect(display.lockedText).toBe("修为达到 Lv.15 才能开启日常");
  });

  it("prints a count row in counts and an idle row in minutes", () => {
    const { service } = seededService(readyToAct);

    const pending = getDailyTaskDisplay(taskState(service, "daily.alchemy"));
    expect(pending.title).toBe("开炉炼丹");
    expect(pending.description).toBe("今日炼制丹药 1 次");
    expect(pending.progressText).toBe("进度 0 / 1");
    expect(pending.rewardText).toBe("仙玉 12");
    expect(pending.statusText).toBe("进行中");
    expect(pending.buttonText).toBe("未完成");
    expect(pending.canClaim).toBe(false);

    service.brewAlchemy("small_experience_pill");
    const claimable = getDailyTaskDisplay(taskState(service, "daily.alchemy"));
    expect(claimable.progressText).toBe("进度 1 / 1");
    expect(claimable.statusText).toBe("可领取");
    expect(claimable.buttonText).toBe("领取");
    expect(claimable.canClaim).toBe(true);

    service.claimDailyTask("daily.alchemy");
    const claimed = getDailyTaskDisplay(taskState(service, "daily.alchemy"));
    expect(claimed.statusText).toBe("已领取");
    expect(claimed.buttonText).toBe("已领取");
    expect(claimed.canClaim).toBe(false);

    idleFor(service, 1);
    expect(
      getDailyTaskDisplay(taskState(service, "daily.idle_six_hours")).progressText,
    ).toBe("进度 60 / 360 分");
  });

  it("prints an exchange row with what its price buys", () => {
    const { service } = seededService();

    const unaffordable = getImmortalJadeShopDisplay(
      service.snapshot,
      getImmortalJadeShopRow("jade.exp_pill_large"),
    );
    expect(unaffordable.title).toBe("经验丹（大） x1");
    expect(unaffordable.description).toBe("折算满效率修炼 360 分钟");
    expect(unaffordable.priceText).toBe("仙玉 60");
    expect(unaffordable.buttonText).toBe("还需 60 枚");
    expect(unaffordable.canExchange).toBe(false);

    const outsideBudget = getImmortalJadeShopDisplay(
      service.snapshot,
      getImmortalJadeShopRow("jade.rename_card"),
    );
    expect(outsideBudget.title).toBe("改名卡 x1");
    expect(outsideBudget.description).toBe("判据之外的出口，不折算时长");
    expect(outsideBudget.priceText).toBe("仙玉 300");
  });

  it("turns the exchange button live once the jade is there", () => {
    const { service } = seededService((save) => {
      save.snapshot.wallet.immortalJade = "60";
    });

    const display = getImmortalJadeShopDisplay(
      service.snapshot,
      getImmortalJadeShopRow("jade.exp_pill_large"),
    );

    expect(display.buttonText).toBe("兑换");
    expect(display.canExchange).toBe(true);
  });
});
