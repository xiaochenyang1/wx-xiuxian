const INTEGER_PATTERN = /^[+-]?\d+$/;
const RATIO_DECIMAL_PLACES = 6;

const DISPLAY_UNITS = [
  { exponent: 16, suffix: "京" },
  { exponent: 12, suffix: "兆" },
  { exponent: 8, suffix: "亿" },
  { exponent: 4, suffix: "万" },
] as const;

interface ParsedInteger {
  negative: boolean;
  digits: string;
}

export function formatLargeNumber(value: string): string {
  let parsed: ParsedInteger;
  try {
    parsed = parseInteger(value);
  } catch {
    return value;
  }

  const sign = parsed.negative ? "-" : "";
  if (parsed.digits.length >= 21) {
    return `${sign}${formatScientific(parsed.digits)}`;
  }

  for (const unit of DISPLAY_UNITS) {
    if (parsed.digits.length <= unit.exponent) continue;
    const wholeLength = parsed.digits.length - unit.exponent;
    const whole = parsed.digits.slice(0, wholeLength);
    const fraction = rightPad(
      parsed.digits.slice(wholeLength, wholeLength + 2),
      2,
      "0",
    ).replace(/0+$/, "");
    return `${sign}${whole}${fraction ? `.${fraction}` : ""}${unit.suffix}`;
  }

  return `${sign}${parsed.digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export function sumBigNumberStrings(values: readonly string[]): string {
  let total: ParsedInteger = { negative: false, digits: "0" };
  for (const value of values) total = addIntegers(total, parseInteger(value));
  return `${total.negative ? "-" : ""}${total.digits}`;
}

export function ratioOfBigNumberStrings(value: string, total: string): number {
  try {
    const numerator = parseInteger(value);
    const denominator = parseInteger(total);
    if (
      numerator.negative ||
      denominator.negative ||
      numerator.digits === "0" ||
      denominator.digits === "0"
    ) {
      return 0;
    }
    if (compareMagnitude(numerator.digits, denominator.digits) >= 0) return 1;

    const scaled = divideUnsignedInteger(
      `${numerator.digits}${"0".repeat(RATIO_DECIMAL_PLACES)}`,
      denominator.digits,
    );
    return Number(scaled) / 10 ** RATIO_DECIMAL_PLACES;
  } catch {
    return 0;
  }
}

function parseInteger(value: string): ParsedInteger {
  const normalized = value.trim();
  if (!INTEGER_PATTERN.test(normalized)) {
    throw new Error(`Invalid integer string: ${value}`);
  }
  const negative = normalized[0] === "-";
  const unsigned =
    normalized[0] === "-" || normalized[0] === "+"
      ? normalized.slice(1)
      : normalized;
  const digits = normalizeDigits(unsigned);
  return { negative: negative && digits !== "0", digits };
}

function addIntegers(left: ParsedInteger, right: ParsedInteger): ParsedInteger {
  if (left.negative === right.negative) {
    return {
      negative: left.negative,
      digits: addMagnitudes(left.digits, right.digits),
    };
  }

  const comparison = compareMagnitude(left.digits, right.digits);
  if (comparison === 0) return { negative: false, digits: "0" };
  const larger = comparison > 0 ? left : right;
  const smaller = comparison > 0 ? right : left;
  return {
    negative: larger.negative,
    digits: subtractMagnitudes(larger.digits, smaller.digits),
  };
}

function addMagnitudes(left: string, right: string): string {
  let carry = 0;
  let result = "";
  let leftIndex = left.length - 1;
  let rightIndex = right.length - 1;
  while (leftIndex >= 0 || rightIndex >= 0 || carry > 0) {
    const sum = digitAt(left, leftIndex) + digitAt(right, rightIndex) + carry;
    result = String(sum % 10) + result;
    carry = Math.floor(sum / 10);
    leftIndex -= 1;
    rightIndex -= 1;
  }
  return normalizeDigits(result);
}

function subtractMagnitudes(larger: string, smaller: string): string {
  let borrow = 0;
  let result = "";
  let smallerIndex = smaller.length - 1;
  for (let largerIndex = larger.length - 1; largerIndex >= 0; largerIndex -= 1) {
    let difference = digitAt(larger, largerIndex) - borrow;
    const subtrahend = digitAt(smaller, smallerIndex);
    if (difference < subtrahend) {
      difference += 10;
      borrow = 1;
    } else {
      borrow = 0;
    }
    result = String(difference - subtrahend) + result;
    smallerIndex -= 1;
  }
  return normalizeDigits(result);
}

function divideUnsignedInteger(dividend: string, divisor: string): string {
  let quotient = "";
  let remainder = "0";
  for (const digit of dividend) {
    remainder = normalizeDigits(`${remainder}${digit}`);
    let quotientDigit = 0;
    while (compareMagnitude(remainder, divisor) >= 0) {
      remainder = subtractMagnitudes(remainder, divisor);
      quotientDigit += 1;
    }
    quotient += String(quotientDigit);
  }
  return normalizeDigits(quotient);
}

function compareMagnitude(left: string, right: string): number {
  if (left.length !== right.length) return left.length > right.length ? 1 : -1;
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function formatScientific(digits: string): string {
  let significant = rightPad(digits.slice(0, 3), 3, "0");
  if (Number(digits[3] ?? "0") >= 5) {
    significant = addMagnitudes(significant, "1");
  }
  const carried = significant.length > 3;
  if (carried) significant = "100";
  const exponent = digits.length - 1 + (carried ? 1 : 0);
  return `${significant[0]}.${significant.slice(1)}e+${exponent}`;
}

function normalizeDigits(value: string): string {
  return value.replace(/^0+(?=\d)/, "");
}

function digitAt(value: string, index: number): number {
  return index < 0 ? 0 : Number(value[index] ?? "0");
}

function rightPad(value: string, length: number, fill: string): string {
  return value.length >= length ? value : value + fill.repeat(length - value.length);
}
