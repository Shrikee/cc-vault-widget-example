// The position card's exit sub-line — src/lib/positionExit.ts.
//
// The copy is the spec's, verbatim (§"The surfaces — Variant B", the position
// card row), which is why it is asserted here as whole sentences rather than as
// the figures inside them: this repo has no component tests by policy (spec,
// "Not covered by tests"), so the model IS the surface, and a sentence that
// drifted from the spec's table would otherwise reach a depositor unchallenged.
//
// The figures are the spec's own worked example, and deliberately the same ones
// src/lib/withdrawQuote.test.ts pins: 6,000 vested + 4,000 unvested at a share
// price of 1.001000 pays 9,999.99 against 10,010.00 at the full share price and
// gives up 10.01. The two surfaces quote different things — the panel the typed
// amount, this the whole balance — so where they agree here, they agree because
// the numbers really are the same, and a depositor reading both is not shown
// two answers.
//
// No ceiling below is a hand-typed number of this file's own: every one of them
// is `quoteEntitlement`'s, reached through the model.
import { describe, expect, it } from "vitest";

import type { HolderEvent } from "../entitlement/entitlement";
import {
  buildPositionExitLine,
  type PositionExitInputs,
} from "./positionExit";

const SHARE = 10n ** 18n;
const DAY = 86_400;
const HOUR = 3_600;
const VESTING = 2_592_000; // 30 days — the Yield Prime 30d term
// 2026-09-01T12:00:00Z — the day the spec's worked example is anchored to.
const NOW = 1_788_264_000;

const ago = (days: number): number => NOW - Math.round(days * DAY);

// A scan that failed, as `PricedHistory.unreadable` hands it over. This card
// reads only whether it is there — it has one sentence for either reason — so
// one shape stands for both.
const READ_FAILED = {
  kind: "read-failed",
  detail: "chunk 41 timed out",
} as const;

// `shares` whole shares bought at `entry` want per whole share.
const deposit = (t: number, shares: number, entry: bigint): HolderEvent => ({
  kind: "deposit",
  t,
  shares: BigInt(shares) * SHARE,
  assets: entry * BigInt(shares),
});

const sumShares = (history: HolderEvent[]): bigint =>
  history.reduce((s, e) => s + ("shares" in e ? e.shares : 0n), 0n);

// The card's inputs. The balance defaults to what the history explains, which
// is the ordinary case; the tests that care about the difference say so.
function inputs(
  history: HolderEvent[],
  navPerShare: bigint,
  extra: Partial<PositionExitInputs> = {}
): PositionExitInputs {
  return {
    history,
    shareBalance: sumShares(history),
    navPerShare,
    now: NOW,
    unlockAt: NOW - DAY,
    paused: false,
    unreadable: null,
    vestingSeconds: VESTING,
    shareDecimals: 18,
    // The widget's default redemption spread, in the queue's ppm — never the
    // panel's control, which this surface is not part of.
    defaultSpreadPpm: 1_000n,
    shareSymbol: "CCUSD30",
    wantSymbol: "USDT",
    ...extra,
  };
}

// The spec's worked example: 6,000 shares vested 45 days ago, 4,000 more ten
// days ago, against a share price of 1.001000.
const mixed = (extra: Partial<PositionExitInputs> = {}): PositionExitInputs =>
  inputs(
    [deposit(ago(45), 6_000, 1_000_000n), deposit(ago(10), 4_000, 1_000_000n)],
    1_001_000n,
    extra
  );

describe("the sub-line", () => {
  it("quotes the whole balance in the spec's own words", () => {
    expect(buildPositionExitLine(mixed())).toBe(
      "Redeemable today ≈ 9,999.99 USDT for your whole balance, at 0.10% — " +
        "computed from your on-chain history by this widget. 10.01 USDT below " +
        "the share price, because 4,000 CCUSD30 has not vested."
    );
  });

  it("says everything has vested when nothing is still vesting", () => {
    expect(
      buildPositionExitLine(inputs([deposit(ago(45), 10_000, 1_000_000n)], 1_001_000n))
    ).toBe(
      "Redeemable today ≈ 9,999.99 USDT for your whole balance, at 0.10% — " +
        "computed from your on-chain history by this widget. Everything has " +
        "vested."
    );
  });

  // The number in the line is the one that would post, which on an unvested
  // balance is the entitlement's rather than the widget's default.
  it("quotes at the required spread when it is wider than the default", () => {
    expect(
      buildPositionExitLine(
        inputs(
          [
            deposit(ago(45), 6_000, 1_000_000n),
            deposit(ago(10), 4_000, 1_000_000n),
          ],
          1_005_000n
        )
      )
    ).toBe(
      "Redeemable today ≈ 10,029.99 USDT for your whole balance, at 0.1991% — " +
        "computed from your on-chain history by this widget. 20.01 USDT below " +
        "the share price, because 4,000 CCUSD30 has not vested."
    );
  });

  // The WHOLE balance, to the wei — not the part of it the replay can explain.
  // A holder whose balance predates the ledger floor carries a residual lot,
  // and a sub-line quoting only the explained part would name a smaller figure
  // than the one the panel offers on MAX.
  it("quotes the balance, not the history behind it", () => {
    expect(buildPositionExitLine(mixed({ shareBalance: 12_000n * SHARE }))).toBe(
      "Redeemable today ≈ 11,999.99 USDT for your whole balance, at 0.10% — " +
        "computed from your on-chain history by this widget. 12.01 USDT below " +
        "the share price, because 4,000 CCUSD30 has not vested."
    );
  });

  // A wallet that was sent its shares has no deposits, so no earnings figure —
  // and an entitlement all the same. The card keeps its "—" for earnings and
  // still says what the balance is worth today.
  //
  // It is also the vector where the two halves of the sentence could disagree:
  // the payout is 4,999.995 and the share price fetches 5,005.000000, so a gap
  // taken off the unrounded units reads 5.01 beside a figure written 5,000.00.
  // The sentence subtracts what it shows, so it reads 5.00.
  it("prices a wallet that never deposited", () => {
    expect(
      buildPositionExitLine(
        inputs(
          [
            {
              kind: "transfer-in",
              t: ago(10),
              shares: 5_000n * SHARE,
              rate: 1_000_000n,
            },
          ],
          1_001_000n
        )
      )
    ).toBe(
      "Redeemable today ≈ 5,000.00 USDT for your whole balance, at 0.10% — " +
        "computed from your on-chain history by this widget. 5.00 USDT below " +
        "the share price, because 5,000 CCUSD30 has not vested."
    );
  });
});

// Past the contract's 1% maximum redemption spread there is no price to name,
// so the line names the largest amount that still has one instead.
describe("the clamp", () => {
  // The withdraw panel's own clamp scenario: 6,000 vested and 4,000 bought
  // five days ago at 1.000000 against a share price of 1.100000, where 6,741
  // whole shares is the largest amount that prices and 6,742 is not.
  const clampWithRoom = (extra: Partial<PositionExitInputs> = {}) =>
    inputs(
      [deposit(ago(45), 6_000, 1_000_000n), deposit(ago(5), 4_000, 1_000_000n)],
      1_100_000n,
      extra
    );

  it("offers the largest whole-share amount that still prices", () => {
    expect(buildPositionExitLine(clampWithRoom())).toBe(
      "Redeemable today — not at any postable price for your whole balance; " +
        "up to 6,741 CCUSD30 can be."
    );
  });

  it("drops the offer when no smaller amount prices either", () => {
    expect(
      buildPositionExitLine(inputs([deposit(ago(5), 10_000, 1_000_000n)], 1_015_000n))
    ).toBe(
      "Redeemable today — not at any postable price for your whole balance."
    );
  });

  // The lock does not move the ceiling, and there is no figure to quote while
  // the balance has no postable price — so the refusal wins over the countdown
  // rather than promising a number the entitlement cannot produce.
  it("refuses rather than quoting while the shares are still locked", () => {
    expect(
      buildPositionExitLine(clampWithRoom({ unlockAt: NOW + 18 * HOUR }))
    ).toBe(
      "Redeemable today — not at any postable price for your whole balance; " +
        "up to 6,741 CCUSD30 can be."
    );
  });
});

// Unlike the withdraw panel, which quotes nothing until the lock ends, the card
// quotes through it: the holder is not posting anything, they are being told
// what they hold.
describe("the lock", () => {
  it("says when the lock ends and prices the balance behind it", () => {
    expect(
      buildPositionExitLine(
        inputs([deposit(NOW - 6 * HOUR, 5_000, 1_000_000n)], 1_000_400n, {
          unlockAt: NOW + 18 * HOUR,
        })
      )
    ).toBe(
      "Redeemable once the lock ends (in 18 h) — ≈ 4,997.00 USDT at today's " +
        "share price and entitlement."
    );
  });

  it("counts the last hour in minutes", () => {
    const line = buildPositionExitLine(
      inputs([deposit(NOW - 6 * HOUR, 5_000, 1_000_000n)], 1_000_400n, {
        unlockAt: NOW + 34 * 60,
      })
    );
    expect(line).toContain("Redeemable once the lock ends (in 34 m) — ");
  });
});

// Nothing is quoted from a read the widget does not have — but the two states
// it can NAME are named, verbatim from the spec (§"When the widget cannot
// price"). A holding is still a holding when the price under it cannot be
// computed, and "Redeemable today" with no figure is more honest than a blank
// line under a balance the depositor can see.
describe("what it will not price", () => {
  it("says the share price is under review, when the accountant is paused", () => {
    expect(buildPositionExitLine(mixed({ paused: true }))).toBe(
      "Redeemable today — not while the share price is under review."
    );
  });

  it("says the history could not be read, when the scan or the floor failed", () => {
    expect(
      buildPositionExitLine(mixed({ history: null, unreadable: READ_FAILED }))
    ).toBe("Redeemable today — couldn't read your history.");
  });

  it("answers the pause first, when both are true", () => {
    // The same order the quote card keeps: the pause is the live operator state
    // and the one that also closes the post.
    expect(
      buildPositionExitLine(mixed({ paused: true, history: null, unreadable: READ_FAILED }))
    ).toBe("Redeemable today — not while the share price is under review.");
  });

  it("says nothing while a read is merely still in flight", () => {
    // No wording: nothing has failed, and a sentence about a failure would not
    // be true yet. Silence is the one thing that cannot be wrong here.
    expect(buildPositionExitLine(mixed({ history: null }))).toBeNull();
    // Including a pause flag nobody has answered for. It is not permission to
    // price — the auto-pause stores the out-of-bounds rate BEFORE setting the
    // flag — and it is not the paused sentence either.
    expect(buildPositionExitLine(mixed({ paused: null }))).toBeNull();
    expect(buildPositionExitLine(mixed({ navPerShare: null }))).toBeNull();
    expect(buildPositionExitLine(mixed({ navPerShare: 0n }))).toBeNull();
    expect(buildPositionExitLine(mixed({ shareBalance: null }))).toBeNull();
  });

  it("says nothing at all to a wallet holding none of the product", () => {
    // Not even the two degraded lines: there is no exit to describe, so
    // "Redeemable today" over a zero balance would be a sentence about nothing.
    expect(buildPositionExitLine(mixed({ shareBalance: 0n }))).toBeNull();
    expect(
      buildPositionExitLine(mixed({ shareBalance: 0n, paused: true }))
    ).toBeNull();
    expect(
      buildPositionExitLine(
        mixed({ shareBalance: 0n, history: null, unreadable: READ_FAILED })
      )
    ).toBeNull();
    // And nothing when the balance itself is what has not been read.
    expect(
      buildPositionExitLine(mixed({ shareBalance: null, paused: true }))
    ).toBeNull();
  });
});
