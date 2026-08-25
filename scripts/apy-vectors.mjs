// Test vectors for the realised trailing APY derivation (run: npm run test:apy)
//
// Drives the real pure module src/lib/apy.ts — the same code the widget runs —
// against the spec's vectors (docs/wayfinder/apy/spec.md §9). No network, no
// framework, no dependencies: Node imports the TypeScript module directly.
//
// PASS (exit 0): every vector matches the spec.
// FAIL (exit 1): the derivation drifted from the spec.
import { apyHint, computeWindowApy, trailingWindowHint } from "../src/lib/apy.ts";
import { fmtPct } from "../src/lib/format.ts";
import { DEPLOY_TIMESTAMP } from "../src/config/history.ts";

// The real share-price series: 28 ExchangeRateUpdated events emitted by the
// accountant between deployment and 2026-08-25T13:06:47Z, inlined from
// docs/research/apy-share-price-history.csv (git-ignored) so the vectors run in
// a fresh clone. Columns: block, event currentTime, oldRate, newRate (uint96,
// USDT 6 dp).
const SERIES = [
  [25430365, "2026-06-30T12:02:11.000Z", 1000000, 998617],
  [25433855, "2026-06-30T23:43:23.000Z", 998617, 998693],
  [25437579, "2026-07-01T12:10:59.000Z", 998693, 998772],
  [25441160, "2026-07-02T00:10:59.000Z", 998772, 998848],
  [25449023, "2026-07-03T02:31:35.000Z", 998848, 999137],
  [25452601, "2026-07-03T14:31:35.000Z", 999137, 999208],
  [25456188, "2026-07-04T02:31:47.000Z", 999208, 999287],
  [25459773, "2026-07-04T14:31:23.000Z", 999287, 999367],
  [25463352, "2026-07-05T02:31:23.000Z", 999367, 999442],
  [25466935, "2026-07-05T14:31:23.000Z", 999442, 999516],
  [25470522, "2026-07-06T02:32:11.000Z", 999516, 999596],
  [25778029, "2026-08-17T23:15:47.000Z", 999596, 999704],
  [25781617, "2026-08-18T11:16:47.000Z", 999704, 999808],
  [25782211, "2026-08-18T13:15:59.000Z", 999808, 999821],
  [25785762, "2026-08-19T01:07:47.000Z", 999821, 999890],
  [25789347, "2026-08-19T13:06:59.000Z", 999890, 999996],
  [25792937, "2026-08-20T01:07:11.000Z", 999996, 1000062],
  [25796522, "2026-08-20T13:07:11.000Z", 1000062, 1000164],
  [25800133, "2026-08-21T01:10:47.000Z", 1000164, 1000228],
  [25803703, "2026-08-21T13:06:59.000Z", 1000228, 1000328],
  [25807295, "2026-08-22T01:07:23.000Z", 1000328, 1000396],
  [25810879, "2026-08-22T13:06:59.000Z", 1000396, 1000497],
  [25814463, "2026-08-23T01:07:23.000Z", 1000497, 1000569],
  [25818049, "2026-08-23T13:06:47.000Z", 1000569, 1000663],
  [25821637, "2026-08-24T01:06:47.000Z", 1000663, 1000733],
  [25825230, "2026-08-24T13:07:11.000Z", 1000733, 1000834],
  [25828817, "2026-08-25T01:07:11.000Z", 1000834, 1000902],
  [25832405, "2026-08-25T13:06:47.000Z", 1000902, 1001004],
];

// Rates are uint96 base-asset units (USDT, 6 dp): 1_001_004 ⇒ 1.001004.
const EVENTS = SERIES.map(([block, iso, oldRate, newRate], i) => ({
  block,
  logIndex: i,
  time: Math.floor(Date.parse(iso) / 1000),
  oldRate: oldRate / 1e6,
  newRate: newRate / 1e6,
}));

const at = (iso) => Math.floor(Date.parse(iso) / 1000);
const SHARE_PRICE = 1.001004; // accountant.getRate() at 2026-08-25T13:06:47Z

let failures = 0;
function check(name, actual, expected) {
  const ok = Object.is(actual, expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "  ok  " : "  FAIL"} ${name}: ${String(actual)}${ok ? "" : ` (expected ${String(expected)})`}`
  );
}
function near(name, actual, expected, tol = 5e-4) {
  const ok = typeof actual === "number" && Math.abs(actual - expected) <= tol;
  if (!ok) failures++;
  console.log(
    `${ok ? "  ok  " : "  FAIL"} ${name}: ${String(actual)}${ok ? "" : ` (expected ${expected} ±${tol})`}`
  );
}

// --- §9: 7d APY — the headline window ---------------------------------------
// now 2026-08-25T15:00:00Z ⇒ rStart 0.999821 (oldRate of the first event inside
// the trailing window) ⇒ 6.1696 % ⇒ "6.17%".
{
  const w = computeWindowApy(EVENTS, SHARE_PRICE, at("2026-08-25T15:00:00Z"), 7);
  console.log("7d APY (spec §9)");
  check("label", w.label, "7d APY");
  check("windowDays", w.windowDays, 7);
  check("days", w.days, 7);
  check("sinceLaunch", w.sinceLaunch, false);
  check("noUpdates", w.noUpdates, false);
  near("apyPct", w.apyPct, 6.1696);
  check("fmtPct", fmtPct(w.apyPct), "6.17%");
}

// --- §9: 3d and 30d APY ------------------------------------------------------
// Same `now`; the 30d window straddles the 43-day gap in the series, which is
// why its figure is a third of the 7d one.
{
  const w = computeWindowApy(EVENTS, SHARE_PRICE, at("2026-08-25T15:00:00Z"), 3);
  console.log("3d APY (spec §9) — rStart 1.000497");
  check("label", w.label, "3d APY");
  check("days", w.days, 3);
  near("apyPct", w.apyPct, 6.1654);
  check("fmtPct", fmtPct(w.apyPct), "6.17%");
}
{
  const w = computeWindowApy(EVENTS, SHARE_PRICE, at("2026-08-25T15:00:00Z"), 30);
  console.log("30d APY (spec §9) — rStart 0.999596");
  check("label", w.label, "30d APY");
  check("days", w.days, 30);
  check("sinceLaunch", w.sinceLaunch, false);
  near("apyPct", w.apyPct, 1.7138);
  check("fmtPct", fmtPct(w.apyPct), "1.71%");
}

// --- §9: since launch (the 30d window predates the vault) --------------------
// now 2026-07-08T11:27:59Z: 12 days after launch, share price 0.999596 — still
// below the 1.000000 the accountant started at, so the figure is negative and
// is rendered as such, never clamped.
{
  const w = computeWindowApy(EVENTS, 0.999596, at("2026-07-08T11:27:59Z"), 30);
  console.log("APY since launch (spec §9)");
  check("label", w.label, "APY since launch");
  check("windowDays", w.windowDays, 30);
  check("sinceLaunch", w.sinceLaunch, true);
  check("days", w.days, 12);
  near("apyPct", w.apyPct, -1.2288);
  check("fmtPct", fmtPct(w.apyPct), "−1.23%");
}

// --- §9: no share-price update inside the window -----------------------------
// now 2026-08-10T00:00:00Z sits inside the 43-day gap: the 3d and 7d windows
// contain no update, so the share price did not move and the APY is 0.00 %.
for (const windowDays of [3, 7]) {
  const w = computeWindowApy(EVENTS, 0.999596, at("2026-08-10T00:00:00Z"), windowDays);
  console.log(`No share-price updates in the last ${windowDays} days (spec §9)`);
  check("label", w.label, `${windowDays}d APY`);
  check("noUpdates", w.noUpdates, true);
  check("sinceLaunch", w.sinceLaunch, false);
  near("apyPct", w.apyPct, 0);
  check("fmtPct", fmtPct(w.apyPct), "0.00%");
}

// --- §5.3 [fill-in]: a vault younger than a day ------------------------------
// Annualising a few hours is noise, so there is no figure yet: "—".
{
  const twelveHoursIn = DEPLOY_TIMESTAMP + 12 * 3600;
  const w = computeWindowApy([], 1.000002, twelveHoursIn, 7);
  console.log("Vault younger than a day (spec §5.3)");
  check("label", w.label, "APY since launch");
  check("sinceLaunch", w.sinceLaunch, true);
  check("days", w.days, 0.5);
  check("apyPct", w.apyPct, null);
  check("fmtPct", fmtPct(w.apyPct), "—");
}
// Exactly one day old: the figure appears.
{
  const oneDayIn = DEPLOY_TIMESTAMP + 24 * 3600;
  const w = computeWindowApy([], 1.0001, oneDayIn, 7);
  console.log("Vault exactly one day old (spec §5.3)");
  check("days", w.days, 1);
  near("apyPct", w.apyPct, 3.65);
  check("fmtPct", fmtPct(w.apyPct), "3.65%");
}

// --- §6.5: fmtPct ------------------------------------------------------------
{
  console.log("fmtPct (spec §6.5)");
  check("null", fmtPct(null), "—");
  check("zero", fmtPct(0), "0.00%");
  check("negative uses U+2212", fmtPct(-0.71), "−0.71%");
  check("never clamped", fmtPct(-123.456), "−123.46%");
  check("a negative that rounds to zero", fmtPct(-0.001), "0.00%");
  check("rounds to 2 dp", fmtPct(6.1696), "6.17%");
}

// --- §9: projected earnings --------------------------------------------------
// What the deposit panel quotes while an amount is being typed: the typed
// amount grown for a year at the headline (7 d) APY, and a twelfth of that per
// month. `formatUsd(…, 2)` is what the callout renders, so assert the strings
// too. (The import rides with its section; ESM hoists it.)
import { formatUsd } from "../src/lib/format.ts";
import { projectEarnings } from "../src/lib/apy.ts";
{
  const p = projectEarnings(1000, 6.1696);
  console.log("Projected earnings (spec §9) — 1,000 at the 6.1696 % headline APY");
  near("perYear", p?.perYear, 61.696);
  near("perMonth", p?.perMonth, 5.1413);
  check("per year rendered", formatUsd(p?.perYear ?? null, 2), "$61.70");
  check("per month rendered", formatUsd(p?.perMonth ?? null, 2), "$5.14");
}
// No figure without both halves — this is what keeps the callout off screen
// while the amount is empty and while the share-price history is loading or
// errored (spec §5.6, §6.3).
{
  console.log("Projected earnings — absent cases (spec §5.6, §6.3)");
  check("no amount", projectEarnings(null, 6.1696), null);
  check("zero amount", projectEarnings(0, 6.1696), null);
  check("negative amount", projectEarnings(-10, 6.1696), null);
  check("no APY (loading, errored, or a vault younger than a day)", projectEarnings(1000, null), null);
  near("a negative APY still projects", projectEarnings(1000, -1.2288)?.perYear, -12.288);
}

// --- §6.4: the hero hint each APY state reads --------------------------------
// The four hint states that follow from the derivation itself (the fifth, the
// RPC-error hint, belongs to the component: no WindowApy exists to describe it).
// Copy is verbatim from spec §6.4 — these assertions are the guard against it
// drifting.
{
  console.log("Hero hint — a normal trailing window (spec §6.4)");
  for (const windowDays of [3, 7, 30]) {
    const w = computeWindowApy(EVENTS, SHARE_PRICE, at("2026-08-25T15:00:00Z"), windowDays);
    check(
      `${windowDays}d hint`,
      apyHint(w),
      `Last ${windowDays} days, annualised — not guaranteed.`
    );
  }
  // The hero shows the same sentence before any figure exists, from this helper.
  check("pending 7d hint", trailingWindowHint(7), "Last 7 days, annualised — not guaranteed.");
}
{
  // The 30d window predates the vault: 12 days of history, measured since launch.
  const w = computeWindowApy(EVENTS, 0.999596, at("2026-07-08T11:27:59Z"), 30);
  console.log("Hero hint — since launch (spec §6.4)");
  check("since-launch hint", apyHint(w), "Since launch (12 days), annualised — not guaranteed.");
}
{
  // A part-day of vault age counts only whole elapsed days: 12.7 days ⇒ "12 days".
  const w = computeWindowApy(EVENTS, 0.999596, DEPLOY_TIMESTAMP + Math.round(12.7 * 86400), 30);
  console.log("Hero hint — since launch counts whole days (spec §6.4)");
  check("whole-day hint", apyHint(w), "Since launch (12 days), annualised — not guaranteed.");
}
{
  console.log("Hero hint — no share-price update in the window (spec §6.4)");
  for (const windowDays of [3, 7]) {
    const w = computeWindowApy(EVENTS, 0.999596, at("2026-08-10T00:00:00Z"), windowDays);
    check(`${windowDays}d hint`, apyHint(w), `No share-price updates in the last ${windowDays} days.`);
    // The number beside this hint is an exact zero, not a "—".
    check(`${windowDays}d value`, fmtPct(w.apyPct), "0.00%");
  }
}
{
  const w = computeWindowApy([], 1.000002, DEPLOY_TIMESTAMP + 12 * 3600, 7);
  console.log("Hero hint — vault younger than a day (spec §6.4)");
  check("under-a-day hint", apyHint(w), "Since launch (<1 day) — APY available after 24 hours.");
  check("under-a-day value", fmtPct(w.apyPct), "—");
}

if (failures > 0) {
  console.error(`FAIL: ${failures} APY vector assertion(s) off spec`);
  process.exit(1);
}
console.log("PASS: APY vectors match docs/wayfinder/apy/spec.md §9");
process.exit(0);
