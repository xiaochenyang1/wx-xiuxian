import { describe, expect, it } from "vitest";
import {
  applyWholeExperience,
  calculateOnlineExperiencePerSecond,
  calculateTotalPower,
  completeBreakthrough,
  requiredExperienceForLevel,
  type PlayerProgress,
} from "../src";

function progress(overrides: Partial<PlayerProgress> = {}): PlayerProgress {
  return {
    level: 1,
    experience: "0",
    cultivationReserve: "0",
    status: "gaining",
    ...overrides,
  };
}

describe("progression formulas", () => {
  it("uses level as the base online experience rate", () => {
    expect(calculateOnlineExperiencePerSecond(1)).toBe("1");
    expect(calculateOnlineExperiencePerSecond(11)).toBe("22");
    expect(calculateOnlineExperiencePerSecond(11, 5_000)).toBe("33");
  });

  it("calculates deterministic rounded experience requirements", () => {
    expect(requiredExperienceForLevel(1)).toBe("107");
    expect(requiredExperienceForLevel(10)).toBe("3384");
    expect(requiredExperienceForLevel(11)).toBe("49252");
  });

  it("automatically levels within a realm and preserves legal overflow", () => {
    const requiredAtOne = requiredExperienceForLevel(1);
    const result = applyWholeExperience(progress(), BigInt(requiredAtOne) + 5n);

    expect(result.progress).toMatchObject({
      level: 2,
      experience: "5",
      status: "gaining",
    });
    expect(result.events).toEqual([{ type: "level_up", fromLevel: 1, toLevel: 2 }]);
    expect(result.discardedExperience).toBe("0");
  });

  it("stops at a full realm cap and discards overflow", () => {
    const requiredAtTen = BigInt(requiredExperienceForLevel(10));
    const result = applyWholeExperience(
      progress({ level: 10, experience: "0" }),
      requiredAtTen + 99_999n,
    );

    expect(result.progress).toEqual({
      level: 10,
      experience: requiredAtTen.toString(),
      cultivationReserve: "0",
      status: "breakthrough_ready",
    });
    expect(result.discardedExperience).toBe("99999");
    expect(result.events).toEqual([{ type: "breakthrough_ready", level: 10 }]);
  });

  it("completes a guaranteed breakthrough into the next realm", () => {
    const input = progress({
      level: 10,
      experience: requiredExperienceForLevel(10),
      status: "breakthrough_ready",
    });
    const result = completeBreakthrough(input);

    expect(result.requiredPills).toBe(1);
    expect(result.progress).toEqual({
      level: 11,
      experience: "0",
      cultivationReserve: "0",
      status: "gaining",
    });
  });

  it("moves post-cap cultivation into reserve instead of levels or power", () => {
    const requiredAtCap = requiredExperienceForLevel(1000);
    const capped = applyWholeExperience(
      progress({ level: 1000, experience: "0" }),
      BigInt(requiredAtCap) + 500n,
    );

    expect(capped.progress).toEqual({
      level: 1000,
      experience: requiredAtCap,
      cultivationReserve: "500",
      status: "version_cap",
    });

    const continued = applyWholeExperience(capped.progress, 250);
    expect(continued.progress.cultivationReserve).toBe("750");
  });

  it("uses the one authoritative total-power formula", () => {
    expect(calculateTotalPower(10)).toBe("1000");
    expect(calculateTotalPower(31)).toBe("15500");
    expect(calculateTotalPower(31, { percentBonusBp: 2_000, fixedPower: "500" })).toBe(
      "19100",
    );
  });
});
