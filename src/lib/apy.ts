// Realised trailing APY — the pure derivation.
//
// The share price's growth over a trailing window, annualised linearly
// (× 365 / days of the window): what the vault actually returned, never a
// target or a forecast. Arithmetic only — no network, no React, no bundler
// globals — so scripts/apy-vectors.mjs can drive this exact code (hence the
// explicit `.ts` extension below: Node resolves no extensions).
import { DEPLOY_TIMESTAMP, INITIAL_SHARE_PRICE } from "../config/history.ts";

// One accountant ExchangeRateUpdated event. `oldRate`/`newRate` are share
// prices in the base asset (the uint96 log value ÷ 1e6, e.g. 1.001004);
// `time` is the event's `currentTime` (unix seconds).
export interface RateEvent {
  block: number;
  logIndex: number;
  time: number;
  oldRate: number;
  newRate: number;
}

export interface WindowApy {
  // The trailing window that was asked for, in days.
  windowDays: number;
  // The span actually measured — `windowDays`, or the vault's age when the
  // window reaches back before launch.
  days: number;
  // The window predates the vault: measured since launch from 1.000000.
  sinceLaunch: boolean;
  // No share-price update landed inside the window: the APY is exactly 0.00 %.
  noUpdates: boolean;
  // Percent, signed and unclamped. null when no meaningful figure exists yet
  // (a vault younger than a day).
  apyPct: number | null;
  label: string;
}

const DAY = 86_400;

// `sharePrice` is the live (polled) share price, so the figure moves when a new
// update lands mid-session even though the event series is scanned once.
export function computeWindowApy(
  events: RateEvent[],
  sharePrice: number,
  now: number,
  windowDays: number
): WindowApy {
  const rEnd = sharePrice;
  const t0 = now - windowDays * DAY;

  // The window reaches back before the vault existed → measure since launch.
  const sinceLaunch = t0 < DEPLOY_TIMESTAMP;
  const days = sinceLaunch ? (now - DEPLOY_TIMESTAMP) / DAY : windowDays;
  const label = sinceLaunch ? "APY since launch" : `${windowDays}d APY`;

  const first = sinceLaunch
    ? undefined
    : events.find((e) => e.time > t0 && e.time <= now);
  const noUpdates = !sinceLaunch && !first;
  const rStart = sinceLaunch ? INITIAL_SHARE_PRICE : (first?.oldRate ?? rEnd);

  // A vault younger than a day has no meaningful figure: annualising a few
  // hours is noise, so show "—" until it has 24 hours of history.
  const apyPct =
    days < 1 ? null : ((rEnd / rStart - 1) * 365 * 100) / days;

  return { windowDays, days, sinceLaunch, noUpdates, apyPct, label };
}

// --- Projected earnings ------------------------------------------------------
// What a deposit being typed would earn at the headline APY — an estimate shown
// before the deposit, never a promise. Linear, like the APY it comes from: a
// year at the headline rate, and a twelfth of that for a month (no compounding,
// which would overstate it).

export interface ProjectedEarnings {
  perYear: number;
  perMonth: number;
}

// null whenever there is nothing honest to show — no amount typed yet, and no
// headline APY because the share-price history is still loading, failed, or the
// vault is younger than a day. Callers render the callout iff this is non-null.
export function projectEarnings(
  amount: number | null,
  headlineApyPct: number | null
): ProjectedEarnings | null {
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  if (headlineApyPct === null || !Number.isFinite(headlineApyPct)) return null;

  const perYear = (amount * headlineApyPct) / 100;
  return { perYear, perMonth: perYear / 12 };
}

// -----------------------------------------------------------------------------
// The hint that reads out a window's state (spec §6.4).
//
// It lives beside the derivation rather than in the component because the four
// states it distinguishes ARE the derivation's states: whichever branch of
// computeWindowApy produced the figure decides the sentence under it, so the two
// stay in step and scripts/apy-vectors.mjs can hold the copy to the spec. The
// fifth hero hint — the RPC-failure one — has no WindowApy to describe and stays
// in the component.
// -----------------------------------------------------------------------------
export function apyHint(apy: WindowApy): string {
  // No figure at all: the vault is younger than the 24 hours the annualisation
  // needs — the only way computeWindowApy returns a null percentage.
  if (apy.apyPct === null) {
    return "Since launch (<1 day) — APY available after 24 hours.";
  }
  if (apy.noUpdates) {
    return `No share-price updates in the last ${apy.windowDays} days.`;
  }
  if (apy.sinceLaunch) {
    // Whole elapsed days only — a vault 12.7 days old has 12 days behind it.
    return `Since launch (${Math.floor(apy.days)} days), annualised — not guaranteed.`;
  }
  return trailingWindowHint(apy.windowDays);
}

// What an ordinary trailing window reads — split out because the hero shows the
// same sentence before any figure exists (while the scan is in flight), and the
// copy should have exactly one home under the vectors' guard.
export function trailingWindowHint(windowDays: number): string {
  return `Last ${windowDays} days, annualised — not guaranteed.`;
}
