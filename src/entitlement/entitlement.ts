/**
 * **Entitlement** — the most the solver may pay for the shares a holder is selling
 * (spec #69, issue #71).
 *
 * The product promises a vesting cliff: a holder who waited out `vestingSeconds` is owed
 * full NAV, one who exits early is owed `min(principal, NAV)` — principal is a cap, not
 * a floor, so a holder leaving into a drawdown still leaves. Nothing on-chain enforces
 * that: the AtomicQueue pays whatever price the holder's request carries, and the solver
 * is the only party that can decline. So the solver computes each request's ceiling and
 * refuses anything above it.
 *
 * **The rule.** A holder's history replays into **lots** — one per deposit, each with
 * its own clock and entry price. Shares received by transfer start a new unvested lot at
 * that block's rate; fills and transfers out spend the oldest lots first (FIFO). Whatever
 * part of the current balance the replayed lots do not explain is one synthetic
 * **residual** lot, vested, spent before all of them — sound only because boot asserts
 * the ledger floor is at least `vestingSeconds` old (`assertFloorAges`, issue #70), so
 * everything under it has vested. A vested lot prices at NAV, an unvested one at
 * `min(entry, NAV)`, and the request's ceiling is the blend over the shares being sold.
 * Vesting is judged at the fill: `now − lot.t >= vestingSeconds`, the boundary
 * inclusive, so a request posted on day 29 and filled on day 31 counts as vested.
 *
 * **Rounding is the vault's way, in one direction only.** Every division here floors:
 *
 *   - a deposit's entry price, `floor(assets × 10^shareDecimals / shares)`, so an
 *     unvested lot is never priced above what the holder actually paid;
 *   - the ceiling, `floor(Σ / soldShares)` — this is the number a holder's request is
 *     compared against, and flooring it to whole want units is what "floored to want
 *     units" means for the ask price;
 *   - the total, `floor(Σ / 10^shareDecimals)`.
 *
 * The blend `Σ` itself is exact — one bigint sum, floored once into each unit — so the
 * two outputs stay consistent: a fill at `maxAskPrice` transfers
 * `floor(maxAskPrice × shares / 10^shareDecimals)`, which never exceeds `entitlement`.
 * The counterpart rule outside this repo: **the UI rounds its discount up** (to the
 * queue's `1e6` granularity) when it turns this ceiling into a price to post, so a
 * posted price is never a rounding unit above the ceiling and never fails the gate for
 * want of one unit.
 *
 * **This module imports nothing.** Not from the rest of the Core, not from the service —
 * nothing. The depositor UI vendors it byte-for-byte with a drift check (spec #69), so
 * every type it needs is declared here and `src/core/types.ts` imports `HolderEvent`
 * from this file rather than the other way round.
 *
 * All amounts are bigint token units: shares in the vault's share decimals, `assets`,
 * `rate`, `navPerShare` and the outputs in want (USDC, 6-dec) units, prices being want
 * per whole share. Times are unix seconds.
 */

/**
 * One event of a holder's own on-chain history, as the ledger (#72) will shape it from
 * the Teller's `Deposit`, the share token's `Transfer` (both directions) and the queue's
 * `AtomicRequestFulfilled` logs. Ordered as the chain ordered them.
 */
export type HolderEvent =
  /** Shares minted to the holder for `assets` want — a lot at `assets/shares`. */
  | { kind: 'deposit'; t: number; shares: bigint; assets: bigint }
  /** Shares received from another wallet — a fresh unvested lot at that block's rate. */
  | { kind: 'transfer-in'; t: number; shares: bigint; rate: bigint }
  /** Shares sent to another wallet — spent oldest-first, exactly like a fill. */
  | { kind: 'transfer-out'; t: number; shares: bigint }
  /** Shares the solver already redeemed — spent oldest-first. */
  | { kind: 'fill'; t: number; shares: bigint };

/** What the solver may pay for one request. */
export interface Entitlement {
  /** The most this request may be paid in total, want units. */
  entitlement: bigint;
  /**
   * The most it may be paid per share, want units — the ceiling on the request's
   * `AtomicRequest.atomicPrice`. A request at or below it fills; above it is skipped.
   */
  maxAskPrice: bigint;
  /** Of the shares being sold, how many price at full NAV. */
  vestedShares: bigint;
  /** The rest of them — priced at their lots' entry, capped at NAV. */
  unvestedShares: bigint;
}

export interface EntitlementQuery {
  /** The holder's own history since the vault's ledger floor, in chain order. */
  history: readonly HolderEvent[];
  /** The holder's current share balance — the quote is capped to it. */
  shareBalance: bigint;
  /** NAV per whole share, want units. */
  navPerShare: bigint;
  /** The moment the request is judged at: the fill's chain time, unix seconds. */
  now: number;
  /** The vault's vesting period, seconds. */
  vestingSeconds: number;
  /** Shares the request offers. More than the balance quotes the balance. */
  offerShares: bigint;
  /** The share token's decimals — what a "whole share" is in both divisions. */
  shareDecimals: number;
}

/** One deposit's worth of shares, with its own clock and entry price. */
interface Lot {
  /** When the shares arrived, unix seconds — the lot's vesting clock. */
  t: number;
  shares: bigint;
  /** What the holder paid per whole share, want units. */
  entry: bigint;
}

const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/** Oldest first — the spend order, and the only line that makes the rule FIFO. */
const oldestFirst = (lots: readonly Lot[]): Lot[] =>
  [...lots].sort((a, b) => a.t - b.t);

/**
 * Walk `lots` in the order given, handing each one the shares it gives up, until
 * `amount` is covered or the lots run out. The one spend loop: a past fill, a transfer
 * out, a reconciliation against the balance, and the request itself are all this walk —
 * they differ only in what they do with each take.
 */
function spend(
  lots: readonly Lot[],
  amount: bigint,
  onTake: (lot: Lot, take: bigint) => void,
): void {
  let left = amount;
  for (const lot of lots) {
    if (left <= 0n) break;
    const take = min(lot.shares, left);
    onTake(lot, take);
    left -= take;
  }
}

/** Drop the shares from these lots, oldest first, and forget the ones left empty. */
const deduct = (lots: Lot[], amount: bigint): Lot[] => {
  spend(oldestFirst(lots), amount, (lot, take) => {
    lot.shares -= take;
  });
  return lots.filter((lot) => lot.shares > 0n);
};

/**
 * Replay the history into the lots still open. Past fills and transfers out are spent
 * here in the same order a request is spent in, which is what makes "which lots are
 * left" a determinate answer rather than a guess. A spend larger than the lots hold
 * simply empties them — the holder's balance is the authority, not this replay.
 *
 * An event that moves no shares opens no lot. On-chain it cannot happen — the Teller
 * reverts a zero-share mint — but a total function must not divide by zero to find out.
 */
function replay(history: readonly HolderEvent[], scale: bigint): Lot[] {
  let lots: Lot[] = [];
  for (const event of history) {
    if (event.kind === 'fill' || event.kind === 'transfer-out') {
      lots = deduct(lots, event.shares);
    } else if (event.shares > 0n) {
      lots.push({
        t: event.t,
        shares: event.shares,
        entry:
          event.kind === 'deposit'
            ? (event.assets * scale) / event.shares
            : event.rate,
      });
    }
  }
  return lots;
}

/**
 * Quote one request: the holder's vesting applied to the shares they are selling. Pure,
 * and defined on every history a chain can produce — a holder with no balance quotes
 * zero, a request larger than the balance quotes the balance, a history that explains
 * nothing quotes NAV, and one that explains too much is reconciled down to the balance.
 */
export function quoteEntitlement(query: EntitlementQuery): Entitlement {
  const scale = 10n ** BigInt(query.shareDecimals);
  const replayed = oldestFirst(replay(query.history, scale));
  const explained = replayed.reduce((sum, lot) => sum + lot.shares, 0n);

  // The balance is the authority; the replay only explains where it came from. Both ways
  // it can disagree are reconciled here, and both land on the vault's side of the line:
  //
  //  - it explains too LITTLE (the usual case — the ledger floor hides the older past):
  //    the remainder is one synthetic vested residual lot, spent before every replayed
  //    one. Its `t` only has to make it vested — the walk order comes from putting it
  //    first, so it stays the oldest of all however old the replayed lots are — and its
  //    entry price is never read, because a vested lot prices at NAV. Calling it vested
  //    is sound only because boot asserts the floor is at least a vesting period old.
  //  - it explains too MUCH (a spend the ledger missed): FIFO says a missing spend took
  //    the oldest shares, so the same amount comes off the oldest lots here. What
  //    survives is the youngest — the least vested — money, which is the conservative
  //    reading and never quotes above what the holder is owed.
  const residual = query.shareBalance - explained;
  const lots =
    residual > 0n
      ? [
          {
            t: query.now - query.vestingSeconds,
            shares: residual,
            entry: query.navPerShare,
          },
          ...replayed,
        ]
      : deduct(replayed, -residual);

  const sold = min(query.offerShares, query.shareBalance);
  let blend = 0n;
  let vestedShares = 0n;
  spend(lots, sold, (lot, take) => {
    if (query.now - lot.t >= query.vestingSeconds) {
      blend += take * query.navPerShare;
      vestedShares += take;
    } else {
      blend += take * min(lot.entry, query.navPerShare);
    }
  });

  return {
    entitlement: blend / scale,
    maxAskPrice: sold > 0n ? blend / sold : 0n,
    vestedShares,
    unvestedShares: sold - vestedShares,
  };
}
