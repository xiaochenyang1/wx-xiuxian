import { Decimal, decimal, type DecimalInput } from "../decimal";

const DISPLAY_UNITS = [
  { exponent: 16, suffix: "京" },
  { exponent: 12, suffix: "兆" },
  { exponent: 8, suffix: "亿" },
  { exponent: 4, suffix: "万" },
] as const;

const SCIENTIFIC_THRESHOLD = decimal(10).pow(20);

export function formatLargeNumber(value: DecimalInput): string {
  const parsed = decimal(value);
  const sign = parsed.isNegative() ? "-" : "";
  const absolute = parsed.abs().toDecimalPlaces(0, Decimal.ROUND_FLOOR);

  if (absolute.greaterThanOrEqualTo(SCIENTIFIC_THRESHOLD)) {
    return `${sign}${absolute.toExponential(2)}`;
  }

  for (const unit of DISPLAY_UNITS) {
    const divisor = decimal(10).pow(unit.exponent);
    if (absolute.greaterThanOrEqualTo(divisor)) {
      const scaled = absolute.div(divisor).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      return `${sign}${trimDecimalZeros(scaled.toFixed(2))}${unit.suffix}`;
    }
  }

  return `${sign}${addThousandsSeparators(absolute.toFixed(0))}`;
}

function trimDecimalZeros(value: string): string {
  return value.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function addThousandsSeparators(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
