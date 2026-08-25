import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { usePublicClient } from "wagmi";

import { CHAIN_ID, CONTRACTS, DEPOSIT_TOKENS } from "../config/vault";
import {
  DEPLOY_BLOCKS,
  TOPIC_DEPOSIT,
  TOPIC_DEPOSIT_REFUNDED,
  historyChunksInFlight,
} from "../config/history";
import { decodeDepositLog, reconstructDeposits, type DepositLog } from "../lib/apy";
import { scanLogs } from "../lib/logScan";

// A connected wallet's deposit history — the average deposit cost behind the
// earnings sub-line.
//
// Scanned ONCE per wallet, from the Teller's deployment block, filtered to the
// wallet: 44 chunks today, growing ~22 a month. Two things keep that bearable.
// A wallet whose share-unlock time is 0 has never deposited, so it needs no
// scan at all; and the average deposit cost only ever changes when the wallet
// itself deposits, so the only refresh is a one-chunk tail scan after its own
// deposit succeeds. Fills, redemptions and transfers move the share balance,
// never the average deposit cost, so they need no re-scan. Never polled.

export interface DepositHistoryState {
  status: "idle" | "none" | "loading" | "ready" | "error";
  // Average deposit cost: base asset paid per CCUSD, across surviving deposits.
  avgCost?: number;
  deposited?: number;
  sharesMinted?: number;
  // The block the scan reached — where a tail scan picks up.
  lastScannedBlock?: bigint;
  error?: string;
}

export interface DepositHistory extends DepositHistoryState {
  // Fold in everything since lastScannedBlock. Called after the user's own
  // deposit succeeds, never on a timer.
  refetchTail: () => void;
}

// DEPOSIT_TOKENS' decimals, keyed by lowercased address: the log carries the
// deposit asset, and its amount is in that asset's decimals.
const DEPOSIT_DECIMALS: Record<string, number> = Object.fromEntries(
  DEPOSIT_TOKENS.map((token) => [token.address.toLowerCase(), token.decimals])
);

// The wallet is topics[2] of both events (Deposit.receiver, DepositRefunded
// .user), left-padded to a 32-byte word.
function pad32(address: string): Hex {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

// Prefer what the provider itself said over viem's generic classification —
// the operator can act on "Archive requests require a personal token".
function errorMessage(e: unknown): string {
  if (typeof e === "object" && e !== null) {
    const err = e as { details?: string; shortMessage?: string; message?: string };
    return err.details || err.shortMessage || err.message || String(e);
  }
  return String(e);
}

function summarise(logs: DepositLog[], lastScannedBlock: bigint): DepositHistoryState {
  // Recomputed over every log the wallet has, not folded into running sums: a
  // refund scanned later cancels a deposit counted earlier.
  const totals = reconstructDeposits(logs, DEPOSIT_DECIMALS);
  if (totals.avgCost === null) return { status: "none", lastScannedBlock };
  return {
    status: "ready",
    avgCost: totals.avgCost,
    deposited: totals.deposited,
    sharesMinted: totals.sharesMinted,
    lastScannedBlock,
  };
}

export function useDepositHistory(
  address?: string,
  unlockAt?: number | null
): DepositHistory {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [state, setState] = useState<DepositHistoryState>({ status: "idle" });

  // Scan bookkeeping lives in refs, so refetchTail keeps a stable identity and
  // a scan that is overtaken by a wallet switch can tell and drop its result.
  const scannedKey = useRef<string | null>(null);
  const logs = useRef<DepositLog[]>([]);
  const lastScanned = useRef<bigint | null>(null);
  const tailRunning = useRef(false);

  useEffect(() => {
    // Precondition: a connected wallet and a resolved share-unlock time.
    if (!client || !address || unlockAt === null || unlockAt === undefined) {
      scannedKey.current = null;
      logs.current = [];
      lastScanned.current = null;
      setState({ status: "idle" });
      return;
    }

    // One scan per wallet. The unlock time enters the key only across the zero
    // boundary: a wallet that had never deposited and now has must be scanned,
    // while every later deposit moves the unlock time without invalidating the
    // scan — refetchTail covers those.
    const key = `${address.toLowerCase()}:${unlockAt === 0 ? "never" : "deposited"}`;
    if (scannedKey.current === key) return;
    scannedKey.current = key;
    logs.current = [];
    lastScanned.current = null;

    // shareUnlockTime === 0 ⇒ this wallet has never deposited ⇒ no scan at all,
    // and the sub-line says so directly.
    if (unlockAt === 0) {
      setState({ status: "none" });
      return;
    }

    setState({ status: "loading" });
    (async () => {
      const latest = await client.getBlockNumber();
      const raw = await scanLogs({
        client,
        address: CONTRACTS.teller,
        // Both event types in one request per chunk — the wallet sits at the
        // same topic index in each.
        topics: [[TOPIC_DEPOSIT, TOPIC_DEPOSIT_REFUNDED], null, pad32(address)],
        fromBlock: BigInt(DEPLOY_BLOCKS.teller),
        toBlock: latest,
        chunksInFlight: historyChunksInFlight(),
      });
      if (scannedKey.current !== key) return; // another wallet took over
      logs.current = raw.map(decodeDepositLog);
      lastScanned.current = latest;
      setState(summarise(logs.current, latest));
    })().catch((e) => {
      if (scannedKey.current !== key) return;
      // No retry and no partial data: a dropped chunk would hide deposits and
      // overstate the earnings.
      lastScanned.current = null;
      setState({ status: "error", error: errorMessage(e) });
    });
  }, [client, address, unlockAt]);

  const refetchTail = useCallback(() => {
    const from = lastScanned.current;
    const key = scannedKey.current;
    // Nothing scanned yet — a never-deposited wallet, or a scan that failed.
    // The wallet's first deposit is picked up by the full scan the effect runs
    // once the share-unlock time turns non-zero.
    if (!client || !address || from === null || key === null) return;
    if (tailRunning.current) return;
    tailRunning.current = true;

    (async () => {
      const latest = await client.getBlockNumber();
      if (latest <= from) return;
      const raw = await scanLogs({
        client,
        address: CONTRACTS.teller,
        topics: [[TOPIC_DEPOSIT, TOPIC_DEPOSIT_REFUNDED], null, pad32(address)],
        fromBlock: from + 1n,
        toBlock: latest,
        chunksInFlight: historyChunksInFlight(),
      });
      if (scannedKey.current !== key) return;
      logs.current = [...logs.current, ...raw.map(decodeDepositLog)];
      lastScanned.current = latest;
      setState(summarise(logs.current, latest));
    })()
      .catch((e) => {
        if (scannedKey.current !== key) return;
        lastScanned.current = null;
        setState({ status: "error", error: errorMessage(e) });
      })
      .finally(() => {
        tailRunning.current = false;
      });
  }, [client, address]);

  return { ...state, refetchTail };
}
