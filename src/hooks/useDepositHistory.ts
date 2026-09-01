import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";

import { CHAIN_ID } from "../config/chain";
import type { HolderEvent } from "../entitlement/entitlement";
import { errorMessage } from "../lib/logScan";
import {
  depositScanRange,
  planWalletScan,
  type DepositScanInput,
  type DepositScanPlan,
} from "../lib/scanPlan";
import type { Vault } from "../lib/vaultRegistry";
import {
  NO_WALLET_SCAN,
  deriveWallet,
  readWalletScan,
  type WalletScan,
} from "../lib/walletScan";
import {
  NO_SCANS,
  abandonScan,
  forgetScans,
  isCurrent,
  requestTail,
  scanKey,
  settleScan,
  startScan,
  type ScanRun,
  type ScanRuns,
} from "../lib/scanRuns";

// A connected wallet's history in ONE product — the average deposit cost behind
// that product's earnings sub-line, and, where the product prices an early exit
// against the holder's entitlement, the holder history that ceiling is computed
// from (spec, "The holder-history read").
//
// Scanned ONCE per wallet per product, from that product's LEDGER FLOOR,
// filtered to the wallet: 94 chunks on the 24h product today and 43 on the 30d
// one — times the three ranges a vesting-gap product reads per chunk, which is
// the whole price of pricing an early exit. Unlike the share-price scan it has
// no window to clamp to — an average deposit cost is over ALL of a wallet's
// deposits, and a holder's lots go back to its first — so it grows with the
// product's age, by ~173 chunks a month at Polygon's block rate. Three things
// keep that bearable.
// A wallet that holds none of a product has nothing to compute there, so there
// is nothing to scan for — whether it never deposited or has since exited the
// whole position (src/lib/scanPlan.ts decides which, because the two say
// different things under the position value). Neither figure moves on its own:
// the average deposit cost only ever changes when the wallet itself deposits,
// so the only refresh is a one-chunk tail scan after its own deposit succeeds,
// and what the tail misses — a transfer in, a fill — the entitlement rule
// reconciles conservatively until the confirm step's own tail closes the gap.
// Never polled.
//
// ONE SCAN, NOT TWO. The two figures are two DERIVATIONS over the same raw
// logs, held once (src/lib/walletScan.ts): the average deposit cost excludes a
// refunded deposit and the holder history keeps the lot, and that divergence
// belongs to the derivations rather than to anything the scan hands them.
//
// Which scan may run and which may commit is decided by src/lib/scanRuns.ts —
// a pure reducer the vectors pin (a wallet switch overtaking a scan, a tail
// asked for mid-scan, a failure that must stay recoverable). This hook holds
// the network side and does what it says. Its key is the wallet IN THIS
// PRODUCT, so the other product's scan can never satisfy this one's
// precondition and report its earnings here.

export interface DepositHistoryState {
  // "none" is a wallet with no average deposit cost in this product — one that
  // never deposited, or whose only deposits were refunded; "no-shares" is one
  // that holds none of it now, named for the plan it comes from
  // (src/lib/scanPlan.ts). Both mean no earnings figure, and they are kept
  // apart because the sub-line under the position value says something
  // different about each (spec §6.4). A "none" wallet can still have a scan and
  // a history: on a vesting-gap product a transfer recipient is exactly that.
  status: "idle" | "none" | "no-shares" | "loading" | "ready" | "error";
  // Average deposit cost: base asset paid per CCUSD, across surviving deposits.
  avgCost?: number;
  deposited?: number;
  sharesMinted?: number;
  // The solver's own holder history for this wallet, in chain order — what the
  // entitlement ceiling is computed from, and what the quote card and the
  // request row price against. Present once a vesting-gap product's scan has
  // landed, whatever the earnings figure came to; never on a product with no
  // vesting gap, where nothing prices an exit against a ceiling.
  history?: HolderEvent[];
  // The block the scan reached — where a tail scan picks up.
  lastScannedBlock?: bigint;
  error?: string;
}

export interface DepositHistory extends DepositHistoryState {
  // Fold in everything since the last scanned block. Called after the user's
  // own deposit succeeds, never on a timer.
  refetchTail: () => void;
}

function summarise(
  scan: WalletScan,
  vault: Vault,
  wallet: string,
  lastScannedBlock: bigint
): DepositHistoryState {
  // Recomputed over every log the wallet has, not folded into running sums: a
  // refund scanned later cancels a deposit counted earlier, and a transfer a
  // tail brings back belongs in the middle of a history rather than at its end.
  const { depositCost, history } = deriveWallet(scan, vault, wallet);
  if (depositCost.avgCost === null) return { status: "none", history, lastScannedBlock };
  return {
    status: "ready",
    avgCost: depositCost.avgCost,
    deposited: depositCost.deposited,
    sharesMinted: depositCost.sharesMinted,
    history,
    lastScannedBlock,
  };
}

// What the scan is planned from — the wallet's holding in THIS product. A
// UserPosition is one; the hook takes only what it plans with, so the read it
// comes from is free to change around it. The two figures the plan is made of
// are the planner's own type, stated once there.
export interface DepositScanPosition extends DepositScanInput {
  // Why the position is unknown, when it is. It is the scan's precondition, and
  // without it there is no telling a never-deposited wallet from a depositor —
  // so the sub-line reports the failure instead of waiting on "…" for a value
  // that is not coming (spec §6.4).
  error: string | null;
}

// What no scan means on screen. Every one of these says "nothing is coming",
// which is why they are settled here rather than left as a spinner: only
// "unresolved" is still on its way.
const NOT_SCANNED = {
  // Still reading the position — including right after an address change, when
  // the previous wallet's value must not be used (spec §5.5).
  unresolved: { status: "idle" },
  // This wallet has never deposited into this product — and, where a vesting gap
  // prices exits, holds none of it either, since there a transferred-in balance
  // is worth a scan on its own (src/lib/scanPlan.ts). No average deposit cost
  // and no lot to price, so the sub-line says so directly. Nothing to tail
  // either: its first deposit turns the unlock time non-zero, which brings the
  // effect back here for the full scan — as does a balance arriving by transfer,
  // on the products whose gate reads the balance.
  "never-deposited": { status: "none" },
  // It deposited and has since exited the whole position. Its earnings are
  // $0.00 whatever it paid, and it holds nothing to redeem, so the position
  // card shows no sub-line and the history behind that figure is never read. A
  // later deposit moves the balance off zero and brings the effect back here.
  "no-shares": { status: "no-shares" },
} as const satisfies Record<Exclude<DepositScanPlan, "scan">, DepositHistoryState>;

export function useDepositHistory(
  vault: Vault,
  address: string | undefined,
  position: DepositScanPosition
): DepositHistory {
  const { shares, unlockAt, error: positionError } = position;
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [state, setState] = useState<DepositHistoryState>({ status: "idle" });

  // Scan bookkeeping and what it folds live in refs, so refetchTail keeps a
  // stable identity and a run overtaken by a wallet switch can tell that its
  // result is no longer wanted.
  const runs = useRef<ScanRuns>(NO_SCANS);
  // The raw logs, held ONCE, with what the chain answered for the transfer
  // blocks among them. Both figures are derived from this and neither is stored
  // beside it.
  const scanned = useRef<WalletScan>(NO_WALLET_SCAN);
  // The wallet-in-product the precondition currently holds for — what a tail
  // scans. null while there is nothing to scan (no wallet, or one holding none
  // of this product).
  const walletKey = useRef<string | null>(null);

  const forget = useCallback(() => {
    walletKey.current = null;
    runs.current = forgetScans(runs.current);
    scanned.current = NO_WALLET_SCAN;
  }, []);

  // Perform one run, then do whatever settling it says to do next (the tail a
  // deposit asked for while this scan was still in flight).
  const runScan = useCallback(
    function perform(scan: ScanRun): void {
      if (!client || !address) return;
      (async () => {
        const latest = await client.getBlockNumber();
        // A full run reads from this product's ledger floor, a tail from the
        // cursor the reducer handed it. The span is asked for here because the
        // BOOKKEEPING needs it — whether the chain moved at all, and where the
        // cursor lands; the ranges read over it are the planner's own, spelled
        // once there and issued by src/lib/walletScan.ts.
        const { from, to } = depositScanRange({
          vault,
          resumeFrom: scan.from,
          head: latest,
        });
        // A tail with nothing new to read: the chain has not moved past the
        // cursor since the last scan.
        const nothingNew = from > to;
        // A full scan replaces what was held; a tail folds in.
        const held = scan.kind === "full" ? null : scanned.current;
        const found = nothingNew
          ? (held ?? NO_WALLET_SCAN)
          : await readWalletScan({
              client,
              vault,
              wallet: address,
              resumeFrom: scan.from,
              head: latest,
              held,
            });
        if (!isCurrent(runs.current, scan)) return; // overtaken — drop it

        // Either way the figures are recomputed over the whole set, and a nonce
        // already counted is not counted twice.
        const cursor = nothingNew ? (runs.current.cursor ?? to) : to;
        const next = summarise(found, vault, address, cursor);

        scanned.current = found;
        const step = settleScan(runs.current, scan, cursor);
        runs.current = step.runs;
        setState(next);
        if (step.run) perform(step.run);
      })().catch((e) => {
        if (!isCurrent(runs.current, scan)) return;
        // No retry and no partial data: a dropped chunk would hide deposits and
        // overstate the earnings, and a transfer left undated or unrated would
        // quote an unvested lot at the full share price. That is why the second
        // phase is all-or-nothing too. A failed full scan leaves nothing behind
        // (the reducer clears its cursor and key), so the next legitimate
        // trigger — this wallet's own deposit, or an address change — can scan
        // again; a failed tail keeps everything up to its cursor.
        if (scan.kind === "full") scanned.current = NO_WALLET_SCAN;
        const step = abandonScan(runs.current, scan);
        runs.current = step.runs;
        setState({ status: "error", error: errorMessage(e) });
        if (step.run) perform(step.run);
      });
    },
    [client, vault, address]
  );

  useEffect(() => {
    // Precondition: a connected wallet and a resolved position to plan from.
    if (!client || !address) {
      forget();
      setState({ status: "idle" });
      return;
    }
    if (positionError) {
      forget();
      setState({ status: "error", error: positionError });
      return;
    }

    // Whether this wallet's history in this product is worth reading at all is
    // src/lib/scanPlan.ts's decision — `shares > 0` where a vesting gap prices
    // exits, stage 1's gate everywhere else — and the skip belongs HERE, inside
    // the scan: the roster is read in full on every render (useProductReads),
    // and filtering it to the products a wallet holds would change how many
    // hooks run between renders. What the balance decides is whether requests
    // are issued, never how many hooks there are.
    const plan = planWalletScan({ vault, shares, unlockAt });
    if (plan !== "scan") {
      forget();
      setState(NOT_SCANNED[plan]);
      return;
    }

    // Keyed by the product as well as the wallet: this hook is mounted once per
    // product, so the 24h scan's state must never answer for the 30d one — and
    // a hook instance handed a different vault must scan again rather than
    // report the other product's average deposit cost as this one's.
    const key = scanKey(vault.id, address);
    walletKey.current = key;
    const step = startScan(runs.current, key);
    runs.current = step.runs;
    // Already scanned, or being scanned: every later deposit moves the unlock
    // time without invalidating the scan, and refetchTail covers those.
    if (!step.run) return;

    scanned.current = NO_WALLET_SCAN;
    setState({ status: "loading" });
    runScan(step.run);
  }, [client, vault, address, shares, unlockAt, positionError, forget, runScan]);

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
      scanned.current = NO_WALLET_SCAN;
      setState({ status: "loading" });
    }
    runScan(step.run);
  }, [client, address, runScan]);

  return { ...state, refetchTail };
}
