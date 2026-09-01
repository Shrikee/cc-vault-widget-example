// The request row's model — src/lib/requestRow.ts.
//
// The copy is the spec's, verbatim (§"The surfaces — Variant B", the request-row
// row and the five-way notes under it), which is why it is asserted here as
// whole sentences rather than as the figures inside them: with no component
// tests in this repo (spec, "Not covered by tests"), the model IS the row, and a
// sentence that drifted from the spec's list would otherwise reach a depositor
// unchallenged.
//
// The scenarios are the prototype's three request vectors (request-above,
// request-below-stale, request-fresh) plus the two it has none for — a share
// price marked down under the ask, and a request the market left behind — the
// same five src/lib/requestComparison.test.ts drives, but priced from a real
// holder history so every ceiling here is `quoteEntitlement`'s rather than a
// number this file typed.
//
// The figures are the spec's own: 1,000 shares asking 1.001000 against a
// two-day-old lot's ceiling of 1.000000 is the strip the surface table prints
// ("Your ask 1.001000 USDT/share → 1,001.00 USDT" / "Your ceiling 1.000000
// USDT/share — asking above it"), and re-posting them prices at 0.999999.
import { describe, expect, it } from "vitest";

import type { HolderEvent } from "../entitlement/entitlement";
import { buildRequestRow, type RequestRowInputs } from "./requestRow";

const SHARE = 10n ** 18n;
const DAY = 86_400;
const VESTING = 2_592_000; // 30 days — the Yield Prime 30d term
// 2026-09-01T12:00:00Z — the day the spec's worked example is anchored to.
const NOW = 1_788_264_000;

const ago = (days: number): number => NOW - days * DAY;

// `shares` whole shares bought at `entry` want per whole share.
const deposit = (t: number, shares: number, entry: bigint): HolderEvent => ({
  kind: "deposit",
  t,
  shares: BigInt(shares) * SHARE,
  assets: entry * BigInt(shares),
});

const sumShares = (history: HolderEvent[]): bigint =>
  history.reduce((s, e) => s + ("shares" in e ? e.shares : 0n), 0n);

// One live request against one history. Everything a row is judged from, with
// the panel's own defaults for what the side rail cannot see.
function inputs(
  history: HolderEvent[],
  navPerShare: bigint,
  request: { ask: bigint; deadline: number; shares?: number },
  extra: Partial<RequestRowInputs> = {}
): RequestRowInputs {
  return {
    vestingGap: true,
    status: NOW >= request.deadline ? "expired" : "open",
    offerShares: BigInt(request.shares ?? 1_000) * SHARE,
    ask: request.ask,
    deadline: request.deadline,
    history,
    shareBalance: sumShares(history),
    navPerShare,
    paused: false,
    now: NOW,
    vestingSeconds: VESTING,
    shareDecimals: 18,
    defaultSpreadPpm: 1_000n, // the widget's 0.1% default
    wantSymbol: "USDT",
    ...extra,
  };
}

// A lot bought two days ago at 1.000000 — 28 days short of vesting, so its
// ceiling is what it paid.
const unvested = (
  navPerShare: bigint,
  request: { ask: bigint; deadline: number; shares?: number },
  extra: Partial<RequestRowInputs> = {}
): RequestRowInputs =>
  inputs([deposit(ago(2), 1_000, 1_000_000n)], navPerShare, request, extra);

// A lot bought 45 days ago: vested, so the ceiling IS the share price.
const vested = (
  navPerShare: bigint,
  request: { ask: bigint; deadline: number; shares?: number },
  extra: Partial<RequestRowInputs> = {}
): RequestRowInputs =>
  inputs([deposit(ago(45), 1_000, 1_000_000n)], navPerShare, request, extra);

// The one shape every assertion below reads from — a row that failed to price
// has nothing to say about a note or a badge, and saying so here keeps every
// test that follows from asserting against `undefined`.
function priced(input: RequestRowInputs) {
  const row = buildRequestRow(input);
  if (row.kind !== "priced") throw new Error(`unpriced: ${JSON.stringify(row)}`);
  return row;
}

describe("the request row's five cases", () => {
  it("above-entitlement: the prototype's request-above, in the spec's own words", () => {
    // The spec's request-row example: 1,000 shares asking the full share price
    // of 1.001000 against a two-day-old lot's ceiling of 1.000000.
    const row = priced(
      unvested(1_001_000n, { ask: 1_001_000n, deadline: NOW + 5 * DAY })
    );

    expect(row.comparison).toBe("above-entitlement");
    expect(row.badge).toBe("Above your entitlement");
    expect(row.tone).toBe("warning");
    expect(row.strip.ask).toEqual({
      label: "Your ask",
      value: "1.001000 USDT/share",
      note: "→ 1,001.00 USDT",
    });
    expect(row.strip.ceiling).toEqual({
      label: "Your ceiling",
      value: "1.000000 USDT/share",
      note: "— asking above it",
    });
    expect(row.askingAbove).toBe(true);
    expect(row.note).toBe(
      "The solver passes over a request asking more than your entitlement " +
        "ceiling, so this one sits open until its deadline. The ceiling is " +
        "computed from your on-chain history by this widget; it moves up as " +
        "your lots vest."
    );
    // The re-post the spec's table names, at the price the posting rule makes
    // over the same shares.
    expect(row.repost).toEqual({
      label: "Re-post at 0.999999",
      amount: "1000",
      offerShares: 1_000n * SHARE,
    });
  });

  it("above-share-price: the accountant marked the share price down under the ask", () => {
    // Nothing about the holder changed — this lot vested weeks ago and its
    // ceiling is the share price itself. The share price fell beneath a request
    // posted against a higher one, which is the solver's own `ask-above-nav`,
    // and the note names that markdown rather than the entitlement.
    const row = priced(
      vested(1_000_500n, { ask: 1_001_000n, deadline: NOW + 5 * DAY })
    );

    expect(row.comparison).toBe("above-share-price");
    expect(row.badge).toBe("Above the share price");
    expect(row.tone).toBe("warning");
    expect(row.note).toBe(
      "The share price has fallen to 1.000500 USDT/share since this was " +
        "posted, below what this request asks, so the solver passes it over — " +
        "it does not fill a request for more than a share is worth."
    );
    expect(row.strip.ceiling.note).toBe("— asking above it");
    expect(row.repost?.label).toBe("Re-post at 0.999499");
  });

  it("expired: the prototype's request-below-stale", () => {
    // The lot vested while the request sat, so its ask is now well inside the
    // ceiling. The price was never the problem: the deadline lapsed.
    const row = priced(
      vested(1_002_001n, { ask: 1_001_000n, deadline: NOW - DAY })
    );

    expect(row.comparison).toBe("expired");
    expect(row.badge).toBe("Expired");
    expect(row.tone).toBe("danger");
    expect(row.strip.ceiling.note).toBe("— asking within it");
    expect(row.askingAbove).toBe(false);
    expect(row.note).toBe(
      "The price was never the problem: this asks inside your ceiling. Its " +
        "deadline lapsed, and an expired request cannot be filled at any " +
        "price — the comparison above cannot see that, which is why the " +
        "deadline is beside it. A request posted now would ask 1.000998 " +
        "USDT/share and pay 1,001.00 USDT."
    );
    // No price fills an expired request, so the re-post is the only remedy
    // there is.
    expect(row.repost?.label).toBe("Re-post at 1.000998");
  });

  it("under-asking: fillable, but priced against an older share price", () => {
    // Posted when the share price was lower, and left behind by one that rose
    // further than the posted spread.
    const row = priced(
      vested(1_002_001n, { ask: 1_000_000n, deadline: NOW + 5 * DAY })
    );

    expect(row.comparison).toBe("under-asking");
    // Nothing is wrong with it, so it keeps the plain badge.
    expect(row.badge).toBe("Open");
    expect(row.tone).toBe("info");
    expect(row.note).toBe(
      "Fillable as it stands, but it was priced against an older share " +
        "price: a request posted now would ask 1.000998 and pay 1.00 USDT more."
    );
    expect(row.repost?.label).toBe("Re-post at 1.000998");
  });

  it("within: the prototype's request-fresh, asking exactly what a post now would", () => {
    // The day-20 lot at a share price of 1.001370: the required spread is
    // 1369 ppm and the ask is the 0.999999 it makes.
    const row = priced(
      inputs([deposit(ago(20), 1_000, 1_000_000n)], 1_001_370n, {
        ask: 999_999n,
        deadline: NOW + 6 * DAY,
      })
    );

    expect(row.comparison).toBe("within");
    expect(row.badge).toBe("Open");
    expect(row.tone).toBe("info");
    expect(row.note).toBe(
      "Within your entitlement. A request posted now would ask 0.999999 " +
        "USDT/share — the same price. Whether it is filled is the solver's " +
        "decision."
    );
    // Nothing to offer: a post now would ask the same price this one already
    // asks, and the row never offers a re-post that fetches no more.
    expect(row.repost).toBeNull();
  });

  it("within, under a share price that has risen inside the posted spread", () => {
    // A request asking MORE than a post now would, and still inside the
    // ceiling: re-posting would fetch less, so there is nothing to offer.
    const row = priced(
      vested(1_002_001n, { ask: 1_001_000n, deadline: NOW + 5 * DAY })
    );

    expect(row.comparison).toBe("within");
    expect(row.note).toBe(
      "Within your entitlement. A request posted now would ask 1.000998 " +
        "USDT/share — no more than this one. Whether it is filled is the " +
        "solver's decision."
    );
    expect(row.repost).toBeNull();
  });
});

describe("the strip", () => {
  it("pays the ask over the shares the request offers, not the balance", () => {
    // Half the balance offered: the strip's payout is the request's own, and
    // so is the ceiling it is measured against.
    const row = priced(
      unvested(1_001_000n, {
        ask: 1_001_000n,
        deadline: NOW + 5 * DAY,
        shares: 400,
      })
    );

    expect(row.strip.ask.note).toBe("→ 400.40 USDT");
    expect(row.repost).toEqual({
      label: "Re-post at 0.999999",
      amount: "400",
      offerShares: 400n * SHARE,
    });
  });
});

describe("what the row will not price", () => {
  it("leaves a product with no vesting gap alone", () => {
    // The 24h product: its shares vest as they unlock, so there is no ceiling
    // below the share price to judge a request against, and its row is stage
    // 1's untouched.
    expect(
      buildRequestRow(
        unvested(
          1_001_000n,
          { ask: 1_001_000n, deadline: NOW + 5 * DAY },
          { vestingGap: false }
        )
      ).kind
    ).toBe("unpriced");
  });

  it("prices nothing it has not read, and keeps stage 1's whole row", () => {
    const live = { ask: 1_001_000n, deadline: NOW + 5 * DAY };
    for (const missing of [
      { history: null },
      { shareBalance: null },
      { navPerShare: null },
      { navPerShare: 0n },
      // Not read at all — a flag this card has not been handed is not a flag
      // that says "running", and it is not one that says "paused" either.
      { paused: null },
    ] satisfies Partial<RequestRowInputs>[]) {
      expect(buildRequestRow(unvested(1_001_000n, live, missing)).kind).toBe(
        "unpriced"
      );
    }
  });

  it("says only the badge and the deadline while the share price is under review", () => {
    // The spec's paused row (§"When the widget cannot price"): no strip, no
    // computed note, and not stage 1's note either — the live cause is the
    // pause, and the rate the Lens serves is the number the operator is
    // reviewing, so nothing here is judged against it.
    const live = { ask: 1_001_000n, deadline: NOW + 5 * DAY };
    expect(buildRequestRow(unvested(1_001_000n, live, { paused: true }))).toEqual(
      { kind: "paused" }
    );
  });

  it("leaves the 24h product's row alone even while its accountant is paused", () => {
    // Exempt by construction: nothing there is priced against a ceiling, so
    // there is nothing for a pause to withdraw.
    expect(
      buildRequestRow(
        unvested(
          1_001_000n,
          { ask: 1_001_000n, deadline: NOW + 5 * DAY },
          { vestingGap: false, paused: true }
        )
      ).kind
    ).toBe("unpriced");
  });

  it("leaves a held or stopped request alone while paused, too", () => {
    // Stage 1's row outranks the pause the same way it outranks a price: a
    // request the solver is holding is not one to say anything new about.
    for (const status of ["solving", "stopped"] as const) {
      expect(
        buildRequestRow(
          unvested(
            1_001_000n,
            { ask: 1_001_000n, deadline: NOW + 5 * DAY },
            { status, paused: true }
          )
        ).kind
      ).toBe("unpriced");
    }
  });

  it("leaves a request the solver is holding, and one that was stopped", () => {
    const live = { ask: 1_001_000n, deadline: NOW + 5 * DAY };
    // Filling: the solver has it, and a re-post would replace the request being
    // filled. Stopped: the approval is revoked, which is the depositor's own
    // decision and not a price to argue with.
    for (const status of ["solving", "stopped"] as const) {
      expect(buildRequestRow(unvested(1_001_000n, live, { status })).kind).toBe(
        "unpriced"
      );
    }
  });

  it("names the cause but offers no re-post when nothing can be posted today", () => {
    // A two-day-old lot bought at 1.010000 under a share price that has since
    // run to 1.030000: the ceiling is what it paid, nearly 2% below the share
    // price, so the contract's maximum redemption spread refuses every amount.
    // The row still says why the live request sits open; there is simply no
    // better post to offer.
    const row = priced(
      inputs([deposit(ago(2), 1_000, 1_010_000n)], 1_030_000n, {
        ask: 1_029_000n,
        deadline: NOW + 5 * DAY,
      })
    );

    expect(row.comparison).toBe("above-entitlement");
    expect(row.strip.ceiling.value).toBe("1.010000 USDT/share");
    expect(row.repost).toBeNull();
  });

  it("says nothing at all about a request already inside a ceiling nothing can be posted under", () => {
    // The same clamp, over a request asking less than the ceiling: every note
    // left names what a post made now would ask, and today none can be made.
    // Stage 1's row stands — the spec writes no wording for this state, and the
    // withdraw panel's clamp card already names the cause and both remedies.
    expect(
      buildRequestRow(
        inputs([deposit(ago(2), 1_000, 1_010_000n)], 1_030_000n, {
          ask: 1_000_000n,
          deadline: NOW + 5 * DAY,
        })
      ).kind
    ).toBe("unpriced");
  });
});
