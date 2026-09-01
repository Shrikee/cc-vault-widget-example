// What may be priced from a wallet's history, and why not — src/lib/pricedHistory.ts.
//
// The rule this pins is the spec's, kept whole: nothing is priced from a
// history the widget does not have, or from a ledger floor it cannot establish
// is sound — and neither ever blocks a post. So every refusal here comes back
// with a REASON a surface can quote, and the states that are merely still
// reading come back with none: "couldn't read your history" said over a scan
// that is still running is a sentence that is not true yet.
import { describe, expect, it } from "vitest";

import type { HolderEvent } from "../entitlement/entitlement";
import { pricedHistory } from "./pricedHistory";

const SHARE = 10n ** 18n;
const NOW = 1_788_264_000;

const history: HolderEvent[] = [
  { kind: "deposit", t: NOW - 15 * 86_400, shares: 1_000n * SHARE, assets: 1_000_000_000n },
];

const SOUND = { status: "sound" } as const;
const CHECKING = { status: "checking" } as const;
const UNSOUND = {
  status: "unsound",
  reason: { kind: "floor-too-young", floorBlock: 92_416_354n, ageSeconds: 15 * 86_400 },
} as const;

const read = { history, error: null };

describe("a history in hand", () => {
  it("is priced from, with nothing to disclose", () => {
    expect(pricedHistory(SOUND, read)).toEqual({ history, unreadable: null });
  });
});

describe("still reading", () => {
  it("prices nothing and says nothing while the scan is in flight", () => {
    // A surface owes no wording here: nothing has failed, and the generic
    // vesting disclosure is what stands in until the figures land.
    expect(pricedHistory(SOUND, { history: undefined, error: null })).toEqual({
      history: null,
      unreadable: null,
    });
  });

  it("prices nothing while the floor check has not answered", () => {
    // Even with a scanned history in hand: nothing is priced from a floor the
    // widget has not yet established is sound.
    expect(pricedHistory(CHECKING, read)).toEqual({
      history: null,
      unreadable: null,
    });
  });
});

describe("a scan that failed", () => {
  it("hands back the chain's own words as the reason", () => {
    expect(
      pricedHistory(SOUND, { history: undefined, error: "chunk 41 timed out" })
    ).toEqual({
      history: null,
      unreadable: { kind: "read-failed", detail: "chunk 41 timed out" },
    });
  });

  it("prices nothing even from whatever the failed scan left behind", () => {
    // A partial history is the over-quote the solver skips: a transfer left
    // undated prices an unvested lot at the full share price.
    expect(pricedHistory(SOUND, { history, error: "chunk 41 timed out" })).toEqual({
      history: null,
      unreadable: { kind: "read-failed", detail: "chunk 41 timed out" },
    });
  });
});

describe("an unsound ledger floor", () => {
  it("prices nothing, and blames the configuration rather than the read", () => {
    expect(pricedHistory(UNSOUND, read)).toEqual({
      history: null,
      unreadable: UNSOUND.reason,
    });
  });

  it("outranks a failed scan — a history read from an unsound floor is not one worth quoting", () => {
    expect(
      pricedHistory(UNSOUND, { history: undefined, error: "chunk 41 timed out" })
        .unreadable
    ).toEqual(UNSOUND.reason);
  });
});
