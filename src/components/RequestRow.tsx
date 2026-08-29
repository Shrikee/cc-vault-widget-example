import { WITHDRAW_TOKEN } from "../config/tokens";
import { hasVestingGap, type Vault } from "../lib/vaultRegistry";
import { formatAmount } from "../lib/format";
import { describeRequest } from "../lib/requestStatus";
import { formatDateTime } from "../lib/time";
import { useNow } from "../hooks/useNow";
import type { WithdrawRequest } from "../hooks/useWithdrawRequest";
import { Badge, Button } from "./ui";

// Renders one open AtomicQueue redemption request. The request is filled by an
// off-chain solver — there is no user "claim" step. The raw cancel (zeroing the
// request) is admin-gated on both vaults, so the depositor's lever to stop a
// pending fill is to revoke the share approval; the request itself clears at its
// deadline.
//
// What the row is allowed to SAY is decided in src/lib/requestStatus.ts, not
// here: it is a decision with vectors behind it, and it has to read the same
// wherever a request is named. This component only lays the words out, and adds
// the one thing that module deliberately does not produce — the deadline as a
// date, which formats differently per environment.
export function RequestRow({
  vault,
  request,
  busy,
  onStop,
}: {
  // The product the request is against — its share symbol is what is offered,
  // and whether its shares can be redeemable while still unvested decides
  // whether an open request carries the vesting note.
  vault: Vault;
  request: WithdrawRequest;
  busy: boolean;
  onStop: () => void;
}) {
  const now = useNow();
  const { status, tone, badge, detail, note } = describeRequest(
    { ...request, vestingGap: hasVestingGap(vault) },
    now
  );
  const minOut = request.shares * request.minPrice;
  const wantSymbol = WITHDRAW_TOKEN.displayName ?? "USDT";

  // "open" already means approved, not held by the solver and inside its
  // deadline — every condition there is to stop.
  const canStop = status === "open";

  return (
    <div className={`request request--${status}`}>
      <div className="request__main">
        <div className="request__line">
          <span className="request__shares">
            {formatAmount(request.shares, 4)} {vault.ui.symbol}
          </span>
          <Badge tone={tone}>{badge}</Badge>
        </div>
        <div className="request__sub">
          → ≥ {formatAmount(minOut, 2)} {wantSymbol} · min{" "}
          {formatAmount(request.minPrice, 4)} {wantSymbol}/share
        </div>
        {/* The deadline is shown in every state, not only while the request is
            open. It is the date the countdown counts to, the date a stopped
            request clears itself on, and the date an expired one lapsed on — and
            now that the row claims nothing about being filled, it is the one
            fact the widget can hold a depositor to. */}
        <div className="request__meta">
          <span>{detail}</span>
          <span className="dot">·</span>
          <span>Deadline {formatDateTime(request.deadline)}</span>
        </div>
        {/* On a product that vests, why a request can sit open, and where to
            ask. It belongs beside the request rather than only in the withdraw
            panel: this card is outside the selection and outside the tabs, so a
            30d request that is not filling is normally read from the deposit tab
            or from the other product, where no panel of its own is on screen. */}
        {note && <p className="request__note">{note}</p>}
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
