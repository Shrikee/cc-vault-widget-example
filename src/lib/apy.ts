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
