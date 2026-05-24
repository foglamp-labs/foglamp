// Exact fixed-point arithmetic for cost math. OpenRouter prices are per-token
// decimal strings (e.g. "0.00000008333333333333334"); multiplying by integer
// token counts in float would drift at the 10th decimal that ClickHouse stores.
// We keep everything in BigInt scaled to 10^COST_SCALE and round half-up once.

export const COST_SCALE = 10; // matches ClickHouse Decimal(18, 10)

const DECIMAL_RE = /^\d+(\.\d+)?$/;

/** value = mantissa / 10^scale, or null if `s` is not a plain decimal. */
export function parseDecimal(
  s: string,
): { mantissa: bigint; scale: number } | null {
  const t = s.trim();
  if (!DECIMAL_RE.test(t)) return null;
  const dot = t.indexOf(".");
  if (dot === -1) return { mantissa: BigInt(t), scale: 0 };
  const intPart = t.slice(0, dot);
  const fracPart = t.slice(dot + 1);
  return { mantissa: BigInt((intPart || "0") + fracPart), scale: fracPart.length };
}

/**
 * `priceStr * count`, scaled by 10^COST_SCALE, rounded half-up. Returns null if
 * the price string is malformed or count is negative.
 */
export function scaledCost(priceStr: string, count: number): bigint | null {
  const p = parseDecimal(priceStr);
  if (!p || !Number.isFinite(count) || count < 0) return null;
  const num = p.mantissa * BigInt(Math.trunc(count));
  const shift = COST_SCALE - p.scale;
  if (shift >= 0) return num * 10n ** BigInt(shift);
  const div = 10n ** BigInt(-shift);
  return (num + div / 2n) / div; // round half-up (div is a power of 10, even)
}

/** Format a 10^COST_SCALE-scaled BigInt as a fixed Decimal(.,10) string. */
export function formatScaled(scaled: bigint): string {
  const neg = scaled < 0n;
  const digits = (neg ? -scaled : scaled).toString().padStart(COST_SCALE + 1, "0");
  const cut = digits.length - COST_SCALE;
  return `${neg ? "-" : ""}${digits.slice(0, cut)}.${digits.slice(cut)}`;
}
