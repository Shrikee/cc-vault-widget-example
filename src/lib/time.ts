export const nowSeconds = () => Math.floor(Date.now() / 1000);

// Lifecycle of an AtomicQueue redemption request. A request is a single struct
// keyed by (offer, want); it is either still fillable ("open") or its deadline
// has lapsed ("expired") and it must be re-submitted (or cancelled).
//   inSolve -> the solver is currently filling it
//   open    -> offerAmount > 0 and now < deadline
//   expired -> offerAmount > 0 and now >= deadline
export type RequestPhase = "open" | "expired" | "solving";

export function requestPhase(
  deadline: number,
  inSolve: boolean,
  now = nowSeconds()
): RequestPhase {
  if (inSolve) return "solving";
  return now < deadline ? "open" : "expired";
}

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
