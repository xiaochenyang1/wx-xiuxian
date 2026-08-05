import { describe, expect, it } from "vitest";
import {
  accrueRate,
  advanceDropClock,
  calculateEffectiveOfflineSeconds,
  calculateSpiritStonePerMinute,
} from "../src";

describe("economy and time accrual", () => {
  it("uses level points per minute as the base spirit-stone rate", () => {
    expect(calculateSpiritStonePerMinute(1)).toBe("1");
    expect(calculateSpiritStonePerMinute(100)).toBe("100");
    expect(calculateSpiritStonePerMinute(100, 2_500)).toBe("125");
  });

  it("preserves micro-unit remainder across short settlement windows", () => {
    const first = accrueRate({
      ratePerPeriod: 1,
      periodSeconds: 60,
      elapsedMilliseconds: 30_000,
    });
    expect(first).toEqual({ wholeUnits: "0", remainderMicros: 500_000 });

    const second = accrueRate({
      ratePerPeriod: 1,
      periodSeconds: 60,
      elapsedMilliseconds: 30_000,
      remainderMicros: first.remainderMicros,
    });
    expect(second).toEqual({ wholeUnits: "1", remainderMicros: 0 });
  });

  it("applies offline efficiency to the shared drop clock", () => {
    const first = advanceDropClock({ elapsedMilliseconds: 60_000, efficiencyBp: 7_000 });
    expect(first).toEqual({ attempts: 0, remainderMicros: 42_000_000 });

    const second = advanceDropClock({
      elapsedMilliseconds: 60_000,
      efficiencyBp: 7_000,
      remainderMicros: first.remainderMicros,
    });
    expect(second).toEqual({ attempts: 1, remainderMicros: 24_000_000 });
  });

  it("caps offline time at 24 hours and ignores clock rollback", () => {
    const start = "2026-08-01T00:00:00.000Z";
    expect(calculateEffectiveOfflineSeconds(start, "2026-08-02T12:00:00.000Z")).toBe(86_400);
    expect(calculateEffectiveOfflineSeconds(start, "2026-07-31T23:00:00.000Z")).toBe(0);
  });
});
