import {
  MAX_LEVEL,
  MIN_LEVEL,
  REALM_CONFIGS,
  calculateOnlineExperiencePerSecond,
  calculateSpiritStonePerMinute,
  calculateTotalPower,
  getRealmConfig,
  getRealmConfigForLevel,
  getRealmTitle,
  isRealmMaxLevel,
  requiredExperienceForLevel,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date("2026-01-01T00:00:00.000Z");
const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;

type MutableSave = Record<string, any>;

afterEach(() => vi.useRealTimers());

/**
 * A save parked at `level` with its bar exactly full and `pills` in the bag —
 * the state a breakthrough is decided from. Written through the raw save rather
 * than by playing forward, because idling to Lv.600 is 673 hours.
 */
function parkedAt(
  level: number,
  pills: number,
  mutate?: (save: MutableSave) => void,
): LocalGameService {
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
  save.snapshot.progress.status = "breakthrough_ready";
  save.snapshot.inventory.stacks =
    pills > 0
      ? [
          {
            itemConfigId: "breakthrough_pill",
            displayName: "突破丹",
            quantity: String(pills),
          },
        ]
      : [];
  // Every milestone already claimed. A fixture parked this deep would otherwise
  // settle the Lv.8 task on its first mutation and quietly add a pill to the
  // count the assertions are about.
  save.snapshot.progressionTasks = save.snapshot.progressionTasks.map(
    (task: MutableSave) => ({
      ...task,
      progress: String(level),
      completedAt: START.toISOString(),
      claimedAt: START.toISOString(),
    }),
  );
  mutate?.(save);

  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  expect(service.initialize(START).created).toBe(false);
  return service;
}

/** The five realms Lv.501-1000 was split into, in ascension order. */
const ENDGAME_REALM_IDS = [
  "true_immortal",
  "golden_immortal",
  "taiyi",
  "daluo",
  "daozu",
] as const;

describe("the realm table", () => {
  it("covers every level exactly once with no gap and no overlap", () => {
    expect(REALM_CONFIGS[0]?.minLevel).toBe(MIN_LEVEL);
    expect(REALM_CONFIGS[REALM_CONFIGS.length - 1]?.maxLevel).toBe(MAX_LEVEL);
    for (const [index, realm] of REALM_CONFIGS.entries()) {
      expect(realm.maxLevel, realm.id).toBeGreaterThan(realm.minLevel);
      if (index === 0) continue;
      expect(realm.minLevel, realm.id).toBe(
        REALM_CONFIGS[index - 1]!.maxLevel + 1,
      );
    }
  });

  it("links every realm to the next one and stops exactly once", () => {
    const walked: string[] = [];
    let realm = REALM_CONFIGS[0]!;
    while (realm.nextRealmId !== null) {
      walked.push(realm.id);
      realm = getRealmConfig(realm.nextRealmId);
    }
    walked.push(realm.id);

    expect(walked).toEqual(REALM_CONFIGS.map((config) => config.id));
    expect(
      REALM_CONFIGS.filter((config) => config.nextRealmId === null),
    ).toHaveLength(1);
  });

  it("charges for every breakthrough except the one that does not exist", () => {
    // Only the version's last realm sells no breakthrough, because there is no
    // realm past it. Anywhere else a null cost is a hole: `completeBreakthrough`
    // refuses, so the level cap of that realm becomes a silent dead end.
    for (const realm of REALM_CONFIGS.slice(0, -1)) {
      expect(realm.breakthroughPillCost, realm.id).not.toBeNull();
    }
    expect(REALM_CONFIGS[REALM_CONFIGS.length - 1]!.breakthroughPillCost).toBeNull();
  });

  it("ends on five 100-level realms that share all three numeric knobs", () => {
    const endgame = ENDGAME_REALM_IDS.map((id) => getRealmConfig(id));

    expect(endgame.map((realm) => [realm.minLevel, realm.maxLevel])).toEqual([
      [501, 600],
      [601, 700],
      [701, 800],
      [801, 900],
      [901, 1000],
    ]);
    // Holding these three equal is what keeps power, the experience curve and
    // the idle rate byte-identical across the split. A change to any one of them
    // moves the trial tower ladder and the expedition gates with it.
    for (const realm of endgame) {
      expect(realm.expMultiplier, realm.id).toBe(60);
      expect(realm.powerMultiplier, realm.id).toBe("10000");
      expect(realm.expRequirementCoefficientBp, realm.id).toBe(6_200_000);
    }
    expect(endgame.map((realm) => realm.breakthroughPillCost)).toEqual([
      700,
      1_000,
      1_400,
      2_000,
      null,
    ]);
  });

  it("asks for 6,077 breakthrough pills over a full run", () => {
    const total = REALM_CONFIGS.reduce(
      (sum, realm) => sum + (realm.breakthroughPillCost ?? 0),
      0,
    );
    // 977 up to Lv.500, plus the 5,100 the split added. The figure is pinned
    // because the drop table's flat pill rate is justified by it having a hard
    // ceiling at all.
    expect(total).toBe(6_077);
  });
});

describe("the split leaves every derived number where it was", () => {
  it("keeps power, the experience curve and the idle rate identical at Lv.501-1000", () => {
    // Re-derived from the literal knobs 真仙期 carried before the split rather
    // than from the config, so this fails if a future realm gets its own values.
    for (let level = 501; level <= MAX_LEVEL; level += 1) {
      expect(calculateTotalPower(level), `power at ${level}`).toBe(
        String(level * 100 * 10_000),
      );
      expect(
        requiredExperienceForLevel(level),
        `required experience at ${level}`,
      ).toBe(String(Math.ceil(level ** 1.5 * 100 * 620)));
      expect(
        calculateOnlineExperiencePerSecond(level),
        `experience per second at ${level}`,
      ).toBe(String(level * 60));
      expect(
        calculateSpiritStonePerMinute(level),
        `spirit stone per minute at ${level}`,
      ).toBe(String(level));
    }
  });

  it("pins the two ends of the range the tower ladder is derived from", () => {
    expect(calculateTotalPower(501)).toBe("501000000");
    expect(calculateTotalPower(1000)).toBe("1000000000");
  });
});

describe("realm boundaries and titles", () => {
  it("puts a breakthrough at every new hundred", () => {
    for (const level of [600, 700, 800, 900]) {
      expect(isRealmMaxLevel(level), `Lv.${level}`).toBe(true);
    }
    // The old 125-level stage edges are no longer realm edges.
    for (const level of [625, 750, 875]) {
      expect(isRealmMaxLevel(level), `Lv.${level}`).toBe(false);
    }
    expect(isRealmMaxLevel(MAX_LEVEL)).toBe(true);
  });

  it("hands out a title every 25 levels instead of every 125", () => {
    expect(
      [501, 526, 551, 576, 601, 701, 801, 901, 1000].map(getRealmTitle),
    ).toEqual([
      "真仙初期",
      "真仙中期",
      "真仙后期",
      "真仙圆满",
      "金仙初期",
      "太乙初期",
      "大罗初期",
      "道祖初期",
      "道祖圆满",
    ]);
    // One per 25 levels across the last 500, matching the density the realms
    // before Lv.501 already had.
    const titles = new Set<string>();
    for (let level = 501; level <= MAX_LEVEL; level += 1) {
      titles.add(getRealmTitle(level));
    }
    expect(titles.size).toBe(20);
  });

  it("reads the realm off the level, so a stale stored id cannot survive", () => {
    expect(getRealmConfigForLevel(600).id).toBe("true_immortal");
    expect(getRealmConfigForLevel(601).id).toBe("golden_immortal");
    expect(getRealmConfigForLevel(700).id).toBe("golden_immortal");
    expect(getRealmConfigForLevel(701).id).toBe("taiyi");
    expect(getRealmConfigForLevel(801).id).toBe("daluo");
    expect(getRealmConfigForLevel(901).id).toBe("daozu");
  });
});

describe("breaking through the new realms", () => {
  it("spends 700 pills at Lv.600 and lands in 金仙期", () => {
    const service = parkedAt(600, 700);
    expect(service.snapshot.progress.status).toBe("breakthrough_ready");

    service.breakthrough();

    expect(service.snapshot.progress.level).toBe(601);
    expect(service.snapshot.progress.status).toBe("gaining");
    expect(service.snapshot.progress.realmId).toBe("golden_immortal");
    expect(service.snapshot.progress.realmName).toBe("金仙期");
    expect(service.snapshot.progress.title).toBe("金仙初期");
    expect(
      service.snapshot.inventory.stacks.find(
        (stack) => stack.itemConfigId === "breakthrough_pill",
      ),
    ).toBeUndefined();
  });

  it("refuses and spends nothing when the pills are one short", () => {
    const service = parkedAt(600, 699);

    expect(() => service.breakthrough()).toThrow("突破丹不足，需要 700 枚");
    expect(service.snapshot.progress.level).toBe(600);
    expect(
      service.snapshot.inventory.stacks.find(
        (stack) => stack.itemConfigId === "breakthrough_pill",
      )?.quantity,
    ).toBe("699");
  });

  it("charges each of the four new breakthroughs its own price", () => {
    for (const [level, pills, realmId] of [
      [700, 1_000, "taiyi"],
      [800, 1_400, "daluo"],
      [900, 2_000, "daozu"],
    ] as const) {
      const service = parkedAt(level, pills);
      service.breakthrough();
      expect(service.snapshot.progress.level, `Lv.${level}`).toBe(level + 1);
      expect(service.snapshot.progress.realmId, `Lv.${level}`).toBe(realmId);
    }
  });

  it("still treats Lv.1000 as the version cap rather than a breakthrough", () => {
    const service = parkedAt(MAX_LEVEL, 10_000, (save) => {
      save.snapshot.progress.status = "version_cap";
    });

    expect(service.snapshot.progress.status).toBe("version_cap");
    expect(() => service.breakthrough()).toThrow();
    expect(service.snapshot.progress.level).toBe(MAX_LEVEL);
  });

  it("re-derives a save that still calls Lv.700 真仙期", () => {
    // The realm fields are shape-checked and then rebuilt from the level on
    // every load, so an old save cannot be rejected by the split — nor keep a
    // realm name the table no longer has at that level.
    const service = parkedAt(700, 0, (save) => {
      save.snapshot.progress.realmId = "true_immortal";
      save.snapshot.progress.realmName = "真仙期";
      save.snapshot.progress.title = "真仙中期";
    });

    expect(service.snapshot.progress.realmId).toBe("golden_immortal");
    expect(service.snapshot.progress.realmName).toBe("金仙期");
    expect(service.snapshot.progress.title).toBe("金仙圆满");
    expect(service.snapshot.progress.totalPower).toBe("700000000");
    expect(service.snapshot.progress.requiredExperience).toBe(
      requiredExperienceForLevel(700),
    );
  });
});
