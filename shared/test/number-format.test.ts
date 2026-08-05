import { describe, expect, it } from "vitest";
import { formatLargeNumber } from "../src";

describe("large number display", () => {
  it("uses separators below ten thousand", () => {
    expect(formatLargeNumber("9876")).toBe("9,876");
  });

  it("uses the fixed Chinese unit system", () => {
    expect(formatLargeNumber("10000")).toBe("1万");
    expect(formatLargeNumber("125000000")).toBe("1.25亿");
    expect(formatLargeNumber("2300000000000")).toBe("2.3兆");
    expect(formatLargeNumber("12000000000000000")).toBe("1.2京");
  });

  it("switches to scientific notation beyond the configured unit range", () => {
    expect(formatLargeNumber("100000000000000000000")).toBe("1.00e+20");
  });
});
