import { describe, expect, it } from "vitest";
import {
  mergeCultivationPresentationPlans,
  planCultivationPresentation,
} from "../../assets/scripts/core/CultivationPresentation";
import { bootstrapFixture } from "./fixtures/bootstrap";

describe("Cocos cultivation presentation planning", () => {
  it("merges a same-realm multi-level gain into one authoritative presentation", () => {
    const previous = bootstrapFixture();
    const current = bootstrapFixture();
    current.progress.level = 4;
    current.progress.totalPower = "400";

    expect(planCultivationPresentation(previous, current, "level_up")).toEqual({
      accountId: previous.account.id,
      playerId: previous.player.id,
      kind: "level_up",
      fromLevel: 1,
      toLevel: 4,
      levelGain: 3,
      fromRealmName: "练气期",
      toRealmName: "练气期",
      fromPower: "100",
      toPower: "400",
      powerDelta: "300",
      powerDirection: "increase",
    });
  });

  it("plans a requested realm breakthrough without deriving client results", () => {
    const previous = bootstrapFixture();
    previous.progress.level = 10;
    previous.progress.realmId = "qi_refining";
    previous.progress.realmName = "练气期";
    previous.progress.totalPower = "1000";
    const current = bootstrapFixture();
    current.progress.level = 11;
    current.progress.realmId = "foundation_establishment";
    current.progress.realmName = "筑基期";
    current.progress.totalPower = "1430";

    expect(
      planCultivationPresentation(previous, current, "breakthrough"),
    ).toMatchObject({
      kind: "breakthrough",
      fromLevel: 10,
      toLevel: 11,
      fromRealmName: "练气期",
      toRealmName: "筑基期",
      powerDelta: "430",
    });
  });

  it("animates signed power corrections without claiming a level gain", () => {
    const previous = bootstrapFixture();
    previous.progress.totalPower = "900719925474099500000";
    const current = bootstrapFixture();
    current.progress.totalPower = "900719925474099300000";

    expect(
      planCultivationPresentation(previous, current, "power_change"),
    ).toMatchObject({
      kind: "power_change",
      powerDelta: "-200000",
      powerDirection: "decrease",
    });
  });

  it("rejects cross-player, unchanged, and trigger-inconsistent snapshots", () => {
    const previous = bootstrapFixture();
    const changed = bootstrapFixture();
    changed.progress.level = 2;
    changed.progress.totalPower = "200";

    changed.player.id = "00000000-0000-4000-8000-000000000202";
    expect(planCultivationPresentation(previous, changed, "level_up")).toBeNull();

    expect(
      planCultivationPresentation(previous, bootstrapFixture(), "power_change"),
    ).toBeNull();

    const samePlayerLevelUp = bootstrapFixture();
    samePlayerLevelUp.progress.level = 2;
    samePlayerLevelUp.progress.totalPower = "200";
    expect(
      planCultivationPresentation(previous, samePlayerLevelUp, "breakthrough"),
    ).toBeNull();

    const realmChange = bootstrapFixture();
    realmChange.progress.level = 11;
    realmChange.progress.realmId = "foundation_establishment";
    realmChange.progress.realmName = "筑基期";
    realmChange.progress.totalPower = "1430";
    expect(planCultivationPresentation(previous, realmChange, "level_up")).toBeNull();
  });

  it("uses only the explicit trigger to classify an authoritative change", () => {
    const previous = bootstrapFixture();
    previous.progress.level = 10;
    const current = bootstrapFixture();
    current.progress.level = 11;
    current.progress.realmId = "foundation_establishment";
    current.progress.realmName = "筑基期";
    current.progress.totalPower = "1430";

    expect(
      planCultivationPresentation(previous, current, "power_change"),
    ).toMatchObject({ kind: "power_change", powerDelta: "1330" });

    const sameRealmPrevious = bootstrapFixture();
    const sameRealmLevelUp = bootstrapFixture();
    sameRealmLevelUp.progress.level = 2;
    sameRealmLevelUp.progress.totalPower = "200";
    expect(
      planCultivationPresentation(
        sameRealmPrevious,
        sameRealmLevelUp,
        "power_change",
      ),
    ).toMatchObject({ kind: "power_change", levelGain: 1 });
  });

  it("merges queued gains while an earlier presentation is obscured", () => {
    const initial = bootstrapFixture();
    const middle = bootstrapFixture();
    middle.progress.level = 2;
    middle.progress.totalPower = "200";
    const latest = bootstrapFixture();
    latest.progress.level = 4;
    latest.progress.totalPower = "400";
    const first = planCultivationPresentation(initial, middle, "level_up")!;
    const second = planCultivationPresentation(middle, latest, "level_up")!;

    expect(mergeCultivationPresentationPlans(first, second)).toMatchObject({
      kind: "level_up",
      fromLevel: 1,
      toLevel: 4,
      levelGain: 3,
      fromPower: "100",
      toPower: "400",
      powerDelta: "300",
    });

    const unrelated = { ...second, playerId: "another-player" };
    expect(mergeCultivationPresentationPlans(first, unrelated)).toBeNull();

    const discontinuous = { ...second, fromPower: "201" };
    expect(mergeCultivationPresentationPlans(first, discontinuous)).toBeNull();
  });
});
