// The lots behind the ceiling: the listing the surfaces show, and the largest
// amount that can still be priced.
//
// `quoteEntitlement` returns totals — a ceiling, a want total and two share
// counts. The quote card needs more than that: a vested/unvested bar, one line
// per unvested lot with its vest date and the price it is capped at, and, when
// the 1% clamp refuses an amount, the largest amount that would NOT be refused.
// None of that is a second entitlement rule. The lots here are replayed BESIDE
// the vendored rule and then CROSS-CHECKED against it — the blend over the lots
// an amount spends must reproduce the rule's own `maxAskPrice`, and the vested
// and unvested counts must equal its own — and the ceiling this module reports
// is always the rule's, passed through untouched.
//
// If the cross-check ever failed, the honest reading is that the listing is
// wrong and the rule is right: `agrees: false` means a surface must drop the
// per-lot lines and the bar, and keep pricing from `ceiling`. Today it cannot
// fail — the replay below mirrors the vendored one step for step — and that is
// exactly what makes it worth asserting, because the vendored file is
// re-vendorable and this one is not pinned to it by anything but this check.
//
// Pure — no chain, no React. ./lotListing.test.ts drives this exact code
// against `quoteEntitlement` called directly.
import {
  quoteEntitlement,
  type EntitlementQuery,
  type HolderEvent,
} from "../entitlement/entitlement";
import { fitsMaximumSpread, requiredSpread } from "./postingRule";

// One open lot, as a surface needs to show it.
export interface LotView {
  // When the shares arrived, unix seconds — the lot's vesting clock. (The
  // vendored rule calls this `t`; a type the surfaces read deserves the word.)
  arrivedAt: number;
  shares: bigint;
  // What a whole share cost (a deposit) or the accountant's rate at the block
  // it arrived (a transfer in). Never read for a vested lot, and never shown
  // for the residual one.
  entry: bigint;
  // When this lot's shares finish the vesting term.
  vestsAt: number;
  vested: boolean;
  // What THIS lot's shares price at: the share price once vested, else the
  // lower of its entry price and the share price — a cap, not a floor.
  pricedAt: bigint;
  // How many of its shares the quoted amount spends, oldest lot first.
  spent: bigint;
  // The synthetic lot standing for the balance the replay cannot explain (the
  // pre-floor past). It is vested by construction and has no entry price or
  // vest date a surface may claim — never render it as a lot the holder made.
  residual: boolean;
}

export interface LotListing {
  // Every open lot in the rule's own spend order: the residual first, then
  // oldest first.
  lots: LotView[];
  // The shares actually quoted: the amount, capped at the balance.
  sold: bigint;
  // `quoteEntitlement`'s own figures, passed through.
  ceiling: bigint;
  entitlement: bigint;
  vestedShares: bigint;
  unvestedShares: bigint;
  // Whether the lots above reproduce those figures. See the header.
  agrees: boolean;
}

// A lot as the replay carries it, before the amount is spent over it.
interface Lot {
  t: number;
  shares: bigint;
  entry: bigint;
  residual: boolean;
}

const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);

const oldestFirst = (lots: readonly Lot[]): Lot[] =>
  [...lots].sort((a, b) => a.t - b.t);

// Drop `amount` shares from these lots, oldest first, and forget the empties —
// the vendored rule's `deduct`, which is how a past fill, a transfer out and a
// balance the replay over-explains are all spent.
function deduct(lots: Lot[], amount: bigint): Lot[] {
  let left = amount;
  for (const lot of oldestFirst(lots)) {
    if (left <= 0n) break;
    const take = min(lot.shares, left);
    lot.shares -= take;
    left -= take;
  }
  return lots.filter((lot) => lot.shares > 0n);
}

function replay(history: readonly HolderEvent[], scale: bigint): Lot[] {
  let lots: Lot[] = [];
  for (const event of history) {
    if (event.kind === "fill" || event.kind === "transfer-out") {
      lots = deduct(lots, event.shares);
    } else if (event.shares > 0n) {
      lots.push({
        t: event.t,
        shares: event.shares,
        entry:
          event.kind === "deposit"
            ? (event.assets * scale) / event.shares
            : event.rate,
        residual: false,
      });
    }
  }
  return lots;
}

// The lots the rule would spend this request over, in the order it would spend
// them: the balance reconciled against the replay, one synthetic vested lot for
// what the replay cannot explain, or the oldest lots deducted for what it
// over-explains.
function openLots(query: Omit<EntitlementQuery, "offerShares">): Lot[] {
  const scale = 10n ** BigInt(query.shareDecimals);
  const replayed = oldestFirst(replay(query.history, scale));
  const explained = replayed.reduce((sum, lot) => sum + lot.shares, 0n);
  const residual = query.shareBalance - explained;
  return residual > 0n
    ? [
        {
          t: query.now - query.vestingSeconds,
          shares: residual,
          entry: query.navPerShare,
          residual: true,
        },
        ...replayed,
      ]
    : deduct(replayed, -residual);
}

// The lot listing for one quoted amount, with the rule's figures beside it.
export function lotListing(query: EntitlementQuery): LotListing {
  const rule = quoteEntitlement(query);
  const sold = min(query.offerShares, query.shareBalance);

  let left = sold;
  const lots: LotView[] = openLots(query).map((lot) => {
    const take = left > 0n ? min(lot.shares, left) : 0n;
    left -= take;
    const vested = query.now - lot.t >= query.vestingSeconds;
    return {
      arrivedAt: lot.t,
      shares: lot.shares,
      entry: lot.entry,
      vestsAt: lot.t + query.vestingSeconds,
      vested,
      pricedAt: vested ? query.navPerShare : min(lot.entry, query.navPerShare),
      spent: take,
      residual: lot.residual,
    };
  });

  // The cross-check. Three equalities, all against the vendored rule: the blend
  // over the spent lots, and both share counts.
  const blend = lots.reduce((sum, lot) => sum + lot.spent * lot.pricedAt, 0n);
  const vestedSpent = lots.reduce(
    (sum, lot) => sum + (lot.vested ? lot.spent : 0n),
    0n
  );
  const agrees =
    (sold > 0n ? blend / sold === rule.maxAskPrice : rule.maxAskPrice === 0n) &&
    vestedSpent === rule.vestedShares &&
    sold - vestedSpent === rule.unvestedShares;

  return {
    lots,
    sold,
    ceiling: rule.maxAskPrice,
    entitlement: rule.entitlement,
    vestedShares: rule.vestedShares,
    unvestedShares: rule.unvestedShares,
    agrees,
  };
}

// The largest amount of shares whose required spread still fits inside the
// contract's 1% maximum — what the clamp refusal offers instead of a bare "no",
// and `null` when no amount at all can be priced today.
//
// FIFO is what makes an answer exist: the oldest shares are spent first, so
// anything inside the vested ones is free and the unvested lots only start
// pulling the blend down after them. The search is over the lots for that
// reason — within one lot the blend moves monotonically toward that lot's own
// price, so the postable part of a lot is a prefix and can be bisected, while
// ACROSS lots it need not be monotone at all: an unvested lot bought higher
// than the one before it pulls the blend back up, and a search that stopped at
// the first failure would offer a holder less than they can post.
//
// Every probe is the vendored rule itself — the boundaries come from the lots,
// the verdict never does — so the amount returned is one the solver's own code
// prices inside the maximum.
export function largestPostableShares(
  query: Omit<EntitlementQuery, "offerShares">
): bigint | null {
  const balance = query.shareBalance;
  if (balance <= 0n) return null;

  const postable = (offerShares: bigint): boolean =>
    fitsMaximumSpread(
      requiredSpread(
        query.navPerShare,
        quoteEntitlement({ ...query, offerShares }).maxAskPrice
      )
    );

  if (postable(balance)) return balance;

  let best: bigint | null = null;
  let start = 0n;
  for (const lot of openLots(query)) {
    const end = start + lot.shares;
    if (postable(end)) {
      best = end; // ends only grow, so this is the largest so far
    } else {
      // The lot's postable part is a prefix of it; find where it ends.
      let lo = start + 1n;
      let hi = end - 1n;
      while (lo <= hi) {
        const mid = (lo + hi) / 2n;
        if (postable(mid)) {
          if (best === null || mid > best) best = mid;
          lo = mid + 1n;
        } else {
          hi = mid - 1n;
        }
      }
    }
    start = end;
  }
  return best;
}
