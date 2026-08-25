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
import { errorMessage, scanLogs } from "../lib/logScan";
import {
  NO_SCANS,
  abandonScan,
  forgetScans,
  isCurrent,
  requestTail,
  settleScan,
  startScan,
  type ScanRun,
  type ScanRuns,
} from "../lib/scanRuns";

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
//
// Which scan may run and which may commit is decided by src/lib/scanRuns.ts —
// a pure reducer the vectors pin (a wallet switch overtaking a scan, a tail
// asked for mid-scan, a failure that must stay recoverable). This hook holds
// the network side and does what it says.

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
  // Fold in everything since the last scanned block. Called after the user's
  // own deposit succeeds, never on a timer.
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

// The wallet's Teller logs over one block range. Both event types come back
// from a single request per chunk, because the wallet sits at the same topic
// index in each.
function scanWallet(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  wallet: string,
  fromBlock: bigint,
  toBlock: bigint
) {
  return scanLogs({
    client,
    address: CONTRACTS.teller,
    topics: [[TOPIC_DEPOSIT, TOPIC_DEPOSIT_REFUNDED], null, pad32(wallet)],
    fromBlock,
    toBlock,
    chunksInFlight: historyChunksInFlight(),
  });
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
  unlockAt?: number | null,
  // Why the share-unlock time is unknown, when it is. That time is the scan's
  // precondition, and without it there is no telling a never-deposited wallet
  // from a depositor — so the sub-line reports the failure instead of waiting
  // on "…" for a value that is not coming (spec §6.4).
  unlockError?: string | null
): DepositHistory {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [state, setState] = useState<DepositHistoryState>({ status: "idle" });

  // Scan bookkeeping and the logs it folds live in refs, so refetchTail keeps a
  // stable identity and a run overtaken by a wallet switch can tell that its
  // result is no longer wanted.
  const runs = useRef<ScanRuns>(NO_SCANS);
  const logs = useRef<DepositLog[]>([]);
  // The wallet the precondition currently holds for — what a tail scans. null
  // while there is nothing to scan (no wallet, or one that never deposited).
  const walletKey = useRef<string | null>(null);

  const forget = useCallback(() => {
    walletKey.current = null;
    runs.current = forgetScans(runs.current);
    logs.current = [];
  }, []);

  // Perform one run, then do whatever settling it says to do next (the tail a
  // deposit asked for while this scan was still in flight).
  const runScan = useCallback(
    function perform(scan: ScanRun): void {
      if (!client || !address) return;
      (async () => {
        const latest = await client.getBlockNumber();
        const from = scan.from ?? BigInt(DEPLOY_BLOCKS.teller);
        // A tail with nothing new to read: the chain has not moved past the
        // cursor since the last scan.
        const raw = from > latest ? [] : await scanWallet(client, address, from, latest);
        if (!isCurrent(runs.current, scan)) return; // overtaken — drop it

        const found = raw.map(decodeDepositLog);
        // A full scan replaces what was held; a tail folds in. Either way the
        // sums are recomputed over the whole set, and a nonce already counted
        // is not counted twice.
        const folded = scan.kind === "full" ? found : [...logs.current, ...found];
        const cursor = from > latest ? (runs.current.cursor ?? latest) : latest;
        const next = summarise(folded, cursor);

        logs.current = folded;
        const step = settleScan(runs.current, scan, cursor);
        runs.current = step.runs;
        setState(next);
        if (step.run) perform(step.run);
      })().catch((e) => {
        if (!isCurrent(runs.current, scan)) return;
        // No retry and no partial data: a dropped chunk would hide deposits
        // and overstate the earnings. A failed full scan leaves nothing behind
        // (the reducer clears its cursor and key), so the next legitimate
        // trigger — this wallet's own deposit, or an address change — can scan
        // again; a failed tail keeps everything up to its cursor.
        if (scan.kind === "full") logs.current = [];
        const step = abandonScan(runs.current, scan);
        runs.current = step.runs;
        setState({ status: "error", error: errorMessage(e) });
        if (step.run) perform(step.run);
      });
    },
    [client, address]
  );

  useEffect(() => {
    // Precondition: a connected wallet and a resolved share-unlock time.
    if (!client || !address) {
      forget();
      setState({ status: "idle" });
      return;
    }
    if (unlockError) {
      forget();
      setState({ status: "error", error: unlockError });
      return;
    }
    if (unlockAt === null || unlockAt === undefined) {
      // Still reading it — including right after an address change, when the
      // previous wallet's value must not be used (spec §5.5).
      forget();
      setState({ status: "idle" });
      return;
    }

    // shareUnlockTime === 0 ⇒ this wallet has never deposited ⇒ no scan at all,
    // and the sub-line says so directly. Nothing to tail either: its first
    // deposit turns the unlock time non-zero, which brings the effect back here
    // for the full scan.
    if (unlockAt === 0) {
      forget();
      setState({ status: "none" });
      return;
    }

    const key = address.toLowerCase();
    walletKey.current = key;
    const step = startScan(runs.current, key);
    runs.current = step.runs;
    // Already scanned, or being scanned: every later deposit moves the unlock
    // time without invalidating the scan, and refetchTail covers those.
    if (!step.run) return;

    logs.current = [];
    setState({ status: "loading" });
    runScan(step.run);
  }, [client, address, unlockAt, unlockError, forget, runScan]);

  const refetchTail = useCallback(() => {
    const key = walletKey.current;
    if (!client || !address || key === null) return;
    const step = requestTail(runs.current, key);
    runs.current = step.runs;
    // Queued behind a scan still in flight; it runs when that one settles.
    if (!step.run) return;
    // Nothing left to resume from — a scan that failed. The wallet is scanned
    // from the start again, which is why the figure goes back to loading.
    if (step.run.kind === "full") {
      logs.current = [];
      setState({ status: "loading" });
    }
    runScan(step.run);
  }, [client, address, runScan]);

  return { ...state, refetchTail };
}
