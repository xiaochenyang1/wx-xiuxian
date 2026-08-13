import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { buildLocalRanking } from "../assets/scripts/core/RankingDisplay";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const NOW = new Date("2026-08-13T08:00:00.000Z");
type MutableSave = Record<string, any>;

afterEach(() => vi.useRealTimers());

function progressedService(mutate?: (save: MutableSave) => void): {
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
  save.snapshot.progress.level = 11;
  save.snapshot.progress.experience = "0";
  save.snapshot.progress.status = "gaining";
  save.snapshot.inventory.stacks = [
    { itemConfigId: "dual_cultivation_pill", displayName: "双修丹", quantity: "3" },
    { itemConfigId: "wood", displayName: "木材", quantity: "30" },
    { itemConfigId: "stone", displayName: "石材", quantity: "30" },
    { itemConfigId: "spiritual_herb", displayName: "灵草", quantity: "30" },
  ];
  mutate?.(save);
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  expect(service.initialize(NOW).created).toBe(false);
  return { service, platform };
}

describe("partner progression", () => {
  it("requires the unlock, locks the choice, consumes pills, and applies bonuses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const locked = new LocalGameService(new FakePlatformAdapter());
    locked.initialize(NOW);
    expect(() => locked.choosePartner("jun_rulan")).toThrow("Lv.11");

    const { service } = progressedService();
    const baselineBonus = service.snapshot.progress.experienceBonusBp;
    service.choosePartner("jun_rulan");
    expect(service.snapshot.partner).toEqual({
      partnerId: "jun_rulan",
      level: 1,
      bond: 0,
    });
    expect(service.snapshot.progress.experienceBonusBp).toBe(baselineBonus + 120);
    expect(() => service.choosePartner("su_wanqing")).toThrow("不能再次选择");

    service.cultivateWithPartner();
    expect(service.snapshot.partner).toEqual({
      partnerId: "jun_rulan",
      level: 1,
      bond: 100,
    });
    service.cultivateWithPartner();
    expect(service.snapshot.partner).toEqual({
      partnerId: "jun_rulan",
      level: 2,
      bond: 0,
    });
    expect(quantityOf(service, "dual_cultivation_pill")).toBe("1");
    expect(service.snapshot.progress.experienceBonusBp).toBe(baselineBonus + 240);
  });
});

describe("sect progression", () => {
  it("joins once, donates exact materials, levels up, and survives reload", () => {
    const { service, platform } = progressedService();
    const baselineBonus = service.snapshot.progress.experienceBonusBp;

    service.joinSect("qingyun");
    expect(service.snapshot.sect).toEqual({
      sectId: "qingyun",
      level: 1,
      contribution: 0,
    });
    expect(service.snapshot.progress.experienceBonusBp).toBe(baselineBonus + 100);
    expect(() => service.joinSect("danxia")).toThrow("不能改投");

    for (let index = 0; index < 4; index += 1) service.donateToSect();
    expect(service.snapshot.sect).toEqual({
      sectId: "qingyun",
      level: 2,
      contribution: 0,
    });
    expect(quantityOf(service, "wood")).toBe("10");
    expect(quantityOf(service, "stone")).toBe("10");
    expect(quantityOf(service, "spiritual_herb")).toBe("10");
    expect(service.snapshot.progress.experienceBonusBp).toBe(baselineBonus + 200);

    const raw = platform.raw(SAVE_KEY);
    if (raw === undefined) throw new Error("expected social save");
    const reader = new FakePlatformAdapter();
    reader.seed(SAVE_KEY, JSON.parse(raw));
    const reloaded = new LocalGameService(reader);
    expect(reloaded.initialize(NOW).created).toBe(false);
    expect(reloaded.snapshot.partner).toEqual(service.snapshot.partner);
    expect(reloaded.snapshot.sect).toEqual(service.snapshot.sect);
  });

  it("does not deduct a partial donation when one material is missing", () => {
    const { service } = progressedService((save) => {
      save.snapshot.inventory.stacks.find(
        (stack: MutableSave) => stack.itemConfigId === "spiritual_herb",
      ).quantity = "4";
    });
    service.joinSect("qingyun");
    const before = JSON.stringify(service.snapshot.inventory);

    expect(() => service.donateToSect()).toThrow("灵草不足");
    expect(JSON.stringify(service.snapshot.inventory)).toBe(before);
  });
});

describe("local rankings", () => {
  it("includes the real player in all five deterministic local boards", () => {
    const { service } = progressedService();
    service.choosePartner("jun_rulan");
    service.joinSect("qingyun");

    for (const category of ["power", "level", "wealth", "cave", "partner"] as const) {
      const ranking = buildLocalRanking(service.snapshot, category);
      expect(ranking).toHaveLength(6);
      expect(ranking.filter((entry) => entry.player)).toHaveLength(1);
      expect(ranking.some((entry) => entry.displayName === service.snapshot.player.displayName)).toBe(true);
      for (let index = 1; index < ranking.length; index += 1) {
        expect(compareDecimalStrings(ranking[index - 1]!.value, ranking[index]!.value)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

function quantityOf(service: LocalGameService, itemConfigId: string): string {
  return (
    service.snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === itemConfigId,
    )?.quantity ?? "0"
  );
}

function compareDecimalStrings(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+(?=\d)/, "");
  const normalizedRight = right.replace(/^0+(?=\d)/, "");
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length - normalizedRight.length;
  }
  if (normalizedLeft === normalizedRight) return 0;
  return normalizedLeft > normalizedRight ? 1 : -1;
}
