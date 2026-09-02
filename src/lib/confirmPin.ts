// What the confirm modal shows, and what the queue is then given.
//
// Opening the modal pins the share price, the balance and the clock to ONE head
// block, recomputes the entitlement ceiling and the posted discount over the
// EXACT shares that would be offered, and shows them beside the block number
// they were read at (spec §"The confirm pin and re-check"). This module is the
// pure half of that: the reads go in, the sentences and the post come out.
//
// The invariant it exists to make provable is one sentence — WHAT THE MODAL
// SHOWS IS WHAT IS POSTED. The tile's payout, the rows' spread and the
// `discountPpm` handed to `queueWithdraw` are all read off one object built
// once from one set of pinned reads, so no surface and no writer can derive the
// number a second time and derive it differently.
//
// THE COPY LIVES HERE for the reason it lives in ./withdrawQuote.ts: the spec's
// confirm-modal row is verbatim copy, this repo has no component tests (spec,
// "Not covered by tests"), and a sentence assembled in JSX is a sentence
// nothing can assert. ./confirmPin.test.ts pins every one of them.
//
// Pure — no chain, no React, no clock of its own; the clock is the head block's
// own timestamp, which is the point of a pin.
//
// Units: shares are share-decimal bigints (18 dp on both products); prices and
// payouts are want units (USDT, 6 dp), prices being want per WHOLE share;
// spreads are the queue's parts per million.
import type { HolderEvent } from "../entitlement/entitlement";
import type { PinnedPost, Recheck } from "./confirmRecheck";
import {
  formatCount,
  formatPrice,
  formatShares,
  formatSpread,
  formatWant,
  quotedReason,
} from "./figures";
import { lotListing } from "./lotListing";
import {
  askPrice,
  payout,
  postedDiscount,
  requiredSpread,
  type PostablePost,
} from "./postingRule";

// What the pre-post tail and the one batch behind it came back with.
//
// Three outcomes, because there are three ways the pin can end and only one of
// them has figures in it. A missing read is never filled in from the panel's
// live values: those were read at some other block, and a modal that mixed them
// would show figures that were never true together.
export type PinReads =
  // Everything, pinned to one head block.
  | {
      kind: "read";
      blockNumber: bigint;
      // The head block's OWN timestamp — the clock every vest date in this
      // recompute is judged against, so the ceiling belongs to the block the
      // rate and balance were read at.
      now: number;
      navPerShare: bigint;
      shareBalance: bigint;
      // `accountantState.lastUpdateTimestamp` at the pin. Not shown: it is
      // what the Confirm re-check compares against (./confirmRecheck.ts).
      rateUpdatedAt: number;
      // The held history with the pre-post tail folded in.
      history: readonly HolderEvent[];
    }
  // The accountant is PAUSED — either because `getRateInQuoteSafe` reverted
  // (the guarded read is how a paused accountant answers, so a revert is not a
  // failed read but an answer) or because its own flag says so. Nothing on this
  // product has a share price while it holds.
  | { kind: "paused" }
  // The tail or the batch did not land. `detail` is the capture point's
  // classified reason (src/lib/userError.ts) — never the raw error, which is
  // console-only (ADR-0004).
  | { kind: "unread"; detail: string };

// What one pin's reads came back as, before anything has decided what they
// MEAN. Every field is null when that read did not land — except `navPerShare`,
// which is null when the guarded rate read REVERTED, and that is an answer
// rather than a failure.
//
// The hook fills this in and nothing else: `pinReadsOf` below is where a revert
// becomes "paused" and a missing balance becomes "unread", so both readings are
// asserted by ./confirmPin.test.ts rather than buried in a callback.
export interface PinBatch {
  blockNumber: bigint;
  now: number;
  navPerShare: bigint | null;
  shareBalance: bigint | null;
  rateUpdatedAt: number | null;
  paused: boolean | null;
  history: readonly HolderEvent[] | null;
  // The classified reason for whichever read did not land
  // (src/lib/userError.ts).
  detail: string | null;
}

// Why a pin had nothing to read, in the words the refusal quotes. They live
// here beside the sentence they land inside, for the same reason the rest of
// the copy does.
export const UNREAD = {
  noWallet: "no wallet is connected",
  noHistory: "this wallet's history has not been read",
  incomplete: "a read did not come back",
} as const;

// A pin that never got as far as a batch: no wallet, no held history to tail
// from, or a read that threw. Not the same thing as a batch with a hole in it,
// which is `pinReadsOf`'s to classify — nothing was asked, so nothing is being
// interpreted.
export const pinUnread = (detail: string): PinReads => ({
  kind: "unread",
  detail,
});

/**
 * What the reads mean.
 *
 * The pause is answered FIRST and from either side: the accountant's
 * auto-pause stores the out-of-bounds rate before setting the flag, so for a
 * moment the guarded read reverts while the flag is still clear — and later the
 * flag is set while a cached rate would still decode. Either one alone is
 * enough to say the product is not being priced.
 */
export function pinReadsOf(batch: PinBatch): PinReads {
  if (batch.navPerShare === null || batch.paused === true) return { kind: "paused" };
  if (
    batch.shareBalance === null ||
    batch.rateUpdatedAt === null ||
    batch.history === null
  )
    return { kind: "unread", detail: batch.detail ?? UNREAD.incomplete };
  return {
    kind: "read",
    blockNumber: batch.blockNumber,
    now: batch.now,
    navPerShare: batch.navPerShare,
    shareBalance: batch.shareBalance,
    rateUpdatedAt: batch.rateUpdatedAt,
    history: batch.history,
  };
}

export interface PinInputs {
  reads: PinReads;
  // The shares the quote card stood behind — `WithdrawQuote.post.offerShares`,
  // never re-derived from the amount box here. The pin recomputes over these
  // and the wire carries these.
  offerShares: bigint;
  // The holder's own redemption spread, in the queue's ppm: the floor on the
  // haircut, which the entitlement may raise but never lower.
  holderSpreadPpm: bigint;
  vestingSeconds: number;
  shareDecimals: number;
  shareSymbol: string;
  wantSymbol: string;
}

// One line of the modal's pinned block.
export interface PinnedRow {
  label: string;
  value: string;
}

// Why nothing could be pinned. Named rather than collapsed into one "failed",
// because the panel says which it was and the depositor can act on only some of
// them.
export type PinFailure =
  // The accountant is paused: nothing on this product is priced right now.
  | "paused"
  // A read did not land — the tail, or the batch.
  | "unread"
  // The pinned balance no longer covers the amount.
  | "balance-short"
  // The required spread at the pin is past the contract's 1% maximum.
  | "unfillable";

export type ConfirmPin =
  | {
      kind: "pinned";
      // "10,000 CCUSD30 → 9,999.99 USDT — Pinned at block 93,051,200. These
      // are the figures that go to the queue."
      tile: string;
      rows: PinnedRow[];
      footer: string;
      // What the one multicall on Confirm compares against.
      pinned: PinnedPost;
      // What `queueWithdraw` is given — the same discount the rows just named.
      post: PostablePost;
    }
  | {
      kind: "cannot-pin";
      cause: PinFailure;
      headline: string;
      body: string;
      // The manual re-pin, on the one refusal the spec gives a control to: a
      // failed tail is a read that may well land on a second ask, and the
      // depositor is standing at a modal they opened on purpose. Null on the
      // other three, and null for a REASON rather than an omission — a paused
      // accountant, a balance that no longer covers and an amount past the 1%
      // maximum are all answers, and asking the chain again would return the
      // same one.
      retryLabel: string | null;
    };

// The one sentence under every pinned modal. It promises nothing, and it says
// whose number the ceiling is — the copy discipline every priced surface keeps.
const FOOTER =
  "An off-chain solver decides whether to fill this request. The ceiling above " +
  "is computed from your on-chain history by this widget; the fill is not this " +
  "widget's to promise.";

// Every refusal ends the same way, because it is the only thing a depositor
// standing at a Confirm button needs to be certain of.
//
// TWO SPELLINGS, deliberately. The three tiles the spec writes out end "Nothing
// was posted."; the re-pin notices below it, which are a different surface —
// a line above figures that ARE pinned — keep "Nothing has been posted." Both
// are verbatim where the spec gives them, and only one is ever on screen at a
// time.
const NOTHING_WAS_POSTED = "Nothing was posted.";
const NOTHING_POSTED = "Nothing has been posted.";

// FAIL SAFE. Each refusal names its cause, shows no figure that was not pinned,
// replaces Confirm with Close, and posts nothing. Three of the four are the
// spec's verbatim tiles (§"When the widget cannot price"); the fourth — a
// required spread past the contract's maximum — is the quote card's clamp
// arriving a moment late, has no wording of its own in the spec, and is refused
// in the clamp's own terms.
//
// `headline` is the cause and `body` the assurance, which is layout rather than
// two sentences: the modal renders them as one line, and ./confirmPin.test.ts
// asserts the pair joined, against the spec's sentence.
const cannotPin = (
  cause: PinFailure,
  headline: string,
  body: string,
  retryLabel: string | null = null
): ConfirmPin => ({ kind: "cannot-pin", cause, headline, body, retryLabel });

/**
 * The modal's model for one pinned post.
 *
 * Total: every way the pin can end comes back as a model, so the panel never
 * has to decide what a missing figure means — it renders a pinned block with a
 * Confirm, or a named refusal with a Close.
 */
export function buildConfirmPin(input: PinInputs): ConfirmPin {
  const {
    reads,
    offerShares,
    holderSpreadPpm,
    vestingSeconds,
    shareDecimals,
    shareSymbol,
    wantSymbol,
  } = input;

  if (reads.kind === "paused")
    return cannotPin(
      "paused",
      `Couldn't pin the figures — the share price is under review (the ` +
        `accountant is paused).`,
      NOTHING_WAS_POSTED
    );

  if (reads.kind === "unread")
    return cannotPin(
      "unread",
      `Couldn't re-read your history — ${quotedReason(reads.detail)}.`,
      NOTHING_WAS_POSTED,
      "Try again"
    );

  const { blockNumber, now, navPerShare, shareBalance, rateUpdatedAt, history } =
    reads;
  const shares = formatShares(offerShares, shareDecimals);

  // Before the ceiling, because a listing over a balance that no longer covers
  // the amount would quote a smaller request than the one being confirmed
  // (`lotListing` caps its spend at the balance). The two figures in this
  // sentence are both the pin's own.
  if (shareBalance < offerShares)
    return cannotPin(
      "balance-short",
      // Both figures are the PIN's own — the balance at the block it read, and
      // the amount that was entered. The block number is not named: the spec's
      // sentence is about what the depositor holds now, and it reads as one.
      `Your balance is now ${formatShares(shareBalance, shareDecimals)} ` +
        `${shareSymbol}, less than the ${shares} you entered.`,
      NOTHING_WAS_POSTED
    );

  // The recompute, over the exact shares and against the pinned block's own
  // clock, rate and balance. Every figure below is the vendored rule's or the
  // posting rule's; this module derives none of its own.
  const listing = lotListing({
    history,
    shareBalance,
    navPerShare,
    now,
    vestingSeconds,
    shareDecimals,
    offerShares,
  });
  const required = requiredSpread(navPerShare, listing.ceiling);
  const posted = postedDiscount(holderSpreadPpm, required);

  if (posted.kind === "unfillable")
    return cannotPin(
      "unfillable",
      "This amount can't be posted.",
      `At block ${formatCount(blockNumber)} your entitlement ceiling for ` +
        `${shares} ${shareSymbol} is ${formatPrice(listing.ceiling)} ` +
        `${wantSymbol} a share — ${formatSpread(required)} below the share ` +
        `price of ${formatPrice(navPerShare)} ${wantSymbol} — computed from ` +
        `your on-chain history by this widget. That is more than the 1% ` +
        `maximum redemption spread the contract carries. ${NOTHING_POSTED}`
    );

  const ask = askPrice(navPerShare, posted.ppm);
  const receive = payout(ask, offerShares, shareDecimals);

  return {
    kind: "pinned",
    tile:
      `${shares} ${shareSymbol} → ${formatWant(receive)} ${wantSymbol} — ` +
      `Pinned at block ${formatCount(blockNumber)}. These are the figures ` +
      `that go to the queue.`,
    rows: [
      { label: "Share price (pinned)", value: perShare(navPerShare, wantSymbol) },
      {
        label: "Your ceiling (pinned)",
        value: perShare(listing.ceiling, wantSymbol),
      },
      {
        // "(required)" or "(yours)" — never left unsaid. A spread the holder
        // did not choose is the whole reason this modal recomputes.
        label: "Posted spread",
        value: `${formatSpread(posted.ppm)} ${
          posted.isRequired ? "(required)" : "(yours)"
        }`,
      },
      { label: "Asking price", value: perShare(ask, wantSymbol) },
      { label: "Receive (min)", value: `${formatWant(receive)} ${wantSymbol}` },
    ],
    footer: FOOTER,
    pinned: { rateUpdatedAt, offerShares },
    post: { offerShares, discountPpm: posted.ppm },
  };
}

// A price as a row value. Three of the five rows are want per WHOLE share and
// one is a total, and a row that did not say which is which invites reading the
// ask as the payout.
const perShare = (units: bigint, wantSymbol: string): string =>
  `${formatPrice(units)} ${wantSymbol}/share`;

// What the modal says when the Confirm re-check refused to post and pinned
// again (./confirmRecheck.ts decides which). The rate wording is the spec's,
// verbatim; the other two are plainly named until the "when the widget cannot
// price" ticket lands their final forms.
export type RePinCause = Extract<Recheck, { verdict: "re-pin" }>["cause"];

// And what it says when the re-check itself did not land. Reading twice is the
// safety property; a read that failed is not a second reading, so the figures
// are pinned again rather than posted against.
// And what it says when the amount being confirmed is no longer the amount the
// figures were pinned over. Unreachable while the modal is open — the amount
// box is disabled for exactly that reason — but a post is not the place to find
// out that an invariant slipped, so it is named rather than dropped.
export const AMOUNT_CHANGED_NOTICE =
  `The amount changed after these figures were pinned, so they have been ` +
  `pinned again over the new one. ${NOTHING_POSTED}`;

export const RECHECK_UNREAD_NOTICE =
  `The re-check before posting could not be made, so the figures have been ` +
  `pinned again. ${NOTHING_POSTED}`;

export function rePinNotice(cause: RePinCause): string {
  if (cause === "rate-moved")
    return "The share price changed while you were confirming — here are the new figures.";
  if (cause === "paused")
    return `The accountant paused while you were confirming. ${NOTHING_POSTED}`;
  return `Your share balance changed while you were confirming — here are the new figures. ${NOTHING_POSTED}`;
}
