import Decimal, { type Numeric } from "decimal.js-light";

Decimal.set({
  precision: 80,
  rounding: Decimal.ROUND_HALF_UP,
});

export type DecimalInput = Numeric | bigint;

export function decimal(value: DecimalInput): Decimal {
  return new Decimal(typeof value === "bigint" ? value.toString() : value);
}

export { Decimal };
