// Display helpers. All vault numbers are already decimal-adjusted (human
// readable) by the library — never re-scale by 10**decimals.

export function formatNumber(
  value: number | undefined | null,
  maxDecimals = 8,
  minDecimals = 2
): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });
}

// Token / share amounts: trim trailing zeros but keep precision up to `maxDp`.
// Used for USDC/USDT amounts and CCUSD share balances alike.
export function formatAmount(
  value: number | undefined | null,
  maxDp = 6
): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  if (value === 0) return "0";
  const fixed = value.toFixed(maxDp);
  return fixed.replace(/\.?0+$/, "");
}

export function formatUsd(
  value: number | undefined | null,
  maxDp = 0
): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: maxDp,
  });
}

export function shortAddress(addr?: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Parse a user-typed amount string into a finite positive number, else null.
export function parseAmount(input: string): number | null {
  if (!input.trim()) return null;
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// The sign a figure will be READ with: round to the decimals it is shown at
// first, then take the sign. A tenth of a cent reads flat rather than as a
// gain, and a hair below zero is "0.00%", never "−0.00%" — which the sign, the
// minus glyph and the up/down tone all have to agree on.
export function signAfterRounding(value: number, decimals: number): -1 | 0 | 1 {
  const rounded = Number(value.toFixed(decimals));
  if (rounded > 0) return 1;
  if (rounded < 0) return -1;
  return 0;
}

// Realised trailing APY: 2 dp, signed with a true minus (U+2212), never
// clamped — a negative window is a real result. "—" when no figure exists.
export function fmtPct(value: number | null | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  const magnitude = `${Math.abs(value).toFixed(2)}%`;
  return signAfterRounding(value, 2) < 0 ? `−${magnitude}` : magnitude;
}

// Earnings: a signed USD figure — "+$12.34" / "−$0.20" / "$0.00", always 2 dp,
// with a true minus (U+2212) and "—" when there is no figure.
export function fmtSignedUsd(value: number | null | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  const magnitude = Math.abs(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = signAfterRounding(value, 2);
  if (sign > 0) return `+${magnitude}`;
  if (sign < 0) return `−${magnitude}`;
  return magnitude;
}
