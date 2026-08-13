import type { BootstrapSnapshot } from "@cultivation-diary/shared";

export type RankingCategory = "power" | "level" | "wealth" | "cave" | "partner";

export interface RankingEntry {
  readonly id: string;
  readonly displayName: string;
  readonly value: string;
  readonly player: boolean;
}

const NPC_VALUES: Readonly<Record<RankingCategory, readonly string[]>> = {
  power: ["12000", "5000", "2000", "800", "300"],
  level: ["60", "45", "30", "18", "10"],
  wealth: ["2000000", "800000", "300000", "80000", "20000"],
  cave: ["45", "32", "20", "12", "5"],
  partner: ["10", "8", "6", "4", "2"],
};

const NPC_NAMES = ["玄霄真人", "丹霞散人", "万象客", "青竹居士", "云游道人"];

export function buildLocalRanking(
  snapshot: BootstrapSnapshot,
  category: RankingCategory,
): readonly RankingEntry[] {
  const playerValue = rankingValue(snapshot, category);
  return [
    ...NPC_NAMES.map((displayName, index) => ({
      id: `npc-${index}`,
      displayName,
      value: NPC_VALUES[category][index]!,
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
    return left.displayName.localeCompare(right.displayName, "zh-CN");
  });
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
