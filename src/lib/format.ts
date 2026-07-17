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
