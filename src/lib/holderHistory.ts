// A holder's own history, replayed from raw logs — the input the vendored
// entitlement rule prices an early exit against (spec, "The holder-history
// read").
//
// The solver decides what it may pay for a redemption request by replaying the
// holder's history into lots (src/entitlement/entitlement.ts). This module
// produces that history in the widget, from the same events, in the same order,
// under the same exclusions — because a history that differs by one event is a
// ceiling that differs by real money, and the widget's whole promise here is to
// name the price the solver would accept before the holder posts it.
//
// The reference is the solver's own `holder-ledger.ts`; this reading was proven
// equivalent against it on every live holder and on the fork scenario, and the
// JSON both sides wrote is what ./holderHistory.test.ts asserts against.
//
// Pure — no chain, no React, no DOM. What the chain has to answer for a
// transfer (when the block was, what a share was worth in it) is read in a
// second phase and handed back in; `transferReads` below says which reads those
// are, so the caller issues exactly them and nothing is fetched twice.
//
// ONE WALLET AT A TIME, and that is not an interface convenience. The share
// token's Transfer range is scanned UNFILTERED — eth_getLogs matches topics by
// position and cannot OR across two of them, so one unfiltered range is cheaper
// than one filtered range per direction — so what comes back is the whole
// product's transfers. Both functions here take the wallet and keep only what
// it is a party to (spec: "client keeps only the wallet's two legs"). Replaying
// the list product-wide instead would date and RATE every stranger's transfer:
// archive calls this wallet's ceiling does not depend on, in an all-or-nothing
// read where each extra call is one more way for the whole scan to fail.
//
// FOUR THINGS TO KNOW BEFORE CHANGING ANYTHING HERE:
//
//   • Refunds are deliberately ignored. `Teller.refundDeposit` calls
//     `vault.exit`, which burns — so a refund is a burn Transfer this replay
//     already excludes, and the `Deposit` lot deliberately stays. The solver's
//     ledger never reads `DepositRefunded` and neither does this. Stage 1's
//     refund exclusion is still right for the AVERAGE DEPOSIT COST
//     (reconstructDeposits in ./apy.ts) and applying it here would delete a lot
//     the solver still counts. The two derivations read one decoded list and
//     diverge in themselves — the divergence is never a flag on the list.
//   • The fill share-leg exclusion is keyed on (transactionHash, holder). A
//     batch fill moves several holders' shares to the solver in ONE
//     transaction, so keying on the solver's address would drop a genuine
//     transfer to it, and keying on the transaction alone would drop a genuine
//     transfer made in the same one.
//   • Order is the chain's: (blockNumber, logIndex) across all three kinds.
//     Lots are spent oldest-first, so an event out of order is a lot spent out
//     of turn.
//   • Nothing here dedupes, and it must not have to. Its sibling derivation
//     does — reconstructDeposits counts a nonce once, because a cursor that
//     moved backwards would inflate the average deposit cost — but a history
//     has no nonce to count by, and a Transfer seen twice would spend the
//     sender's lots twice. What keeps it safe is upstream: one scan per wallet
//     per product over one span, and a tail that resumes at cursor + 1, so no
//     block is ever read into the same history twice (./scanRuns.ts,
//     ./scanPlan.ts). Hand it overlapping ranges and it will believe them.
import { TOPIC_FULFILLED } from "../config/history";
import type { HolderEvent } from "../entitlement/entitlement";
import { decodeDepositLog } from "./apy";
import { dataWord, type RawLog } from "./logScan";

// Mint from, and burn to.
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// The three scans a wallet's history is read from, raw and undecoded.
//
// Which of them the scan filtered is this module's business only as a cost:
// every kind is narrowed to the wallet again here, so a product-wide list and a
// wallet-filtered one produce the same history. `deposits` carries `Deposit` and
// `DepositRefunded` together — one range, as stage 1 already scans them — and
// the refunds are ignored below.
export interface HistoryLogs {
  deposits: readonly RawLog[];
  transfers: readonly RawLog[];
  fills: readonly RawLog[];
}

// What the chain answered for the transfer blocks — see `transferReads`. Keyed
// by block number: a block has one timestamp, and `getRateInQuote(want)` at a
// block has one value.
export interface HistoryReads {
  blockTimes: ReadonlyMap<bigint, number>;
  rates: ReadonlyMap<bigint, bigint>;
}

// The reads one wallet's logs need before they can be replayed, in chain order.
// Block numbers both — unlike `HistoryReads.rates`, which holds the rates those
// reads came back with.
//
// `dateBlocks` is one `eth_getBlockByNumber` per DISTINCT block carrying a
// transfer this wallet is a party to; `rateBlocks` is one archive `eth_call` to
// the UNGUARDED `getRateInQuote(want)` per TRANSFER-IN, as the ledger makes it
// — unguarded so a transfer received during a past pause stays readable. Only
// transfers IN need one: a rate is a received lot's entry price, and shares
// leaving carry none. A block repeats in `rateBlocks` when one block brought
// the wallet two of them, so the list is also the cost.
//
// Every one of them must land: a history missing a transfer-in is the
// over-quoting kind of wrong, so the scan is all-or-nothing.
export interface TransferReads {
  dateBlocks: bigint[];
  rateBlocks: bigint[];
}

// An indexed address is right-aligned in its 32-byte topic (as ./apy.ts reads
// them). Lowercased: the same address arrives spelled both ways.
const topicAddress = (topic: string): string => `0x${topic.slice(-40)}`.toLowerCase();

// The share leg a fill moves, keyed by the pair it belongs to.
const legKey = (transactionHash: string, holder: string): string =>
  `${transactionHash.toLowerCase()}|${holder.toLowerCase()}`;

const chainOrder = (a: RawLog, b: RawLog): number => {
  const byBlock = BigInt(a.blockNumber) - BigInt(b.blockNumber);
  if (byBlock !== 0n) return byBlock < 0n ? -1 : 1;
  return Number(BigInt(a.logIndex) - BigInt(b.logIndex));
};

// One share movement this wallet is a party to — a Transfer log that survived
// the exclusions, decoded once.
interface Movement {
  log: RawLog;
  block: bigint;
  // A wallet transferring to itself is both, and so gets both legs.
  sent: boolean;
  received: boolean;
  shares: bigint;
}

// Which transfers are this wallet's, in one place, so the phase that decides
// what to read and the phase that replays cannot disagree. Two implementations
// of "which transfers count" is a history that quietly needs a rate it never
// fetched.
function movements(logs: HistoryLogs, holder: string): Movement[] {
  const legs = new Set(
    logs.fills.map((log) => legKey(log.transactionHash, topicAddress(log.topics[1])))
  );
  const kept: Movement[] = [];

  for (const log of [...logs.transfers].sort(chainOrder)) {
    const from = topicAddress(log.topics[1]);
    const to = topicAddress(log.topics[2]);
    // A mint is the deposit's own share issue and the `Deposit` log is the lot;
    // a burn — a fill's redemption, or a refund's exit — is not a movement
    // between holders, and a fill has its own event.
    if (from === ZERO_ADDRESS || to === ZERO_ADDRESS) continue;
    // This holder's own share leg of a fill in this transaction. The fill is the
    // event; counting the leg too would spend the lots twice.
    if (legs.has(legKey(log.transactionHash, from))) continue;
    if (from !== holder && to !== holder) continue;
    kept.push({
      log,
      block: BigInt(log.blockNumber),
      sent: from === holder,
      received: to === holder,
      shares: dataWord(log.data, 0),
    });
  }
  return kept;
}

export function transferReads(logs: HistoryLogs, wallet: string): TransferReads {
  const kept = movements(logs, wallet.toLowerCase());
  const dateBlocks: bigint[] = [];
  for (const movement of kept) {
    if (dateBlocks[dateBlocks.length - 1] !== movement.block) dateBlocks.push(movement.block);
  }
  return {
    dateBlocks,
    rateBlocks: kept.filter((movement) => movement.received).map((movement) => movement.block),
  };
}

/**
 * THE HOLDER HISTORY — one wallet's event list in one product, in chain order,
 * which is the shape the vendored rule takes (CONTEXT.md).
 *
 * Empty for a wallet the logs never mention, and that is a real answer rather
 * than a gap: a wallet that never deposited and never received a share has no
 * lots, and the rule prices its whole balance as one vested residual lot.
 *
 * Throws when one of the wallet's transfers has no timestamp or no rate — that
 * is a scan that lost one of its second-phase reads, and half a history must
 * never reach the entitlement rule.
 */
export function holderHistory(
  logs: HistoryLogs,
  reads: HistoryReads,
  wallet: string
): HolderEvent[] {
  const holder = wallet.toLowerCase();
  const history: HolderEvent[] = [];

  // The chain's own order across the three kinds. The scans hand back three
  // separate streams, each sorted within itself; a lot deposited after a
  // transfer was spent is a different history from one deposited before it.
  // Each transfer travels with the movement it was decoded into, so the walk
  // below never has to find its way back from a log to that decoding.
  const ordered: { log: RawLog; movement?: Movement }[] = [
    ...logs.deposits.map((log) => ({ log })),
    ...movements(logs, holder).map((movement) => ({ log: movement.log, movement })),
    ...logs.fills.map((log) => ({ log })),
  ].sort((a, b) => chainOrder(a.log, b.log));

  for (const { log, movement } of ordered) {
    if (movement) {
      const t = reads.blockTimes.get(movement.block);
      if (t === undefined) {
        throw new Error(`block ${movement.block} cannot be dated — its share transfer is unread`);
      }
      // Shares out spend the oldest lots, exactly as a fill does; shares in
      // start a fresh unvested lot at what a whole share was worth in this
      // block. A transfer to oneself is both, in that order.
      if (movement.sent) history.push({ kind: "transfer-out", t, shares: movement.shares });
      if (movement.received) {
        const rate = reads.rates.get(movement.block);
        if (rate === undefined) {
          throw new Error(
            `no rate at block ${movement.block} — a transfer-in lot has no entry price`
          );
        }
        history.push({ kind: "transfer-in", t, shares: movement.shares, rate });
      }
    } else if (log.topics[0].toLowerCase() === TOPIC_FULFILLED) {
      // AtomicRequestFulfilled(user*, offerToken*, wantToken*, offerAmountSpent,
      // wantAmountReceived, timestamp) — the shares the solver already redeemed.
      if (topicAddress(log.topics[1]) !== holder) continue;
      history.push({
        kind: "fill",
        t: Number(dataWord(log.data, 2)),
        shares: dataWord(log.data, 0),
      });
    } else {
      // The Teller scan carries both its events; the same decoder serves the
      // average deposit cost, which excludes what this deliberately keeps.
      const deposit = decodeDepositLog(log);
      if (deposit.kind === "refund") continue;
      // Deposit's `receiver` and DepositRefunded's `user` are both topics[2].
      if (topicAddress(log.topics[2]) !== holder) continue;
      history.push({
        kind: "deposit",
        // The LOT'S clock, not the block's: `depositTimestamp` is what the
        // vesting term is measured from.
        t: deposit.depositTimestamp,
        shares: deposit.shareAmount,
        assets: deposit.depositAmount,
      });
    }
  }

  return history;
}
