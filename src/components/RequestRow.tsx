import { WITHDRAW_DISCOUNT_PCT_DEFAULT } from "../config/redemption";
import { WITHDRAW_TOKEN } from "../config/tokens";
import { hasVestingGap, type Vault } from "../lib/vaultRegistry";
import { formatAmount } from "../lib/format";
import { spreadPpmOf } from "../lib/postingRule";
import {
  buildRequestRow,
  type RequestRepost,
  type RequestRowReads,
} from "../lib/requestRow";
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
// What the row is allowed to SAY is decided in two modules, not here, and for
// the same reason: both are decisions with vectors behind them, and they have
// to read the same wherever a request is named. src/lib/requestStatus.ts says
// which of four states a request is in — stage 1's, unchanged. On a product
// whose exits are priced against the holder's entitlement,
// src/lib/requestRow.ts then judges the request against the ceiling for the
// shares it offers: the badge, the ask-vs-ceiling strip, the one five-way note
// and the re-post offer are all its, computed on the SAME `now` as the status
// above, so the badge and the note can never disagree about a deadline.
//
// This component lays the words out, and adds the one thing neither module
// produces — the deadline as a date, which formats differently per environment.
export function RequestRow({
  vault,
  request,
  reads,
  busy,
  onStop,
  onRepost,
}: {
  // The product the request is against — its share symbol is what is offered,
  // and whether its shares can be redeemable while still unvested decides
  // whether the request is priced at all.
  vault: Vault;
  request: WithdrawRequest;
  reads: RequestRowReads;
  busy: boolean;
  onStop: () => void;
  // Re-post these shares: the caller takes it to the withdraw panel's pinned
  // confirm flow, which prices them again at the block it pins. Nothing is
  // posted from here, and no price this row printed is carried into the write.
  onRepost: (repost: RequestRepost) => void;
}) {
  const now = useNow();
  const { status, tone, badge, detail, note } = describeRequest(
    { ...request, vestingGap: hasVestingGap(vault) },
    now
  );
  const minOut = request.shares * request.minPrice;
  const wantSymbol = WITHDRAW_TOKEN.displayName ?? "USDT";

  // The priced judgement, or "unpriced" — a product with no vesting gap, a
  // request nobody may re-price, or a read the rail does not have.
  const judged = buildRequestRow({
    vestingGap: hasVestingGap(vault),
    status,
    offerShares: request.sharesRaw,
    ask: request.minPriceRaw,
    deadline: request.deadline,
    history: reads.history,
    shareBalance: reads.shareBalance,
    navPerShare: reads.navPerShare,
    paused: reads.paused,
    now,
    vestingSeconds: vault.vestingSeconds,
    shareDecimals: vault.ui.decimals,
    // The side rail cannot see the withdraw panel's spread control, so a
    // re-post is quoted at the default — the same spread the position card's
    // sub-line quotes at, so the two never disagree. What is actually posted is
    // the pin's, recomputed at the block it pins.
    defaultSpreadPpm: spreadPpmOf(WITHDRAW_DISCOUNT_PCT_DEFAULT),
    wantSymbol,
  });
  const priced = judged.kind === "priced" ? judged : null;
  // The share price is under review: the badge and the deadline, and nothing
  // else (spec §"When the widget cannot price"). Not stage 1's sub-line and not
  // stage 1's note — both are about why a request may sit open on a vesting
  // product, and while the accountant is paused that is not the live reason.
  const pricingPaused = judged.kind === "paused";
  // Pulled out of the judgement so the button below reads from a `const` the
  // narrowing survives into its own handler.
  const repost = priced?.repost ?? null;

  // "open" already means approved, not held by the solver and inside its
  // deadline — every condition there is to stop.
  const canStop = status === "open";

  // The one line the row carries whatever else it says. Written once, rendered
  // in both layouts below — the priced row puts it after the note the spec's
  // order asks for, stage 1's keeps it where stage 1 had it.
  const deadline = (
    <div className="request__meta">
      <span>{detail}</span>
      <span className="dot">·</span>
      <span>Deadline {formatDateTime(request.deadline)}</span>
    </div>
  );

  return (
    <div className={`request request--${status}`}>
      <div className="request__main">
        <div className="request__line">
          <span className="request__shares">
            {formatAmount(request.shares, 4)} {vault.ui.symbol}
          </span>
          {/* The badge names the CASE where one was computed — an ask above the
              share price and an ask above the ceiling are two different things
              to do about a request that reads "Open" either way. */}
          <Badge tone={priced ? priced.tone : tone}>
            {priced ? priced.badge : badge}
          </Badge>
        </div>

        {/* The deadline is shown in every state, not only while the request is
            open. It is the date the countdown counts to, the date a stopped
            request clears itself on, and the date an expired one lapsed on —
            and where the exit is priced it is rendered BESIDE the comparison on
            purpose: an expired request cannot be filled at any price, which is
            the one thing an ask-vs-ceiling strip cannot show. One element, in
            both orders below, so no branch can drop it. */}
        {priced ? (
          <>
            {/* The comparison: what this request asks, and the most it may
                ask. Two lines, one number each, so the gap between them is the
                whole point of looking. */}
            <div className="request__strip">
              <div className="request__strip-line">
                <span>{priced.strip.ask.label}</span>
                <strong>{priced.strip.ask.value}</strong>
                <span className="muted">{priced.strip.ask.note}</span>
              </div>
              <div
                className={`request__strip-line request__strip-line--${
                  priced.askingAbove ? "above" : "within"
                }`}
              >
                <span>{priced.strip.ceiling.label}</span>
                <strong>{priced.strip.ceiling.value}</strong>
                <span className="muted">{priced.strip.ceiling.note}</span>
              </div>
            </div>
            {/* Exactly one note, computed: which of the five things is true of
                this request (src/lib/requestRow.ts). It replaces stage 1's
                "may sit open", which was all the widget could say before it
                could read a ceiling. */}
            <p className="request__note">{priced.note}</p>
            {deadline}
          </>
        ) : pricingPaused ? (
          deadline
        ) : (
          <>
            <div className="request__sub">
              → ≥ {formatAmount(minOut, 2)} {wantSymbol} · min{" "}
              {formatAmount(request.minPrice, 4)} {wantSymbol}/share
            </div>
            {deadline}
            {/* Stage 1's note, on a product that vests: why a request can sit
                open, and where to ask. This card is outside the selection and
                outside the tabs, so a request that is not filling is normally
                read with no panel of its own on screen. */}
            {note && <p className="request__note">{note}</p>}
          </>
        )}
      </div>

      {(repost || canStop) && (
        <div className="request__actions">
          {/* The primary action wherever a better post exists: it does not post
              anything itself — it opens the withdraw panel's confirm, which
              pins the figures at a block of its own and prices these shares
              again there. The price on the button is what a post would ask at
              the share price this row was rendered from. */}
          {repost && (
            <Button disabled={busy} onClick={() => onRepost(repost)}>
              {repost.label}
            </Button>
          )}
          {canStop && (
            <Button variant="danger" disabled={busy} onClick={onStop}>
              Stop request
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
