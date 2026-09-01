// The posting rule: every number between the entitlement ceiling and the queue.
//
// The ceiling itself is never computed here — it comes from the vendored
// `quoteEntitlement` (src/entitlement/entitlement.ts), byte-for-byte the
// solver's own rule. What this module owns is what the widget does with it: how
// far below the share price a request must ask to sit at or under the ceiling,
// which spread actually gets posted, what the queue will stamp as the ask, and
// how the discount is written on the wire.
//
// Two rounding directions carry the whole module, and both point the same way —
// away from a request the solver would skip:
//
//   • the required spread rounds UP. The solver's gate is `ask <= maxAskPrice`,
//     and the vendored rule floors the ceiling into whole want units; a floored
//     discount can leave the ask one want unit ABOVE the ceiling, which is a
//     skip for want of a unit. The vendored file says so in its own words: "the
//     UI rounds its discount up … so a posted price is never a rounding unit
//     above the ceiling".
//   • the share conversion truncates, because the library truncates
//     (`multipliedBy(10 ** decimals).decimalPlaces(0, ROUND_DOWN)`): rounding up
//     would offer shares the holder does not hold.
//
// Pure — no chain, no React, bigints throughout. ./postingRule.test.ts drives
// this exact code, including the round-trip through the installed bignumber.js.
//
// Units: shares are share-decimal bigints (18 dp on both products); prices,
// `assets` and payouts are want units (USDT, 6 dp), prices being want per WHOLE
// share; spreads are the queue's parts per million, where 1e6 is 100%.

// The queue's discount granularity: 1e6 = 100% of the share price.
export const PPM = 1_000_000n;

// The AtomicQueue's own MAX_DISCOUNT — 1% of the share price. A request needing
// more than this cannot be posted at all: the contract will not carry it, and a
// discount clamped down TO the maximum posts an ask above the ceiling, which is
// the skip this whole module exists to avoid.
export const MAX_DISCOUNT_PPM = 10_000n;

// The smallest spread at which a request for these shares asks no more than the
// holder's ceiling — zero when the ceiling is at or above the share price (a
// fully vested holder needs nothing), and never clamped at the top: the number
// past the maximum is what the refusal names ("1.4779% below the share price"),
// so it is returned as it is and judged by `postedDiscount`.
//
// `navPerShare <= 0` is not a state either accountant produces, but the early
// return covers it: nothing is required, and nothing is divided by zero.
export function requiredSpread(navPerShare: bigint, ceiling: bigint): bigint {
  if (ceiling >= navPerShare) return 0n;
  // ceil((nav − ceiling) × 1e6 / nav), in bigint.
  return ((navPerShare - ceiling) * PPM + navPerShare - 1n) / navPerShare;
}

// What the widget posts, and why. `required` past the contract's maximum is the
// refusal — the clamp state — and it still carries the number so the surface can
// name the cause rather than saying "unavailable".
//
// On the name: CONTEXT.md calls this number the POSTED SPREAD — the wider of the
// holder's redemption spread and the one their entitlement requires — and warns
// off "discount" as the solver's word for a spread in the queue's units. That is
// precisely what this returns: the posted spread already in the queue's units,
// which is the `discount` argument the AtomicQueue write takes and the number
// that lands on the wire. The spec names the function for that end of it
// (§"Derived figures as pure functions": `postedDiscount(spreadPpm, required)`),
// and so does this file; the SPREAD it carries is `ppm`.
export type PostedDiscount =
  | {
      kind: "postable";
      // The discount that goes on the wire, in the queue's ppm.
      ppm: bigint;
      required: bigint;
      // Whether the entitlement's spread is the one being posted, rather than
      // the holder's own — what marks the row "(required)".
      isRequired: boolean;
    }
  | { kind: "unfillable"; required: bigint };

// The posted spread is the WIDER of the holder's and the entitlement's.
//
// The spread control keeps its stage-1 meaning: the holder's floor on the
// haircut, not the whole of it. A vested holder's post is byte-identical to
// stage 1's (required is 0, so the holder's spread wins); an unvested holder's
// changes only once the entitlement asks for more than they would have posted
// anyway. Equal spreads post as the holder's — nothing is "required" of a
// depositor who was already going to post it.
export function postedDiscount(
  holderPpm: bigint,
  required: bigint
): PostedDiscount {
  if (!fitsMaximumSpread(required)) return { kind: "unfillable", required };
  const ppm = required > holderPpm ? required : holderPpm;
  return { kind: "postable", ppm, required, isRequired: required > holderPpm };
}

// Whether a spread this wide can be posted at all. The contract's maximum is
// the one gate, and it is asked in two places — here, turning a required spread
// into a posted one, and in the search for the largest amount that still prices
// (src/lib/lotListing.ts) — so it is written once.
export function fitsMaximumSpread(spreadPpm: bigint): boolean {
  return spreadPpm <= MAX_DISCOUNT_PPM;
}

// What the queue stamps as the request's `atomicPrice`: the share price less the
// posted spread, floored to whole want units — the same floor the contract does.
export function askPrice(navPerShare: bigint, spreadPpm: bigint): bigint {
  return (navPerShare * (PPM - spreadPpm)) / PPM;
}

// The want paid for `shares` at `price` per whole share.
export function payout(
  price: bigint,
  shares: bigint,
  shareDecimals: number
): bigint {
  return (price * shares) / 10n ** BigInt(shareDecimals);
}

// The typed amount as offer shares, converted the way the library converts it:
// × 10^decimals, truncated (`decimalPlaces(0, ROUND_DOWN)`). Anything the amount
// box cannot produce — blank, junk, a second dot, a sign — is no shares at all,
// so a quote is never computed for an amount that could not be posted.
//
// The exponent forms bignumber.js would accept ("1e3") are deliberately not:
// the input filters to digits and one dot, and a quote must be computed over
// exactly the shares that would post.
export function offerSharesOf(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) return 0n;
  const [whole = "", frac = ""] = trimmed.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const digits = `${whole || "0"}${padded}`;
  if (!/^\d+$/.test(digits)) return 0n;
  return BigInt(digits);
}

// The inverse: the amount string that converts back to exactly these units.
//
// This is what MAX types into the box. A share balance is an 18-dp bigint and a
// JS number holds ~15 significant digits, so a balance printed from its float
// can be short by a few wei — and a MAX that offers less than the balance
// leaves dust behind, while one that offers more is a request the queue cannot
// pull shares for. `offerSharesOf(amountStringOf(raw)) === raw`, always.
export function amountStringOf(units: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = units / scale;
  const frac = (units % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// The discount as the library's `discountPercent` argument: a percent string.
//
// The library multiplies it by 10⁴ through bignumber.js and takes `toFixed(0)`,
// so `String(d / 1e4)` returns exactly `d` on the wire for every d in 0..10000 —
// brute-forced against the installed bignumber.js in ./postingRule.test.ts and
// again over the real compiled `queueWithdraw` in
// scripts/queue-withdraw-regression.cjs. What the modal shows is what is posted.
export function formatDiscountPercent(discountPpm: bigint): string {
  return String(Number(discountPpm) / 1e4);
}
