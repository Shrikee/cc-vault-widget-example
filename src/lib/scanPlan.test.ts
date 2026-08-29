// Scan-planning vectors (spec, "RPC budget") — src/lib/scanPlan.ts.
//
// What these pin is a cost, and the ticket that raised them states it as one:
// serving two products must not double the widget's dependence on the archive
// endpoint that ADR-0001 already names as its hard requirement. So the
// assertions below are mostly about how many blocks — and how many eth_getLogs
// chunks — a plan asks for, and about the one thing that must not change while
// they shrink: which events remain reachable.
//
// The head is the spec's own verification head, 92,835,789, and both products
// are the real registry entries, so every figure here can be recomputed by hand
// from the verification table.
import { describe, expect, it } from "vitest";

import { ROSTER } from "../config/vaults";
import { HEADLINE_WINDOW } from "../config/history";
import { chunkRanges } from "./logScan";
import { vaultById } from "./vaultRegistry";
import {
  FULL_WINDOW_DAYS,
  depositScanRange,
  planDepositScan,
  planSharePriceScan,
  scanWindowDays,
  widenCovered,
  type BlockRange,
} from "./scanPlan";

const HEAD = 92_835_789n;

const VAULT_24H = vaultById(ROSTER, "coinchange-24h-polygon");
const VAULT_30D = vaultById(ROSTER, "coinchange-30d-polygon");

// The provider caps a ranged eth_getLogs at 10,000 blocks, so a range costs
// requests, not blocks — and what this ticket is about is the requests. Counted
// with the scanner's own chunker, so the figures below cannot drift from what
// the widget would actually ask for.
function chunks(range: BlockRange | null): number {
  return range === null ? 0 : chunkRanges(range.from, range.to).length;
}

const span = (range: BlockRange | null) =>
  range === null ? 0n : range.to - range.from + 1n;

const planShares = (
  vault = VAULT_24H,
  windowDays = FULL_WINDOW_DAYS,
  covered: BlockRange | null = null,
  head = HEAD
) => planSharePriceScan({ vault, windowDays, head, covered });

// A synthetic entry standing for a product deployed a given distance back —
// both the young case, where the clamp and the headline window collide, and the
// old one both real products will grow into.
const deployedAgo = (blocksAgo: bigint) => ({
  ...VAULT_30D,
  ui: {
    ...VAULT_30D.ui,
    deployBlocks: {
      ...VAULT_30D.ui.deployBlocks,
      accountant: Number(HEAD - blocksAgo),
    },
  },
});

// A flat 30-day span regardless of a vault's age is what shipped before this
// planner, and with two products — one of them a week old — that waste doubled.
describe("clamping a scan to its own vault's deploy block", () => {
  it("starts at the accountant's deployment when the window reaches past it", () => {
    // Both products are younger than the 30-day window today, so both clamp.
    expect(planShares(VAULT_24H)?.from).toBe(91_901_948n);
    expect(planShares(VAULT_30D)?.from).toBe(92_415_698n);
    // Each to its OWN accountant: the products deployed five months apart, and
    // one plan is not the other's.
    expect(planShares(VAULT_24H)?.from).not.toBe(planShares(VAULT_30D)?.from);
  });

  it("changes no figure, because it drops only blocks the accountant predates", () => {
    // The whole claim behind the clamp: every block in which this accountant
    // could have posted a share-price update is still scanned. What the flat
    // span added was 794,159 blocks before the contract existed, which return
    // no logs however often they are asked for.
    const plan = planShares(VAULT_24H);
    expect(plan?.from).toBe(BigInt(VAULT_24H.ui.deployBlocks.accountant));
    expect(plan?.to).toBe(HEAD);
  });

  it("costs 94 chunks on the 24h product instead of 173", () => {
    // 173 is the flat span: 1,728,000 blocks ÷ 10,001 per request. The
    // measurement in the ticket that raised this — 173 requests to each
    // accountant — is that number, twice.
    const flat = 1_728_000n;
    expect(chunks({ from: HEAD - flat, to: HEAD })).toBe(173);
    expect(chunks(planShares(VAULT_24H))).toBe(94);
    expect(chunks(planShares(VAULT_30D))).toBe(43);
  });

  it("leaves an old enough vault's window alone", () => {
    // Nothing to clamp once the product is older than the window: the plan is
    // the window, and the vectors above must not read as "always the deploy
    // block".
    const old = planShares(deployedAgo(2_000_000n));
    expect(old?.from).toBe(HEAD - BigInt(FULL_WINDOW_DAYS) * 57_600n);
    expect(span(old)).toBe(1_728_001n);
  });
});

// Only the selected product needs the full trailing-window set. The other one
// contributes a single number to the page — its headline APY on a chip — so it
// scans that window and no more.
describe("windowing an unselected product to its headline APY", () => {
  it("plans the full window for the selected product and 7 days for the other", () => {
    expect(scanWindowDays(true)).toBe(FULL_WINDOW_DAYS);
    expect(scanWindowDays(false)).toBe(HEADLINE_WINDOW);
    // The headline APY is the 7-day realised trailing APY, so 7 days of
    // history is exactly what the chip's figure is computed from.
    expect(HEADLINE_WINDOW).toBe(7);
  });

  it("scans a week rather than a month, at under half the requests", () => {
    const unselected = planShares(VAULT_24H, scanWindowDays(false));
    expect(unselected?.from).toBe(HEAD - 403_200n); // 57,600 blocks/day × 7
    expect(chunks(unselected)).toBe(41);
    expect(chunks(planShares(VAULT_24H, scanWindowDays(true)))).toBe(94);
  });

  it("still clamps: a young product's week is shorter than a week", () => {
    // The unselected window is a ceiling, not a floor. A product deployed two
    // days ago has two days of history and the plan says so.
    const twoDays = deployedAgo(115_200n);
    expect(planShares(twoDays, scanWindowDays(false))?.from).toBe(
      BigInt(twoDays.ui.deployBlocks.accountant)
    );
  });
});

// Switching products must not pay for the week already held a second time.
describe("switching to a product scanned only for its headline APY", () => {
  const held = planShares(VAULT_30D, scanWindowDays(false))!;

  it("plans only the blocks the held history does not reach", () => {
    const widening = planShares(VAULT_30D, scanWindowDays(true), held);
    // The full window clamps to this product's deployment; the week already
    // held starts 403,200 blocks back. What is missing is what lies between.
    expect(widening).toEqual({ from: 92_415_698n, to: held.from - 1n });
    expect(chunks(widening)).toBe(2);
  });

  it("abuts the held history exactly — no gap, and nothing scanned twice", () => {
    const widening = planShares(VAULT_30D, scanWindowDays(true), held)!;
    expect(widening.to + 1n).toBe(held.from); // no block falls between them
    expect(widening.to).toBeLessThan(held.from); // and none is asked for twice
    // Together they are the full plan, so the widened history answers for the
    // 30-day window exactly as a cold full scan would have.
    expect(span(widening) + span(held)).toBe(span(planShares(VAULT_30D, scanWindowDays(true))));
  });

  it("plans nothing when the history already covers the window", () => {
    const full = planShares(VAULT_30D, scanWindowDays(true))!;
    // Switching away and back: the 30-day history covers the 7-day window and
    // covers itself.
    expect(planShares(VAULT_30D, scanWindowDays(false), full)).toBeNull();
    expect(planShares(VAULT_30D, scanWindowDays(true), full)).toBeNull();
  });

  it("plans nothing more for a product younger than the headline window", () => {
    // Both windows clamp to the same deploy block, so the unselected scan
    // already read everything there is. Selecting it costs no request at all.
    const young = deployedAgo(200_000n);
    const week = planShares(young, scanWindowDays(false))!;
    expect(week.from).toBe(BigInt(young.ui.deployBlocks.accountant));
    expect(planShares(young, scanWindowDays(true), week)).toBeNull();
  });

  it("never re-reads the live end, however far the head has moved", () => {
    // The share-price scan is a history: its live end is the 45 s share-price
    // poll's job, not a rescan's (src/hooks/useShareHistory.ts). Widening only
    // ever reaches further back, so a head 50,000 blocks later than the one the
    // held history was scanned at plans nothing new at the top.
    const later = HEAD + 50_000n;
    const full = planShares(VAULT_30D, scanWindowDays(true))!;
    expect(planShares(VAULT_30D, scanWindowDays(true), full, later)).toBeNull();

    const held = planShares(VAULT_30D, scanWindowDays(false))!;
    expect(planShares(VAULT_30D, scanWindowDays(true), held, later)?.to).toBe(
      held.from - 1n
    );
  });
});

// What the caller has to hold between a scan and the next one: one range, so
// the next widening is planned against a single number.
describe("what a scan leaves covered", () => {
  it("joins the widening to the history it widened", () => {
    const held = planShares(VAULT_30D, scanWindowDays(false))!;
    const widening = planShares(VAULT_30D, scanWindowDays(true), held)!;
    const after = widenCovered(held, widening);
    // One range, from the earlier scan's start to the later one's end — the
    // same range a cold full scan would have covered in one go.
    expect(after).toEqual(planShares(VAULT_30D, scanWindowDays(true)));
    // And planning against it asks for nothing further, which is what makes a
    // switch back free.
    expect(planShares(VAULT_30D, scanWindowDays(true), after)).toBeNull();
  });

  it("covers nothing when nothing was held and nothing was read", () => {
    expect(widenCovered(null, null)).toBeNull();
    const held = planShares(VAULT_30D, scanWindowDays(false))!;
    expect(widenCovered(held, null)).toEqual(held);
    expect(widenCovered(null, held)).toEqual(held);
  });
});

// A product a wallet holds none of has no earnings to compute, so its deposit
// history is never read. The share balance is already on screen — the position
// card renders it for both products — so this costs nothing to decide.
describe("planning a wallet's deposit scan", () => {
  it("scans for a wallet that holds shares", () => {
    expect(planDepositScan({ shares: 1.05, unlockAt: 1_787_000_000 })).toBe("scan");
  });

  it("skips a product the wallet holds none of", () => {
    // It deposited once — the share-unlock time says so — and has since exited
    // the whole position. Its earnings are $0.00 against any average deposit
    // cost, so the 94 chunks that would reconstruct that cost buy nothing.
    expect(planDepositScan({ shares: 0, unlockAt: 1_787_000_000 })).toBe("no-shares");
  });

  it("skips a wallet that never deposited", () => {
    // The rule that already shipped, kept apart from the one above: these two
    // say different things under the position value, and a wallet that never
    // deposited must not be told it exited.
    expect(planDepositScan({ shares: 0, unlockAt: 0 })).toBe("never-deposited");
  });

  it("waits while the position read is outstanding", () => {
    // Not "no shares": the Lens read has not landed, or landed for the wallet
    // that was connected a moment ago. Scanning on a null would read the wrong
    // wallet's history; skipping on one would report no earnings for a
    // depositor who has them.
    expect(planDepositScan({ shares: null, unlockAt: null })).toBe("unresolved");
    expect(planDepositScan({ shares: null, unlockAt: 1_787_000_000 })).toBe("unresolved");
    expect(planDepositScan({ shares: 1.05, unlockAt: null })).toBe("unresolved");
  });
});

// The ledger floor, not the teller's deployment: the block the solver's holder
// ledger is built from, below which no event of this vault's counts. Verified
// on chain — the share totalSupply at floor − 1 is zero on both products, so no
// deposit predates the floor.
describe("where a deposit scan starts", () => {
  it("starts at this product's ledger floor", () => {
    expect(depositScanRange({ vault: VAULT_24H, resumeFrom: null, head: HEAD })).toEqual({
      from: 91_901_943n,
      to: HEAD,
    });
    expect(depositScanRange({ vault: VAULT_30D, resumeFrom: null, head: HEAD })).toEqual({
      from: 92_416_354n,
      to: HEAD,
    });
  });

  it("is the registry's eventsFromBlock, either side of the teller's block", () => {
    // The floor is 7 blocks BELOW the 24h teller's deployment and 654 blocks
    // ABOVE the 30d teller's, so a scan pinned to the teller is neither
    // reliably cheaper nor reliably safer — it is simply a different number
    // from the one the solver's ledger uses.
    for (const vault of ROSTER.vaults) {
      expect(depositScanRange({ vault, resumeFrom: null, head: HEAD }).from).toBe(
        BigInt(vault.eventsFromBlock)
      );
    }
    expect(VAULT_24H.eventsFromBlock).toBeLessThan(VAULT_24H.ui.deployBlocks.teller);
    expect(VAULT_30D.eventsFromBlock).toBeGreaterThan(VAULT_30D.ui.deployBlocks.teller);
  });

  it("resumes a tail from its cursor instead", () => {
    // The cursor is the deposit scan's own, per wallet in a product
    // (src/lib/scanRuns.ts) — nothing to do with what the share-price scan
    // covers.
    expect(
      depositScanRange({ vault: VAULT_24H, resumeFrom: 92_800_000n, head: HEAD })
    ).toEqual({ from: 92_800_000n, to: HEAD });
  });

  it("reads a range no wider than the chain, when the cursor has caught up", () => {
    // A tail asked for before the chain moved: from is past to, which the
    // caller reads as "nothing new" and commits without a request.
    const caught = depositScanRange({ vault: VAULT_24H, resumeFrom: HEAD + 1n, head: HEAD });
    expect(caught.from).toBeGreaterThan(caught.to);
  });
});
