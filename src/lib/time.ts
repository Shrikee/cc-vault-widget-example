// The clock and its formatting. What state a redemption request is in given
// that clock is a separate decision, and lives in ./requestStatus.ts with the
// wording it drives.
export const nowSeconds = () => Math.floor(Date.now() / 1000);

// Human countdown like "1d 4h 12m" / "3h 5m" / "42s". Returns "" if <= 0.
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m && !d) parts.push(`${m}m`);
  if (!d && !h) parts.push(`${s}s`);
  return parts.join(" ");
}

export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
