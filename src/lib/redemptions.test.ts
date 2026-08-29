// What a queue read means, and which queue reads reach the card —
// src/lib/redemptions.ts.
//
// Both AtomicQueues are polled now, one hook instance per product, so the two
// decisions this file pins are the two the second queue makes dangerous:
// whether a request that is no longer there was FILLED, and which of the two
// queues' requests the side-rail card lists.
//
// The fill question is the sharp one. A fill is announced from an absence — the
// struct going to zero — and an absence has more than one cause once there are
// two queues to read: the other product's poll resolving first, a wallet
// changing, a product being switched. Every vector below is a way of being
// absent that is NOT a fill.
import { describe, expect, it } from "vitest";

import {
  isFillTransition,
  openRedemptions,
  type QueueSnapshot,
} from "./redemptions";

const NOW = 1_800_000_000;
// The two wallets the other vectors in this repository are anchored to; here
// they are only two distinct owners, and nothing is claimed about what either
// holds.
const WALLET = "0x463639c13d578dd17e8164d83ab7fc6135d130f9";
const OTHER_WALLET = "0xb4b0a5b761133860a39d2e89d59a8c6f6769cbe0";

// An open request in the 24h queue, well inside its deadline.
const OPEN: QueueSnapshot = {
  vaultId: "coinchange-24h-polygon",
  owner: WALLET,
  offerAmount: 1_050_000_000_000_000_000n, // 1.05 CCUSD
  deadline: NOW + 3 * 86_400,
  inSolve: false,
};
// The same read after the solver took it: the struct is zeroed.
const zeroed = (from: QueueSnapshot): QueueSnapshot => ({
  ...from,
  offerAmount: 0n,
  deadline: 0,
  inSolve: false,
});

describe("a solver fill", () => {
  it("is an open request in a queue going to zero within its deadline", () => {
    expect(isFillTransition(OPEN, zeroed(OPEN), NOW)).toBe(true);
  });

  it("is announced for a request the solver had already taken, past its deadline", () => {
    // inSolve means the solver held it when we last looked; the fill lands
    // after that, and may land after the deadline we last read.
    const solving = { ...OPEN, inSolve: true, deadline: NOW - 600 };
    expect(isFillTransition(solving, zeroed(solving), NOW)).toBe(true);
  });

  it("survives the poll interval: a fill just inside a deadline we saw just after", () => {
    const expiring = { ...OPEN, deadline: NOW - 30 };
    expect(isFillTransition(expiring, zeroed(expiring), NOW)).toBe(true);
  });
});

describe("an absence that is not a fill", () => {
  it("is a request that lapsed and was cleared long after its deadline", () => {
    // Only a fill zeroes the struct inside the deadline; a zero long after it
    // is an admin cleanup, and congratulating the depositor on it would be a
    // lie about money.
    const lapsed = { ...OPEN, deadline: NOW - 4 * 86_400 };
    expect(isFillTransition(lapsed, zeroed(lapsed), NOW)).toBe(false);
  });

  it("is the OTHER product's queue answering", () => {
    // The trap two queues make easy: a 30d read of zero is not the 24h
    // request the widget last saw disappearing. A remembered request answers
    // for the queue it was read from, or for nothing.
    const otherQueue = zeroed({ ...OPEN, vaultId: "coinchange-30d-polygon" });
    expect(isFillTransition(OPEN, otherQueue, NOW)).toBe(false);
  });

  it("is another wallet's read landing after a wallet switch", () => {
    expect(isFillTransition(OPEN, zeroed({ ...OPEN, owner: OTHER_WALLET }), NOW)).toBe(
      false
    );
  });

  it("is the first read of a queue that has nothing open in it", () => {
    expect(isFillTransition(null, zeroed(OPEN), NOW)).toBe(false);
  });

  it("is a queue that was already empty staying empty", () => {
    const empty = zeroed(OPEN);
    expect(isFillTransition(empty, empty, NOW)).toBe(false);
  });

  it("is a request being replaced rather than emptied", () => {
    // A new request overwrites the struct in place: still non-zero, no fill.
    const replaced = { ...OPEN, offerAmount: 2_000_000_000_000_000_000n };
    expect(isFillTransition(OPEN, replaced, NOW)).toBe(false);
  });
});

describe("the requests the card lists", () => {
  const product = (id: string, request: { shares: number } | null) => ({
    vault: { id },
    request,
  });

  it("lists a request from each queue, in the roster's order", () => {
    const listed = openRedemptions([
      product("coinchange-24h-polygon", { shares: 1.05 }),
      product("coinchange-30d-polygon", { shares: 0.05 }),
    ]);
    expect(listed.map((r) => r.vault.id)).toEqual([
      "coinchange-24h-polygon",
      "coinchange-30d-polygon",
    ]);
  });

  it("lists the unselected product's request as readily as the selected one's", () => {
    // Nothing about a selection reaches here — which is the point of the card.
    const listed = openRedemptions([
      product("coinchange-24h-polygon", null),
      product("coinchange-30d-polygon", { shares: 0.05 }),
    ]);
    expect(listed.map((r) => r.vault.id)).toEqual(["coinchange-30d-polygon"]);
    // And the request is known to be there, so the row needs no null check.
    expect(listed[0].request.shares).toBe(0.05);
  });

  it("lists nothing when neither queue holds a request", () => {
    expect(
      openRedemptions([
        product("coinchange-24h-polygon", null),
        product("coinchange-30d-polygon", null),
      ])
    ).toEqual([]);
  });
});
