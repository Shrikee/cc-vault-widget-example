// What the position card says a holding is worth to exit today, on a product
// whose exits are priced against the holder's entitlement.
//
// One sentence under the stat grid, and it answers a different question from
// the withdraw panel's quote card. The panel prices the amount in its box; this
// prices the WHOLE BALANCE, at the wider of the widget's default redemption
// spread and the one the entitlement requires. That is the decision the spec
// makes (§"The surfaces — Variant B", the position card row) and the reason the
// two surfaces can never disagree: they are not two answers to one question,
// they are one answer each to two.
//
// THE COPY LIVES HERE, not in the JSX, for the reason src/lib/withdrawQuote.ts
// gives at the same length: the spec's surface table is verbatim copy, this
// repo has no component tests by policy (spec, "Not covered by tests"), and a
// sentence assembled in a component is a sentence nothing can assert. Assembled
// here, every form of it is pinned by ./positionExit.test.ts.
//
// Pure — no chain, no React, no clock of its own. The ceiling is
// `quoteEntitlement`'s, reached through src/lib/lotListing.ts; the spreads and
// the prices are src/lib/postingRule.ts's. Nothing here computes a price.
//
// Units: shares are share-decimal bigints (18 dp on both products); payouts are
// want units (USDT, 6 dp) and prices want per WHOLE share; spreads are the
// queue's parts per million.
import type {
  EntitlementQuery,
  HolderEvent,
} from "../entitlement/entitlement";
import { largestPostableShares, lotListing } from "./lotListing";
import type { HistoryUnreadable } from "./pricedHistory";
import { askPrice, payout, postedDiscount, requiredSpread } from "./postingRule";
import { formatWant, formatShares, formatSpread } from "./figures";

// What the card knows about one product's holding. The vendored rule's seven
// inputs minus the offered shares — which are the balance, always — plus the
// two symbols the sentence names things with.
export interface PositionExitInputs {
  // The holder history the ceiling is computed from — the held scan. `null`
  // while it has not landed, or when it could not be read; nothing is priced
  // from a history the widget does not have.
  history: readonly HolderEvent[] | null;
  // Why that history is null, when the answer is "it could not be read" rather
  // than "not yet" — a failed scan, or a ledger floor the widget cannot
  // establish (./pricedHistory.ts). The SAME shape every priced surface takes,
  // passed straight through from `PricedHistory.unreadable`, so no caller has
  // to convert it and no two surfaces can disagree about what it means.
  //
  // This card reads only whether it is null: it has one sentence either way,
  // and naming the reason is the job of the surface that offers the retry.
  unreadable: HistoryUnreadable | null;
  // The accountant's pause flag for this product: true while the share price is
  // under review, false while it is not, and null until the poll has answered
  // at all. Null is NOT permission to price — the auto-pause stores the
  // out-of-bounds rate before setting the flag, so an unread flag over a rate
  // that decodes is exactly the case this exists to catch — and it is not the
  // paused wording either, because nothing has been established yet.
  paused: boolean | null;
  // The raw balance, to the wei. This is the quoted amount: the card offers no
  // box to type a smaller one into.
  shareBalance: bigint | null;
  // Today's share price, want per whole share — the Lens rate as it is read,
  // undivided.
  navPerShare: bigint | null;
  // Unix seconds, from `useNow` — the same clock the lock badge counts on.
  now: number;
  // When the share lock ends, if it has not.
  unlockAt: number | null;
  vestingSeconds: number;
  shareDecimals: number;
  // The WIDGET'S default redemption spread in the queue's ppm, not the withdraw
  // panel's control: the card is outside that panel and must not move with a
  // number typed into it. What a post would carry is the wider of this and the
  // entitlement's required spread.
  defaultSpreadPpm: bigint;
  shareSymbol: string;
  wantSymbol: string;
}

// The vendored rule's own query, minus the shares being asked about — narrowed
// once, at the top of the builder, so nothing downstream needs a non-null
// assertion.
type EntitlementInputs = Omit<EntitlementQuery, "offerShares">;

// The sub-line, or `null` where there is nothing to say.
//
// Total over the states this surface has copy for: the quote (vesting or fully
// vested), the clamp, the lock, and the two the spec gives this card a sentence
// of its own for — a paused accountant and an unreadable history (§"When the
// widget cannot price"). What still returns `null` is a wallet holding none of
// the product, and a read that has not landed yet: nothing has failed there, so
// a sentence about a failure would not be true. Silence is the one thing that
// cannot be wrong — no figure on screen is better than a figure priced off a
// read the widget does not have.
//
// The caller decides whether this product prices exits at all — the gate is the
// vesting gap, never the vault id (src/lib/vaultRegistry.ts, `hasVestingGap`).
export function buildPositionExitLine(
  inputs: PositionExitInputs
): string | null {
  const {
    history,
    unreadable,
    paused,
    shareBalance,
    navPerShare,
    now,
    unlockAt,
    vestingSeconds,
    shareDecimals,
    defaultSpreadPpm,
    shareSymbol,
    wantSymbol,
  } = inputs;

  // NOTHING TO PRICE comes first, and outranks everything below it. A wallet
  // holding none of this product has no exit to describe: "≈ 0.00 USDT" is a
  // sentence about nothing, and so is "Redeemable today" over a zero balance —
  // the degraded lines are about a holding, and there is none.
  if (shareBalance === null || shareBalance <= 0n) return null;

  // Nothing to price FROM, in the two states this card has words for. The order
  // is the quote card's, and for the same reason: the pause is the live
  // operator state and the one that also closes the post, so it is what a
  // holder is told when both are true.
  if (paused === true)
    return "Redeemable today — not while the share price is under review.";
  if (unreadable !== null)
    return "Redeemable today — couldn't read your history.";

  // And the states it has no words for, because nothing has failed: a read
  // still in flight, including a pause flag nobody has answered for yet.
  // Silence is the one thing that cannot be wrong here — no figure on screen is
  // better than a figure priced off a read the widget does not have.
  if (
    paused === null ||
    history === null ||
    navPerShare === null ||
    navPerShare <= 0n
  )
    return null;

  const query: EntitlementInputs = {
    history,
    shareBalance,
    navPerShare,
    now,
    vestingSeconds,
    shareDecimals,
  };
  // Over the whole balance — the one thing this surface ever quotes.
  const listing = lotListing({ ...query, offerShares: shareBalance });
  const required = requiredSpread(navPerShare, listing.ceiling);
  const posted = postedDiscount(defaultSpreadPpm, required);

  // The clamp is answered BEFORE the lock, which is the opposite of the
  // withdraw panel's order and deliberate. The panel quotes nothing while
  // locked, so its lock notice needs no price; this card quotes THROUGH the
  // lock, so it needs one — and past the contract's 1% maximum there is no
  // postable price to name. The refusal is what is true either way; the lock is
  // a wait, and the ceiling does not move because of it.
  if (posted.kind === "unfillable") return clamped(query, shareSymbol);

  // Both from the posting rule, never re-derived here: the queue's own stamp,
  // and what it pays over the whole balance.
  const ask = askPrice(navPerShare, posted.ppm);
  const receive = payout(ask, shareBalance, shareDecimals);

  // Locked, and priced anyway — unlike the withdraw panel, which prices nothing
  // until the lock ends. The card is not a post: a holder looking at what they
  // hold deserves the figure, with the wait named and both moving parts of it
  // ("today's share price and entitlement") admitted.
  if (unlockAt !== null && now < unlockAt)
    return (
      `Redeemable once the lock ends (in ${untilUnlock(unlockAt - now)}) — ` +
      `≈ ${formatWant(receive)} ${wantSymbol} at today's share price and ` +
      `entitlement.`
    );

  const atFullSharePrice = payout(navPerShare, shareBalance, shareDecimals);

  // What the gap to the share price is, and why there is one. The vested
  // holder's gap is the redemption spread and nothing else, which is stage 1's
  // story and needs no explaining here; the unvested holder's is the cap, and
  // the sentence names the shares it comes from.
  //
  // The gap is the difference of the two figures as WRITTEN, not as held: a
  // payout of 4,999.995 is shown as 5,000.00, and a gap taken off the unrounded
  // units would say 5.01 where a depositor subtracting what is in front of them
  // gets 5.00. One sentence must not disagree with itself by a cent.
  const because =
    listing.unvestedShares > 0n
      ? `${formatWant(roundedToCents(atFullSharePrice) - roundedToCents(receive))} ${wantSymbol} below the ` +
        `share price, because ` +
        `${formatShares(listing.unvestedShares, shareDecimals)} ${shareSymbol} ` +
        `has not vested.`
      : "Everything has vested.";

  return (
    `Redeemable today ≈ ${formatWant(receive)} ${wantSymbol} for your whole ` +
    `balance, at ${formatSpread(posted.ppm)} — computed from your on-chain ` +
    `history by this widget. ${because}`
  );
}

// The refusal, in one clause: no postable price for the balance, and the
// largest amount that does price when one exists. It never says "unavailable" —
// the cause is the ceiling, and the remedy is a smaller amount. The full
// naming of both is the withdraw panel's job; this line points at it.
function clamped(query: EntitlementInputs, shareSymbol: string): string {
  const { shareDecimals } = query;
  // Floored to WHOLE shares, per the spec: the boundary itself is an 18-dp
  // bigint, and an amount a depositor cannot read is not an offer. Flooring can
  // only move it further inside the contract's maximum, so what is named always
  // prices.
  const scale = 10n ** BigInt(shareDecimals);
  const boundary = largestPostableShares(query);
  const whole = boundary === null ? 0n : (boundary / scale) * scale;
  const refusal = "Redeemable today — not at any postable price for your whole balance";
  return whole > 0n
    ? `${refusal}; up to ${formatShares(whole, shareDecimals)} ${shareSymbol} can be.`
    : `${refusal}.`;
}

// A want amount as the screen writes it: half-up to the cent, still in want
// units, so a difference taken between two of these is a difference a reader
// can check against the figures in front of them.
function roundedToCents(units: bigint): bigint {
  const perCent = 10_000n; // want units (6 dp) to the cent
  const whole = units / perCent;
  return ((units % perCent) * 2n >= perCent ? whole + 1n : whole) * perCent;
}



// How much of the lock is left, compact — "18 h", and "34 m" in its last hour.
// The share lock is a day at most, so there is no day form to write.
//
// The switch is on the seconds, not on the rounded hours: half an hour rounds
// UP to one, and "in 1 h" with thirty minutes left is a wait that reads as
// twice what it is.
function untilUnlock(seconds: number): string {
  if (seconds >= 3_600) return `${Math.round(seconds / 3_600)} h`;
  return `${Math.max(1, Math.round(seconds / 60))} m`;
}
