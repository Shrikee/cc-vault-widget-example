import type { PublicClient } from "viem";

import { DEPOSIT_TOKENS } from "../config/tokens";
import type { HolderEvent } from "../entitlement/entitlement";
import { decodeDepositLog, reconstructDeposits, type DepositTotals } from "./apy";
import {
  holderHistory,
  transferReads,
  type HistoryLogs,
  type HistoryReads,
} from "./holderHistory";
import { mapWithBudget } from "./inFlightBudget";
import { SCAN_BUDGET, addressTopic, scanLogs, toHex, type RawLog } from "./logScan";
import { walletScanRanges, type WalletScanRange } from "./scanPlan";
import { hasVestingGap, type Vault } from "./vaultRegistry";

// ONE WALLET'S SCAN in one product: what it reads from the chain, and what the
// reading derives (spec, "The holder-history read"; ADR-0003).
//
// Stage 1 read one thing here — the wallet's Teller logs, for its average
// deposit cost. Where a product prices an early exit against the holder's
// entitlement, the same scan has to bring back everything the solver's ledger
// reads: the wallet's deposits, the share transfers it is a party to, and the
// fills it has already had. This module is that widening, and it is a WIDENING
// rather than a second scan — three ranges over ONE span, from the ledger floor,
// under one cursor and one bookkeeping entry (./scanRuns.ts).
//
// Two things are held apart here on purpose.
//
//   • THE RAW LOGS ARE HELD ONCE, and the two derivations read them
//     independently: the average deposit cost EXCLUDES a refunded deposit (a
//     refund undoes what the wallet paid) and the holder history KEEPS the lot
//     (the solver's ledger never reads DepositRefunded — the refund is a burn
//     Transfer the replay already excludes). That divergence lives in
//     ./apy.ts and ./holderHistory.ts, never as a flag on a shared decoded
//     list, because a single "is this refunded?" bit would have to mean two
//     opposite things at once.
//   • THE SECOND PHASE IS ALL-OR-NOTHING. A transfer needs its block dated and
//     a transfer IN needs that block's rate, and both are chain reads the log
//     scan cannot make for it. Any one of them failing fails the whole scan,
//     like a dropped chunk: a history missing a transfer-in quotes an unvested
//     lot as a vested one, at full share price — the over-quote the solver
//     skips and the holder waits on. Never a partial history.
//
// No judgement about what a log MEANS is made here: which ranges to read is
// ./scanPlan.ts's, what they decode to is ./holderHistory.ts's and ./apy.ts's.
// What this module owns is the ORDER — logs, then the reads those logs turn out
// to need — and the PAIRING: one scan yields both figures, so `deriveWallet`
// below sits beside the read that feeds it rather than a file away from it. It
// takes the client rather than reaching for one, so ./walletScan.test.ts drives
// the whole of it against a forged chain.

// What one wallet's scan holds: the raw logs, and what the chain answered for
// the transfer blocks among them. Together they are everything both derivations
// need, and the only thing a tail has to fold into.
export interface WalletScan {
  logs: HistoryLogs;
  reads: HistoryReads;
}

// Nothing scanned — a wallet's history before its first scan, and what a failed
// full scan leaves behind.
export const NO_WALLET_SCAN: WalletScan = {
  logs: { deposits: [], transfers: [], fills: [] },
  reads: { blockTimes: new Map(), rates: new Map() },
};

export interface WalletScanRequest {
  client: PublicClient;
  vault: Vault;
  wallet: string;
  // Where a tail resumes; null for a full scan from the ledger floor. The
  // planner turns the pair into the ranges (./scanPlan.ts).
  resumeFrom: bigint | null;
  head: bigint;
  // What a tail folds into. Null for a full scan, which replaces what was held.
  held: WalletScan | null;
}

// The accountant's `getRateInQuote(address)` selector — the UNGUARDED read, as
// the solver's ledger makes it, so a transfer received during a past pause
// still has an entry price. Its guarded twin reverts while the accountant is
// paused, which would leave a real lot unpriceable forever.
const GET_RATE_IN_QUOTE = "0x1dcbb110";

// An address as one ABI-encoded argument. The same right-aligned 32-byte word an
// indexed address is logged in, which is why the topic helper spells it: calldata
// and topics pad an address identically, and one speller cannot drift from itself.
const abiAddress = (address: string): string => addressTopic(address).slice(2);

// When a block happened. One request per block, never per log in it.
async function blockTime(client: PublicClient, block: bigint): Promise<number> {
  const found = await client.request({
    method: "eth_getBlockByNumber",
    params: [toHex(block), false],
  });
  // A block the node will not hand back is not a dated one, and the replay
  // would only discover that after the figures were already on screen.
  if (!found) throw new Error(`block ${block} cannot be dated — a share transfer is unread`);
  return Number(BigInt(found.timestamp));
}

// What one whole share was worth in `want` at that block — a received lot's
// entry price. An ARCHIVE call: the block is where the shares landed, which may
// be months back.
async function rateInQuote(client: PublicClient, vault: Vault, block: bigint): Promise<bigint> {
  const quoted = await client.request({
    method: "eth_call",
    params: [
      {
        to: vault.addresses.accountant,
        data: `${GET_RATE_IN_QUOTE}${abiAddress(vault.addresses.want)}`,
      },
      toHex(block),
    ],
  });
  return BigInt(quoted);
}

// The second phase: everything the fetched logs turn out to need, and nothing
// that is already held.
//
// Both kinds of read go through the app's one in-flight budget, beside the
// chunks: they are requests to the same endpoint, and it is the endpoint's
// limit, not any one scan's (./inFlightBudget.ts).
//
// A block already dated or rated is not read again: a block has one timestamp
// and one rate whenever it is asked, so a tail pays only for what it brought.
async function readTransferBlocks(
  client: PublicClient,
  vault: Vault,
  logs: HistoryLogs,
  wallet: string,
  held: HistoryReads | null
): Promise<HistoryReads> {
  const blockTimes = new Map(held?.blockTimes ?? []);
  const rates = new Map(held?.rates ?? []);
  const needed = transferReads(logs, wallet);

  // No Set around this one: the planner walks the transfers in chain order, so
  // equal blocks are adjacent and already collapsed (./holderHistory.ts).
  const dating = needed.dateBlocks.filter((block) => !blockTimes.has(block));
  // The planner lists a block once per transfer-in, because that is what the
  // reads COST; two in one block are still one rate, so the read is made once.
  const rating = [...new Set(needed.rateBlocks)].filter((block) => !rates.has(block));

  const [times, quoted] = await Promise.all([
    mapWithBudget(dating, SCAN_BUDGET, (block) => blockTime(client, block)),
    mapWithBudget(rating, SCAN_BUDGET, (block) => rateInQuote(client, vault, block)),
  ]);

  dating.forEach((block, i) => blockTimes.set(block, times[i]));
  rating.forEach((block, i) => rates.set(block, quoted[i]));
  return { blockTimes, rates };
}

/**
 * ONE RUN of a wallet's scan — a full one from the ledger floor, or a tail from
 * the cursor folded into what is held.
 *
 * Both phases or neither: it resolves with a scan whose transfers are every one
 * dated and every received one rated, or it rejects. There is no retry here and
 * no partial result, exactly as the chunked log scan has none (./logScan.ts) —
 * the caller drops what it was holding and says so.
 */
export async function readWalletScan({
  client,
  vault,
  wallet,
  resumeFrom,
  head,
  held,
}: WalletScanRequest): Promise<WalletScan> {
  const ranges = walletScanRanges({ vault, wallet, resumeFrom, head });
  // One range per kind, so a kind's logs are what its own range brought back.
  const fetched = new Map<WalletScanRange["kind"], RawLog[]>(
    await Promise.all(
      ranges.map(
        async (range) =>
          [
            range.kind,
            await scanLogs({
              client,
              address: range.address,
              topics: range.topics,
              fromBlock: range.from,
              toBlock: range.to,
            }),
          ] as const
      )
    )
  );

  // A full scan holds nothing, so its fold is the fetch. A tail's ranges start
  // at cursor + 1 and so cannot re-read a block already folded in — the
  // invariant the replay depends on and states (./holderHistory.ts).
  const fold = (kind: WalletScanRange["kind"], before: readonly RawLog[]): RawLog[] =>
    before.concat(fetched.get(kind) ?? []);
  const logs: HistoryLogs = {
    deposits: fold("deposit", held?.logs.deposits ?? []),
    transfers: fold("transfer", held?.logs.transfers ?? []),
    fills: fold("fill", held?.logs.fills ?? []),
  };

  const reads = await readTransferBlocks(client, vault, logs, wallet, held?.reads ?? null);
  return { logs, reads };
}

// DEPOSIT_TOKENS' decimals, keyed by lowercased address: the log carries the
// deposit asset, and its amount is in that asset's decimals. Passed to
// ./apy.ts rather than imported there, so the arithmetic stays runnable
// without the app's config.
const DEPOSIT_DECIMALS: Record<string, number> = Object.fromEntries(
  DEPOSIT_TOKENS.map((token) => [token.address.toLowerCase(), token.decimals])
);

export interface WalletDerivations {
  // The AVERAGE DEPOSIT COST and the totals behind it (CONTEXT.md): what the
  // wallet paid per share, across the deposits that SURVIVED their refunds —
  // stage 1's figure, from stage 1's function, unchanged. The earnings the
  // sub-line shows are computed FROM it, a share price later (./apy.ts).
  depositCost: DepositTotals;
  // The solver's own holder history, refunds and all. Undefined where the
  // product has no vesting gap: nothing prices an exit against a ceiling there,
  // so the scan never fetched the transfers and fills a history is made of, and
  // a deposits-only list would be a history that is quietly missing events.
  history?: HolderEvent[];
}

/**
 * Both derivations over one scan's raw logs.
 *
 * Recomputed over the whole set rather than folded into running sums: a refund
 * scanned after its deposit cancels a deposit already counted, and a transfer
 * scanned by a tail belongs in the middle of a history, not at its end.
 *
 * Throws when a transfer in the logs has no timestamp or no rate — a scan that
 * lost one of its second-phase reads, which `readWalletScan` above does not
 * return.
 */
export function deriveWallet(
  scan: WalletScan,
  vault: Vault,
  wallet: string
): WalletDerivations {
  const depositCost = reconstructDeposits(
    scan.logs.deposits.map(decodeDepositLog),
    DEPOSIT_DECIMALS
  );
  if (!hasVestingGap(vault)) return { depositCost };
  return { depositCost, history: holderHistory(scan.logs, scan.reads, wallet) };
}
