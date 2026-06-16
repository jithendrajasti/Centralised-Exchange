export const SCALE = 1_000_000;
const SCALE_DIGITS = 6;
const SCALE_BIG = BigInt(SCALE);

export function toScaledFromDecimal(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return NaN;
  }

  const negative = trimmed.startsWith("-");
  const normalized = negative ? trimmed.slice(1) : trimmed;
  const [wholeRaw, fracRaw = ""] = normalized.split(".");
  const whole = wholeRaw || "0";

  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fracRaw)) {
    return NaN;
  }

  const frac = (fracRaw + "0".repeat(SCALE_DIGITS)).slice(0, SCALE_DIGITS);
  const wholeInt = Number(whole);
  const fracInt = Number(frac || "0");

  if (!Number.isFinite(wholeInt) || !Number.isFinite(fracInt)) {
    return NaN;
  }

  const scaled = wholeInt * SCALE + fracInt;
  return negative ? -scaled : scaled;
}

export function fromScaledToDecimal(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs / SCALE);
  const frac = abs % SCALE;
  const sign = negative ? "-" : "";

  if (frac === 0) {
    return `${sign}${whole}`;
  }

  const fracStr = frac
    .toString()
    .padStart(SCALE_DIGITS, "0")
    .replace(/0+$/, "");

  return `${sign}${whole}.${fracStr}`;
}

export function formatDecimalWithScale(value: number, scaleDigits: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const scale = 10 ** scaleDigits;
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs / scale);
  const frac = abs % scale;
  const sign = negative ? "-" : "";

  if (frac === 0) {
    return `${sign}${whole}`;
  }

  const fracStr = frac
    .toString()
    .padStart(scaleDigits, "0")
    .replace(/0+$/, "");

  return `${sign}${whole}.${fracStr}`;
}

export function multiplyScaled(a: number, b: number): number {
  return Number((BigInt(a) * BigInt(b)) / SCALE_BIG);
}

export function scaledToNumber(value: number): number {
  return value / SCALE;
}

export function scaleFromNumber(value: number): number {
  return Math.round(value * SCALE);
}

export function percentChangeScaled(current: number, first: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(first) || first === 0) {
    return "0";
  }

  const diff = current - first;
  const percentScaled = Number((BigInt(diff) * BigInt(10000)) / BigInt(first));
  return formatDecimalWithScale(percentScaled, 2);
}
