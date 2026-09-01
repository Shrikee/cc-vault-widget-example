import type { ReactNode } from "react";

import { WITHDRAW_DISCOUNT_PCT_DEFAULT } from "../config/redemption";
import { WITHDRAW_TOKEN } from "../config/tokens";
import { hasVestingGap, type Vault } from "../lib/vaultRegistry";
import { formatAmount, formatUsd, fmtSignedUsd, signAfterRounding } from "../lib/format";
import { computeEarnings } from "../lib/apy";
import { buildPositionExitLine } from "../lib/positionExit";
import { spreadPpmOf } from "../lib/postingRule";
import type { DepositHistory } from "../hooks/useDepositHistory";
import { formatDateTime, formatDuration } from "../lib/time";
import { useNow } from "../hooks/useNow";
import { Badge, Card, InlineError, Stat } from "./ui";

const wantSymbol = WITHDRAW_TOKEN.displayName ?? "USDT";

// What a wallet holds in one product — the part of that product's reads this
// card uses, declared narrowly so the card asks for no more than it shows.
export interface ProductPosition {
  // The product this position is in — its name and share symbol label the
  // holding, so two positions in one card can never be confused.
  vault: Vault;
  // `sharesRaw` and `sharePriceRaw` are the exit sub-line's, not the stat
  // grid's: an 18-dp balance does not survive a double, and the figure this
  // card quotes over the WHOLE balance has to be the same figure the withdraw
  // panel offers on MAX, to the wei.
  position: { shares: number | null; sharesRaw: bigint | null; unlockAt: number | null };
  metrics: { shareValue: number | null; sharePriceRaw: bigint | null };
  // Earnings is derived here rather than passed in: the average deposit cost
  // comes from that product's own scan, the shares and share price the card
  // already has. That same scan carries the holder history the sub-line prices
  // against, on the products that have one.
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
    position: { shares, sharesRaw, unlockAt },
    metrics: { shareValue, sharePriceRaw },
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

  // A wallet that holds none of this product gets no sub-line at all: its
  // earnings are $0.00 against any average deposit cost, so the figure would
  // say nothing about what it once earned. The two halves are one rule read at
  // two moments — "no-shares" is the scan declining to read a deposit history
  // nobody would see a figure from (src/lib/scanPlan.ts), and `shares === 0`
  // covers the frame between a balance reaching zero and the effect that says
  // so.
  const nothingToEarnOn = shares === 0 || depositHistory.status === "no-shares";

  // The sub-line under Position value. A wallet with no deposits in this
  // product says so — the block's own heading names which product that is. The
  // error line is doubled by the InlineError below — the reason belongs beside
  // the figure and in the card's error slot (§6.2).
  const earningsHint: ReactNode =
    depositHistory.status === "none" ? (
      "Earnings — No deposits found for this wallet."
    ) : depositHistory.status === "error" ? (
      "Earnings — Couldn't load deposit history."
    ) : nothingToEarnOn ? undefined : depositHistory.status !== "ready" ||
      earningsUsd === null ? (
      "…"
    ) : (
      <>
        <strong className={`earnings earnings--${tone}`}>
          {fmtSignedUsd(earningsUsd)}
        </strong>{" "}
        earned since your deposits
      </>
    );

  // What this holding is worth to exit today, over the WHOLE balance — the
  // sentence and every figure in it from src/lib/positionExit.ts.
  //
  // The gate is the vesting gap, never the vault id: a product whose shares
  // have vested by the time they unlock prices no exit against a ceiling, and
  // its block here is stage 1's, untouched.
  //
  // It is quoted independently of the earnings figure above, which is why the
  // history is read straight off the scan rather than off its status: a wallet
  // that was SENT its shares has no deposits and so no earnings — it keeps the
  // "—" beside that word — and it has an entitlement like anyone else.
  //
  // Two states this line has no wording for yet: a history that could not be
  // read, and a paused accountant. Both belong to the "when the widget cannot
  // price" ticket (spec §"When the widget cannot price"), which lands this
  // card's sentence for each; until then the model returns nothing for the
  // first and the pause flag is not threaded here at all.
  const exitLine = hasVestingGap(vault)
    ? buildPositionExitLine({
        history: depositHistory.history ?? null,
        shareBalance: sharesRaw,
        navPerShare: sharePriceRaw,
        now,
        unlockAt,
        vestingSeconds: vault.vestingSeconds,
        shareDecimals: vault.ui.decimals,
        // The widget's default spread, not the withdraw panel's control: this
        // card is outside that panel, and a figure here that moved with a
        // number typed over there would be two surfaces disagreeing.
        defaultSpreadPpm: spreadPpmOf(WITHDRAW_DISCOUNT_PCT_DEFAULT),
        shareSymbol: vault.ui.symbol,
        wantSymbol,
      })
    : null;

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

      {exitLine !== null && <p className="position__exit">{exitLine}</p>}

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
