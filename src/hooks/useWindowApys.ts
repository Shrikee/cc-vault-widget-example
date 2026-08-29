import { HEADLINE_WINDOW, INITIAL_SHARE_PRICE, WINDOWS } from "../config/history";
import { computeWindowApy, type WindowApy } from "../lib/apy";
import type { Vault } from "../lib/vaultRegistry";
import { useNow } from "./useNow";
import type { ShareHistory } from "./useShareHistory";
import type { VaultMetrics } from "./useVaultMetrics";

// The realised trailing APY for every window the widget offers, derived once.
//
// Both halves of the figure live outside this hook — the share-price history is
// scanned once per page load, the share price itself polled every 45 s — and
// every consumer wants the same arithmetic over them at the same moment: the
// hero's toggle needs all three windows (a tab reads "launch" when its own
// window predates the vault), the deposit projection needs the headline one.
// Deriving it in one place is what keeps them from disagreeing.

export interface WindowApys {
  // One figure per offered window, in WINDOWS order. null until both halves are
  // in: while the scan is in flight, after it failed, or when the poll has not
  // delivered a share price.
  windows: WindowApy[] | null;
  // The headline APY — the 7-day window, the figure the deposit projection
  // quotes whatever the toggle shows.
  headline: WindowApy | null;
}

export function useWindowApys(
  vault: Vault,
  history: ShareHistory,
  metrics: VaultMetrics
): WindowApys {
  // The window's trailing edge only has to keep pace with the 45 s share-price
  // poll, so a coarse tick is enough.
  const now = useNow(30_000);
  const sharePrice = metrics.shareValue;

  // Where this product's history starts. A window reaching back before it is
  // measured since launch instead, and the two products launched five months
  // apart — so a 30-day window is an ordinary trailing window on one and a
  // since-launch measurement on the other, at the same moment.
  const launch = {
    deployTimestamp: vault.ui.deployTimestamp,
    initialSharePrice: INITIAL_SHARE_PRICE,
  };

  // Arithmetic over ≤ 60 events — cheap enough to redo on each tick.
  const windows =
    history.status === "ready" && sharePrice !== null
      ? WINDOWS.map((windowDays) =>
          computeWindowApy(launch, history.events, sharePrice, now, windowDays)
        )
      : null;

  return {
    windows,
    headline: windows?.find((w) => w.windowDays === HEADLINE_WINDOW) ?? null,
  };
}
