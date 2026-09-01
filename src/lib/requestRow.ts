// What the side rail's row says about a live redemption request on a product
// whose exits are priced against the holder's entitlement.
//
// Stage 1's row said a request "may sit open", because the widget could not
// tell why one had not filled. With the entitlement ceiling it can: the ask is
// above the share price, or above the ceiling, or the deadline lapsed, or the
// market moved past the price, or nothing is wrong at all — the five-way
// ./requestComparison.ts decides. This module is what the row SAYS about each
// of them, and what it offers to do about it.
//
// THE COPY LIVES HERE, not in the JSX, for the reason src/lib/withdrawQuote.ts
// gives: the spec's surface table is verbatim copy, this repo has no component
// tests by policy, and a sentence assembled in a component is a sentence
// nothing can assert. Assembled here, every one is pinned by
// ./requestRow.test.ts against the spec's own five-way list. What the component
// still owns is layout — and the deadline, which formats differently per
// environment and is stage 1's to render (./requestStatus.ts).
//
// Pure — no chain, no React, no clock of its own. Every ceiling is
// `quoteEntitlement`'s, computed over the shares the LIVE REQUEST offers rather
// than over a balance or a typed amount: it is that request the solver judges,
// and a ceiling for any other quantity would be a different number.
//
// Units: shares are share-decimal bigints; prices and payouts are want units
// (USDT, 6 dp), prices being want per WHOLE share; spreads are the queue's ppm.
import { quoteEntitlement, type HolderEvent } from "../entitlement/entitlement";
import { formatPrice, formatWant } from "./figures";
import {
  amountStringOf,
  askPrice,
  payout,
  postedDiscount,
  requiredSpread,
} from "./postingRule";
import { compareRequest, type RequestComparison } from "./requestComparison";
import type { RequestStatus } from "./requestStatus";

// What the side rail has read about this product — everything a judgement is
// priced from, and every one of them nullable, because nothing is priced from a
// read the widget does not have. Exported because the surface that gathers them
// is the redemptions card, which must not invent a shape of its own for them.
export interface RequestRowReads {
  // This wallet's holder history in this product — the held scan. Null while it
  // has not landed, or when it could not be read.
  history: readonly HolderEvent[] | null;
  // The raw balance the quote is capped to, and today's share price as the Lens
  // serves it, undivided.
  shareBalance: bigint | null;
  navPerShare: bigint | null;
  // The accountant's pause flag for THIS product — false when it is running,
  // true while the share price is under review, and null before the poll has
  // answered. Nothing is priced from a rate under review, and a flag nobody has
  // read yet is not a flag that says "running".
  paused: boolean | null;
}

// One live request, the reads it is judged against, and the two facts about the
// product that decide whether it is judged at all.
export interface RequestRowInputs extends RequestRowReads {
  // Whether this product's shares can be redeemable and unvested at once
  // (`hasVestingGap`). False on the 24h product, where every redeemable share
  // has vested and the ceiling is always the share price: nothing there is
  // worth a strip, a note or a re-post, and its row is stage 1's untouched.
  vestingGap: boolean;
  // Stage 1's status for this request (./requestStatus.ts). Only an open or an
  // expired request is priced: a request the solver is HOLDING must not be
  // offered a re-post that would replace the fill in flight, and a STOPPED one
  // is a depositor's own decision, not a price to argue with.
  status: RequestStatus;
  // The request's own two numbers, raw: the shares it offers and the
  // `atomicPrice` it asks, want per whole share.
  offerShares: bigint;
  ask: bigint;
  // Unix seconds it stays open until — what `compareRequest` measures `now`
  // against, and what the row renders beside this comparison.
  deadline: number;
  now: number;
  vestingSeconds: number;
  shareDecimals: number;
  // The WIDGET'S default redemption spread in the queue's ppm, not the withdraw
  // panel's control: the side rail is outside that panel and must not move with
  // a number typed into it. Named as src/lib/positionExit.ts names the same
  // thing, and quoted at for the same reason — the two surfaces price the same
  // holder and may not disagree. What a re-post would actually carry is the
  // wider of the holder's own spread and the entitlement's required one, which
  // the confirm pin settles at the block it pins.
  defaultSpreadPpm: bigint;
  wantSymbol: string;
}

// One line of the ask-vs-ceiling strip: a name, a price, and what it means.
export interface RequestStripLine {
  label: string;
  value: string;
  note: string;
}

// The re-post offer — the whole of it, so the surface invents nothing. The
// label carries the price it would post at; `amount` is the string the withdraw
// panel's amount box takes, and `offerShares` the units it converts back to.
export interface RequestRepost {
  label: string;
  amount: string;
  offerShares: bigint;
}

export type RequestRowJudgement =
  // Stage 1's row, untouched: a product with no vesting gap, a request nobody
  // may re-price, a read still in flight, or a history that could not be read.
  //
  // The unreadable history keeps stage 1's row DELIBERATELY (spec §"When the
  // widget cannot price": "stage 1's note and the deadline; no strip, no
  // re-post offer"). Stage 1's note says a request may sit open because shares
  // vest after they unlock, which is still true and still the reason — the
  // widget has merely lost the ability to say by how much. The place that
  // names the failure and offers the re-scan is the withdraw panel's quote
  // card, which is also the only place with a control to offer.
  | { kind: "unpriced" }
  // The share price is under review. Badge and deadline only: no strip and no
  // computed note, because there is no rate to compute them from — and not
  // stage 1's note either, because a depositor reading a row while the
  // accountant is paused is owed the live cause rather than the standing one.
  | { kind: "paused" }
  | {
      kind: "priced";
      // Which of the five is true. Exactly one, always — it is a sum type, not
      // a bag of booleans, so no surface can show two notes or none.
      comparison: RequestComparison;
      // The badge naming the case, and its tone.
      badge: string;
      tone: "info" | "warning" | "danger";
      // The two-line comparison strip.
      strip: { ask: RequestStripLine; ceiling: RequestStripLine };
      // Whether the ask sits above the ceiling — the strip's second line is the
      // bad one when it does, and the component colours it.
      askingAbove: boolean;
      // The one computed note, verbatim from the spec's five-way list.
      note: string;
      // The primary button, on every priced case that has a better post to
      // make. Null on `within`, where a post now would fetch no more, and
      // wherever the 1% clamp means no post can be made at all.
      repost: RequestRepost | null;
    };

const UNPRICED: RequestRowJudgement = { kind: "unpriced" };
const PAUSED: RequestRowJudgement = { kind: "paused" };

// The badge per case (spec, request-row row). `under-asking` and `within` are
// both a request with nothing wrong with it, so both keep stage 1's "Open".
const BADGES: Record<
  RequestComparison,
  { badge: string; tone: "info" | "warning" | "danger" }
> = {
  "above-share-price": { badge: "Above the share price", tone: "warning" },
  "above-entitlement": { badge: "Above your entitlement", tone: "warning" },
  expired: { badge: "Expired", tone: "danger" },
  "under-asking": { badge: "Open", tone: "info" },
  within: { badge: "Open", tone: "info" },
};

// The two cases a row can name with no fresh price in hand. They are the two
// the clamp leaves reachable, and the type is what proves the other three are
// never asked for one they do not have.
type CeilingCase = "above-share-price" | "above-entitlement";
const namesNoPrice = (c: RequestComparison): c is CeilingCase =>
  c === "above-share-price" || c === "above-entitlement";

// The row's model for one live request.
//
// Total: every state a request row can be in comes back as a judgement,
// including the ones it cannot price — so the component never has to decide
// what an absent judgement means.
export function buildRequestRow(
  inputs: RequestRowInputs
): RequestRowJudgement {
  const {
    vestingGap,
    status,
    offerShares,
    ask,
    deadline,
    history,
    shareBalance,
    navPerShare,
    paused,
    now,
    vestingSeconds,
    shareDecimals,
    defaultSpreadPpm,
    wantSymbol,
  } = inputs;

  if (!vestingGap) return UNPRICED;
  // "Filling" and "Stopped" are stage 1's, and outrank any price: see `status`.
  if (status !== "open" && status !== "expired") return UNPRICED;
  if (offerShares <= 0n) return UNPRICED;

  // The share price is under review, and this row says so — AFTER the three
  // gates above, all of which outrank it: the 24h product is exempt by
  // construction, and a request the solver is holding or the depositor stopped
  // is not one to say anything new about, paused or not.
  if (paused === true) return PAUSED;

  // Nothing to price FROM, and nothing established about why. An unread pause
  // flag is not permission to judge a request against this rate, and it is not
  // the paused row either — nothing has been established yet.
  if (
    paused === null ||
    history === null ||
    shareBalance === null ||
    navPerShare === null ||
    navPerShare <= 0n
  )
    return UNPRICED;

  // The ceiling for the shares THIS REQUEST offers — the vendored rule itself,
  // over the same seven inputs the quote card and the confirm pin use.
  const ceiling = quoteEntitlement({
    history,
    shareBalance,
    navPerShare,
    now,
    vestingSeconds,
    shareDecimals,
    offerShares,
  }).maxAskPrice;

  // What a post made right now would ask for the same shares, at the wider of
  // the default spread and the one the entitlement requires. Null under the 1%
  // clamp: no request for these shares can be posted today at all, so there is
  // no fresh price to compare against and none to offer.
  const posted = postedDiscount(
    defaultSpreadPpm,
    requiredSpread(navPerShare, ceiling)
  );
  const freshAsk =
    posted.kind === "postable" ? askPrice(navPerShare, posted.ppm) : null;

  const price = (units: bigint): string =>
    `${formatPrice(units)} ${wantSymbol}/share`;
  const askingAbove = ask > ceiling;
  const strip = {
    ask: {
      label: "Your ask",
      value: price(ask),
      note: `→ ${formatWant(payout(ask, offerShares, shareDecimals))} ${wantSymbol}`,
    },
    ceiling: {
      label: "Your ceiling",
      value: price(ceiling),
      note: askingAbove ? "— asking above it" : "— asking within it",
    },
  };

  // The comparison is ./requestComparison.ts's, always — the order the five
  // causes are tested in lives there and nowhere else.
  //
  // Under the clamp the request's own ask stands in for the fresh one, and the
  // substitution is exact rather than convenient: the first three rules never
  // read `freshAsk`, and the fourth (`ask < freshAsk`) cannot fire against
  // itself, so what comes back is the same judgement minus the one case that
  // needs a price which does not exist today.
  const comparison = compareRequest(
    { ask, ceiling, navPerShare, freshAsk: freshAsk ?? ask, deadline },
    now
  );

  // Which leaves the three notes that DO name what a post now would ask. With
  // nothing postable the row declines to say them — it would be naming a price
  // no request could carry — and stage 1's row stands. The spec writes no
  // wording for this state and it needs none: a live request under a clamp is
  // not a failure to read anything, and the withdraw panel's clamp card is
  // where the cause and both remedies are already named in full.
  const note = namesNoPrice(comparison)
    ? ceilingNote(comparison, navPerShare, wantSymbol)
    : freshAsk === null
    ? null
    : freshNote(comparison, freshAsk, {
        ask,
        offerShares,
        shareDecimals,
        wantSymbol,
      });
  if (note === null) return UNPRICED;

  return {
    kind: "priced",
    comparison,
    ...BADGES[comparison],
    strip,
    askingAbove,
    note,
    // Every case but `within` has a better post to make: one the solver would
    // not pass over on price, or — where the deadline lapsed — one that exists
    // at all. `within` has none, and the row does not offer a re-post that
    // would fetch no more than the request already open. Under the clamp there
    // is no post to offer at any amount, and the note stands alone.
    repost:
      comparison === "within" || freshAsk === null
        ? null
        : {
            label: `Re-post at ${formatPrice(freshAsk)}`,
            amount: amountStringOf(offerShares, shareDecimals),
            offerShares,
          },
  };
}

// The two notes that name no price of their own — which is what lets them stand
// under the clamp as well.
//
// `above-share-price` is the one the spec leaves to be written ("names the
// markdown, offers the re-post"): it names the markdown by its number, and the
// offer is the button beside it.
function ceilingNote(
  comparison: CeilingCase,
  navPerShare: bigint,
  wantSymbol: string
): string {
  if (comparison === "above-share-price")
    return (
      `The share price has fallen to ${formatPrice(navPerShare)} ` +
      `${wantSymbol}/share since this was posted, below what this request ` +
      `asks, so the solver passes it over — it does not fill a request for ` +
      `more than a share is worth.`
    );
  return (
    `The solver passes over a request asking more than your entitlement ` +
    `ceiling, so this one sits open until its deadline. The ceiling is ` +
    `computed from your on-chain history by this widget; it moves up as your ` +
    `lots vest.`
  );
}

// What the three notes below are written from, beside the fresh ask itself.
interface NoteFigures {
  ask: bigint;
  offerShares: bigint;
  shareDecimals: number;
  wantSymbol: string;
}

// The three that say what a request posted now would ask — verbatim from the
// spec's five-way list, with the figures rendered live.
function freshNote(
  comparison: Exclude<RequestComparison, CeilingCase>,
  freshAsk: bigint,
  figures: NoteFigures
): string {
  const { ask, offerShares, shareDecimals, wantSymbol } = figures;
  const wouldPay = payout(freshAsk, offerShares, shareDecimals);

  if (comparison === "expired")
    return (
      `The price was never the problem: this asks inside your ceiling. Its ` +
      `deadline lapsed, and an expired request cannot be filled at any price ` +
      `— the comparison above cannot see that, which is why the deadline is ` +
      `beside it. A request posted now would ask ${formatPrice(freshAsk)} ` +
      `${wantSymbol}/share and pay ${formatWant(wouldPay)} ${wantSymbol}.`
    );

  if (comparison === "under-asking")
    return (
      `Fillable as it stands, but it was priced against an older share ` +
      `price: a request posted now would ask ${formatPrice(freshAsk)} and ` +
      `pay ${formatWant(
        wouldPay - payout(ask, offerShares, shareDecimals)
      )} ${wantSymbol} more.`
    );

  return (
    `Within your entitlement. A request posted now would ask ` +
    `${formatPrice(freshAsk)} ${wantSymbol}/share — ` +
    `${ask === freshAsk ? "the same price" : "no more than this one"}. ` +
    `Whether it is filled is the solver's decision.`
  );
}
