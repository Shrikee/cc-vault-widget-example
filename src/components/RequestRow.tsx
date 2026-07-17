import { SHARE_SYMBOL, WITHDRAW_TOKEN } from "../config/vault";
import { formatAmount } from "../lib/format";
import { formatDateTime, formatDuration, requestPhase } from "../lib/time";
import { useNow } from "../hooks/useNow";
import type { WithdrawRequest } from "../hooks/useWithdrawRequest";
import { Badge, Button } from "./ui";

// Renders the user's single open AtomicQueue redemption request. The request is
// filled by an off-chain solver — there is no user "claim" step. This vault's
// raw cancel (zeroing the request) is admin-gated, so the user's lever to stop a
// pending fill is to revoke the share approval; the request itself clears at its
// deadline.
export function RequestRow({
  request,
  busy,
  onStop,
}: {
  request: WithdrawRequest;
  busy: boolean;
  onStop: () => void;
}) {
  const now = useNow();
  const phase = requestPhase(request.deadline, request.inSolve, now);
  const minOut = request.shares * request.minPrice;
  const wantSymbol = WITHDRAW_TOKEN.displayName ?? "USDT";

  // "stopped" = approval revoked while the request is still open/unexpired: it
  // exists on-chain but the solver can't pull shares, so it won't be filled.
  const stopped = !request.inSolve && phase === "open" && !request.approved;

  const tone = stopped
    ? "warning"
    : phase === "solving"
    ? "success"
    : phase === "open"
    ? "info"
    : "danger";
  const label = stopped
    ? "Stopped"
    : phase === "solving"
    ? "Filling"
    : phase === "open"
    ? "Open"
    : "Expired";

  const countdown = stopped
    ? "Approval revoked — won't be filled; clears at its deadline"
    : phase === "solving"
    ? "Solver is filling your request"
    : phase === "open"
    ? `Fillable for ${formatDuration(request.deadline - now)}`
    : `Expired ${formatDateTime(request.deadline)}`;

  const canStop = phase === "open" && request.approved && !request.inSolve;

  return (
    <div className={`request request--${stopped ? "expired" : phase}`}>
      <div className="request__main">
        <div className="request__line">
          <span className="request__shares">
            {formatAmount(request.shares, 4)} {SHARE_SYMBOL}
          </span>
          <Badge tone={tone}>{label}</Badge>
        </div>
        <div className="request__sub">
          → ≥ {formatAmount(minOut, 2)} {wantSymbol} · min{" "}
          {formatAmount(request.minPrice, 4)} {wantSymbol}/share
        </div>
        <div className="request__meta">
          <span>{countdown}</span>
          {phase === "open" && !stopped && (
            <>
              <span className="dot">·</span>
              <span>Deadline {formatDateTime(request.deadline)}</span>
            </>
          )}
        </div>
      </div>

      {canStop && (
        <div className="request__actions">
          <Button variant="danger" disabled={busy} onClick={onStop}>
            Stop request
          </Button>
        </div>
      )}
    </div>
  );
}
