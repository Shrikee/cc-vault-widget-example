import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";

import { CHAIN_ID } from "../config/chain";
import { TOPIC_EXCHANGE_RATE_UPDATED } from "../config/history";
import { errorMessage, scanLogs } from "../lib/logScan";
import {
  planSharePriceScan,
  scanWindowDays,
  widenCovered,
  type BlockRange,
} from "../lib/scanPlan";
import { decodeSharePriceUpdate, type SharePriceUpdate } from "../lib/apy";
import type { Vault } from "../lib/vaultRegistry";

// The share-price history behind the realised trailing APY: the share-price
// updates this product's accountant posted over the window the page needs.
//
// How wide that window is depends on whether the product is SELECTED, and that
// is the whole reason this hook takes a boolean it never renders. The selected
// product's stats card offers every trailing window, so it needs the widest;
// the other product appears once, as a chip carrying its headline APY, so seven
// days of history is all its figure is computed from — a quarter of the
// requests. Which blocks that comes to is src/lib/scanPlan.ts's decision,
// clamped there to the accountant's own deployment.
//
// Scanned ONCE per product per page load, and WIDENED once when a product is
// selected — the blocks the held history does not reach, never the whole span
// again. Nothing else re-scans: the operator updates the share price about
// twice a day, and the live end of the figure (the share price itself) comes
// from useVaultMetrics' 45 s poll, so re-reading the top of the range would buy
// nothing. In memory only; a reload scans again.

export interface ShareHistory {
  status: "loading" | "ready" | "error";
  events: SharePriceUpdate[];
  error?: string;
}

// The answer held for one product and one window. `windowDays` is what makes a
// widening legible to the render below: events scanned for a chip's headline
// APY do not answer a 30-day question, and must not be shown as though they do.
interface HistoryState {
  vaultId: string;
  windowDays: number;
  status: ShareHistory["status"];
  events: SharePriceUpdate[];
  error?: string;
}

const SCANNING: ShareHistory = { status: "loading", events: [] };

export function useShareHistory(vault: Vault, selected: boolean): ShareHistory {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [state, setState] = useState<HistoryState>({
    vaultId: vault.id,
    windowDays: 0,
    status: "loading",
    events: [],
  });

  // What this hook has ASKED its product for, and what came BACK.
  //
  // `requested` is set the moment a scan starts, so a second effect run for a
  // window already being read starts nothing — StrictMode's double mount is
  // exactly that, and in development it would double a cold load. `covered` is
  // set when a scan lands: the blocks its events answer for, which is what the
  // next widening plans against.
  const requested = useRef<{ vaultId: string; windowDays: number } | null>(null);
  const covered = useRef<{
    vaultId: string;
    range: BlockRange;
    events: SharePriceUpdate[];
  } | null>(null);
  // Monotonic, so a run overtaken by a selection change or a different product
  // can tell that its result is no longer wanted.
  const running = useRef(0);

  useEffect(() => {
    if (!client) return;
    const windowDays = scanWindowDays(selected);
    // Already asked for this much of this product: the same selection again, or
    // a switch AWAY from it, which narrows what is needed and reads nothing.
    const asked = requested.current;
    if (asked?.vaultId === vault.id && asked.windowDays >= windowDays) return;

    // A scan of some other product answers for that product and no other.
    const held = covered.current?.vaultId === vault.id ? covered.current : null;
    if (!held) covered.current = null;

    requested.current = { vaultId: vault.id, windowDays };
    const run = ++running.current;
    setState({ vaultId: vault.id, windowDays, status: "loading", events: [] });

    (async () => {
      const head = await client.getBlockNumber();
      const range = planSharePriceScan({
        vault,
        windowDays,
        head,
        covered: held?.range ?? null,
      });
      // No range at all means the held history already reaches as far back as
      // this product goes — a product younger than the window it was asked for.
      const logs = range
        ? await scanLogs({
            client,
            address: vault.addresses.accountant,
            topics: [TOPIC_EXCHANGE_RATE_UPDATED],
            fromBlock: range.from,
            toBlock: range.to,
          })
        : [];
      // A run the selection or the product moved on from answers a question
      // nobody is asking any more.
      if (running.current !== run) return;

      // The widening reads blocks BELOW what is held, so the events go in
      // front. Both halves are already sorted and the ranges do not overlap.
      const events = [...logs.map(decodeSharePriceUpdate), ...(held?.events ?? [])];
      const range2 = widenCovered(held?.range ?? null, range);
      covered.current = range2
        ? { vaultId: vault.id, range: range2, events }
        : null;
      setState({ vaultId: vault.id, windowDays, status: "ready", events });
    })().catch((e) => {
      if (running.current !== run) return;
      // No partial data: a scan missing a chunk would understate the
      // share-price history, so a failed widening drops the narrower history it
      // started from rather than reporting it as the wider one. Nothing retries
      // on its own — but the next selection change is a legitimate trigger, and
      // finds nothing held to widen.
      requested.current = null;
      covered.current = null;
      setState({
        vaultId: vault.id,
        windowDays,
        status: "error",
        events: [],
        error: errorMessage(e),
      });
    });
  }, [client, vault, selected]);

  // Whether what is held answers the question being asked NOW. Drawn here
  // rather than in the effect because the effect runs after the render that
  // switched products: for one frame the state still describes the week that
  // was scanned for a chip, and the stats card would put a 30-day label on it.
  const answers =
    state.vaultId === vault.id && state.windowDays >= scanWindowDays(selected);
  return answers
    ? { status: state.status, events: state.events, error: state.error }
    : SCANNING;
}
