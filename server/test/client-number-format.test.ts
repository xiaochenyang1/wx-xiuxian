import { describe, expect, it } from "vitest";
import {
  formatLargeNumber,
  ratioOfBigNumberStrings,
  sumBigNumberStrings,
} from "../../assets/scripts/core/ClientNumber";

describe("Cocos client large-number helpers", () => {
  it("uses separators and fixed Chinese units without losing integer precision", () => {
    expect(formatLargeNumber("9876")).toBe("9,876");
    expect(formatLargeNumber("10000")).toBe("1万");
    expect(formatLargeNumber("125000000")).toBe("1.25亿");
    expect(formatLargeNumber("2300000000000")).toBe("2.3兆");
    expect(formatLargeNumber("12000000000000000")).toBe("1.2京");
    expect(formatLargeNumber("-125000000")).toBe("-1.25亿");
  });

  it("switches to rounded scientific notation at 10^20", () => {
    expect(formatLargeNumber("100000000000000000000")).toBe("1.00e+20");
    expect(formatLargeNumber("999500000000000000000")).toBe("1.00e+21");
  });

  it("sums quantities beyond Number.MAX_SAFE_INTEGER", () => {
    expect(
      sumBigNumberStrings([
        "9007199254740993",
        "9007199254740993",
        "14",
      ]),
    ).toBe("18014398509482000");
    expect(sumBigNumberStrings(["100", "-250", "25"])).toBe("-125");
  });

  it("calculates a bounded fixed-point progress ratio", () => {
    expect(ratioOfBigNumberStrings("25", "100")).toBe(0.25);
    expect(
      ratioOfBigNumberStrings(
        "50000000000000000000000000000000000000",
        "100000000000000000000000000000000000000",
      ),
    ).toBe(0.5);
    expect(ratioOfBigNumberStrings("101", "100")).toBe(1);
    expect(ratioOfBigNumberStrings("invalid", "100")).toBe(0);
  });
});
