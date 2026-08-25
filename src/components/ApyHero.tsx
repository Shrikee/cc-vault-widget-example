import { useState } from "react";

import { HEADLINE_WINDOW, WINDOWS } from "../config/history";
import { useNow } from "../hooks/useNow";
import type { ShareHistory } from "../hooks/useShareHistory";
import type { VaultMetrics } from "../hooks/useVaultMetrics";
import {
  apyHint,
  computeWindowApy,
  trailingWindowHint,
  type WindowApy,
} from "../lib/apy";
import { fmtPct } from "../lib/format";

// The vault overview's headline: the realised trailing APY over the selected
// trailing window — the share price's growth, annualised linearly. It leads with
// the headline APY (the 7-day window) and the toggle swaps in the 3d or 30d one.
// It is what the vault actually returned, never a target or a forecast, hence
// the hint and the footnote.
//
// The figure needs both halves of the window: the share-price history (scanned
// once per page load) and the live share price (polled every 45 s), so it shows
// "…" until both are in and "—" when the history scan failed.

const FOOTNOTE = "Past performance does not guarantee future returns.";
const HISTORY_UNAVAILABLE =
  "Share-price history is unavailable on the current RPC.";

// The windows the toggle offers — 3, 7 or 30 days, nothing else.
type TrailingWindow = (typeof WINDOWS)[number];

export function ApyHero({
  history,
  metrics,
}: {
  history: ShareHistory;
  metrics: VaultMetrics;
}) {
  // The window's trailing edge only has to keep pace with the 45 s share-price
  // poll, so a coarse tick is enough.
  const now = useNow(30_000);

  // Which trailing window is on show. Deliberately local and unpersisted (spec
  // §6.1): a reload returns every visitor to the headline APY, which is also the
  // figure the deposit projection quotes whatever is selected here.
  const [selectedWindow, setSelectedWindow] =
    useState<TrailingWindow>(HEADLINE_WINDOW);

  const sharePrice = metrics.shareValue;
  const failed = history.status === "error";
  // "…" only while something is still on its way. A failed metrics poll leaves
  // the share price null for good — that is a "—", not a wait.
  const loading =
    !failed &&
    metrics.error === null &&
    (history.status === "loading" || sharePrice === null);

  // Every window, not just the selected one: a tab reads "launch" when its own
  // window reaches back before the vault existed, so each needs its own figure.
  // Arithmetic over ≤ 60 events — cheap enough to redo on each tick.
  const windows: WindowApy[] | null =
    history.status === "ready" && sharePrice !== null
      ? WINDOWS.map((windowDays) =>
          computeWindowApy(history.events, sharePrice, now, windowDays)
        )
      : null;
  const figureFor = (windowDays: TrailingWindow) =>
    windows?.find((w) => w.windowDays === windowDays) ?? null;
  const apy = figureFor(selectedWindow);

  const value = loading ? "…" : fmtPct(apy?.apyPct ?? null);
  // A negative window is a real result: it turns red, and fmtPct never clamps it.
  const tone =
    apy?.apyPct == null
      ? " apy-hero__value--muted"
      : apy.apyPct < 0
        ? " apy-hero__value--negative"
        : "";

  // Nothing to switch between until the figures exist — while the scan is in
  // flight, after it failed, or when the poll never delivered a share price.
  const tabsDisabled = windows === null;

  const hint = failed
    ? HISTORY_UNAVAILABLE
    : apy
      ? apyHint(apy)
      : // No figures yet: name the window the visitor is waiting on.
        trailingWindowHint(selectedWindow);

  return (
    <>
      <div className="apy-hero">
        <div>
          <div className="stat__label">
            {apy?.label ?? `${selectedWindow}d APY`}
          </div>
          <div className={`apy-hero__value${tone}`}>{value}</div>
        </div>
        <div
          className="tabs tabs--compact"
          role="tablist"
          aria-label="Trailing window"
        >
          {WINDOWS.map((windowDays) => {
            const active = windowDays === selectedWindow;
            return (
              <button
                key={windowDays}
                type="button"
                role="tab"
                aria-selected={active}
                className={`tab${active ? " tab--active" : ""}`}
                disabled={tabsDisabled}
                onClick={() => setSelectedWindow(windowDays)}
              >
                {/* A window reaching back before the vault is measured since
                    launch, and its tab says so. */}
                {figureFor(windowDays)?.sinceLaunch ? "launch" : `${windowDays}d`}
              </button>
            );
          })}
        </div>
      </div>
      <p className="muted small apy-hero__hint">{hint}</p>
      <p className="muted small apy-hero__footnote">{FOOTNOTE}</p>
    </>
  );
}
