import {
  calculateTotalPower,
  type BigNumberString,
  type BootstrapSnapshot,
} from "@cultivation-diary/shared";

export type RankingCategory = "power" | "level" | "wealth" | "cave" | "partner";

export interface RankingEntry {
  readonly id: string;
  readonly displayName: string;
  readonly value: string;
  readonly player: boolean;
}

/**
 * One fictional rival, defined once and read by all five boards.
 *
 * The point of holding a `level` rather than five unrelated numbers is that
 * the power column is *derived* from it. The table this replaced was written
 * when the cap was Lv.60 and never moved again, so by Lv.31 the player owned
 * the power board permanently; deriving from `calculateTotalPower` means a
 * future realm-multiplier or level-cap change carries the benchmarks with it.
 *
 * Anchors and the accounting behind every number:
 * `docs/superpowers/specs/2026-08-27-local-ranking-benchmark-design.md`.
 */
interface RankingBenchmark {
  readonly displayName: string;
  readonly level: number;
  /** Gear the rival is wearing. Only the first and last carry any. */
  readonly powerBonusBp: number;
  /**
   * Bare idle spirit stone accumulated by `level`, the top rival's figure
   * additionally scaled for the bonus a fully geared cultivator would hold.
   * A literal rather than a derivation: the cumulative curve needs a
   * level-by-level integral that `shared` has no reason to carry for five
   * numbers. Derivation in §4.3 of the design, re-checked by the tests.
   */
  readonly wealth: BigNumberString;
  /**
   * Cave levels summed across all five buildings, and bond level. Both used to
   * be justified as "quantities that are capped anyway" — the cave board's
   * ceiling was 50 and 玄霄真人 sat at 45. Now that the four idle buildings and
   * the bond follow the band, the ceilings are 170 (four × 40 plus 炼器室's
   * fixed 10) and 40, so each rival is restated at the same relative water line
   * inside their own band's ceiling. 云游道人 is 凡阶 and therefore unchanged.
   */
  readonly caveTotal: number;
  readonly partnerLevel: number;
}

const BENCHMARKS: readonly RankingBenchmark[] = [
  {
    displayName: "玄霄真人",
    level: 920,
    powerBonusBp: 71_774,
    wealth: "364000000",
    caveTotal: 153,
    partnerLevel: 40,
  },
  {
    displayName: "丹霞散人",
    level: 580,
    powerBonusBp: 0,
    wealth: "61000000",
    caveTotal: 109,
    partnerLevel: 32,
  },
  {
    displayName: "万象客",
    level: 290,
    powerBonusBp: 0,
    wealth: "11000000",
    caveTotal: 52,
    partnerLevel: 18,
  },
  {
    displayName: "青竹居士",
    level: 140,
    powerBonusBp: 0,
    wealth: "1230000",
    caveTotal: 22,
    partnerLevel: 8,
  },
  {
    displayName: "云游道人",
    level: 40,
    powerBonusBp: 2_000,
    wealth: "43000",
    caveTotal: 5,
    partnerLevel: 2,
  },
];

export function buildLocalRanking(
  snapshot: BootstrapSnapshot,
  category: RankingCategory,
): readonly RankingEntry[] {
  const playerValue = rankingValue(snapshot, category);
  return [
    ...BENCHMARKS.map((benchmark, index) => ({
      id: `npc-${index}`,
      displayName: benchmark.displayName,
      value: benchmarkValue(benchmark, category),
      player: false,
    })),
    {
      id: snapshot.player.id,
      displayName: snapshot.player.displayName,
      value: playerValue,
      player: true,
    },
  ].sort((left, right) => {
    const comparison = compareDecimalStrings(left.value, right.value);
    if (comparison !== 0) return comparison;
    // Matching a benchmark counts as passing it. The middle three rivals wear
    // no gear, so their power is exactly the bare power of their own level and
    // the player lands on it precisely — as they do on every level anchor. The
    // nickname tiebreak below would otherwise decide those ranks, which is how
    // a maxed partner's rank used to depend on how their name sorted.
    if (left.player !== right.player) return left.player ? -1 : 1;
    return left.displayName.localeCompare(right.displayName, "zh-CN");
  });
}

function benchmarkValue(
  benchmark: RankingBenchmark,
  category: RankingCategory,
): string {
  if (category === "power") {
    return calculateTotalPower(benchmark.level, {
      percentBonusBp: benchmark.powerBonusBp,
    });
  }
  if (category === "level") return String(benchmark.level);
  if (category === "wealth") return benchmark.wealth;
  if (category === "cave") return String(benchmark.caveTotal);
  return String(benchmark.partnerLevel);
}

function rankingValue(
  snapshot: BootstrapSnapshot,
  category: RankingCategory,
): string {
  if (category === "power") return snapshot.progress.totalPower;
  if (category === "level") return String(snapshot.progress.level);
  if (category === "wealth") return snapshot.wallet.lifetimeSpiritStoneEarned;
  if (category === "cave") {
    return String(
      snapshot.cave.buildings.reduce((sum, building) => sum + building.level, 0),
    );
  }
  return String(snapshot.partner.level);
}

function compareDecimalStrings(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+(?=\d)/, "");
  const normalizedRight = right.replace(/^0+(?=\d)/, "");
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length > normalizedRight.length ? -1 : 1;
  }
  if (normalizedLeft === normalizedRight) return 0;
  return normalizedLeft > normalizedRight ? -1 : 1;
}
