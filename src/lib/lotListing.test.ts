// The lot listing and the largest postable amount — src/lib/lotListing.ts.
//
// The listing is DERIVED BESIDE the vendored rule, never instead of it, so the
// test that matters most is the cross-check: the blend over the lots the amount
// spends must reproduce `quoteEntitlement`'s own `maxAskPrice`, and the vested
// and unvested counts must equal its own. Every scenario below is checked that
// way against the rule called directly, on the prototype's four scenarios
// (mixed, unvested-late, transfer-in, clamp) and on the shapes the live chain
// adds: a residual lot under the ledger floor, and a past fill.
import { describe, expect, it } from "vitest";

import {
  quoteEntitlement,
  type EntitlementQuery,
  type HolderEvent,
} from "../entitlement/entitlement";
import { fitsMaximumSpread, requiredSpread } from "./postingRule";
import { largestPostableShares, lotListing } from "./lotListing";

const SHARE = 10n ** 18n;
const DAY = 86_400;
const VESTING = 2_592_000; // 30 days — the Yield Prime 30d term
const NOW = 1_800_000_000;
const ago = (days: number): number => NOW - Math.round(days * DAY);

// `shares` whole shares bought at `entry` want per whole share.
const deposit = (t: number, shares: number, entry: bigint): HolderEvent => ({
  kind: "deposit",
  t,
  shares: BigInt(shares) * SHARE,
  assets: (entry * BigInt(shares) * SHARE) / SHARE,
});
const transferIn = (t: number, shares: number, rate: bigint): HolderEvent => ({
  kind: "transfer-in",
  t,
  shares: BigInt(shares) * SHARE,
  rate,
});
const fill = (t: number, shares: number): HolderEvent => ({
  kind: "fill",
  t,
  shares: BigInt(shares) * SHARE,
});

const sumShares = (history: HolderEvent[]): bigint =>
  history.reduce(
    (s, e) =>
      e.kind === "fill" || e.kind === "transfer-out" ? s - e.shares : s + e.shares,
    0n
  );

function query(
  history: HolderEvent[],
  navPerShare: bigint,
  offerShares: bigint,
  shareBalance = sumShares(history)
): EntitlementQuery {
  return {
    history,
    shareBalance,
    navPerShare,
    now: NOW,
    vestingSeconds: VESTING,
    offerShares,
    shareDecimals: 18,
  };
}

// The cross-check, asserted against the rule called here rather than against
// what the listing says about itself.
function expectAgreesWithTheRule(q: EntitlementQuery) {
  const rule = quoteEntitlement(q);
  const listing = lotListing(q);

  const sold = q.offerShares < q.shareBalance ? q.offerShares : q.shareBalance;
  const blend = listing.lots.reduce((s, l) => s + l.spent * l.pricedAt, 0n);
  const spent = listing.lots.reduce((s, l) => s + l.spent, 0n);
  const vested = listing.lots.reduce((s, l) => s + (l.vested ? l.spent : 0n), 0n);
  const unvested = listing.lots.reduce((s, l) => s + (l.vested ? 0n : l.spent), 0n);

  expect(spent).toBe(sold);
  if (sold > 0n) expect(blend / sold).toBe(rule.maxAskPrice);
  expect(vested).toBe(rule.vestedShares);
  expect(unvested).toBe(rule.unvestedShares);
  // And the listing's own verdict on all of that.
  expect(listing.agrees).toBe(true);
  // The ceiling is the rule's number, passed through — never recomputed here.
  expect(listing.ceiling).toBe(rule.maxAskPrice);
  expect(listing.entitlement).toBe(rule.entitlement);
  return listing;
}

describe("the lot listing reproduces the rule it is derived beside", () => {
  it("mixed: 6,000 vested and 4,000 unvested blend to 1.000600", () => {
    const q = query(
      [deposit(ago(45), 6_000, 1_000_000n), deposit(ago(10), 4_000, 1_000_000n)],
      1_001_000n,
      10_000n * SHARE
    );
    const listing = expectAgreesWithTheRule(q);

    expect(listing.ceiling).toBe(1_000_600n);
    expect(listing.vestedShares).toBe(6_000n * SHARE);
    expect(listing.unvestedShares).toBe(4_000n * SHARE);
    expect(listing.lots).toHaveLength(2);
    // Oldest first, which is also the spend order.
    expect(listing.lots[0].vested).toBe(true);
    expect(listing.lots[0].pricedAt).toBe(1_001_000n); // a vested lot prices at NAV
    expect(listing.lots[1].vested).toBe(false);
    expect(listing.lots[1].pricedAt).toBe(1_000_000n); // capped at what was paid
    expect(listing.lots[1].vestsAt).toBe(ago(10) + VESTING);
  });

  it("unvested-late: the whole amount is capped at what it cost", () => {
    const q = query([deposit(ago(20), 10_000, 1_000_000n)], 1_001_370n, 10_000n * SHARE);
    const listing = expectAgreesWithTheRule(q);

    expect(listing.ceiling).toBe(1_000_000n);
    expect(listing.vestedShares).toBe(0n);
    expect(requiredSpread(1_001_370n, listing.ceiling)).toBe(1369n);
  });

  it("transfer-in: the received lot carries the rate at its block", () => {
    const q = query([transferIn(ago(1), 400, 1_000_122n)], 1_000_396n, 400n * SHARE);
    const listing = expectAgreesWithTheRule(q);

    expect(listing.ceiling).toBe(1_000_122n);
    expect(listing.lots[0].entry).toBe(1_000_122n);
    expect(listing.lots[0].vested).toBe(false);
    expect(requiredSpread(1_000_396n, listing.ceiling)).toBe(274n);
  });

  it("clamp: an unrealistic share price leaves the ceiling at what was paid", () => {
    const q = query([deposit(ago(5), 10_000, 1_000_000n)], 1_015_000n, 10_000n * SHARE);
    const listing = expectAgreesWithTheRule(q);

    expect(listing.ceiling).toBe(1_000_000n);
    expect(requiredSpread(1_015_000n, listing.ceiling)).toBe(14_779n);
  });

  it("a residual lot under the ledger floor is listed vested, and first", () => {
    // The usual live shape: the replay explains part of the balance and the
    // rest is one synthetic vested lot, spent before every replayed one.
    const q = query(
      [deposit(ago(3), 400, 1_000_000n)],
      1_001_000n,
      1_000n * SHARE,
      1_000n * SHARE // 600 shares the replay cannot explain
    );
    const listing = expectAgreesWithTheRule(q);

    expect(listing.lots[0].residual).toBe(true);
    expect(listing.lots[0].shares).toBe(600n * SHARE);
    expect(listing.lots[0].vested).toBe(true);
    expect(listing.lots[1].residual).toBe(false);
    // The residual is spent first, so the young lot is only reached after it.
    expect(listing.lots[0].spent).toBe(600n * SHARE);
    expect(listing.lots[1].spent).toBe(400n * SHARE);
  });

  it("a balance the replay over-explains comes off the oldest lots", () => {
    // A spend the ledger missed: FIFO says it took the oldest shares, so the
    // youngest — least vested — money is what survives.
    const q = query(
      [deposit(ago(45), 6_000, 1_000_000n), deposit(ago(10), 4_000, 1_000_000n)],
      1_001_000n,
      10_000n * SHARE,
      4_000n * SHARE
    );
    const listing = expectAgreesWithTheRule(q);

    expect(listing.lots).toHaveLength(1);
    expect(listing.lots[0].vested).toBe(false);
    expect(listing.vestedShares).toBe(0n);
  });

  it("a past fill spends the oldest lots, exactly as a request does", () => {
    const q = query(
      [
        deposit(ago(45), 6_000, 1_000_000n),
        deposit(ago(10), 4_000, 1_000_000n),
        fill(ago(2), 6_000),
      ],
      1_001_000n,
      4_000n * SHARE
    );
    const listing = expectAgreesWithTheRule(q);

    expect(listing.lots).toHaveLength(1);
    expect(listing.lots[0].arrivedAt).toBe(ago(10));
    expect(listing.vestedShares).toBe(0n);
  });

  it("quotes the balance when more is offered than is held", () => {
    const q = query([deposit(ago(45), 6_000, 1_000_000n)], 1_001_000n, 99_999n * SHARE);
    const listing = expectAgreesWithTheRule(q);

    expect(listing.sold).toBe(6_000n * SHARE);
    expect(listing.lots[0].spent).toBe(6_000n * SHARE);
  });

  it("spends nothing, and claims no ceiling, for an empty amount", () => {
    const q = query([deposit(ago(45), 6_000, 1_000_000n)], 1_001_000n, 0n);
    const listing = expectAgreesWithTheRule(q);

    expect(listing.sold).toBe(0n);
    expect(listing.ceiling).toBe(0n);
    expect(listing.lots.every((l) => l.spent === 0n)).toBe(true);
    // The lots are still listed: the bar and the vest dates show before an
    // amount is typed.
    expect(listing.lots).toHaveLength(1);
  });

  it("lists a wallet with no shares as no lots at all", () => {
    const listing = lotListing(query([], 1_001_000n, 10n * SHARE, 0n));
    expect(listing.lots).toEqual([]);
    expect(listing.agrees).toBe(true);
    expect(listing.ceiling).toBe(0n);
  });
});

describe("largestPostableShares", () => {
  const postable = (q: EntitlementQuery, n: bigint): boolean =>
    fitsMaximumSpread(
      requiredSpread(q.navPerShare, quoteEntitlement({ ...q, offerShares: n }).maxAskPrice)
    );

  it("is null when one young lot is the whole balance — nothing prices", () => {
    // The prototype's clamp scenario. Every share in the balance is in the same
    // unvested lot at the same entry price, so no smaller amount prices any
    // better: the refusal has no remedy to offer, and the "Up to…" clause is
    // omitted rather than invented.
    const q = query([deposit(ago(5), 10_000, 1_000_000n)], 1_015_000n, 10_000n * SHARE);
    expect(largestPostableShares(q)).toBe(null);
  });

  it("is the whole balance when everything has vested", () => {
    const q = query([deposit(ago(40), 10_000, 1_000_000n)], 1_002_740n, 10_000n * SHARE);
    expect(largestPostableShares(q)).toBe(10_000n * SHARE);
  });

  it("is the boundary a clamped holder can still post: their vested shares and the tail that survives the 1%", () => {
    // 6,000 vested shares and 4,000 in a 5-day-old lot at an unrealistic share
    // price — the clamp scenario with something to fall back on. FIFO makes
    // everything inside the vested 6,000 free, and the 1% maximum then buys a
    // little of the unvested lot on top: the exact boundary is what gets
    // offered, and it is strictly more than the vested shares.
    //
    // (The spec's clamp copy illustrates this clause with a round "6,000"; the
    // computed answer is the vested shares PLUS that tail, because one wei of
    // unvested money moves the blend by far less than the 1% the contract
    // allows. Offering only the vested shares would understate what can be
    // posted.)
    const q = query(
      [deposit(ago(45), 6_000, 1_000_000n), deposit(ago(5), 4_000, 1_000_000n)],
      1_100_000n,
      10_000n * SHARE
    );
    const largest = largestPostableShares(q);

    expect(largest).not.toBe(null);
    expect(largest!).toBeGreaterThan(6_000n * SHARE);
    expect(largest!).toBeLessThan(10_000n * SHARE);
    // The whole point: what is offered can be posted, and one wei more cannot.
    expect(postable(q, largest!)).toBe(true);
    expect(postable(q, largest! + 1n)).toBe(false);
    // Worked by hand from the rule's own inequality, so the number is a
    // derivation and not a recording: a spread of at most 1% means the blend
    // must stay at or above NAV − NAV/100 = 1.089000, so with V = 6,000 vested
    // shares at 1.100000 and u shares at 1.000000,
    //   V×1.100000 + u×1.000000 ≥ 1.089000 × (V + u)  ⟺  u ≤ V × 11/89,
    // and V × 11/89 = 741.573033707865168539… shares.
    expect(largest).toBe(6_741_573_033_707_865_168_539n);
  });

  it("is exact at the 1% boundary rather than approximate", () => {
    // A boundary that falls INSIDE the young lot: 1,000 vested shares and 1,000
    // bought at 0.900000 against a share price of 1.020000. A whole-share or
    // whole-lot answer would leave postable shares behind.
    const q = query(
      [deposit(ago(45), 1_000, 1_000_000n), deposit(ago(1), 1_000, 900_000n)],
      1_020_000n,
      2_000n * SHARE
    );
    const largest = largestPostableShares(q);

    expect(largest!).toBeGreaterThan(1_000n * SHARE);
    expect(largest!).toBeLessThan(2_000n * SHARE);
    expect(largest! % SHARE).not.toBe(0n); // to the wei, not to the share
    expect(postable(q, largest!)).toBe(true);
    expect(postable(q, largest! + 1n)).toBe(false);
  });

  it("is null for a wallet holding nothing", () => {
    expect(largestPostableShares(query([], 1_001_000n, 0n, 0n))).toBe(null);
  });

  it("searches past a lot that prices better than the one before it", () => {
    // Lot prices are not monotone: an unvested lot bought higher can follow one
    // bought lower, so the running blend can RISE with the amount. A search
    // that assumed otherwise would stop at the first lot that fails and offer
    // less than the holder can post.
    const q = query(
      [transferIn(ago(1), 100, 500_000n), transferIn(NOW - 3600, 100_000, 1_009_900n)],
      1_010_000n,
      100_100n * SHARE
    );
    const largest = largestPostableShares(q);
    expect(largest).not.toBe(null);
    // Nothing inside the first, deeply discounted lot prices at all…
    expect(postable(q, 100n * SHARE)).toBe(false);
    // …but the whole balance does, because the second lot pulls the blend back.
    expect(largest).toBe(100_100n * SHARE);
  });
});
