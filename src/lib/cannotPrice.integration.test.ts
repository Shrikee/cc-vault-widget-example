// The degraded path, composed — a broken chain to the sentences a depositor
// reads (spec §"When the widget cannot price").
//
// The one file in src/lib with no module of its own, and named for it: these
// are INTEGRATION vectors over modules that each have their own beside them.
//
// Every module in this path has vectors of its own: the floor check against a
// forged chain (./ledgerFloorCheck.test.ts), the two absences held apart
// (./pricedHistory.test.ts), and each surface's copy (./withdrawQuote.test.ts,
// ./positionExit.test.ts, ./requestRow.test.ts). What none of them can show is
// that the pieces JOIN UP: that a failing endpoint really does arrive at the
// quote card as the wording with the Try again under it, that the position card
// and the request row degrade in the same breath, and — the one that matters
// most — that none of it closes the post.
//
// So these vectors are the acceptance criterion itself, mechanically: with the
// RPC broken, nothing is priced, the three surfaces say the spec's words, and a
// request can still go out at the holder's own spread. This repo has no
// component tests by policy (spec, "Not covered by tests") and needs none here
// — every sentence below is a model's, and the components render models.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ROSTER } from "../config/vaults";
import type { HolderEvent } from "../entitlement/entitlement";
import { buildConfirmPin, pinReadsOf } from "./confirmPin";
import { readLedgerFloor } from "./ledgerFloorCheck";
import { buildPositionExitLine } from "./positionExit";
import { pricedHistory } from "./pricedHistory";
import { buildRequestRow } from "./requestRow";
import { vaultById } from "./vaultRegistry";
import { buildWithdrawQuote } from "./withdrawQuote";

const SHARE = 10n ** 18n;
const DAY = 86_400;
const NOW = 1_788_264_000; // 2026-09-01T12:00:00Z
const VAULT = vaultById(ROSTER, "coinchange-30d-polygon");
const FLOOR = BigInt(VAULT.eventsFromBlock);

// A holder with a real balance and a real history — so that nothing below is
// silent merely because there was nothing to say. 10,000 shares, half of them
// still vesting: exactly the holder the priced surfaces exist for.
const HISTORY: HolderEvent[] = [
  { kind: "deposit", t: NOW - 45 * DAY, shares: 6_000n * SHARE, assets: 6_000_000_000n },
  { kind: "deposit", t: NOW - 10 * DAY, shares: 4_000n * SHARE, assets: 4_000_000_000n },
];
const BALANCE = 10_000n * SHARE;
const NAV = 1_001_000n;

// An endpoint that refuses everything, which is what "the RPC is broken" means
// to the two reads the floor check makes.
const deadChain = {
  getBlock: async () => {
    throw new Error("HTTP request failed");
  },
  readContract: async () => {
    throw new Error("HTTP request failed");
  },
} as unknown as Parameters<typeof readLedgerFloor>[0];

// A chain that answers, over a floor with shares already minted below it: the
// registry is wrong rather than the endpoint.
const youngFloorChain = {
  getBlock: async () => ({ timestamp: BigInt(NOW - 15 * DAY) }),
  readContract: async () => 1n,
} as unknown as Parameters<typeof readLedgerFloor>[0];

// The panel's model over the whole balance, given what the floor check said.
const quoteFrom = (priced: ReturnType<typeof pricedHistory>) =>
  buildWithdrawQuote({
    history: priced.history,
    unreadable: priced.unreadable,
    shareBalance: BALANCE,
    navPerShare: NAV,
    now: NOW,
    unlockAt: NOW - DAY,
    paused: false,
    vestingSeconds: VAULT.vestingSeconds,
    shareLockSeconds: VAULT.ui.shareLockPeriod,
    shareDecimals: VAULT.ui.decimals,
    amount: "10000",
    holderSpreadPpm: 1_000n,
    holderSpreadIsDefault: true,
    shareSymbol: VAULT.ui.symbol,
    wantSymbol: "USDT",
  });

describe("with the RPC broken", () => {
  // reportError puts the endpoint's own words on the console (ADR-0004) —
  // asserted in ./ledgerFloorCheck.test.ts, silenced here so the vectors'
  // output stays the assertions'.
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("prices nothing anywhere, and says so in the spec's words", async () => {
    // 1. The floor check cannot establish the invariant.
    const floor = await readLedgerFloor(deadChain, VAULT, NOW);
    expect(floor).toEqual({
      status: "unsound",
      reason: { kind: "read-failed", detail: "the network request failed" },
    });

    // 2. So nothing may be priced from this wallet's history — even the one the
    //    scan would have handed over, had it run.
    const priced = pricedHistory(floor, { history: HISTORY, error: null });
    expect(priced.history).toBeNull();

    // 3. The quote card names the reason and offers the re-scan.
    const quote = quoteFrom(priced);
    expect(quote.card).toEqual({
      kind: "unreadable",
      headline:
        "Couldn't read your history from the chain — the network request failed.",
      body:
        "Nothing is priced. A request posts at your redemption spread and, on " +
        "this product, may be passed over if your shares haven't finished " +
        "vesting.",
      retryLabel: "Try again",
    });
    expect(quote.receive).toBe("—");
    expect(quote.spread).toBe("0.10% (default)");

    // 4. The position card's sub-line.
    expect(
      buildPositionExitLine({
        history: priced.history,
        unreadable: priced.unreadable,
        paused: false,
        shareBalance: BALANCE,
        navPerShare: NAV,
        now: NOW,
        unlockAt: NOW - DAY,
        vestingSeconds: VAULT.vestingSeconds,
        shareDecimals: VAULT.ui.decimals,
        defaultSpreadPpm: 1_000n,
        shareSymbol: VAULT.ui.symbol,
        wantSymbol: "USDT",
      })
    ).toBe("Redeemable today — couldn't read your history.");

    // 5. The request row keeps stage 1's — its note and its deadline, no strip
    //    and no re-post offer.
    expect(
      buildRequestRow({
        vestingGap: true,
        status: "open",
        offerShares: 1_000n * SHARE,
        ask: 1_001_000n,
        deadline: NOW + 5 * DAY,
        history: priced.history,
        shareBalance: BALANCE,
        navPerShare: NAV,
        paused: false,
        now: NOW,
        vestingSeconds: VAULT.vestingSeconds,
        shareDecimals: VAULT.ui.decimals,
        defaultSpreadPpm: 1_000n,
        wantSymbol: "USDT",
      })
    ).toEqual({ kind: "unpriced" });
  });

  it("still lets a request go out, at the holder's own spread", async () => {
    // THE GOVERNING RULE. The widget never posts what it can establish the
    // solver will skip — and it has established nothing here, so it may post
    // what it cannot establish, disclosed. `refused` is the panel's only gate
    // on the submit button that this path could have touched, and it stays
    // false; the disclosure is the card above.
    const floor = await readLedgerFloor(deadChain, VAULT, NOW);
    const quote = quoteFrom(pricedHistory(floor, { history: HISTORY, error: null }));

    expect(quote.refused).toBe(false);
    // Nothing to PIN — the pinned confirm prices from reads this path does not
    // have — so the post goes out through stage 1's modal at the spread the
    // control holds, which is the spread the rows just named.
    expect(quote.post).toBeNull();
    expect(quote.spread).toBe("0.10% (default)");
    expect(quote.spreadIsRequired).toBe(false);
  });

  it("owes no generic vesting notice — the card is the disclosure", async () => {
    const floor = await readLedgerFloor(deadChain, VAULT, NOW);
    const quote = quoteFrom(pricedHistory(floor, { history: HISTORY, error: null }));
    expect(quote.cannotPrice).toBe(true);
    expect(quote.discloseVesting).toBe(false);
  });
});

describe("with the accountant paused", () => {
  it("says so on the card, the sub-line and the row, in one breath", () => {
    // One flag, three surfaces. They are three modules and they must not
    // disagree: a depositor sees the panel, the position card and the side rail
    // at once.
    const quote = buildWithdrawQuote({
      history: HISTORY,
      unreadable: null,
      shareBalance: BALANCE,
      navPerShare: NAV,
      now: NOW,
      unlockAt: NOW - DAY,
      paused: true,
      vestingSeconds: VAULT.vestingSeconds,
      shareLockSeconds: VAULT.ui.shareLockPeriod,
      shareDecimals: VAULT.ui.decimals,
      amount: "10000",
      holderSpreadPpm: 1_000n,
      holderSpreadIsDefault: true,
      shareSymbol: VAULT.ui.symbol,
      wantSymbol: "USDT",
    });
    expect(quote.card).toEqual({
      kind: "paused",
      headline: "Redemptions are paused.",
      body:
        "The share price is under review by the operator, so nothing is priced " +
        "and no request can be posted until it resumes.",
    });
    // The rows the spec names beside it.
    expect(quote.receive).toBe("—");
    expect(quote.spread).toBe("0.10% (default)");

    expect(
      buildPositionExitLine({
        history: HISTORY,
        unreadable: null,
        paused: true,
        shareBalance: BALANCE,
        navPerShare: NAV,
        now: NOW,
        unlockAt: NOW - DAY,
        vestingSeconds: VAULT.vestingSeconds,
        shareDecimals: VAULT.ui.decimals,
        defaultSpreadPpm: 1_000n,
        shareSymbol: VAULT.ui.symbol,
        wantSymbol: "USDT",
      })
    ).toBe("Redeemable today — not while the share price is under review.");

    // Badge and deadline only: the row model carries neither strip nor note.
    expect(
      buildRequestRow({
        vestingGap: true,
        status: "open",
        offerShares: 1_000n * SHARE,
        ask: 1_001_000n,
        deadline: NOW + 5 * DAY,
        history: HISTORY,
        shareBalance: BALANCE,
        navPerShare: NAV,
        paused: true,
        now: NOW,
        vestingSeconds: VAULT.vestingSeconds,
        shareDecimals: VAULT.ui.decimals,
        defaultSpreadPpm: 1_000n,
        wantSymbol: "USDT",
      })
    ).toEqual({ kind: "paused" });
  });

  it("turns the pin's reverting rate read into the paused tile", () => {
    // The guarded `getRateInQuoteSafe` reverts while the accountant is paused,
    // so the hook hands the batch a null rate — a revert is an ANSWER, and the
    // two seams compose into the spec's tile without the hook deciding anything.
    const reads = pinReadsOf({
      blockNumber: 93_051_200n,
      now: NOW,
      navPerShare: null,
      shareBalance: BALANCE,
      rateUpdatedAt: NOW - 1_800,
      paused: false,
      history: HISTORY,
      detail: null,
    });
    expect(reads).toEqual({ kind: "paused" });

    const pin = buildConfirmPin({
      reads,
      offerShares: BALANCE,
      holderSpreadPpm: 1_000n,
      vestingSeconds: VAULT.vestingSeconds,
      shareDecimals: VAULT.ui.decimals,
      shareSymbol: VAULT.ui.symbol,
      wantSymbol: "USDT",
    });
    if (pin.kind !== "cannot-pin") throw new Error("expected a refusal");
    expect(`${pin.headline} ${pin.body}`).toBe(
      "Couldn't pin the figures — the share price is under review (the " +
        "accountant is paused). Nothing was posted."
    );
    // Nothing pinned is nothing to confirm: the panel replaces Confirm with
    // Close on exactly this shape, and there is no post on it to sign.
    expect("post" in pin).toBe(false);
  });
});

describe("with a ledger floor too young for the term", () => {
  it("blames the widget's configuration, and still does not block the post", async () => {
    const floor = await readLedgerFloor(youngFloorChain, VAULT, NOW);
    const priced = pricedHistory(floor, { history: HISTORY, error: null });
    const quote = quoteFrom(priced);

    if (quote.card.kind !== "unreadable")
      throw new Error("expected the unreadable card");
    expect(quote.card.headline).toBe(
      `Couldn't price from your history — the vault registry's ledger floor ` +
        `(block ${FLOOR.toLocaleString("en-US")}, 15 days old) is too young ` +
        `for a 30-day term. The widget's configuration needs updating.`
    );
    // Nothing priced from an unsound floor…
    expect(priced.history).toBeNull();
    expect(quote.receive).toBe("—");
    // …and posting never blocked by it.
    expect(quote.refused).toBe(false);
  });
});
