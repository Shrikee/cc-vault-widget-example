// What the withdraw panel says about the amount in its box, on a product whose
// exits are priced against the holder's entitlement.
//
// The panel used to estimate its own "You receive": shares × share price ×
// (1 − spread), in doubles. On a vesting-gap product that figure is wrong for
// anyone still vesting — it prices unvested shares at the full share price,
// which is exactly the number the solver will not pay — so the panel stops
// computing anything and renders THIS instead. One model, built once per
// render from the screen's own inputs; no surface computes a figure of its own
// (spec §"Derived figures as pure functions", and the prototype's `buildModel`
// this follows).
//
// THE COPY LIVES HERE, not in the JSX, and that is deliberate. The spec's
// surface table is verbatim copy, this repo has no component tests by policy
// (spec, "Not covered by tests"), and a sentence assembled in a component is a
// sentence nothing can assert. Assembled here, every one of them is pinned by
// ./withdrawQuote.test.ts against the spec's own worked example. What the
// component still owns is layout: the bar's two widths, the tiles' boxes, the
// button the offer fills, the dots before the legend and the lot lines.
//
// Pure — no chain, no React, no clock of its own. Every ceiling in it is
// `quoteEntitlement`'s, reached through src/lib/lotListing.ts; every spread is
// src/lib/postingRule.ts's. This module computes no price of its own; it only
// says what they mean.
//
// Units: shares are share-decimal bigints (18 dp on both products); prices,
// payouts and `entitlement` are want units (USDT, 6 dp), prices being want per
// WHOLE share; spreads are the queue's parts per million.
import type {
  EntitlementQuery,
  HolderEvent,
} from "../entitlement/entitlement";
import {
  largestPostableShares,
  lotListing,
  type LotListing,
  type LotView,
} from "./lotListing";
import {
  formatCount,
  formatPrice,
  formatShares,
  formatSpread,
  formatWant,
  quotedReason,
} from "./figures";
import type { HistoryUnreadable } from "./pricedHistory";
import {
  amountStringOf,
  askPrice,
  offerSharesOf,
  payout,
  postedDiscount,
  requiredSpread,
  type PostablePost,
} from "./postingRule";

const DAY = 86_400;

// What the screen knows when a depositor types. The seven the vendored rule
// takes (spec §"The seven inputs") plus what the copy needs to name things: the
// two symbols, the two clocks, and the spread control's current value.
export interface QuoteInputs {
  // The holder history the ceiling is computed from — the held scan. `null`
  // while it has not landed, or when it could not be read; nothing is priced
  // from a history the widget does not have.
  history: readonly HolderEvent[] | null;
  // Why that history is null, when the answer is "it could not be read" rather
  // than "not yet" (./pricedHistory.ts). The two absences get different cards,
  // because only one of them is something to tell a depositor about.
  unreadable: HistoryUnreadable | null;
  // The raw balance, to the wei: what MAX offers and what the quote is capped
  // to.
  shareBalance: bigint | null;
  // Today's share price, want per whole share — the Lens rate as it is read,
  // undivided.
  navPerShare: bigint | null;
  // Unix seconds, from `useNow` — the same clock the lock countdown uses.
  now: number;
  // When the share lock ends. Nothing is priced before it.
  unlockAt: number | null;
  // The ACCOUNTANT's pause flag, and only the accountant's: true while the
  // share price is under review, false while it is not, and null until the poll
  // has answered at all. Nothing is priced from a rate under review, and an
  // unread flag is not permission to price either — the auto-pause stores the
  // out-of-bounds rate BEFORE setting the flag, so a rate that decodes beside a
  // flag nobody has read is exactly the case this exists to catch.
  //
  // NOT the panel's own posting gate, which is also true of a paused queue: a
  // queue that will not take a request has no opinion about the share price,
  // and the card must not say the price is under review when it is not.
  paused: boolean | null;
  vestingSeconds: number;
  shareLockSeconds: number;
  shareDecimals: number;
  // The amount box, exactly as it holds it.
  amount: string;
  // The holder's own redemption spread, in the queue's ppm, and whether they
  // left the control alone — the row says "(default)" only when they did.
  holderSpreadPpm: bigint;
  holderSpreadIsDefault: boolean;
  shareSymbol: string;
  wantSymbol: string;
}

// The vendored rule's own query, minus the shares being asked about: what is
// left once the panel's nullable reads have been narrowed once, at the top of
// the builder. Everything downstream prices from this exact object.
type EntitlementInputs = Omit<EntitlementQuery, "offerShares">;

// One of the card's two figures: what this exit pays now, and what the same
// shares fetch at the full share price.
export interface QuoteTile {
  label: string;
  value: string;
  note: string;
}

// The vested/unvested split, as a shape and as its legend. Null when the lot
// listing does not agree with the rule it was derived beside — see
// src/lib/lotListing.ts: the ceiling is still the rule's and still priced from,
// but nothing is drawn from lots that failed their own cross-check.
export interface QuoteBar {
  // How much of the bar is vested, 0–100.
  vestedPercent: number;
  vestedLegend: string;
  unvestedLegend: string;
}

// What the clamp offers instead of a bare refusal: the largest amount that
// still prices today, and the button that fills the box with it.
export interface QuoteOffer {
  // "Up to 6,741 CCUSD30 can be priced today"
  text: string;
  // "Use 6,741"
  buttonLabel: string;
  // What the button types — a whole number of shares, so it is a clean amount
  // that always prices (see `wholeShares` below).
  amount: string;
}

// The callout between the amount input and the rows: one of four things.
export type QuoteCard =
  // Nothing typed yet, or nothing this panel can price. The rows stand alone.
  | { kind: "none" }
  // The share lock has not ended: there is nothing to post, so there is
  // nothing to quote. The card IS the lock notice — stage 1's separate one goes.
  | { kind: "locked"; headline: string; body: string }
  // The accountant is paused. Nothing on this product has a share price while
  // it holds, so nothing is priced AND nothing can be posted — the one state
  // where those two are the same answer, because the gate is the contract's
  // rather than the widget's reading of it.
  | { kind: "paused"; headline: string; body: string }
  // The history could not be read, or the ledger floor it would be read from
  // cannot be established. Nothing is priced — and posting stays open at the
  // holder's own spread, disclosed, because the widget has established nothing
  // the solver would skip.
  | {
      kind: "unreadable";
      headline: string;
      body: string;
      // The manual re-scan. A LABEL rather than a flag because it is copy: the
      // ADR-0001 stance is that a failed read is retried when a person asks and
      // never on a timer, so the control that asks is part of the wording.
      retryLabel: string;
    }
  // The 1% clamp: the entitlement for this amount is further below the share
  // price than the contract's maximum redemption spread, so any request for it
  // would be passed over. The card is the refusal, and the post is disabled.
  | {
      kind: "clamp";
      headline: string;
      body: string;
      // The largest amount that still prices, when one exists. Never a promise
      // of a fill — only of a request the solver would not skip on price.
      offer: QuoteOffer | null;
      // When the next lot vests, which is the remedy the holder actually has.
      // Null only where nothing is left to vest.
      nextVest: string | null;
    }
  | {
      kind: "quote";
      headline: string;
      bar: QuoteBar | null;
      tiles: { now: QuoteTile; atFullSharePrice: QuoteTile };
      // The cap sentence — which of the two it is depends on whether anything
      // in this amount is still vesting.
      cap: string;
      // One line per unvested lot the amount spends, in the order it spends
      // them. Empty when everything has vested, and when the listing disagrees.
      lots: string[];
    };

export interface WithdrawQuote {
  card: QuoteCard;
  // The "You receive (est., min)" row's value.
  receive: string;
  // The "Redemption spread" row's value.
  spread: string;
  // Whether that spread is the entitlement's rather than the holder's own — the
  // fact behind the row's "(required)", which the panel also emphasises. A
  // number the holder did not choose deserves to be seen.
  spreadIsRequired: boolean;
  // What a post for the amount in the box would carry (./postingRule.ts), or
  // null wherever nothing is postable — an empty box, an amount above the
  // balance, the lock, the clamp, and every state in which nothing could be
  // priced. Null is the panel's whole test for "is there anything to confirm?".
  //
  // It is on the MODEL rather than re-derived by the panel because the confirm
  // modal and the queue write must provably agree: the pin recomputes over
  // these shares, the modal names this discount, and `formatDiscountPercent`
  // writes that same number on the wire. Two conversions of one typed string
  // is two chances to post an amount nobody was shown.
  post: PostablePost | null;
  // The 1% clamp: the post button is disabled, with no override.
  refused: boolean;
  // Nothing could be priced: the share price is under review, the history could
  // not be read, or one of the reads this prices from has not landed. Posting
  // stays open at the holder's own spread in every one of them except the pause
  // — the widget never gates a post on its own READS, and the pause is the
  // contract's gate rather than a reading (spec §"When the widget cannot
  // price").
  //
  // It is not the same as an empty amount box: there, nothing is priced because
  // nothing was asked for, and no wrong figure is on screen.
  cannotPrice: boolean;
  // Whether the panel still owes the generic vesting disclosure — stage 1's
  // notice, the disclosure of last resort.
  //
  // True in exactly one place: nothing could be priced AND the card has nothing
  // of its own to say, which is a read that has not landed yet. The paused and
  // unreadable cards each carry their own disclosure, so showing the generic
  // one beside them would say the weaker half of it twice; and where a figure
  // was priced the card says it with this amount's own numbers in it.
  //
  // A decision, not a rendering rule, which is why it is on the model: what a
  // depositor is owed when the widget is mid-read is the same question the rest
  // of this module answers, and a component deciding it is a decision nothing
  // can assert.
  discloseVesting: boolean;
}

// A vest date — "21 Sept". en-GB because that is the form the spec's copy is
// written in, on this surface and on the request row's deadline; a date is a
// live figure but the shape of it is part of the sentence.
const formatDate = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

// "in 20 days" — coarse, which is all a vesting date needs.
function formatDaysAway(from: number, to: number): string {
  const days = Math.round((to - from) / DAY);
  if (days <= 0) return "today";
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

// A term in the depositor's own words — "30-day", "1-day". Both clocks are
// said the same way, because to a depositor they are the same kind of thing:
// how long until something about their shares changes.
const termInDays = (seconds: number): string =>
  `${Math.round(seconds / DAY)}-day`;

// Why nothing could be read, as the first sentence of the card.
//
// Two forms, because the two blame different things and a depositor can act on
// only one of them. A failed read is the endpoint having a bad minute and the
// reason is the chain's own words — quoted rather than paraphrased, since the
// widget has no idea which of a dozen failures it was. A too-young ledger floor
// is this widget shipped wrong: it names the registry's own block, how old it
// is and the term it is too young for, and says plainly that no amount of
// retrying by the depositor is the fix.
function unreadableHeadline(
  reason: HistoryUnreadable,
  vestingSeconds: number
): string {
  if (reason.kind === "floor-too-young")
    return (
      `Couldn't price from your history — the vault registry's ledger floor ` +
      `(block ${formatCount(reason.floorBlock)}, ` +
      // FLOORED, never rounded: a floor 15.9 days old is fifteen days past, and
      // a sentence that called it sixteen would overstate the one figure a
      // maintainer checks the registry against.
      `${Math.floor(reason.ageSeconds / DAY)} days old) is too young for a ` +
      `${termInDays(vestingSeconds)} term. The widget's configuration needs ` +
      `updating.`
    );
  return `Couldn't read your history from the chain — ${quotedReason(
    reason.detail
  )}.`;
}

// How much of the lock is left — "18 hours", and "34 minutes" in its last
// hour, because "another 0 hours" is a lock that reads as over while the
// button is still disabled.
function untilUnlock(seconds: number): string {
  // The switch is on the seconds, not on the rounded hours: half an hour
  // rounds UP to one, and "another 1 hour" with thirty minutes left is a wait
  // that reads as twice what it is.
  if (seconds >= 3_600) {
    const hours = Math.round(seconds / 3_600);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// The panel's model for the amount in its box.
//
// Total: every state a vesting-gap product's withdraw panel can be in comes
// back as a model, including the ones where nothing could be priced — so the
// panel never has to decide what an absent quote means, and the one thing it
// still decides for itself (whether this product prices exits at all) is the
// vesting gap.
export function buildWithdrawQuote(inputs: QuoteInputs): WithdrawQuote {
  const {
    history,
    unreadable,
    shareBalance,
    navPerShare,
    now,
    unlockAt,
    paused,
    vestingSeconds,
    shareLockSeconds,
    shareDecimals,
    amount,
    holderSpreadPpm,
    holderSpreadIsDefault,
    shareSymbol,
    wantSymbol,
  } = inputs;

  // What the spread row says when nothing is priced: the holder's own spread,
  // which is what a request would still carry.
  const nothingPriced = {
    card: { kind: "none" } as QuoteCard,
    receive: "—",
    spread: `${formatSpread(holderSpreadPpm)}${
      holderSpreadIsDefault ? " (default)" : ""
    }`,
    spreadIsRequired: false,
    post: null,
    refused: false,
    cannotPrice: false,
    discloseVesting: false,
  };

  // No quote while locked, and the lock is answered before anything else is
  // read: the card is the notice, and it needs no price to say what it says.
  if (unlockAt !== null && now < unlockAt)
    return {
      ...nothingPriced,
      card: {
        kind: "locked",
        headline:
          `${shareSymbol} shares locked for another ` +
          `${untilUnlock(unlockAt - now)}.`,
        body:
          `The ${termInDays(shareLockSeconds)} share lock has not ended, so ` +
          `there is nothing to post yet and nothing to quote. The quote ` +
          `appears with the first amount you type once the lock ends.`,
      },
    };

  // Nothing to price FROM. Three different answers, in the order a depositor
  // can act on them.
  //
  // The PAUSE first: it is the live operator state, it is the only one of the
  // three that also closes the post (stage 1's gate, the contract's rather than
  // this widget's), and telling a holder their history failed while the button
  // is disabled for another reason sends them to fix the wrong thing.
  if (paused === true)
    return {
      ...nothingPriced,
      cannotPrice: true,
      card: {
        kind: "paused",
        headline: "Redemptions are paused.",
        body:
          `The share price is under review by the operator, so nothing is ` +
          `priced and no request can be posted until it resumes.`,
      },
    };

  // Then a read that FAILED, which is a thing to say and a thing to retry.
  // Posting stays open here: an unread history is the widget not knowing, and
  // the widget does not refuse what it cannot establish.
  if (unreadable !== null)
    return {
      ...nothingPriced,
      cannotPrice: true,
      card: {
        kind: "unreadable",
        headline: unreadableHeadline(unreadable, vestingSeconds),
        body:
          `Nothing is priced. A request posts at your redemption spread and, ` +
          `on this product, may be passed over if your shares haven't ` +
          `finished vesting.`,
        retryLabel: "Try again",
      },
    };

  // And last a read that has simply not landed. No wording of its own — nothing
  // has failed — so the panel's generic vesting notice stands in.
  if (
    paused === null ||
    history === null ||
    shareBalance === null ||
    navPerShare === null ||
    navPerShare <= 0n
  )
    return { ...nothingPriced, cannotPrice: true, discloseVesting: true };

  // Exactly the shares that would post — the typed string converted the way the
  // library converts it. Recomputed on every keystroke because this is a pure
  // function of it: a neighbouring amount's ceiling can differ by a floored want
  // unit, and a unit is a skip.
  //
  // An amount ABOVE the balance is not quoted at all. Nothing would post at
  // that amount, and quoting the balance instead would answer a question the
  // holder did not ask while the panel's own error says the amount is too
  // large — two surfaces disagreeing about one number.
  const sold = offerSharesOf(amount, shareDecimals);
  if (sold <= 0n || sold > shareBalance) return nothingPriced;

  // The seven inputs, narrowed once. Everything downstream — the listing, the
  // largest postable amount — is quoted from this exact query, so no surface
  // can price against a different one.
  const query = {
    history,
    shareBalance,
    navPerShare,
    now,
    vestingSeconds,
    shareDecimals,
  };
  const listing = lotListing({ ...query, offerShares: sold });

  const required = requiredSpread(navPerShare, listing.ceiling);
  const posted = postedDiscount(holderSpreadPpm, required);
  if (posted.kind === "unfillable")
    return clamped(inputs, query, listing, required, sold);

  // Both from the posting rule, never re-derived here: the queue's own stamp,
  // and what it pays over these shares.
  const ask = askPrice(navPerShare, posted.ppm);
  const receive = payout(ask, sold, shareDecimals);
  const atFullSharePrice = payout(navPerShare, sold, shareDecimals);

  const soldShares = formatShares(sold, shareDecimals);
  const term = termInDays(vestingSeconds);

  const cap =
    listing.unvestedShares > 0n
      ? `${formatShares(listing.unvestedShares, shareDecimals)} ${shareSymbol} ` +
        `of this has not finished the ${term} vesting term, so it is capped at ` +
        `what you paid — a cap, not a floor. Over the whole amount that ceiling ` +
        `is ${formatPrice(listing.ceiling)} ${wantSymbol} a share, computed ` +
        `from your on-chain history by this widget. Leaving now gives up ` +
        `${formatWant(atFullSharePrice - receive)} ${wantSymbol}.`
      : `Every share in this amount has finished the ${term} vesting term, so ` +
        `your ceiling is the share price itself — ` +
        `${formatPrice(listing.ceiling)} ${wantSymbol} a share, computed from ` +
        `your on-chain history by this widget. What you give up is the ` +
        `${formatSpread(posted.ppm)} redemption spread and nothing else.`;

  return {
    card: {
      kind: "quote",
      headline:
        `Redeeming ${soldShares} ${shareSymbol} — ≈ ${formatWant(receive)} ` +
        `${wantSymbol} if filled today.`,
      bar: listing.agrees
        ? {
            vestedPercent:
              Number((listing.vestedShares * 10_000n) / sold) / 100,
            vestedLegend: `${formatShares(
              listing.vestedShares,
              shareDecimals
            )} ${shareSymbol} vested`,
            unvestedLegend: `${formatShares(
              listing.unvestedShares,
              shareDecimals
            )} ${shareSymbol} unvested`,
          }
        : null,
      tiles: {
        now: {
          label: "NOW",
          value: `${formatWant(receive)} ${wantSymbol}`,
          note: `at ${formatPrice(ask)} ${wantSymbol}/share`,
        },
        atFullSharePrice: {
          label: "AT FULL SHARE PRICE",
          value: `${formatWant(atFullSharePrice)} ${wantSymbol}`,
          note: `at ${formatPrice(navPerShare)} ${wantSymbol}/share`,
        },
      },
      cap,
      lots: listing.agrees ? lotLines(listing.lots, inputs) : [],
    },
    receive: `${formatWant(receive)} ${wantSymbol}`,
    // "(required)" only when the entitlement's spread is the one being posted
    // rather than the holder's own — the holder did not choose this number, and
    // the row is where they find that out.
    spread: `${formatSpread(posted.ppm)}${posted.isRequired ? " (required)" : ""}`,
    spreadIsRequired: posted.isRequired,
    // The one place the two numbers a post is made of are settled — over the
    // shares this card just priced, at the spread it just named.
    post: { offerShares: sold, discountPpm: posted.ppm },
    refused: false,
    cannotPrice: false,
    discloseVesting: false,
  };
}

// The refusal. It never says "unavailable": it names the ceiling, the distance
// from the share price, the contract rule that makes that distance unpostable,
// and the two remedies that exist — a smaller amount now, and the date the next
// lot vests.
function clamped(
  inputs: QuoteInputs,
  // The seven inputs already narrowed by the caller — which is why nothing in
  // here needs a non-null assertion on the one path where being wrong about a
  // number means refusing a depositor their exit.
  query: EntitlementInputs,
  listing: LotListing,
  required: bigint,
  sold: bigint
): WithdrawQuote {
  const { shareDecimals, shareSymbol, wantSymbol } = inputs;
  const { navPerShare, now } = query;

  // The largest amount whose required spread still fits inside the contract's
  // maximum, floored to WHOLE shares: the boundary itself is an 18-dp bigint,
  // and an amount a depositor cannot read is not an offer. Flooring can only
  // move it further inside the maximum, so what the button types always prices.
  const scale = 10n ** BigInt(shareDecimals);
  const boundary = largestPostableShares(query);
  const whole = boundary === null ? 0n : (boundary / scale) * scale;
  const offer: QuoteOffer | null =
    whole > 0n
      ? {
          text: `Up to ${formatShares(whole, shareDecimals)} ${shareSymbol} can be priced today`,
          buttonLabel: `Use ${formatShares(whole, shareDecimals)}`,
          amount: amountStringOf(whole, shareDecimals),
        }
      : null;

  // Guarded the same way the bar and the lot lines are: a listing that failed
  // its own cross-check against the rule must not put a confident vest date
  // inside a refusal. The ceiling above is still the rule's, and still refuses.
  const next = listing.agrees
    ? listing.lots.find((lot) => !lot.vested) ?? null
    : null;

  return {
    card: {
      kind: "clamp",
      headline: "This amount can't be posted.",
      body:
        `For ${formatShares(sold, shareDecimals)} ${shareSymbol} your ` +
        `entitlement ceiling is ${formatPrice(listing.ceiling)} ${wantSymbol} ` +
        `a share — ${formatSpread(required)} below the share price of ` +
        `${formatPrice(navPerShare)} ${wantSymbol} — computed from your ` +
        `on-chain history by this widget. No redemption request can ask more ` +
        `than 1% below the share price (the contract's maximum redemption ` +
        `spread), so a request for this amount would be passed over.`,
      offer,
      // It reads as the tail of the offer's sentence when there is one, and as
      // a sentence of its own when there is not.
      nextVest:
        next === null
          ? null
          : `${offer ? "your" : "Your"} next lot vests on ` +
            `${formatDate(next.vestsAt)} (${formatDaysAway(now, next.vestsAt)}), ` +
            `which raises the ceiling.`,
    },
    receive: "—",
    spread: `${formatSpread(required)} required — over the 1% maximum`,
    // The required spread is by definition the one that would post here — it is
    // just that it cannot be.
    spreadIsRequired: true,
    // Nothing stands behind a refusal: the contract will not carry this
    // discount, and a clamped one posts an ask above the ceiling.
    post: null,
    // No override. The widget does not post what it can establish the solver
    // will skip, and this is the one state where it can establish exactly that.
    refused: true,
    cannotPrice: false,
    discloseVesting: false,
  };
}

// One line per unvested lot the amount actually spends — the lots whose price
// is the reason the ceiling is below the share price, and the dates on which
// that stops being true.
function lotLines(lots: readonly LotView[], inputs: QuoteInputs): string[] {
  const { now, shareDecimals, shareSymbol, wantSymbol } = inputs;
  return lots
    .filter((lot) => !lot.vested && lot.spent > 0n)
    .map(
      (lot) =>
        `${formatShares(lot.spent, shareDecimals)} ${shareSymbol} vest on ` +
        `${formatDate(lot.vestsAt)} (${formatDaysAway(now, lot.vestsAt)}) — ` +
        `until then priced at ${formatPrice(lot.pricedAt)} ${wantSymbol}`
    );
}
