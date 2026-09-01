// The five-way comparison of a live request — src/lib/requestComparison.ts.
//
// The vectors are the prototype's three request scenarios (request-above,
// request-below-stale, request-fresh) plus the two it has no scenario for: a
// share price marked down under the ask, and a request left behind by one that
// rose. Each case is a different sentence in the row, so the tests are as much
// about which cause is NAMED as about which is true.
import { describe, expect, it } from "vitest";

import { askPrice, postedDiscount, requiredSpread } from "./postingRule";
import { compareRequest } from "./requestComparison";

const DAY = 86_400;
const NOW = 1_800_000_000;
const HOLDER_SPREAD = 1000n; // the panel's 0.1% default

// What a post made right now would ask for the same shares — the caller's own
// arithmetic, spelled out here so the vectors show where `freshAsk` comes from.
function freshAskFor(navPerShare: bigint, ceiling: bigint): bigint {
  const posted = postedDiscount(HOLDER_SPREAD, requiredSpread(navPerShare, ceiling));
  if (posted.kind !== "postable") throw new Error("unfillable — nothing to ask");
  return askPrice(navPerShare, posted.ppm);
}

describe("compareRequest", () => {
  it("above-entitlement: the prototype's request-above", () => {
    // A request asking the full share price of 1.001000 against a 2-day-old
    // lot's ceiling of 1.000000. The solver passes it over every cycle until it
    // lapses — the one case the row must not describe as merely "open".
    const nav = 1_001_000n;
    const ceiling = 1_000_000n;
    expect(
      compareRequest(
        {
          ask: 1_001_000n,
          ceiling,
          navPerShare: nav,
          freshAsk: freshAskFor(nav, ceiling),
          deadline: NOW + 5 * DAY,
        },
        NOW
      )
    ).toBe("above-entitlement");
  });

  it("expired: the prototype's request-below-stale", () => {
    // The lot vested while the request sat, so its ask is now well inside the
    // ceiling. The price was never the problem: the deadline lapsed.
    const nav = 1_002_001n;
    const ceiling = 1_002_001n; // fully vested — the ceiling is the share price
    const fresh = freshAskFor(nav, ceiling);
    expect(fresh).toBe(1_000_998n);
    expect(
      compareRequest(
        {
          ask: 1_001_000n,
          ceiling,
          navPerShare: nav,
          freshAsk: fresh,
          deadline: NOW - DAY,
        },
        NOW
      )
    ).toBe("expired");
  });

  it("within: the prototype's request-fresh, asking exactly what a post now would", () => {
    const nav = 1_001_370n;
    const ceiling = 1_000_000n; // the day-20 lot
    const fresh = freshAskFor(nav, ceiling);
    expect(fresh).toBe(999_999n); // the required 1369 ppm, as the runbook has it
    expect(
      compareRequest(
        {
          ask: 999_999n,
          ceiling,
          navPerShare: nav,
          freshAsk: fresh,
          deadline: NOW + 6 * DAY,
        },
        NOW
      )
    ).toBe("within");
  });

  it("above-share-price: the accountant marked the share price down under the ask", () => {
    // Nothing about the holder changed; the share price fell beneath a request
    // posted against a higher one. The solver's own `ask-above-nav`.
    const nav = 1_000_500n;
    const ceiling = 1_000_500n;
    expect(
      compareRequest(
        {
          ask: 1_001_000n,
          ceiling,
          navPerShare: nav,
          freshAsk: freshAskFor(nav, ceiling),
          deadline: NOW + 5 * DAY,
        },
        NOW
      )
    ).toBe("above-share-price");
  });

  it("above-share-price wins over above-entitlement — the markdown is the cause to name", () => {
    // An ask above the share price is above the ceiling too (the ceiling never
    // exceeds the share price), so the order of the two decides which cause a
    // holder is told. The markdown is the one that explains it.
    expect(
      compareRequest(
        {
          ask: 1_001_000n,
          ceiling: 1_000_000n,
          navPerShare: 1_000_500n,
          freshAsk: 999_499n,
          deadline: NOW + 5 * DAY,
        },
        NOW
      )
    ).toBe("above-share-price");
  });

  it("under-asking: the share price rose past the posted spread since the post", () => {
    // Fillable as it stands, and that is the point: re-posting would fetch
    // more. The ask is inside the ceiling and below what a post made now asks.
    const nav = 1_001_370n;
    const ceiling = 1_000_000n;
    const fresh = freshAskFor(nav, ceiling); // 999,999
    expect(
      compareRequest(
        {
          ask: 999_000n,
          ceiling,
          navPerShare: nav,
          freshAsk: fresh,
          deadline: NOW + 6 * DAY,
        },
        NOW
      )
    ).toBe("under-asking");
  });

  it("is under-asking when the LOT vested rather than the share price rising", () => {
    // A request posted on day 20 at the required 1369 ppm, read on day 30 with
    // the share price unchanged: the lot has vested, so the ceiling is now the
    // share price and a post made today would ask the holder's own 0.1% —
    // 1.000368, more than the 0.999999 this one asks.
    //
    // The spec explains the case as "the share price has risen by more than the
    // posted spread since the post", and that is the usual cause; it is also
    // the only one this comparison can SEE, because an ask alone does not
    // reveal the spread it was posted at, so the share price at the post cannot
    // be recovered from a row's inputs. Vesting reaches the same place and the
    // note stays true where it matters — a post made now would fetch more — but
    // the row's wording names only the price. Flagged for the copy, not fixed
    // here: narrowing the case would silence a note a holder profits from.
    const nav = 1_001_370n;
    const ceiling = 1_001_370n; // vested since the post
    const fresh = freshAskFor(nav, ceiling);
    expect(fresh).toBe(1_000_368n);
    expect(
      compareRequest(
        {
          ask: 999_999n,
          ceiling,
          navPerShare: nav,
          freshAsk: fresh,
          deadline: NOW + 6 * DAY,
        },
        NOW
      )
    ).toBe("under-asking");
  });

  it("is within, not under-asking, when the share price has not risen past the spread", () => {
    // A request asking MORE than a fresh post would is not "under-asking" — the
    // holder is not leaving anything on the table, and the note must not offer
    // a re-post that pays less.
    expect(
      compareRequest(
        {
          ask: 1_000_500n,
          ceiling: 1_001_000n,
          navPerShare: 1_001_500n,
          freshAsk: 1_000_499n,
          deadline: NOW + 6 * DAY,
        },
        NOW
      )
    ).toBe("within");
  });

  it("expired wins over under-asking — an expired request fills at no price", () => {
    expect(
      compareRequest(
        {
          ask: 999_000n,
          ceiling: 1_000_000n,
          navPerShare: 1_001_370n,
          freshAsk: 999_999n,
          deadline: NOW - 1,
        },
        NOW
      )
    ).toBe("expired");
  });

  it("above-entitlement wins over expired — the price is why it never filled", () => {
    expect(
      compareRequest(
        {
          ask: 1_001_000n,
          ceiling: 1_000_000n,
          navPerShare: 1_001_000n,
          freshAsk: 999_999n,
          deadline: NOW - DAY,
        },
        NOW
      )
    ).toBe("above-entitlement");
  });

  it("expires at the deadline, not a second after it", () => {
    const atTheDeadline = {
      ask: 999_999n,
      ceiling: 1_000_000n,
      navPerShare: 1_001_370n,
      freshAsk: 999_999n,
      deadline: NOW,
    };
    expect(compareRequest(atTheDeadline, NOW)).toBe("expired");
    expect(compareRequest(atTheDeadline, NOW - 1)).toBe("within");
  });

  it("reads an ask at exactly the ceiling as inside it — the solver's gate is inclusive", () => {
    expect(
      compareRequest(
        {
          ask: 1_000_000n,
          ceiling: 1_000_000n,
          navPerShare: 1_001_370n,
          freshAsk: 999_999n,
          deadline: NOW + DAY,
        },
        NOW
      )
    ).toBe("within");
  });
});
