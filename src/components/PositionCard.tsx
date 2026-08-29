import type { ReactNode } from "react";

import type { Vault } from "../lib/vaultRegistry";
import { formatAmount, formatUsd, fmtSignedUsd, signAfterRounding } from "../lib/format";
import { computeEarnings } from "../lib/apy";
import type { DepositHistory } from "../hooks/useDepositHistory";
import { formatDateTime, formatDuration } from "../lib/time";
import { useNow } from "../hooks/useNow";
import { Badge, Card, InlineError, Stat } from "./ui";

// What a wallet holds in one product — the part of that product's reads this
// card uses, declared narrowly so the card asks for no more than it shows.
export interface ProductPosition {
  // The product this position is in — its name and share symbol label the
  // holding, so two positions in one card can never be confused.
  vault: Vault;
  position: { shares: number | null; unlockAt: number | null };
  metrics: { shareValue: number | null };
  // Earnings is derived here rather than passed in: the average deposit cost
  // comes from that product's own scan, the shares and share price the card
  // already has.
  depositHistory: DepositHistory;
}

// Every product the depositor holds, in one card.
//
// Both positions are shown whichever product is selected (spec, "Layout and
// selection"): a depositor holding both should see everything they hold in one
// place, and money in the product they are not looking at must never be
// invisible. Each figure is per product on purpose — the two share tokens have
// different share prices and different average deposit costs, so a blended
// total would be a number that is true of nothing.
//
// The card takes its products as an explicit list, which is the whole reason
// the widget threads a vault argument through every component instead of
// putting the selected one in a context: a context would have made this card
// the special case.
export function PositionCard({
  connected,
  products,
}: {
  connected: boolean;
  products: ProductPosition[];
}) {
  const now = useNow();

  if (!connected) {
    return (
      <Card title="Your positions">
        <p className="muted">Connect your wallet to view your positions.</p>
      </Card>
    );
  }

  return (
    <Card title="Your positions">
      {products.map((product) => (
        <ProductPositionBlock key={product.vault.id} product={product} now={now} />
      ))}
    </Card>
  );
}

function ProductPositionBlock({
  product: {
    vault,
    position: { shares, unlockAt },
    metrics: { shareValue },
    depositHistory,
  },
  now,
}: {
  product: ProductPosition;
  now: number;
}) {
  // shareValue is NAV per share in USDT (≈ USD), so position value ≈ USD.
  const positionValue =
    shares !== null && shareValue !== null ? shares * shareValue : null;
  const locked = unlockAt !== null && now < unlockAt;
  const secsLeft = unlockAt !== null ? unlockAt - now : 0;

  // Earnings: position value minus what the wallet paid for these shares, at
  // its average deposit cost. Signed — a share price below that cost is a real
  // loss — and toned off the rounded figure so a tenth of a cent reads flat.
  const earningsUsd = computeEarnings(shares, shareValue, depositHistory.avgCost);
  const sign = earningsUsd === null ? 0 : signAfterRounding(earningsUsd, 2);
  const tone = sign > 0 ? "up" : sign < 0 ? "down" : "flat";

  // The sub-line under Position value. A wallet with no deposits in this
  // product says so — the block's own heading names which product that is; a
  // wallet that has since exited its whole position gets no sub-line, because
  // the figure would be $0.00 regardless of what it once earned. The error
  // line is doubled by the InlineError below — the reason belongs beside the
  // figure and in the card's error slot (§6.2).
  const earningsHint: ReactNode =
    depositHistory.status === "none" ? (
      "Earnings — No deposits found for this wallet."
    ) : depositHistory.status === "error" ? (
      "Earnings — Couldn't load deposit history."
    ) : depositHistory.status !== "ready" || earningsUsd === null ? (
      "…"
    ) : shares === 0 ? undefined : (
      <>
        <strong className={`earnings earnings--${tone}`}>
          {fmtSignedUsd(earningsUsd)}
        </strong>{" "}
        earned since your deposits
      </>
    );

  return (
    <div className="position">
      <div className="position__head">
        <h3 className="position__name">{vault.ui.name}</h3>
        {locked ? (
          <Badge tone="warning">Locked</Badge>
        ) : shares && shares > 0 ? (
          <Badge tone="success">Unlocked</Badge>
        ) : null}
      </div>

      <div className="stat-grid">
        <Stat
          label={`Your ${vault.ui.symbol}`}
          value={shares === null ? "…" : formatAmount(shares, 4)}
        />
        <Stat
          label="Position value"
          value={positionValue === null ? "…" : formatUsd(positionValue, 2)}
          hint={earningsHint}
        />
      </div>

      {depositHistory.status === "error" && (
        <InlineError>
          Couldn't load deposit history: {depositHistory.error}
        </InlineError>
      )}

      {locked && (
        <div className="notice notice--warning">
          <strong>
            {vault.ui.symbol} shares locked for {formatDuration(secsLeft)}.
          </strong>
          <span>
            Unlocks {formatDateTime(unlockAt!)} ({" "}
            {Math.max(0, Math.ceil(secsLeft / 86400))}d remaining). You can
            redeem after this.
          </span>
        </div>
      )}
    </div>
  );
}
