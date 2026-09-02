import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";

import { CHAIN_ID } from "../config/chain";
import { TOPIC_EXCHANGE_RATE_UPDATED } from "../config/history";
import { scanLogs } from "../lib/logScan";
import { readFailedReason, reportError } from "../lib/userError";
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
// days of history is all its figure is computed from — 41 chunks today against
// the 94 the selected product's clamped 30-day window costs. Which blocks that
// comes to is src/lib/scanPlan.ts's decision, clamped there to the accountant's
// own deployment.
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
  // How wide a trailing window these events can answer for, in days. A wider
  // one is not theirs to answer: an unselected product is scanned for its
  // headline APY alone, and a 30-day figure taken off a week of events would
  // understate the growth before it — a figure the data does not support.
  // 0 while nothing is held.
  coversDays: number;
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

const SCANNING: ShareHistory = { status: "loading", events: [], coversDays: 0 };

export function useShareHistory(vault: Vault, selected: boolean): ShareHistory {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [state, setState] = useState<HistoryState>({
    vaultId: vault.id,
    windowDays: 0,
    status: "loading",
    events: [],
  });

  // What came back, and whether a scan is out. `held` is the blocks the events
  // answer for, which is what the next widening is planned against; it is
  // written only when a scan lands, so it is never a promise of anything.
  const held = useRef<{
    vaultId: string;
    windowDays: number;
    range: BlockRange;
    events: SharePriceUpdate[];
  } | null>(null);
  const scanning = useRef(false);
  // Bumped when a scan lands, which brings the effect back to plan whatever was
  // wanted while it ran. Deliberately NOT bumped when one fails: that is what
  // keeps a failure from re-attempting itself in a loop.
  const [landed, setLanded] = useState(0);

  useEffect(() => {
    if (!client) return;
    const windowDays = scanWindowDays(selected);
    // A scan of some other product answers for that product and no other.
    const covered = held.current?.vaultId === vault.id ? held.current : null;
    // The events already reach this far back — the same selection again, or a
    // switch AWAY from this product, which narrows what it needs and reads
    // nothing.
    if (covered && covered.windowDays >= windowDays) return;
    // One scan at a time per product, and it must LAND before the next is
    // planned: a selection change while the headline window is still being
    // read waits for it, rather than starting a 30-day scan over blocks that
    // are already being fetched. `landed` brings the effect back when it does.
    // The same guard is what keeps StrictMode's double mount from scanning
    // twice in development.
    if (scanning.current) return;
    if (!covered) held.current = null;

    scanning.current = true;
    setState({ vaultId: vault.id, windowDays, status: "loading", events: [] });

    (async () => {
      const head = await client.getBlockNumber();
      const range = planSharePriceScan({
        vault,
        windowDays,
        head,
        covered: covered?.range ?? null,
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

      // The widening reads blocks BELOW what is held, so its events go in
      // front. Both halves are already sorted and the ranges do not overlap.
      const events = [...logs.map(decodeSharePriceUpdate), ...(covered?.events ?? [])];
      const widened = widenCovered(covered?.range ?? null, range);
      held.current = widened
        ? { vaultId: vault.id, windowDays, range: widened, events }
        : null;
      scanning.current = false;
      setState({ vaultId: vault.id, windowDays, status: "ready", events });
      // Plan whatever was wanted while this ran, now that there is something to
      // plan it against. Nothing was covered ⇒ nothing to widen, and bumping
      // then would put the effect straight back into the scan it just did.
      if (held.current) setLanded((n) => n + 1);
    })().catch((e) => {
      reportError("share-price history scan failed", e);
      scanning.current = false;
      // No partial data: a scan missing a chunk would understate the
      // share-price history, so a failed widening drops the narrower history it
      // started from rather than reporting it as the wider one. And no retry —
      // the same rule the deposit scan's reducer states (src/lib/scanRuns.ts):
      // nothing re-attempts on its own, but the next selection change is a
      // legitimate trigger and finds nothing held to widen.
      held.current = null;
      setState({
        vaultId: vault.id,
        windowDays,
        status: "error",
        events: [],
        error: readFailedReason(e),
      });
    });
  }, [client, vault, selected, landed]);

  // Whether what is held answers the question being asked NOW. Drawn here
  // rather than in the effect because the effect runs after the render that
  // switched products: for one frame the state still describes the week that
  // was scanned for a chip, and the stats card would put a 30-day label on it.
  const answers =
    state.vaultId === vault.id && state.windowDays >= scanWindowDays(selected);
  return answers
    ? {
        status: state.status,
        events: state.events,
        coversDays: state.windowDays,
        error: state.error,
      }
    : SCANNING;
}
