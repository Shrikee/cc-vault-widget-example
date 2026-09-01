// The confirm modal's pinned model — src/lib/confirmPin.ts.
//
// The copy is the spec's, verbatim (§"The surfaces — Variant B", confirm-modal
// row), and this repo has no component tests (spec, "Not covered by tests"), so
// the model IS the modal: every sentence a depositor reads before signing is
// asserted here as a whole sentence.
//
// The scenarios are the spec's own worked example, anchored at 2026-09-01: 6,000
// shares vested + 4,000 unvested at a share price of 1.001000 blends to a
// ceiling of 1.000600 and pays 9,999.99; one 20-day-old lot at 1.000000 against
// a share price of 1.001370 requires the spec's 0.1369%. No ceiling here is a
// number this file typed — every one is `quoteEntitlement`'s, reached through
// the model.
import { describe, expect, it } from "vitest";

import type { HolderEvent } from "../entitlement/entitlement";
import {
  buildConfirmPin,
  pinReadsOf,
  rePinNotice,
  RECHECK_UNREAD_NOTICE,
  UNREAD,
  type ConfirmPin,
  type PinBatch,
  type PinInputs,
} from "./confirmPin";
import { recheckBeforePost } from "./confirmRecheck";

const SHARE = 10n ** 18n;
const DAY = 86_400;
const VESTING = 2_592_000; // 30 days — the Yield Prime 30d term
// 2026-09-01T12:00:00Z, the head block's own timestamp.
const NOW = 1_788_264_000;
// The spec's worked example prints this one.
const BLOCK = 93_051_200n;

const ago = (days: number): number => NOW - Math.round(days * DAY);

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
  offerShares: bigint,
  extra: Partial<PinInputs> = {}
): PinInputs {
  return {
    reads: {
      kind: "read",
      blockNumber: BLOCK,
      now: NOW,
      navPerShare,
      shareBalance: sumShares(history),
      rateUpdatedAt: NOW - 1_800,
      history,
    },
    offerShares,
    holderSpreadPpm: 1_000n, // the panel's 0.1% default
    vestingSeconds: VESTING,
    shareDecimals: 18,
    shareSymbol: "CCUSD30",
    wantSymbol: "USDT",
    ...extra,
  };
}

// The worked example, pinned over the whole 10,000.
const mixed = (extra: Partial<PinInputs> = {}): PinInputs =>
  inputs(
    [deposit(ago(45), 6_000, 1_000_000n), deposit(ago(10), 4_000, 1_000_000n)],
    1_001_000n,
    10_000n * SHARE,
    extra
  );

// One 20-day-old lot: the entitlement requires more than the holder's own
// spread, which is the case the whole ticket exists for.
const unvested = (extra: Partial<PinInputs> = {}): PinInputs =>
  inputs([deposit(ago(20), 10_000, 1_000_000n)], 1_001_370n, 10_000n * SHARE, extra);

function pinned(input: PinInputs): Extract<ConfirmPin, { kind: "pinned" }> {
  const pin = buildConfirmPin(input);
  if (pin.kind !== "pinned") throw new Error(`expected a pin, got ${pin.body}`);
  return pin;
}

const rowValue = (pin: Extract<ConfirmPin, { kind: "pinned" }>, label: string) => {
  const row = pin.rows.find((r) => r.label === label);
  if (!row) throw new Error(`no row ${JSON.stringify(label)}`);
  return row.value;
};

describe("the pinned tile", () => {
  it("names the amount, the payout and the block they were read at", () => {
    expect(pinned(mixed()).tile).toBe(
      "10,000 CCUSD30 → 9,999.99 USDT — Pinned at block 93,051,200. These are " +
        "the figures that go to the queue."
    );
  });
});

describe("the pinned rows", () => {
  it("shows the share price, the ceiling, the spread, the ask and the payout", () => {
    const pin = pinned(mixed());
    expect(pin.rows.map((r) => r.label)).toEqual([
      "Share price (pinned)",
      "Your ceiling (pinned)",
      "Posted spread",
      "Asking price",
      "Receive (min)",
    ]);
    expect(rowValue(pin, "Share price (pinned)")).toBe("1.001000 USDT/share");
    // `quoteEntitlement`'s blend over the two lots, never a number typed here.
    expect(rowValue(pin, "Your ceiling (pinned)")).toBe("1.000600 USDT/share");
    expect(rowValue(pin, "Asking price")).toBe("0.999999 USDT/share");
    expect(rowValue(pin, "Receive (min)")).toBe("9,999.99 USDT");
  });

  it("says whose spread is being posted", () => {
    // The holder's own 0.1% is wider than the 0.04% the entitlement asks for,
    // so it is theirs.
    expect(rowValue(pinned(mixed()), "Posted spread")).toBe("0.10% (yours)");
    // The 20-day lot's entitlement asks for more than they would have posted.
    expect(rowValue(pinned(unvested()), "Posted spread")).toBe(
      "0.1369% (required)"
    );
  });
});

describe("the footer", () => {
  it("promises nothing, and says who the ceiling came from", () => {
    expect(pinned(mixed()).footer).toBe(
      "An off-chain solver decides whether to fill this request. The ceiling " +
        "above is computed from your on-chain history by this widget; the fill " +
        "is not this widget's to promise."
    );
  });
});

describe("what the pin stands behind", () => {
  it("posts the required spread when the entitlement requires it", () => {
    // The one criterion the ticket turns on: an unvested holder's ON-WIRE
    // discount is the entitlement's, not the control's.
    expect(pinned(unvested()).post).toEqual({
      offerShares: 10_000n * SHARE,
      discountPpm: 1_369n,
    });
  });

  it("posts the holder's own spread, unchanged, when nothing more is required", () => {
    // A vested holder's post is byte-identical to stage 1's: 0.1% in, 0.1% out.
    expect(pinned(mixed()).post).toEqual({
      offerShares: 10_000n * SHARE,
      discountPpm: 1_000n,
    });
  });

  it("hands the re-check exactly what it compares against", () => {
    expect(pinned(mixed()).pinned).toEqual({
      rateUpdatedAt: NOW - 1_800,
      offerShares: 10_000n * SHARE,
    });
  });

  it("prices over the shares that would post, not the balance behind them", () => {
    // 6,000 spends the vested lot alone, so the ceiling is the share price.
    const pin = pinned(mixed({ offerShares: 6_000n * SHARE }));
    expect(rowValue(pin, "Your ceiling (pinned)")).toBe("1.001000 USDT/share");
    expect(pin.post.offerShares).toBe(6_000n * SHARE);
  });
});

// Fail SAFE. The verbatim wordings for these three are the "when the widget
// cannot price" ticket's; what is fixed here is the BEHAVIOUR — a named cause,
// no Confirm, no figure that was not pinned, and nothing posted.
describe("when the figures cannot be pinned", () => {
  const cannot = (input: PinInputs) => {
    const pin = buildConfirmPin(input);
    if (pin.kind !== "cannot-pin") throw new Error("expected a refusal");
    return pin;
  };

  it("names the pause when the guarded rate read reverts", () => {
    const pin = cannot(mixed({ reads: { kind: "paused" } }));
    expect(pin.cause).toBe("paused");
    expect(pin.headline).toBe("The share price is under review.");
    expect(pin.body).toContain("Nothing has been posted.");
  });

  it("names the failed read when the tail or the batch does not land", () => {
    const pin = cannot(
      mixed({ reads: { kind: "unread", detail: "chunk 41 timed out" } })
    );
    expect(pin.cause).toBe("unread");
    expect(pin.body).toContain("chunk 41 timed out");
    expect(pin.body).toContain("Nothing has been posted.");
  });

  it("names the short balance, in the figures it pinned", () => {
    const pin = cannot(mixed({ offerShares: 10_001n * SHARE }));
    expect(pin.cause).toBe("balance-short");
    expect(pin.body).toContain("10,000 CCUSD30");
    expect(pin.body).toContain("10,001 CCUSD30");
    expect(pin.body).toContain("Nothing has been posted.");
  });

  it("refuses an amount the contract's maximum spread cannot carry", () => {
    // Five days into a 30-day lot at a share price 1.5% above what was paid:
    // the required spread is past the 1% maximum, so there is nothing postable
    // to confirm — even though the card let the modal open.
    const pin = cannot(
      inputs([deposit(ago(5), 10_000, 1_000_000n)], 1_015_000n, 10_000n * SHARE)
    );
    expect(pin.cause).toBe("unfillable");
    expect(pin.body).toContain("1.4779%");
    expect(pin.body).toContain("Nothing has been posted.");
  });

  it("never carries a post", () => {
    for (const pin of [
      cannot(mixed({ reads: { kind: "paused" } })),
      cannot(mixed({ reads: { kind: "unread", detail: "x" } })),
      cannot(mixed({ offerShares: 10_001n * SHARE })),
    ]) {
      expect("post" in pin).toBe(false);
    }
  });
});

// What a re-check that refused to post says while the new figures are pinned
// again. Only the rate wording is the spec's; the other two land with the
// "when the widget cannot price" ticket.
describe("the re-pin notice", () => {
  it("says the share price changed, when a rate tick is what refused the post", () => {
    // The two pure seams composed the way the confirm step composes them: the
    // predicate decides, and its cause picks the sentence. A tick between pin
    // and Confirm is a certain skip for an unvested lot, so it re-pins.
    const pin = pinned(unvested());
    const verdict = recheckBeforePost(pin.pinned, {
      rateUpdatedAt: pin.pinned.rateUpdatedAt + 3_600,
      paused: false,
      shareBalance: 10_000n * SHARE,
    });
    expect(verdict).toEqual({ verdict: "re-pin", cause: "rate-moved" });
    if (verdict.verdict !== "re-pin") throw new Error("unreachable");
    expect(rePinNotice(verdict.cause)).toBe(
      "The share price changed while you were confirming — here are the new figures."
    );
  });

  it("says nothing was posted, whichever of the three refused it", () => {
    expect(rePinNotice("paused")).toContain("Nothing has been posted.");
    expect(rePinNotice("balance-short")).toContain("Nothing has been posted.");
    expect(RECHECK_UNREAD_NOTICE).toContain("Nothing has been posted.");
  });

  it("posts when nothing moved", () => {
    const pin = pinned(unvested());
    expect(
      recheckBeforePost(pin.pinned, {
        rateUpdatedAt: pin.pinned.rateUpdatedAt,
        paused: false,
        shareBalance: 10_000n * SHARE,
      })
    ).toEqual({ verdict: "post" });
  });
});

// What the pin's reads MEAN, decided here rather than in the hook that made
// them: a reverting guarded read is the accountant saying it is paused, and a
// read that simply did not come back is not the same thing at all.
describe("reading the pin's batch", () => {
  const batch = (over: Partial<PinBatch> = {}): PinBatch => ({
    blockNumber: BLOCK,
    now: NOW,
    navPerShare: 1_001_000n,
    shareBalance: 10_000n * SHARE,
    rateUpdatedAt: NOW - 1_800,
    paused: false,
    history: [deposit(ago(45), 6_000, 1_000_000n)],
    detail: null,
    ...over,
  });

  it("reads a reverting rate as the pause it is", () => {
    expect(pinReadsOf(batch({ navPerShare: null }))).toEqual({ kind: "paused" });
  });

  it("reads the accountant's own flag as the same pause", () => {
    // The flag and the revert disagree for a moment either side of an
    // auto-pause, and either one alone means nothing is being priced.
    expect(pinReadsOf(batch({ paused: true }))).toEqual({ kind: "paused" });
  });

  it("reads a missing figure as unread, in the chain's own words", () => {
    expect(
      pinReadsOf(batch({ shareBalance: null, detail: "execution reverted" }))
    ).toEqual({ kind: "unread", detail: "execution reverted" });
    expect(pinReadsOf(batch({ history: null }))).toEqual({
      kind: "unread",
      detail: UNREAD.incomplete,
    });
  });

  it("passes a complete read through untouched", () => {
    const read = pinReadsOf(batch());
    expect(read.kind).toBe("read");
    if (read.kind !== "read") throw new Error("unreachable");
    expect(read.blockNumber).toBe(BLOCK);
    expect(read.now).toBe(NOW);
    expect(read.rateUpdatedAt).toBe(NOW - 1_800);
  });
});
