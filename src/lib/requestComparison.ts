// Which of five things is true of a redemption request already in the queue.
//
// Stage 1's request row said a request "may sit open", because the widget could
// not tell why one had not filled: the solver's pre-filter reads facts the page
// never read. With the entitlement ceiling it can tell, and there turn out to be
// five different answers — a marked-down share price, an ask above the holder's
// ceiling, a lapsed deadline, a price the market has moved past, and nothing
// wrong at all. Exactly one is true at a time, and each is a different thing for
// a holder to do about it, which is why this returns one of five rather than a
// bag of booleans a surface would have to re-decide.
//
// Pure — no chain, no React, and no clock of its own: `now` is passed in, so the
// row and the confirm modal cannot judge the same request differently in the
// same instant. ./requestComparison.test.ts drives this exact code.

// One open request, measured against two different things: the holder's
// entitlement ceiling for the shares IT offers (does the solver's gate let it
// through at all?) and what a post made right now would ask for the same shares
// (would re-posting fetch more?). Those are different questions, and a request
// can be comfortably inside the ceiling and still be the wrong price.
export interface RequestPricing {
  // The price the open request asks, want per whole share — its `atomicPrice`.
  ask: bigint;
  // The entitlement ceiling over the shares this request offers.
  ceiling: bigint;
  // Today's share price.
  navPerShare: bigint;
  // What a post made now would ask for the same shares, at the wider of the
  // holder's spread and the one their entitlement requires.
  freshAsk: bigint;
  // Unix seconds the request stays open until.
  deadline: number;
}

export type RequestComparison =
  // The share price fell beneath the ask — the solver's own `ask-above-nav`.
  | "above-share-price"
  // The ask is above what the holder is entitled to; the solver passes it over
  // every cycle until it lapses.
  | "above-entitlement"
  // Its deadline lapsed. No price fills an expired request.
  | "expired"
  // Fillable as it stands, but the share price rose past the posted spread
  // since it was posted, so a request posted now would ask more.
  | "under-asking"
  // Inside the ceiling, at or above what a post now would ask. Whether it is
  // filled is the solver's decision.
  | "within";

// Which one of the five is true of this request.
//
// The order is the order the causes matter in, and each step is a reason a
// holder would act differently:
//
//   1. A markdown beneath the ask is above the ceiling too — the ceiling never
//      exceeds the share price — so the markdown has to be tested first or it
//      would always be reported as an entitlement problem, and re-posted for
//      the wrong reason.
//   2. Above the ceiling comes before the deadline because it is why the
//      request never filled while it was alive; an expired one that was also
//      unfillable should not be re-posted at the same price.
//   3. Expired comes before the price comparisons because no price fills it,
//      which is the one thing the ask-vs-ceiling strip beside it cannot show —
//      hence the deadline rendered next to that comparison.
export function compareRequest(
  request: RequestPricing,
  now: number
): RequestComparison {
  if (request.ask > request.navPerShare) return "above-share-price";
  if (request.ask > request.ceiling) return "above-entitlement";
  if (now >= request.deadline) return "expired";
  if (request.ask < request.freshAsk) return "under-asking";
  return "within";
}
