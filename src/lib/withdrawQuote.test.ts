// The withdraw panel's quote model — src/lib/withdrawQuote.ts.
//
// The copy is the spec's, verbatim (§"The surfaces — Variant B"), which is why
// it is asserted here as whole sentences rather than as the figures inside
// them: with no component tests in this repo (spec, "Not covered by tests"),
// the model IS the surface, and a sentence that drifted from the spec's table
// would otherwise reach a depositor unchallenged.
//
// Every scenario below is the spec's own worked example, whose numbers the
// spec table prints: 6,000 vested + 4,000 unvested at a share price of
// 1.001000 blends to a ceiling of 1.000600, pays 9,999.99 against 10,010.00 at
// the full share price, and gives up 10.01. The dates ("21 Sept", "26 Sept")
// are the spec's too — the example is anchored at 2026-09-01, so `NOW` below is
// that day at noon UTC, far enough from either midnight that no timezone moves
// the date.
//
// The ceilings are never asserted against a hand-typed number of this file's
// own: every one of them is `quoteEntitlement`'s, reached through the model.
import { describe, expect, it } from "vitest";

import type { HolderEvent } from "../entitlement/entitlement";
import { amountStringOf } from "./postingRule";
import {
  buildWithdrawQuote,
  type QuoteInputs,
  type WithdrawQuote,
} from "./withdrawQuote";

const SHARE = 10n ** 18n;
const DAY = 86_400;
const VESTING = 2_592_000; // 30 days — the Yield Prime 30d term
const SHARE_LOCK = 86_400; // 1 day, both products
// 2026-09-01T12:00:00Z — the day the spec's worked example is anchored to.
const NOW = 1_788_264_000;

const ago = (days: number): number => NOW - Math.round(days * DAY);

// `shares` whole shares bought at `entry` want per whole share.
const deposit = (t: number, shares: number, entry: bigint): HolderEvent => ({
  kind: "deposit",
  t,
  shares: BigInt(shares) * SHARE,
  assets: entry * BigInt(shares),
});

const sumShares = (history: HolderEvent[]): bigint =>
  history.reduce((s, e) => s + ("shares" in e ? e.shares : 0n), 0n);

function inputs(
  history: HolderEvent[],
  navPerShare: bigint,
  amount: string,
  extra: Partial<QuoteInputs> = {}
): QuoteInputs {
  return {
    history,
    shareBalance: sumShares(history),
    navPerShare,
    now: NOW,
    unlockAt: NOW - DAY,
    paused: false,
    vestingSeconds: VESTING,
    shareLockSeconds: SHARE_LOCK,
    shareDecimals: 18,
    amount,
    holderSpreadPpm: 1_000n, // the panel's 0.1% default
    holderSpreadIsDefault: true,
    shareSymbol: "CCUSD30",
    wantSymbol: "USDT",
    ...extra,
  };
}

// The spec's worked example: 6,000 shares vested 45 days ago, 4,000 more ten
// days ago, quoted over the whole 10,000 at a share price of 1.001000.
const mixed = (amount = "10000"): QuoteInputs =>
  inputs(
    [
      deposit(ago(45), 6_000, 1_000_000n),
      deposit(ago(10), 4_000, 1_000_000n),
    ],
    1_001_000n,
    amount
  );

describe("the quote card", () => {
  it("prices the spec's worked example in the spec's own words", () => {
    const quote = buildWithdrawQuote(mixed());
    const card = quote.card;
    expect(card.kind).toBe("quote");
    if (card.kind !== "quote") return;

    expect(card.headline).toBe(
      "Redeeming 10,000 CCUSD30 — ≈ 9,999.99 USDT if filled today."
    );
    expect(card.bar).toEqual({
      vestedPercent: 60,
      vestedLegend: "6,000 CCUSD30 vested",
      unvestedLegend: "4,000 CCUSD30 unvested",
    });

    expect(card.tiles.now).toEqual({
      label: "NOW",
      value: "9,999.99 USDT",
      note: "at 0.999999 USDT/share",
    });
    expect(card.tiles.atFullSharePrice).toEqual({
      label: "AT FULL SHARE PRICE",
      value: "10,010.00 USDT",
      note: "at 1.001000 USDT/share",
    });

    expect(card.cap).toBe(
      "4,000 CCUSD30 of this has not finished the 30-day vesting term, so it " +
        "is capped at what you paid — a cap, not a floor. Over the whole " +
        "amount that ceiling is 1.000600 USDT a share, computed from your " +
        "on-chain history by this widget. Leaving now gives up 10.01 USDT."
    );

    expect(card.lots).toEqual([
      "4,000 CCUSD30 vest on 21 Sept (in 20 days) — until then priced at 1.000000 USDT",
    ]);

    expect(quote.receive).toBe("9,999.99 USDT");
    expect(quote.spread).toBe("0.10%");
    expect(quote.refused).toBe(false);
  });

  it("marks the spread row (required) when the entitlement's is the one posting", () => {
    // The spec's other worked example — one 10,000-share lot on day 20 at a
    // share price of 1.001370. The entitlement requires 1369 ppm, wider than
    // the holder's 0.1%, so the required spread is what would be posted.
    const quote = buildWithdrawQuote(
      inputs([deposit(ago(20), 10_000, 1_000_000n)], 1_001_370n, "10000")
    );
    expect(quote.spread).toBe("0.1369% (required)");
    expect(quote.receive).toBe("9,999.99 USDT");
  });

  it("says the ceiling is the share price itself once everything has vested", () => {
    const quote = buildWithdrawQuote(
      inputs([deposit(ago(40), 10_000, 1_000_000n)], 1_002_001n, "10000")
    );
    const card = quote.card;
    if (card.kind !== "quote") throw new Error(`expected a quote, got ${card.kind}`);

    expect(card.cap).toBe(
      "Every share in this amount has finished the 30-day vesting term, so " +
        "your ceiling is the share price itself — 1.002001 USDT a share, " +
        "computed from your on-chain history by this widget. What you give up " +
        "is the 0.10% redemption spread and nothing else."
    );
    // Nothing is vesting, so there is no lot line and the bar is all vested.
    expect(card.lots).toEqual([]);
    expect(card.bar).toEqual({
      vestedPercent: 100,
      vestedLegend: "10,000 CCUSD30 vested",
      unvestedLegend: "0 CCUSD30 unvested",
    });
    expect(quote.spread).toBe("0.10%");
  });
});

describe("the locked card", () => {
  // Deposited six hours ago; the 1-day share lock has eighteen hours to run.
  const locked = (amount = "5000", secondsLeft = 18 * 3_600): QuoteInputs =>
    inputs([deposit(NOW - 6 * 3_600, 5_000, 1_000_396n)], 1_000_400n, amount, {
      unlockAt: NOW + secondsLeft,
    });

  it("prices nothing while the share lock runs, and says why", () => {
    const quote = buildWithdrawQuote(locked());
    const card = quote.card;
    if (card.kind !== "locked") throw new Error(`expected locked, got ${card.kind}`);

    expect(card.headline).toBe("CCUSD30 shares locked for another 18 hours.");
    expect(card.body).toBe(
      "The 1-day share lock has not ended, so there is nothing to post yet " +
        "and nothing to quote. The quote appears with the first amount you " +
        "type once the lock ends."
    );
    // Nothing is priced, whatever is in the box.
    expect(quote.receive).toBe("—");
    expect(quote.spread).toBe("0.10% (default)");
    expect(quote.refused).toBe(false);
  });

  it("counts the last hour of the lock in minutes rather than in 0 hours", () => {
    const quote = buildWithdrawQuote(locked("5000", 34 * 60));
    const card = quote.card;
    if (card.kind !== "locked") throw new Error(`expected locked, got ${card.kind}`);
    expect(card.headline).toBe("CCUSD30 shares locked for another 34 minutes.");
  });
});

describe("the clamp refusal", () => {
  it("names the cause and refuses the post when no amount at all prices", () => {
    // The spec's clamp example: one lot five days old at an unrealistic APY.
    // Every share in it is that one unvested lot, so no smaller amount prices
    // either and there is nothing to offer instead.
    const quote = buildWithdrawQuote(
      inputs([deposit(ago(5), 10_000, 1_000_000n)], 1_015_000n, "10000")
    );
    const card = quote.card;
    if (card.kind !== "clamp") throw new Error(`expected clamp, got ${card.kind}`);

    expect(card.headline).toBe("This amount can't be posted.");
    expect(card.body).toBe(
      "For 10,000 CCUSD30 your entitlement ceiling is 1.000000 USDT a share " +
        "— 1.4779% below the share price of 1.015000 USDT — computed from " +
        "your on-chain history by this widget. No redemption request can ask " +
        "more than 1% below the share price (the contract's maximum " +
        "redemption spread), so a request for this amount would be passed over."
    );
    expect(card.offer).toBeNull();
    expect(card.nextVest).toBe(
      "Your next lot vests on 26 Sept (in 25 days), which raises the ceiling."
    );

    expect(quote.receive).toBe("—");
    expect(quote.spread).toBe("1.4779% required — over the 1% maximum");
    expect(quote.refused).toBe(true);
  });

  // 6,000 shares vested 45 days ago and 4,000 bought five days ago at 1.000000,
  // against a share price of 1.100000. The whole 10,000 blends to a ceiling of
  // 1.060000 — far past the 1% maximum — but the vested shares need no spread
  // at all, so some of the unvested tail fits inside it.
  //
  // Where the boundary is, derived without this code: a request prices when its
  // ceiling is at least 99% of the share price, i.e. 1,089,000. Over 6,000
  // vested shares and x unvested, the ceiling is
  // (6,600,000,000 + 1,000,000x) / (6,000 + x), which is 1,089,007 at x = 741
  // and 1,088,994 at x = 742. So 6,741 whole shares is the largest amount that
  // prices, and 6,742 is not.
  const clampWithRoom = (amount: string): QuoteInputs =>
    inputs(
      [deposit(ago(45), 6_000, 1_000_000n), deposit(ago(5), 4_000, 1_000_000n)],
      1_100_000n,
      amount
    );

  it("offers the largest whole-share amount that still prices", () => {
    const quote = buildWithdrawQuote(clampWithRoom("10000"));
    const card = quote.card;
    if (card.kind !== "clamp") throw new Error(`expected clamp, got ${card.kind}`);

    expect(card.offer).toEqual({
      text: "Up to 6,741 CCUSD30 can be priced today",
      buttonLabel: "Use 6,741",
      amount: "6741",
    });
    // Reads as the tail of the offer's sentence, not as one of its own.
    expect(card.nextVest).toBe(
      "your next lot vests on 26 Sept (in 25 days), which raises the ceiling."
    );
  });

  it("offers an amount that prices — the button never refills a refusal", () => {
    const offered = buildWithdrawQuote(clampWithRoom("10000"));
    const card = offered.card;
    if (card.kind !== "clamp" || card.offer === null)
      throw new Error("expected a clamp with an offer");

    // The offer, typed back into the box, prices.
    const refilled = buildWithdrawQuote(clampWithRoom(card.offer.amount));
    expect(refilled.card.kind).toBe("quote");
    expect(refilled.refused).toBe(false);

    // And it is the LARGEST whole amount that does: one more share is refused.
    expect(buildWithdrawQuote(clampWithRoom("6742")).card.kind).toBe("clamp");
  });
});

// The quote is a pure function of what is in the box, recomputed on every
// keystroke over EXACTLY the shares a post would carry — not over the balance,
// and not over a rounded reading of the string.
describe("the shares that would post", () => {
  const capOf = (quote: WithdrawQuote): string => {
    const card = quote.card;
    if (card.kind !== "quote") throw new Error(`expected a quote, got ${card.kind}`);
    return card.cap;
  };

  it("prices the amount typed, not the balance behind it", () => {
    // The same holder as the worked example, typing 6,000 instead of 10,000:
    // FIFO spends the vested lot alone, so the ceiling becomes the share price
    // and the cap sentence changes with it. Nothing about the balance moved.
    const quote = buildWithdrawQuote(mixed("6000"));
    const card = quote.card;
    if (card.kind !== "quote") throw new Error(`expected a quote, got ${card.kind}`);

    expect(card.headline).toBe(
      "Redeeming 6,000 CCUSD30 — ≈ 5,999.99 USDT if filled today."
    );
    expect(card.cap).toBe(
      "Every share in this amount has finished the 30-day vesting term, so " +
        "your ceiling is the share price itself — 1.001000 USDT a share, " +
        "computed from your on-chain history by this widget. What you give up " +
        "is the 0.10% redemption spread and nothing else."
    );
    expect(card.lots).toEqual([]);
  });

  it("truncates the typed string the way the wire does", () => {
    // A 19th decimal is dropped by the library's conversion, so the quote must
    // drop it too. One wei either side of the vested lot's edge is what makes
    // that observable: 6,000 shares exactly spends only vested shares, and a
    // single wei more reaches into the unvested lot.
    expect(capOf(buildWithdrawQuote(mixed("6000.0000000000000000009")))).toBe(
      capOf(buildWithdrawQuote(mixed("6000")))
    );

    const oneWeiMore = buildWithdrawQuote(mixed("6000.000000000000000001"));
    const card = oneWeiMore.card;
    if (card.kind !== "quote") throw new Error(`expected a quote, got ${card.kind}`);
    expect(card.lots).toHaveLength(1);
  });

  it("quotes MAX's exact balance, and nothing above it", () => {
    // What MAX types: the whole balance as an exact 18-dp string, which must
    // price to the wei.
    const balance = sumShares([
      deposit(ago(45), 6_000, 1_000_000n),
      deposit(ago(10), 4_000, 1_000_000n),
    ]);
    const max = amountStringOf(balance, 18);
    expect(max).toBe("10000");
    expect(buildWithdrawQuote(mixed(max)).card.kind).toBe("quote");

    // One wei more is an amount nothing would post. Quoting the balance instead
    // would answer a question the holder did not ask, beside the panel's own
    // "Amount exceeds your share balance" — two surfaces disagreeing about one
    // number.
    const over = buildWithdrawQuote(mixed("10000.000000000000000001"));
    expect(over.card.kind).toBe("none");
    expect(over.receive).toBe("—");
  });

  it("marks the required spread as one the holder did not choose", () => {
    // The fact behind the row's "(required)", carried as a fact so the panel
    // can emphasise it without reading the sentence.
    const required = buildWithdrawQuote(
      inputs([deposit(ago(20), 10_000, 1_000_000n)], 1_001_370n, "10000")
    );
    expect(required.spreadIsRequired).toBe(true);
    // The worked example posts the holder's own 0.1%, which they did choose.
    expect(buildWithdrawQuote(mixed()).spreadIsRequired).toBe(false);
  });

  it("prices nothing until there is an amount to price", () => {
    for (const amount of ["", "  ", ".", "0", "0.000"]) {
      const quote = buildWithdrawQuote(mixed(amount));
      expect(quote.card.kind).toBe("none");
      expect(quote.receive).toBe("—");
      expect(quote.spread).toBe("0.10% (default)");
      expect(quote.refused).toBe(false);
    }
  });
});

// Nothing to price FROM, which is not the same as nothing to price. Posting
// stays open at the holder's own spread — the widget never gates a post on its
// own reads — so the panel is told it owes a disclosure instead of a figure.
// The wordings for these states are the "when the widget cannot price" ticket's;
// what this ticket owes is that no WRONG figure stands in for them.
describe("when nothing can be priced", () => {
  const cases: [string, Partial<QuoteInputs>][] = [
    ["the share price is under review", { paused: true }],
    ["the history has not been read", { history: null }],
    ["the balance has not been read", { shareBalance: null }],
    ["the share price has not been read", { navPerShare: null }],
  ];

  for (const [why, broken] of cases) {
    it(`says so, and quotes nothing, when ${why}`, () => {
      const quote = buildWithdrawQuote(inputs(
        [deposit(ago(45), 6_000, 1_000_000n)],
        1_001_000n,
        "6000",
        broken
      ));
      expect(quote.cannotPrice).toBe(true);
      expect(quote.card.kind).toBe("none");
      expect(quote.receive).toBe("—");
      expect(quote.spread).toBe("0.10% (default)");
      // Never refused: the widget refuses only what it can ESTABLISH the solver
      // would skip, and it has established nothing here.
      expect(quote.refused).toBe(false);
    });
  }

  it("is not what an empty amount box means", () => {
    // Nothing is priced there either, but nothing was asked for, no wrong
    // figure is on screen, and so no disclosure is owed.
    const quote = buildWithdrawQuote(mixed(""));
    expect(quote.card.kind).toBe("none");
    expect(quote.cannotPrice).toBe(false);
  });

  it("keeps the lock notice ahead of the pause", () => {
    // A locked holder is told about the lock, not about the pause: the lock is
    // the one they can do something about, and it needs no price to say.
    const quote = buildWithdrawQuote(
      inputs([deposit(NOW - 3_600, 5_000, 1_000_000n)], 1_000_400n, "5000", {
        unlockAt: NOW + 18 * 3_600,
        paused: true,
      })
    );
    expect(quote.card.kind).toBe("locked");
    expect(quote.cannotPrice).toBe(false);
  });
});

// What the confirm modal pins and the wire carries. The model used to expose
// formatted strings alone, which left the panel to convert the amount and pick
// the spread a SECOND time on its way to `queueWithdraw` — two derivations of
// one number, and nothing to prove they agree. They are on the model now, so
// "what the modal shows is what is posted" is a fact about one object.
describe("the post the quote stands behind", () => {
  it("carries the exact shares and the exact discount", () => {
    // The worked example: the holder's own 0.1% is wider than the 0.04% the
    // entitlement requires, so it is what posts — byte-identical to stage 1.
    expect(buildWithdrawQuote(mixed()).post).toEqual({
      offerShares: 10_000n * SHARE,
      discountPpm: 1_000n,
    });
  });

  it("carries the required spread when that is the one that posts", () => {
    // The spec's "0.1369% (required)": one 20-day-old lot at 1.000000 quoted
    // against a share price of 1.001370.
    const quote = buildWithdrawQuote(
      inputs([deposit(ago(20), 10_000, 1_000_000n)], 1_001_370n, "10000")
    );
    expect(quote.spreadIsRequired).toBe(true);
    expect(quote.post).toEqual({
      offerShares: 10_000n * SHARE,
      discountPpm: 1_369n,
    });
  });

  it("carries the shares the string converts to, not the string", () => {
    // A 19th decimal the library drops must not reach the wire as shares the
    // holder does not hold.
    expect(buildWithdrawQuote(mixed("6000.0000000000000000009")).post).toEqual({
      offerShares: 6_000n * SHARE,
      discountPpm: 1_000n,
    });
  });

  it("stands behind nothing where nothing is postable", () => {
    // Every state in which the button is dead or the box is empty. A post
    // offered here would be a post the card never priced.
    expect(buildWithdrawQuote(mixed("")).post).toBeNull();
    expect(buildWithdrawQuote(mixed("10000.000000000000000001")).post).toBeNull();
    expect(
      buildWithdrawQuote(
        inputs([deposit(ago(45), 6_000, 1_000_000n)], 1_001_000n, "6000", {
          paused: true,
        })
      ).post
    ).toBeNull();
    expect(
      buildWithdrawQuote(
        inputs([deposit(NOW - 3_600, 5_000, 1_000_000n)], 1_000_400n, "5000", {
          unlockAt: NOW + 18 * 3_600,
        })
      ).post
    ).toBeNull();
    // The clamp: refused, and so nothing stands behind it.
    const clamped = buildWithdrawQuote(
      inputs([deposit(ago(5), 10_000, 1_000_000n)], 1_015_000n, "10000")
    );
    expect(clamped.refused).toBe(true);
    expect(clamped.post).toBeNull();
  });
});
