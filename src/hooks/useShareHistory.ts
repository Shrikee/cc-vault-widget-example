import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";

import { CHAIN_ID, CONTRACTS } from "../config/vault";
import {
  BLOCKS_30D,
  TOPIC_EXCHANGE_RATE_UPDATED,
  historyChunksInFlight,
} from "../config/history";
import { errorMessage, scanLogs } from "../lib/logScan";
import { decodeSharePriceUpdate, type SharePriceUpdate } from "../lib/apy";

// The share-price history behind the realised trailing APY: every share-price
// update the accountant posted in the last 30 days.
//
// Fetched ONCE per page load and never re-scanned — the operator updates the
// share price about twice a day, and the live end of the figure (the share
// price itself) comes from useVaultMetrics' 45 s poll, so a re-scan would buy
// nothing. In memory only; a reload scans again.

export interface ShareHistory {
  status: "loading" | "ready" | "error";
  events: SharePriceUpdate[];
  error?: string;
}

export function useShareHistory(): ShareHistory {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [history, setHistory] = useState<ShareHistory>({
    status: "loading",
    events: [],
  });
  const scanned = useRef(false);

  useEffect(() => {
    if (!client || scanned.current) return;
    // One scan per page load — also what keeps StrictMode's second mount from
    // scanning again in development.
    scanned.current = true;
    const chunksInFlight = historyChunksInFlight();

    (async () => {
      const latest = await client.getBlockNumber();
      const span = BigInt(BLOCKS_30D);
      // Flat 30-day span, no branching on the vault's age: chunks that predate
      // deployment simply return no logs.
      const from = latest > span ? latest - span : 0n;
      const logs = await scanLogs({
        client,
        address: CONTRACTS.accountant,
        topics: [TOPIC_EXCHANGE_RATE_UPDATED],
        fromBlock: from,
        toBlock: latest,
        chunksInFlight,
      });
      setHistory({ status: "ready", events: logs.map(decodeSharePriceUpdate) });
    })().catch((e) => {
      setHistory({ status: "error", events: [], error: errorMessage(e) });
    });
  }, [client]);

  return history;
}
