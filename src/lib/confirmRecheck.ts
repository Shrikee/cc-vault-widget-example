// May the figures the confirm modal pinned still be posted?
//
// Opening the modal pins the share price, the balance and the time to one block
// and shows what would be posted from them. What the modal shows is what is
// posted — so between that pin and the transaction, anything that moved one of
// those figures means re-pinning and showing again, never posting.
//
// The rationale is narrow and exact: between pin and transaction an unvested
// lot's ask rises with the share price while its ceiling does not, so a rate
// tick in the gap is a certain skip. Time alone in the gap is safe — lots only
// vest, and the solver judges at the fill — which is why the clock is not one
// of the three things read back. No spread margin is added to insure the gap
// either: a tick is up to 1,000 ppm and at most hourly, and insuring it would
// cost every request the standard spread.
//
// Pure — no chain, no React. ./confirmRecheck.test.ts drives this exact code.

// The figures the modal pinned when it opened.
export interface PinnedPost {
  // `accountantState.lastUpdateTimestamp` as it was at the pin.
  rateUpdatedAt: number;
  // The shares the post would carry — what the balance has to cover.
  offerShares: bigint;
}

// What the one multicall on Confirm reads back.
export interface FreshReads {
  rateUpdatedAt: number;
  paused: boolean;
  shareBalance: bigint;
}

export type Recheck =
  | { verdict: "post" }
  | { verdict: "re-pin"; cause: "paused" | "rate-moved" | "balance-short" };

// Post, or re-pin and show.
//
// The pause is tested before the tick because the accountant's auto-pause
// stores the out-of-bounds rate BEFORE pausing: both are true at once, and "the
// share price changed" would name the symptom while the pause is the cause.
export function recheckBeforePost(
  pinned: PinnedPost,
  fresh: FreshReads
): Recheck {
  if (fresh.paused) return { verdict: "re-pin", cause: "paused" };
  if (fresh.rateUpdatedAt !== pinned.rateUpdatedAt)
    return { verdict: "re-pin", cause: "rate-moved" };
  if (fresh.shareBalance < pinned.offerShares)
    return { verdict: "re-pin", cause: "balance-short" };
  return { verdict: "post" };
}
