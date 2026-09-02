import { useEffect } from "react";

import { readFailedReason, reportError } from "../lib/userError";

// The wagmi-query half of ADR-0004, held once: the raw error goes to the
// console — it names the endpoint — and the caller renders the classified
// phrase. Logged in an effect keyed on the error, so a poll that keeps
// failing writes one line per failure rather than one per render.
export function useReportedReadError(
  context: string,
  error: unknown
): string | null {
  useEffect(() => {
    if (error) reportError(context, error);
  }, [context, error]);
  return error ? readFailedReason(error) : null;
}
