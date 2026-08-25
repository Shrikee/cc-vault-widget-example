import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";

import { CHAIN_ID, CONTRACTS } from "../config/vault";
import {
  BLOCKS_30D,
  SHARE_PRICE_UNIT,
  TOPIC_EXCHANGE_RATE_UPDATED,
  historyChunksInFlight,
} from "../config/history";
import { scanLogs, type RawLog } from "../lib/logScan";
import type { RateEvent } from "../lib/apy";

// The share-price history behind the realised trailing APY: every
// ExchangeRateUpdated the accountant emitted in the last 30 days.
//
// Fetched ONCE per page load and never re-scanned — the operator updates the
// rate about twice a day, and the live end of the figure (the share price
// itself) comes from useVaultMetrics' 45 s poll, so a re-scan would buy
// nothing. In memory only; a reload scans again.

export interface ShareHistory {
  status: "loading" | "ready" | "error";
  events: RateEvent[];
  error?: string;
}

// ExchangeRateUpdated(uint96 oldRate, uint96 newRate, uint64 currentTime) —
// none of the three is indexed, so the data field is exactly three words.
function decodeRateEvent(log: RawLog): RateEvent {
  const body = log.data.slice(2);
  if (body.length < 192) {
    throw new Error("Malformed ExchangeRateUpdated log");
  }
  const word = (i: number) => BigInt(`0x${body.slice(i * 64, (i + 1) * 64)}`);
  return {
    block: Number(log.blockNumber),
    logIndex: Number(log.logIndex),
    time: Number(word(2)),
    // uint96 base-asset units (USDT, 6 dp) → share price, e.g. 1.001004.
    oldRate: Number(word(0)) / SHARE_PRICE_UNIT,
    newRate: Number(word(1)) / SHARE_PRICE_UNIT,
  };
}

// Prefer what the provider itself said (viem keeps it in `details`) over
// viem's generic classification — "Archive requests require a personal token"
// tells the operator what to fix; "Invalid parameters" does not.
function errorMessage(e: unknown): string {
  if (typeof e === "object" && e !== null) {
    const err = e as { details?: string; shortMessage?: string; message?: string };
    return err.details || err.shortMessage || err.message || String(e);
  }
  return String(e);
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
      setHistory({ status: "ready", events: logs.map(decodeRateEvent) });
    })().catch((e) => {
      setHistory({ status: "error", events: [], error: errorMessage(e) });
    });
  }, [client]);

  return history;
}
