import * as fs from 'fs';
import * as path from 'path';
import { HolderEvent, quoteEntitlement } from './entitlement';

/**
 * The 300 seeded random histories the throwaway prototype produced and an independent
 * reviewer verified (2026-08-25: an exact-rational reimplementation plus a per-unit
 * brute-force oracle, 0 mismatches over 4,500 fields), pinned here as a regression
 * fixture in token units. `entitlement.cases.json` carries its own provenance header.
 *
 * **How the float prototype and this bigint Core are compared.** The prototype computes
 * in plain floats (coins, shares, days); the Core computes in exact bigint token units
 * and floors every division the vault's way. The fixture is therefore built by
 * quantizing each history to token units FIRST — the units the chain actually reports —
 * and running the prototype's verified rule over those exact inputs. Both sides then see
 * identical numbers, and the only gaps left are:
 *
 *   1. **The Core's deliberate flooring.** A lot's entry price is floored to want units,
 *      so an unvested lot can price up to one want unit per share below the prototype's
 *      unrounded ratio; the ceiling is floored again. Both push the Core DOWN, never up.
 *   2. **The reference's own rounding** — float sums at ~1e-15 relative, stored rounded
 *      to token units.
 *
 * So the bounds are derived, not tuned, and one-sided where the rounding is one-sided:
 * the Core must land in `[expected − (one want unit per whole share sold + 2), expected]`
 * on the total, in `[expected − 2, expected]` on the per-share ceiling, and within a
 * millionth of a share on the vested/unvested split — which is a classification, so it
 * has to agree, and does. (Observed across the 300: totals 0…−1313 units, at worst 0.995
 * units per whole share; ceilings 0…−2 units; splits within 5.4e-13 of a share.)
 */

/** JSON has no bigint, so every token amount is a decimal string on the wire. */
type FixtureEvent =
  | { kind: 'deposit'; t: number; shares: string; assets: string }
  | { kind: 'transfer-in'; t: number; shares: string; rate: string }
  | { kind: 'transfer-out'; t: number; shares: string }
  | { kind: 'fill'; t: number; shares: string };

interface FixtureCase {
  id: number;
  family: string;
  events: FixtureEvent[];
  shareBalance: string;
  navPerShare: string;
  now: number;
  offerShares: string;
  expected: {
    entitlement: string;
    maxAskPrice: string;
    vestedShares: string;
    unvestedShares: string;
  };
}
interface Fixture {
  source: string;
  seed: number;
  vestingSeconds: number;
  shareDecimals: number;
  cases: FixtureCase[];
}

/**
 * Read rather than `import`: the file is 300 cases of decimal strings, and a JSON import
 * would have TypeScript infer a literal type for every one of them.
 */
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'entitlement.cases.json'), 'utf8'),
) as Fixture;

function toEvent(e: FixtureEvent): HolderEvent {
  switch (e.kind) {
    case 'deposit':
      return {
        kind: 'deposit',
        t: e.t,
        shares: BigInt(e.shares),
        assets: BigInt(e.assets),
      };
    case 'transfer-in':
      return {
        kind: 'transfer-in',
        t: e.t,
        shares: BigInt(e.shares),
        rate: BigInt(e.rate),
      };
    case 'transfer-out':
      return { kind: 'transfer-out', t: e.t, shares: BigInt(e.shares) };
    case 'fill':
      return { kind: 'fill', t: e.t, shares: BigInt(e.shares) };
  }
}

const ONE_SHARE = 10n ** BigInt(fixture.shareDecimals);
/** A millionth of a share — the float reference's noise floor, far below any real cost. */
const SHARE_NOISE = ONE_SHARE / 1_000_000n;

interface Replayed {
  fixtureCase: FixtureCase;
  sold: bigint;
  nav: bigint;
  quote: ReturnType<typeof quoteEntitlement>;
}

const replayed: Replayed[] = fixture.cases.map((fixtureCase) => {
  const offerShares = BigInt(fixtureCase.offerShares);
  const shareBalance = BigInt(fixtureCase.shareBalance);
  const nav = BigInt(fixtureCase.navPerShare);
  return {
    fixtureCase,
    sold: offerShares < shareBalance ? offerShares : shareBalance,
    nav,
    quote: quoteEntitlement({
      history: fixtureCase.events.map(toEvent),
      shareBalance,
      navPerShare: nav,
      now: fixtureCase.now,
      vestingSeconds: fixture.vestingSeconds,
      offerShares,
      shareDecimals: fixture.shareDecimals,
    }),
  };
});

/** The offending cases, so one failure names every one of them and not just the first. */
function offenders(
  holds: (replay: Replayed) => boolean,
  report: (replay: Replayed) => string,
): string[] {
  return replayed.filter((replay) => !holds(replay)).map(report);
}

describe(`the prototype's ${fixture.cases.length} verified histories (seed ${fixture.seed})`, () => {
  it('quotes the same ceiling on every case, never above it', () => {
    expect(
      offenders(
        ({ fixtureCase, quote }) => {
          const expected = BigInt(fixtureCase.expected.maxAskPrice);
          return (
            quote.maxAskPrice <= expected && quote.maxAskPrice >= expected - 2n
          );
        },
        ({ fixtureCase, quote }) =>
          `case ${fixtureCase.id} (${fixtureCase.family}): ${quote.maxAskPrice} vs ` +
          `${fixtureCase.expected.maxAskPrice}`,
      ),
    ).toEqual([]);
  });

  it('quotes the same total on every case, under it by at most a want unit per share', () => {
    expect(
      offenders(
        ({ fixtureCase, quote, sold }) => {
          const expected = BigInt(fixtureCase.expected.entitlement);
          const wholeShares = (sold + ONE_SHARE - 1n) / ONE_SHARE;
          return (
            quote.entitlement <= expected &&
            quote.entitlement >= expected - (wholeShares + 2n)
          );
        },
        ({ fixtureCase, quote }) =>
          `case ${fixtureCase.id} (${fixtureCase.family}): ${quote.entitlement} vs ` +
          `${fixtureCase.expected.entitlement}`,
      ),
    ).toEqual([]);
  });

  it('splits vested from unvested shares exactly as the prototype did', () => {
    const agrees = (got: bigint, want: string): boolean => {
      const gap = got - BigInt(want);
      return gap <= SHARE_NOISE && -gap <= SHARE_NOISE;
    };
    expect(
      offenders(
        ({ fixtureCase, quote }) =>
          agrees(quote.vestedShares, fixtureCase.expected.vestedShares) &&
          agrees(quote.unvestedShares, fixtureCase.expected.unvestedShares),
        ({ fixtureCase, quote }) =>
          `case ${fixtureCase.id} (${fixtureCase.family}): ` +
          `${quote.vestedShares}/${quote.unvestedShares} vs ` +
          `${fixtureCase.expected.vestedShares}/${fixtureCase.expected.unvestedShares}`,
      ),
    ).toEqual([]);
  });
});

/**
 * The rule's invariants over the same 300 histories — the cheapest 300-sample property
 * suite available, and the only place they meet real churn (partial fills, transfers,
 * markdowns) rather than a hand-built position.
 */
describe(`the rule's invariants across the ${fixture.cases.length} histories`, () => {
  it('never quotes above what the shares are worth at NAV', () => {
    expect(
      offenders(
        ({ quote, sold, nav }) =>
          quote.maxAskPrice <= nav &&
          quote.entitlement <= (sold * nav) / ONE_SHARE,
        ({ fixtureCase, quote, nav }) =>
          `case ${fixtureCase.id}: ceiling ${quote.maxAskPrice} vs NAV ${nav}`,
      ),
    ).toEqual([]);
  });

  it('quotes exactly NAV whenever every share sold has vested', () => {
    expect(
      offenders(
        ({ quote, sold, nav }) =>
          quote.unvestedShares > 0n || sold === 0n || quote.maxAskPrice === nav,
        ({ fixtureCase, quote, nav }) =>
          `case ${fixtureCase.id}: all vested but ceiling ${quote.maxAskPrice} != NAV ${nav}`,
      ),
    ).toEqual([]);
  });

  it('accounts for every share sold, as vested or as unvested', () => {
    expect(
      offenders(
        ({ quote, sold }) => quote.vestedShares + quote.unvestedShares === sold,
        ({ fixtureCase }) => `case ${fixtureCase.id}`,
      ),
    ).toEqual([]);
  });

  it('never pays more, at the ceiling, than the total it quoted', () => {
    // The two floors stay consistent: a fill at maxAskPrice transfers
    // floor(maxAskPrice × shares / 10^decimals), which never exceeds `entitlement`.
    expect(
      offenders(
        ({ quote, sold }) =>
          (quote.maxAskPrice * sold) / ONE_SHARE <= quote.entitlement,
        ({ fixtureCase }) => `case ${fixtureCase.id}`,
      ),
    ).toEqual([]);
  });
});
