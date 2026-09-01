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
//   • Widen where an exit is priced. A vesting-gap product prices a holder's
//     early exit against its entitlement ceiling (ADR-0003), which needs the
//     holder's whole history rather than its deposits — so on that product, and
//     only there, a wallet's scan asks a wider question of a wider gate. That
//     is the one decision here that is about WHICH EVENTS a scan reads and not
//     only which blocks, which is why the ranges below carry their filters.
//
// Pure — no chain, no React, no DOM — so ./scanPlan.test.ts drives this exact
// code, and what it drives is a cost: the vectors count the chunks each plan
// asks for. The one thing it reaches into ./logScan.ts for is the eth_getLogs
// wire format: a filtered range is a topic filter, and how an address is spelt
// in one belongs beside the code that decodes it back.
//
// It is several small functions rather than one call because the answers are
// needed at different moments. The two hooks that scan (useShareHistory,
// useDepositHistory) must decide whether to scan at all — and say so on screen
// — before they have the chain head, and must decide which blocks after it.
// Bundling those would mean handing each hook the other's inputs.
import type { Address } from "viem";

import {
  BLOCKS_PER_DAY,
  HEADLINE_WINDOW,
  TOPIC_DEPOSIT,
  TOPIC_DEPOSIT_REFUNDED,
  TOPIC_FULFILLED,
  TOPIC_TRANSFER,
  WINDOWS,
} from "../config/history";
import { addressTopic, type LogTopic } from "./logScan";
import { hasVestingGap, type Vault } from "./vaultRegistry";

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

// Whether a wallet's history in a product needs reading, where a product prices
// an early exit against the holder's entitlement (spec, "The holder-history
// read"; ADR-0003).
//
// This is planDepositScan's gate widened, and only where the widening buys
// something. On a VESTING-GAP product the precondition is `shares > 0`, nothing
// else. Stage 1's `shareUnlockTime ≠ 0` is right for earnings — no deposit, no
// average deposit cost — and wrong for the history: a wallet that received its
// shares by transfer never deposited, holds one unvested lot, and unread would
// quote as a vested RESIDUAL lot at full share price. That is the over-quote the
// solver skips, so the widened gate is the difference between a request that
// fills and one that sits open.
//
// Such a wallet still derives `avgCost: null` and still shows earnings as "—":
// what widens is which wallets are scanned, never what a scan means.
//
// Where there is no vesting gap nothing is priced against a ceiling, so the
// history has no reader and the gate stays exactly stage 1's — which is also
// what keeps the 24h product's scan the size it was.
export interface WalletScanInput extends DepositScanInput {
  // Which product's history, because whether the widening applies is the
  // product's own property (hasVestingGap) and not the wallet's.
  vault: Vault;
}

export function planWalletScan({ vault, shares, unlockAt }: WalletScanInput): DepositScanPlan {
  if (!hasVestingGap(vault)) return planDepositScan({ shares, unlockAt });
  if (shares === null) return "unresolved";
  if (shares > 0) return "scan";
  // No shares: no history to price and no earnings to compute, and the two
  // reasons still say different things under the position value (planDepositScan
  // above). Which one it is takes the unlock time, so an unresolved one waits.
  if (unlockAt === null) return "unresolved";
  return unlockAt === 0 ? "never-deposited" : "no-shares";
}

// One eth_getLogs filter over one span of blocks.
//
// `kind` is what the range brings back, so the caller can hand each result to
// the derivation that reads it without re-deriving that from the topics.
export interface WalletScanRange extends BlockRange {
  kind: "deposit" | "transfer" | "fill";
  address: Address;
  topics: LogTopic[];
}

export interface WalletScanRangeInput extends DepositScanRangeInput {
  wallet: string;
}

// Every range one wallet's scan reads in a product — three on a vesting-gap
// product, one everywhere else.
//
// All of them over the SAME blocks: the history read is a widening of stage 1's
// deposit scan, not a second scan, so there is one span, one cursor and one
// bookkeeping entry (./scanRuns.ts) however many ranges it takes. What it costs
// is that multiplication — three ranges over the ledger floor to head is three
// times what stage 1 asked for on that product — and ./scanPlan.test.ts counts
// it in requests.
//
// Two of the three are filtered to the wallet. The share transfers are not, and
// cannot be: eth_getLogs matches topics by position and cannot OR across two of
// them, so a wallet's two legs would be two ranges. One unfiltered range is
// cheaper than that, and the replay keeps the legs that are the wallet's
// (./holderHistory.ts).
export function walletScanRanges({
  vault,
  wallet,
  resumeFrom,
  head,
}: WalletScanRangeInput): WalletScanRange[] {
  const blocks = depositScanRange({ vault, resumeFrom, head });
  const holder = addressTopic(wallet);
  // Both Teller events in one range, as stage 1 reads them: the average deposit
  // cost excludes refunded deposits and the history deliberately keeps them, and
  // that divergence belongs to the derivations, not to the scan.
  //
  // This is the ONLY spelling of that filter — src/lib/walletScan.ts issues
  // these ranges and nothing else, so stage 1's deposit scan and the history
  // read cannot drift apart into two filters that disagree.
  const deposit: WalletScanRange = {
    ...blocks,
    kind: "deposit",
    address: vault.addresses.teller,
    topics: [[TOPIC_DEPOSIT, TOPIC_DEPOSIT_REFUNDED], null, holder],
  };
  if (!hasVestingGap(vault)) return [deposit];

  return [
    deposit,
    { ...blocks, kind: "transfer", address: vault.addresses.vault, topics: [TOPIC_TRANSFER] },
    {
      ...blocks,
      kind: "fill",
      address: vault.addresses.queue,
      // The queue serves every vault and every want token: without the last two
      // topics a fill of some other product's shares would land in this
      // product's history.
      topics: [
        TOPIC_FULFILLED,
        holder,
        addressTopic(vault.addresses.vault),
        addressTopic(vault.addresses.want),
      ],
    },
  ];
}
