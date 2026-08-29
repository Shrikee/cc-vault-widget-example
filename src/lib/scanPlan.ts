// Which blocks each of a product's log scans should read.
//
// Two products doubled the widget's chunked log-scan load, and ADR-0001 already
// names that load as the widget's hard dependency on an archive-capable
// endpoint. What brings it back to one product's cost is not a faster scanner —
// it is asking for fewer blocks, and the decisions that produce that number are
// here, apart from the code that issues the requests (spec, "RPC budget"):
//
//   • Clamp. A scan starts no earlier than the contract it reads. The flat
//     30-day span the share-price scan used to cover asked 79 chunks a load for
//     blocks in which the 24h accountant did not yet exist, and with a second,
//     younger product that waste doubled. Clamping changes no figure: a log
//     cannot predate its emitter.
//   • Window by selection. The selected product needs every trailing window the
//     hero offers; the other contributes one number to the page — its headline
//     APY on a chip — so it scans that window and no more. Switching widens the
//     newly selected product's history rather than rescanning it.
//   • Skip on zero balance. Earnings is position value minus what the wallet
//     paid, so a product the wallet holds none of has no earnings to compute
//     and its deposit history is never read. The share balance is already on
//     screen, so this costs nothing to decide.
//
// Pure — no chain, no React, no bundler globals — so ./scanPlan.test.ts drives
// this exact code, and what it drives is a cost: the vectors count the chunks
// each plan asks for.
//
// It is several small functions rather than one call because the answers are
// needed at different moments. The two hooks that scan (useShareHistory,
// useDepositHistory) must decide whether to scan at all — and say so on screen
// — before they have the chain head, and must decide which blocks after it.
// Bundling those would mean handing each hook the other's inputs.
import { BLOCKS_PER_DAY, HEADLINE_WINDOW, WINDOWS } from "../config/history";
import type { Vault } from "./vaultRegistry";

// An inclusive block range, as eth_getLogs takes it. Both ends are block
// numbers on the chain the roster declares.
export interface BlockRange {
  from: bigint;
  to: bigint;
}

// The widest trailing window the hero offers, and so the most history any
// product ever needs. Derived from the offered set rather than written down:
// adding a 90-day window should widen the selected product's scan by itself.
export const FULL_WINDOW_DAYS = Math.max(...WINDOWS);

// How much share-price history a product needs, in days.
//
// The selected product's stats card offers every window, so it needs the widest
// of them. The unselected one appears on the page exactly once, as a chip
// carrying its headline APY — the 7-day realised trailing APY — so seven days
// of history is not a truncation of what it needs, it is what it needs.
export function scanWindowDays(selected: boolean): number {
  return selected ? FULL_WINDOW_DAYS : HEADLINE_WINDOW;
}

export interface SharePriceScanInput {
  vault: Vault;
  // Days of history wanted — scanWindowDays above.
  windowDays: number;
  // The chain head the scan will run against.
  head: bigint;
  // What this product's held events already cover, or null when none are held.
  // Only the start is consulted, because a widening only ever reaches further
  // back: the share-price scan is a history, and its live end belongs to the
  // 45-second share-price poll, not to a rescan. The whole range is taken so
  // the input reads as "what is held" rather than as an implementation's
  // leftovers.
  covered: BlockRange | null;
}

// The blocks of a product's accountant history still to read, or null when the
// events already held answer for the window asked about.
export function planSharePriceScan({
  vault,
  windowDays,
  head,
  covered,
}: SharePriceScanInput): BlockRange | null {
  const span = BigInt(BLOCKS_PER_DAY) * BigInt(windowDays);
  const window = head > span ? head - span : 0n;
  // Clamped to the contract that emits the events. Blocks before an
  // accountant's deployment hold no share-price update of that accountant's,
  // whichever product is asking.
  const deployed = BigInt(vault.ui.deployBlocks.accountant);
  const from = window > deployed ? window : deployed;

  if (covered === null) return from > head ? null : { from, to: head };
  // The held history already reaches at least this far back — the same window
  // again, a narrower one after a switch away, or a window that clamps to the
  // same deploy block on a product younger than it.
  if (from >= covered.from) return null;
  return { from, to: covered.from - 1n };
}

// What a product's held history covers once a planned range has landed: the
// span already held, widened by the span just read.
//
// The two abut by construction — planSharePriceScan hands back exactly the
// blocks immediately below what is held — so their union is one range and never
// two, and the caller can keep one cursor rather than a set of them. Null in
// and null out is a scan that read nothing into a history that held nothing: a
// node whose head is behind the accountant's own deployment covers no blocks at
// all, which is different from covering them and finding no events.
export function widenCovered(
  covered: BlockRange | null,
  scanned: BlockRange | null
): BlockRange | null {
  if (covered === null) return scanned;
  if (scanned === null) return covered;
  return {
    from: scanned.from < covered.from ? scanned.from : covered.from,
    to: scanned.to > covered.to ? scanned.to : covered.to,
  };
}

// Whether a wallet's deposit history in a product needs reading, and when it
// does not, which of the three reasons it is — because each says something
// different under that product's position value, and only one of them is
// "still coming".
export type DepositScanPlan =
  // Read it: the wallet holds shares, so it has earnings to compute.
  | "scan"
  // The position read has not landed for this wallet yet. Not the same as
  // holding nothing: scanning on it would read the previously connected
  // wallet's history, and skipping on it would report no earnings for a
  // depositor who has them.
  | "unresolved"
  // shareUnlockTime is 0 — this wallet has never deposited into this product.
  | "never-deposited"
  // It deposited once and has since exited the whole position. Its earnings are
  // $0.00 against any average deposit cost, so reconstructing that cost from
  // the whole teller history buys a figure nobody sees.
  | "no-shares";

export interface DepositScanInput {
  // The wallet's share balance in this product; null while it is not known.
  shares: number | null;
  // The wallet's share-unlock time in this product, unix seconds; 0 when it has
  // never deposited, null while it is not known.
  unlockAt: number | null;
}

export function planDepositScan({ shares, unlockAt }: DepositScanInput): DepositScanPlan {
  // Both figures come from one Lens read, so in practice they are unknown
  // together; either being unknown is enough to wait.
  if (shares === null || unlockAt === null) return "unresolved";
  if (unlockAt === 0) return "never-deposited";
  if (shares === 0) return "no-shares";
  return "scan";
}

export interface DepositScanRangeInput {
  vault: Vault;
  // Where a tail scan resumes — the deposit scan's own cursor, per wallet in a
  // product (./scanRuns.ts). Null for a full scan. Nothing to do with what the
  // share-price scan covers: the two scans read different contracts over
  // different spans and neither cursor means anything to the other.
  resumeFrom: bigint | null;
  head: bigint;
}

// The blocks of a product's teller history to read for one wallet.
//
// A full scan starts at the LEDGER FLOOR — the block the solver's holder ledger
// is built from, which the registry carries per product from the solver
// service's own roster. It is the floor and not the teller's deployment because
// the floor is what the authority uses, and it is safe to start there: the
// vault's share totalSupply at floor − 1 is zero on both products, verified on
// chain, so no deposit predates it. On the 24h product the floor is 7 blocks
// below the teller's deployment and on the 30d product 654 blocks above it —
// a few chunks either way, and the same answer.
//
// `from` past `to` is a tail asked for before the chain moved. It is a range
// with nothing in it rather than a null, because the caller still has a cursor
// to commit; it must simply issue no request for it.
export function depositScanRange({
  vault,
  resumeFrom,
  head,
}: DepositScanRangeInput): BlockRange {
  return { from: resumeFrom ?? BigInt(vault.eventsFromBlock), to: head };
}
