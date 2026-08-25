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

// Realised trailing APY: 2 dp, signed with a true minus (U+2212), never
// clamped — a negative window is a real result. "—" when no figure exists.
export function fmtPct(value: number | null | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  // Round first, then sign: a value that rounds to zero is "0.00%", never
  // "−0.00%".
  const magnitude = `${Math.abs(value).toFixed(2)}%`;
  return Number(value.toFixed(2)) < 0 ? `−${magnitude}` : magnitude;
}

// Earnings: a signed USD figure — "+$12.34" / "−$0.20" / "$0.00", always 2 dp,
// with a true minus (U+2212) and "—" when there is no figure. As in fmtPct the
// sign comes from the *rounded* value, so a gain of a tenth of a cent reads
// "$0.00" rather than "+$0.00".
export function fmtSignedUsd(value: number | null | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  const rounded = Number(value.toFixed(2));
  const magnitude = Math.abs(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (rounded > 0) return `+${magnitude}`;
  if (rounded < 0) return `−${magnitude}`;
  return magnitude;
}
