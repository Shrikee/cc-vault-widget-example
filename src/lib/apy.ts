// Realised trailing APY, earnings and projected earnings — the pure derivations.
//
// The share price's growth over a trailing window, annualised linearly
// (× 365 / days of the window): what the vault actually returned, never a
// target or a forecast. Arithmetic and log decoding only — no network, no
// React, no DOM — so ./apy.test.ts drives this exact code.
//
// The imports below used to carry explicit `.ts` extensions: the vectors ran
// under plain Node, which resolves none. They run under Vitest now, through
// Vite's own resolver, so the extensions are gone with the constraint that
// forced them.
import { SHARE_PRICE_UNIT, TOPIC_DEPOSIT_REFUNDED } from "../config/history";
import { dataWord, type RawLog } from "./logScan";

// One accountant ExchangeRateUpdated event: the share price before and after
// one update, in the base asset (the uint96 log value ÷ 1e6, e.g. 1.001004).
// `time` is the event's `currentTime` (unix seconds).
export interface SharePriceUpdate {
  block: number;
  logIndex: number;
  time: number;
  oldPrice: number;
  newPrice: number;
}

// ExchangeRateUpdated(uint96 oldRate, uint96 newRate, uint64 currentTime) —
// none of the three is indexed, so the data field is exactly three words.
export function decodeSharePriceUpdate(log: RawLog): SharePriceUpdate {
  if (log.data.length - 2 < 192) {
    throw new Error("Malformed ExchangeRateUpdated log");
  }
  return {
    block: Number(log.blockNumber),
    logIndex: Number(log.logIndex),
    time: Number(dataWord(log.data, 2)),
    // uint96 base-asset units (USDT, 6 dp) → share price, e.g. 1.001004.
    oldPrice: Number(dataWord(log.data, 0)) / SHARE_PRICE_UNIT,
    newPrice: Number(dataWord(log.data, 1)) / SHARE_PRICE_UNIT,
  };
}

export interface WindowApy {
  // The trailing window that was asked for, in days.
  windowDays: number;
  // The span actually measured — `windowDays`, or the vault's age when the
  // window reaches back before launch.
  days: number;
  // The window predates the vault: measured since launch, from the launch
  // share price.
  sinceLaunch: boolean;
  // No share-price update landed inside the window: the APY is exactly 0.00 %.
  noUpdates: boolean;
  // Percent, signed and unclamped. null when no meaningful figure exists yet
  // (a vault younger than a day).
  apyPct: number | null;
  label: string;
}

const DAY = 86_400;

// Where a vault's history starts. Both figures are properties of the vault
// being measured, not of the derivation, so they are arguments: the widget
// serves two products with different launches, and a window that predates one
// of them does not predate the other.
export interface LaunchAnchors {
  // The vault's launch instant, unix seconds — its accountant's deploy block
  // timestamp (registry `ui.deployTimestamp`). Read from the chain, never from
  // a deployment record: that record holds the broadcast time, which on the
  // 30d stack is 3m25s later than the block (spec, Further Notes).
  deployTimestamp: number;
  // The share price at that instant, the opening point of every since-launch
  // figure. The accountant's constructor sets its `exchangeRate` to 1.000000
  // base/share on both products, so there is nothing to look up.
  initialSharePrice: number;
}

// `sharePrice` is the live (polled) share price, so the figure moves when a new
// update lands mid-session even though the event series is scanned once.
//
// `updates` must be sorted ascending and must not reach past `now` — a scan
// runs to the head block, so what a caller holds never does. (A vector
// replaying an old `now` against a longer recorded series has to truncate it.)
export function computeWindowApy(
  launch: LaunchAnchors,
  updates: SharePriceUpdate[],
  sharePrice: number,
  now: number,
  windowDays: number
): WindowApy {
  const endPrice = sharePrice;
  const t0 = now - windowDays * DAY;

  // The window reaches back before the vault existed → measure since launch.
  const sinceLaunch = t0 < launch.deployTimestamp;
  const days = sinceLaunch ? (now - launch.deployTimestamp) / DAY : windowDays;
  const label = sinceLaunch ? "APY since launch" : `${windowDays}d APY`;

  const first = sinceLaunch ? undefined : updates.find((u) => u.time > t0);
  const noUpdates = !sinceLaunch && !first;
  const startPrice = sinceLaunch
    ? launch.initialSharePrice
    : (first?.oldPrice ?? endPrice);

  // A vault younger than a day has no meaningful figure: annualising a few
  // hours is noise, so show "—" until it has 24 hours of history.
  const apyPct =
    days < 1 ? null : ((endPrice / startPrice - 1) * 365 * 100) / days;

  return { windowDays, days, sinceLaunch, noUpdates, apyPct, label };
}

// --- Projected earnings ------------------------------------------------------
// What a deposit being typed would earn at the headline APY — an estimate shown
// before the deposit, never a promise. Linear, like the APY it comes from: a
// year at the headline APY, and a twelfth of that for a month (no compounding,
// which would overstate it).

export interface ProjectedEarnings {
  perYear: number;
  perMonth: number;
}

// null whenever there is nothing honest to show — no amount typed yet, and no
// headline APY because the share-price history is still loading, failed, or the
// vault is younger than a day. Callers render the callout iff this is non-null.
export function projectEarnings(
  amount: number | null,
  headlineApyPct: number | null
): ProjectedEarnings | null {
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  if (headlineApyPct === null || !Number.isFinite(headlineApyPct)) return null;

  const perYear = (amount * headlineApyPct) / 100;
  return { perYear, perMonth: perYear / 12 };
}

// -----------------------------------------------------------------------------
// The hint that reads out a window's state (spec §6.4).
//
// It lives beside the derivation rather than in the component because the four
// states it distinguishes ARE the derivation's states: whichever branch of
// computeWindowApy produced the figure decides the sentence under it, so the two
// stay in step and ./apy.test.ts can hold the copy to the spec. The
// fifth hero hint — the RPC-failure one — has no WindowApy to describe and stays
// in the component.
// -----------------------------------------------------------------------------
export function apyHint(apy: WindowApy): string {
  // No figure at all: the vault is younger than the 24 hours the annualisation
  // needs — the only way computeWindowApy returns a null percentage.
  if (apy.apyPct === null) {
    return "Since launch (<1 day) — APY available after 24 hours.";
  }
  if (apy.noUpdates) {
    return `No share-price updates in the last ${apy.windowDays} days.`;
  }
  if (apy.sinceLaunch) {
    // Whole elapsed days only — a vault 12.7 days old has 12 days behind it.
    return `Since launch (${Math.floor(apy.days)} days), annualised — not guaranteed.`;
  }
  return trailingWindowHint(apy.windowDays);
}

// What an ordinary trailing window reads — split out because the hero shows the
// same sentence before any figure exists (while the scan is in flight), and the
// copy should have exactly one home under the vectors' guard.
export function trailingWindowHint(windowDays: number): string {
  return `Last ${windowDays} days, annualised — not guaranteed.`;
}

// =============================================================================
// Earnings — the unrealised gain on the CCUSD a wallet holds right now.
//
// Position value minus what the wallet paid for those shares, at its average
// deposit cost per share. Pure arithmetic over the wallet's own Teller Deposit
// events, so ./apy.test.ts drives this exact code.
// =============================================================================

// One decoded Teller log for a wallet, from the single scan that fetches both
// event types (the wallet is topics[2] in each). A refund carries only the
// nonce it cancels — `depositHash` and `user` are all its other fields hold.
export type DepositLog =
  | {
      kind: "deposit";
      nonce: string;
      // The deposit asset (topics[3]); matched against DEPOSIT_TOKENS.
      asset: string;
      // Raw log amounts: `depositAmount` in the asset's decimals, `shareAmount`
      // always 18 dp. Kept as bigint so nothing is lost before the division.
      depositAmount: bigint;
      shareAmount: bigint;
    }
  | { kind: "refund"; nonce: string };

// Decode one Teller log from the wallet-filtered scan. Both events are fetched
// together, so the signature in topics[0] says which this is:
//
// Deposit(uint256 indexed nonce, address indexed receiver, address indexed
//   depositAsset, uint256 depositAmount, uint256 shareAmount,
//   uint256 depositTimestamp, uint256 shareLockPeriodAtTimeOfDeposit)
// DepositRefunded(uint256 indexed nonce, bytes32 depositHash, address indexed user)
//
// The deposit's four unindexed fields are four data words; earnings needs the
// first two. A refund carries nothing beyond the nonce it cancels.
export function decodeDepositLog(log: RawLog): DepositLog {
  const nonce = BigInt(log.topics[1]).toString();
  if (log.topics[0].toLowerCase() === TOPIC_DEPOSIT_REFUNDED) {
    return { kind: "refund", nonce };
  }

  if (log.data.length - 2 < 256) throw new Error("Malformed Deposit log");
  return {
    kind: "deposit",
    nonce,
    // An indexed address is right-aligned in its 32-byte topic.
    asset: `0x${log.topics[3].slice(-40)}`,
    depositAmount: dataWord(log.data, 0),
    shareAmount: dataWord(log.data, 1),
  };
}

export interface DepositTotals {
  // Base-asset value deposited — USDT at face value ($1).
  deposited: number;
  sharesMinted: number;
  // Average deposit cost: what the wallet paid per CCUSD. null when no deposit
  // survives the refund exclusion (the caller reports "no deposits" rather than
  // dividing by zero).
  avgCost: number | null;
}

// A deposit in an asset the widget does not know the decimals of cannot be
// valued, and guessing would silently distort the average deposit cost.
export const UNKNOWN_DEPOSIT_ASSET = "Unknown deposit asset";

// A wallet's average deposit cost, reconstructed from its own Teller logs.
//
// `decimalsByAsset` maps a lowercased deposit-asset address to its decimals
// (from DEPOSIT_TOKENS — passed in rather than imported so this module stays
// free of the React/wagmi stack and runs under plain Node).
// Throws UNKNOWN_DEPOSIT_ASSET for a deposit asset that is not in the map.
export function reconstructDeposits(
  logs: DepositLog[],
  decimalsByAsset: Record<string, number>
): DepositTotals {
  // refundDeposit burns the shares but leaves the original Deposit log in
  // place, so refunded nonces are collected first and skipped below — the
  // refund may be scanned before or after its deposit.
  const refunded = new Set<string>();
  for (const log of logs) {
    if (log.kind === "refund") refunded.add(log.nonce);
  }

  // A nonce identifies one deposit, so it is counted once however many times
  // it appears: overlapping block ranges (a tail scan resuming from a cursor
  // that moved backwards) must not inflate the average deposit cost.
  const counted = new Set<string>();

  let deposited = 0;
  let sharesMinted = 0;
  for (const log of logs) {
    if (log.kind !== "deposit" || refunded.has(log.nonce)) continue;
    if (counted.has(log.nonce)) continue;
    counted.add(log.nonce);
    const decimals = decimalsByAsset[log.asset.toLowerCase()];
    if (decimals === undefined) throw new Error(UNKNOWN_DEPOSIT_ASSET);
    deposited += Number(log.depositAmount) / 10 ** decimals;
    sharesMinted += Number(log.shareAmount) / 1e18;
  }

  return {
    deposited,
    sharesMinted,
    avgCost: sharesMinted === 0 ? null : deposited / sharesMinted,
  };
}

// Earnings: what the shares are worth now minus what the wallet paid for them.
// Signed and unclamped — a share price below the average deposit cost is a real
// loss. null when any input is missing (no position, no share price yet, or no
// reconstructed deposit history), which the sub-line renders as "—".
export function computeEarnings(
  sharesHeld: number | null | undefined,
  sharePrice: number | null | undefined,
  avgCost: number | null | undefined
): number | null {
  if (sharesHeld === null || sharesHeld === undefined) return null;
  if (sharePrice === null || sharePrice === undefined) return null;
  if (avgCost === null || avgCost === undefined) return null;
  return sharesHeld * (sharePrice - avgCost);
}
