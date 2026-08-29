import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";

import { CHAIN_ID } from "../config/chain";
import {
  BLOCKS_30D,
  TOPIC_EXCHANGE_RATE_UPDATED,
  historyChunksInFlight,
} from "../config/history";
import { errorMessage, scanLogs } from "../lib/logScan";
import { decodeSharePriceUpdate, type SharePriceUpdate } from "../lib/apy";
import type { Vault } from "../lib/vaultRegistry";

// The share-price history behind the realised trailing APY: every share-price
// update the accountant posted in the last 30 days.
//
// Scanned ONCE per product per page load and never re-scanned — the operator
// updates the share price about twice a day, and the live end of the figure
// (the share price itself) comes from useVaultMetrics' 45 s poll, so a re-scan
// would buy nothing. In memory only; a reload scans again.

export interface ShareHistory {
  status: "loading" | "ready" | "error";
  events: SharePriceUpdate[];
  error?: string;
}

export function useShareHistory(vault: Vault): ShareHistory {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [history, setHistory] = useState<ShareHistory>({
    status: "loading",
    events: [],
  });
  // Which product has been scanned, rather than whether one has: the events are
  // one accountant's, so they answer for that product and no other.
  const scanned = useRef<string | null>(null);

  useEffect(() => {
    if (!client || scanned.current === vault.id) return;
    // One scan per product per page load — also what keeps StrictMode's second
    // mount from scanning again in development.
    const scanning = vault.id;
    scanned.current = scanning;
    const chunksInFlight = historyChunksInFlight();
    setHistory({ status: "loading", events: [] });

    (async () => {
      const latest = await client.getBlockNumber();
      const span = BigInt(BLOCKS_30D);
      // Flat 30-day span, no branching on the vault's age: chunks that predate
      // deployment simply return no logs.
      const from = latest > span ? latest - span : 0n;
      const logs = await scanLogs({
        client,
        address: vault.addresses.accountant,
        topics: [TOPIC_EXCHANGE_RATE_UPDATED],
        fromBlock: from,
        toBlock: latest,
        chunksInFlight,
      });
      // A scan the selected product moved on from answers for a vault nobody
      // is looking at any more.
      if (scanned.current !== scanning) return;
      setHistory({ status: "ready", events: logs.map(decodeSharePriceUpdate) });
    })().catch((e) => {
      if (scanned.current !== scanning) return;
      setHistory({ status: "error", events: [], error: errorMessage(e) });
    });
  }, [client, vault]);

  return history;
}
