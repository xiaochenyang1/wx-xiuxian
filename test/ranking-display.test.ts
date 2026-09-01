import {
  CAVE_BUILDING_CONFIGS,
  PARTNER_ABSOLUTE_MAX_LEVEL,
  calculateTotalPower,
  caveMaxLevelForBand,
  equipmentBandForLevel,
  partnerMaxLevelForBand,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import {
  buildLocalRanking,
  type RankingCategory,
  type RankingEntry,
} from "../assets/scripts/core/RankingDisplay";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date("2026-01-01T00:00:00.000Z");
const UNBOUNDED: readonly RankingCategory[] = ["power", "level", "wealth"];
const EVERY_CATEGORY: readonly RankingCategory[] = [
  ...UNBOUNDED,
  "cave",
  "partner",
];

/**
 * The bare idle total at Lv.1000. The wealth column is literals, so a change
 * to the income curve cannot move it on its own — this is §8.2's sentinel.
 */
const BARE_CAP_WEALTH = "223312542";
/** 法宝六件满词条满强化 71,774bp 加炼器室 Lv.10 的 2,000bp。 */
const FULL_BONUS_BP = 73_774;

interface SnapshotOverrides {
  readonly level?: number;
  readonly powerBonusBp?: number;
  readonly wealth?: string;
  readonly caveLevel?: number;
  readonly partnerLevel?: number;
  readonly displayName?: string;
}

/** A fresh snapshot rewritten to the state under test, without touching disk. */
function snapshotWith(overrides: SnapshotOverrides = {}) {
  const service = new LocalGameService(new FakePlatformAdapter());
  service.initialize(START);
  const base = service.snapshot;
  const level = overrides.level ?? 1;
  return {
    ...base,
    player: {
      ...base.player,
      displayName: overrides.displayName ?? base.player.displayName,
    },
    progress: {
      ...base.progress,
      level,
      totalPower: calculateTotalPower(level, {
        percentBonusBp: overrides.powerBonusBp ?? 0,
      }),
    },
    wallet: {
      ...base.wallet,
      lifetimeSpiritStoneEarned: overrides.wealth ?? "0",
    },
    cave: {
      ...base.cave,
      buildings: base.cave.buildings.map((building) => ({
        ...building,
        level: overrides.caveLevel ?? 0,
      })),
    },
    partner: { ...base.partner, level: overrides.partnerLevel ?? 0 },
  };
}

/**
 * The five benchmark values of one board, top first. Read through the public
 * function with a Lv.1 player so the table is never asserted against itself.
 */
function benchmarks(category: RankingCategory): readonly string[] {
  return buildLocalRanking(snapshotWith(), category)
    .filter((entry) => !entry.player)
    .map((entry) => entry.value);
}

function playerRank(entries: readonly RankingEntry[]): number {
  return entries.findIndex((entry) => entry.player) + 1;
}

function powerRank(level: number, powerBonusBp = 0): number {
  return playerRank(
    buildLocalRanking(snapshotWith({ level, powerBonusBp }), "power"),
  );
}

describe("the ranking benchmark table", () => {
  it("holds the five anchor levels", () => {
    expect(benchmarks("level")).toEqual(["920", "580", "290", "140", "40"]);
  });

  it("derives every power benchmark from its own level and gear", () => {
    // Recomputed here rather than read back, so a change to the realm
    // multipliers or the level cap carries this column instead of failing.
    expect(benchmarks("power")).toEqual([
      calculateTotalPower(920, { percentBonusBp: 71_774 }),
      calculateTotalPower(580, { percentBonusBp: 0 }),
      calculateTotalPower(290, { percentBonusBp: 0 }),
      calculateTotalPower(140, { percentBonusBp: 0 }),
      calculateTotalPower(40, { percentBonusBp: 2_000 }),
    ]);
  });

  it("holds the bare idle wealth of each anchor level", () => {
    expect(benchmarks("wealth")).toEqual([
      "364000000",
      "61000000",
      "11000000",
      "1230000",
      "43000",
    ]);
  });

  it("leaves the top power slot reachable only with most of the gear", () => {
    const [top] = benchmarks("power");
    const gearedCap = calculateTotalPower(1000, {
      percentBonusBp: FULL_BONUS_BP,
    });
    expect(BigInt(top!)).toBeLessThan(BigInt(gearedCap));
    expect(BigInt(top!)).toBeGreaterThan(
      BigInt(calculateTotalPower(1000, { percentBonusBp: 0 })),
    );
  });

  it("keeps the top wealth slot above a bare run to the cap", () => {
    expect(BigInt(benchmarks("wealth")[0]!)).toBeGreaterThan(
      BigInt(BARE_CAP_WEALTH),
    );
  });

  it("keeps both bounded boards inside their own band's ladder", () => {
    // Neither ceiling is a constant any more: the four idle buildings and the
    // bond follow the band, so each rival is checked against the ceiling of the
    // band their own level puts them in (50/90/130/170 for the cave once
    // 炼器室's fixed 10 is added, 10/20/30/40 for the bond). Derived here rather
    // than listed so a change to either step carries this test.
    const levels = benchmarks("level").map(Number);
    const caveTotals = benchmarks("cave").map(Number);
    const partnerLevels = benchmarks("partner").map(Number);
    levels.forEach((level, index) => {
      const band = equipmentBandForLevel(level);
      const caveCeiling = CAVE_BUILDING_CONFIGS.reduce(
        (total, config) => total + caveMaxLevelForBand(config.id, band),
        0,
      );
      expect(caveTotals[index]!).toBeLessThanOrEqual(caveCeiling);
      expect(partnerLevels[index]!).toBeLessThanOrEqual(
        partnerMaxLevelForBand(band),
      );
    });
  });
});

describe("the ranking board", () => {
  it("puts a new save last on all three unbounded boards", () => {
    for (const category of UNBOUNDED) {
      expect(playerRank(buildLocalRanking(snapshotWith(), category))).toBe(6);
    }
  });

  it("hands over one power rank at each anchor level", () => {
    expect([powerRank(47), powerRank(48)]).toEqual([6, 5]);
    expect([powerRank(139), powerRank(140)]).toEqual([5, 4]);
    expect([powerRank(289), powerRank(290)]).toEqual([4, 3]);
    expect([powerRank(579), powerRank(580)]).toEqual([3, 2]);
  });

  it("counts matching a bare rival's power as passing them", () => {
    // The middle three wear no gear, so their benchmark is exactly the bare
    // power of their level and the player lands on it to the digit.
    expect(benchmarks("power").slice(1, 4)).toEqual([
      calculateTotalPower(580, { percentBonusBp: 0 }),
      calculateTotalPower(290, { percentBonusBp: 0 }),
      calculateTotalPower(140, { percentBonusBp: 0 }),
    ]);
    expect(powerRank(290)).toBe(3);
  });

  it("lets gear pull an overtake forward", () => {
    // Lv.221 with +20,000bp reaches 1.989e7 and passes 万象客's 8.7e6 — 69
    // levels before a bare save gets there.
    expect(powerRank(221, 20_000)).toBe(3);
    expect(powerRank(221)).toBe(4);
  });

  it("ranks a geared capped save first and a bare one second", () => {
    expect(powerRank(1000, FULL_BONUS_BP)).toBe(1);
    expect(powerRank(1000)).toBe(2);
  });

  it("gives a maxed partner the top slot whatever the nickname sorts as", () => {
    // 阿一 collates before 玄霄真人 and 赵子龙 after it; the old comparator let
    // that decide the rank, because the top benchmark ties the player's own cap
    // — Lv.40 now that the bond follows the band, as Lv.10 was before it.
    for (const displayName of ["阿一", "赵子龙"]) {
      const entries = buildLocalRanking(
        snapshotWith({
          partnerLevel: PARTNER_ABSOLUTE_MAX_LEVEL,
          displayName,
        }),
        "partner",
      );
      expect(playerRank(entries)).toBe(1);
      expect(entries[0]!.displayName).toBe(displayName);
    }
  });

  it("returns six rows with exactly one player row on every board", () => {
    const snapshot = snapshotWith({ level: 290, caveLevel: 4, partnerLevel: 6 });
    for (const category of EVERY_CATEGORY) {
      const entries = buildLocalRanking(snapshot, category);
      expect(entries).toHaveLength(6);
      expect(entries.filter((entry) => entry.player)).toHaveLength(1);
    }
  });

  it("reads the same twice for one snapshot", () => {
    const snapshot = snapshotWith({ level: 290, wealth: "11090723" });
    for (const category of EVERY_CATEGORY) {
      expect(buildLocalRanking(snapshot, category)).toEqual(
        buildLocalRanking(snapshot, category),
      );
    }
  });
});
