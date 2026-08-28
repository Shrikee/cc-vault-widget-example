// Test vectors for the yield figures' pure seams (run: npm run test:apy)
//
// Drives the real modules src/lib/apy.ts and src/lib/scanRuns.ts — the same
// code the widget runs — against the spec (docs/wayfinder/apy/spec.md §5, §9).
// No network, no framework, no dependencies: Node imports the TypeScript
// modules directly.
//
// PASS (exit 0): every vector matches the spec.
// FAIL (exit 1): the derivation drifted from the spec.
import {
  UNKNOWN_DEPOSIT_ASSET,
  apyHint,
  computeEarnings,
  computeWindowApy,
  decodeDepositLog,
  projectEarnings,
  reconstructDeposits,
  trailingWindowHint,
} from "../src/lib/apy.ts";
import { fmtPct, fmtSignedUsd, formatUsd } from "../src/lib/format.ts";
import {
  DEPLOY_TIMESTAMP,
  TOPIC_DEPOSIT,
  TOPIC_DEPOSIT_REFUNDED,
} from "../src/config/history.ts";
import {
  NO_SCANS,
  abandonScan,
  forgetScans,
  isCurrent,
  requestTail,
  settleScan,
  startScan,
} from "../src/lib/scanRuns.ts";

// The real share-price series: 28 ExchangeRateUpdated events emitted by the
// accountant between deployment and 2026-08-25T13:06:47Z, inlined from
// docs/research/apy-share-price-history.csv (git-ignored) so the vectors run in
// a fresh clone. Columns: block, event currentTime, and the share price before
// and after the update (uint96 base-asset units, USDT 6 dp).
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

// SERIES was recorded against a vault launched at this instant. The derivation
// reads DEPLOY_TIMESTAMP from config, so the fixture is re-anchored to whatever
// launch the app is currently configured for: every timestamp below (and every
// `now` the vectors replay) shifts by the same delta.
//
// The expected APYs are unaffected — an APY depends only on the price ratio and
// the elapsed days between two points, and a uniform shift preserves both. This
// is what keeps the vectors a test of the derivation rather than of the chain
// the widget happens to point at. Block numbers are not shifted: they are only
// used for ordering and dedup, never for time.
const SERIES_LAUNCH = Math.floor(Date.parse("2026-06-26T11:27:59Z") / 1000);
const SHIFT = DEPLOY_TIMESTAMP - SERIES_LAUNCH;

// Share prices are uint96 base-asset units (USDT, 6 dp): 1_001_004 ⇒ 1.001004.
const EVENTS = SERIES.map(([block, iso, before, after], i) => ({
  block,
  logIndex: i,
  time: Math.floor(Date.parse(iso) / 1000) + SHIFT,
  oldPrice: before / 1e6,
  newPrice: after / 1e6,
}));

const at = (iso) => Math.floor(Date.parse(iso) / 1000) + SHIFT;
// The series a scan holds at a given moment: it reaches the head block, so it
// ends at `now`. Replaying an earlier `now` against the whole recorded history
// has to truncate it the same way (spec §5.3).
const seriesAt = (now) => EVENTS.filter((e) => e.time <= now);
const SHARE_PRICE = 1.001004; // the share price at 2026-08-25T13:06:47Z

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
// now 2026-08-25T15:00:00Z ⇒ startPrice 0.999821 (the share price before the
// first update inside the trailing window) ⇒ 6.1696 % ⇒ "6.17%".
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
  console.log("3d APY (spec §9) — startPrice 1.000497");
  check("label", w.label, "3d APY");
  check("days", w.days, 3);
  near("apyPct", w.apyPct, 6.1654);
  check("fmtPct", fmtPct(w.apyPct), "6.17%");
}
{
  const w = computeWindowApy(EVENTS, SHARE_PRICE, at("2026-08-25T15:00:00Z"), 30);
  console.log("30d APY (spec §9) — startPrice 0.999596");
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
// The series is truncated at `now` first — see "the window's start" below.
for (const windowDays of [3, 7]) {
  const now = at("2026-08-10T00:00:00Z");
  const w = computeWindowApy(seriesAt(now), 0.999596, now, windowDays);
  console.log(`No share-price updates in the last ${windowDays} days (spec §9)`);
  check("label", w.label, `${windowDays}d APY`);
  check("noUpdates", w.noUpdates, true);
  check("sinceLaunch", w.sinceLaunch, false);
  near("apyPct", w.apyPct, 0);
  check("fmtPct", fmtPct(w.apyPct), "0.00%");
}

// --- §5.3: the window's start is the first update strictly after t0 ----------
// The predicate is exactly `e.time > t0` — nothing else. The window has no
// upper bound because it needs none: a scan reaches the head block, so the
// series a caller holds never contains an update from the future. Handing the
// derivation a series that does (as a vector replaying an old `now` against the
// whole recorded history can) is the caller's truncation to do, not the
// derivation's guess.
{
  const now = at("2026-08-25T15:00:00Z");
  const t0 = now - 7 * 86400;
  console.log("Window start — the first update strictly after t0 (spec §5.3)");
  // An update landing exactly on t0 is outside the window; the next one starts it.
  const onT0 = { block: 1, logIndex: 0, time: t0, oldPrice: 0.5, newPrice: 0.6 };
  const justAfter = { block: 2, logIndex: 1, time: t0 + 1, oldPrice: 0.9, newPrice: 1 };
  const w = computeWindowApy([onT0, justAfter], 1, now, 7);
  check("an update on t0 does not start the window", w.noUpdates, false);
  // startPrice 0.9 (justAfter.oldPrice), not 0.5: (1/0.9 − 1) × 365/7 × 100.
  near("startPrice comes from the first update after t0", w.apyPct, ((1 / 0.9 - 1) * 365 * 100) / 7, 1e-9);
}
{
  // Same series, same `now`, truncated or not: the difference is the caller's.
  const now = at("2026-08-10T00:00:00Z");
  console.log("Window start — the derivation does not bound the window at `now`");
  check("an untruncated series takes its start from a later update", computeWindowApy(EVENTS, 0.999596, now, 3).noUpdates, false);
  check("the truncated series a scan holds reports no updates", computeWindowApy(seriesAt(now), 0.999596, now, 3).noUpdates, true);
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
// too.
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
    const now = at("2026-08-10T00:00:00Z");
    const w = computeWindowApy(seriesAt(now), 0.999596, now, windowDays);
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

// =============================================================================
// Earnings vectors — a connected wallet's unrealised gain (spec §9, §6.5).
// =============================================================================

// Verbatim from eth_getLogs on the Teller (block 25733026, tx 0x68529fdd…) —
// wallet B's only deposit, so this one log reconstructs its whole position.
const RAW_DEPOSIT_B = {
  topics: [
    TOPIC_DEPOSIT,
    "0x0000000000000000000000000000000000000000000000000000000000000003",
    "0x000000000000000000000000b4b0a5b761133860a39d2e89d59a8c6f6769cbe0",
    "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  ],
  data:
    "0x00000000000000000000000000000000000000000000000000000000ee6b2800" +
    "0000000000000000000000000000000000000000000000d8ed96388bcdd661d5" +
    "000000000000000000000000000000000000000000000000000000006a7b515b" +
    "0000000000000000000000000000000000000000000000000000000000015180",
};
// Every Teller Deposit event to date, inlined from
// docs/research/apy-deposit-history.csv (git-ignored) so the vectors run in a
// fresh clone. Columns: nonce, receiver, asset, depositAmount (asset units),
// shareAmount (18 dp) — exactly the fields the scan decodes from a log.
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WALLET_A = "0x463639c13d578dd17e8164d83ab7fc6135d130f9";
const WALLET_B = "0xb4b0a5b761133860a39d2e89d59a8c6f6769cbe0";
const DEPOSITS = [
  ["1", WALLET_A, USDT_ADDRESS, "90000000", "90000000000000000000"],
  ["2", WALLET_A, USDT_ADDRESS, "900000000", "900363746953769322806"],
  ["3", WALLET_B, USDC_ADDRESS, "4000000000", "4001616653127863656917"],
];

// DEPOSIT_TOKENS' decimals, keyed lowercase (src/config/vault.ts is not
// importable here — it pulls in the React/wagmi stack).
const DECIMALS = { [USDT_ADDRESS.toLowerCase()]: 6, [USDC_ADDRESS.toLowerCase()]: 6 };

const depositsOf = (wallet) =>
  DEPOSITS.filter(([, receiver]) => receiver === wallet).map(
    ([nonce, , asset, depositAmount, shareAmount]) => ({
      kind: "deposit",
      nonce,
      asset,
      depositAmount: BigInt(depositAmount),
      shareAmount: BigInt(shareAmount),
    })
  );
const refundOf = (nonce) => ({ kind: "refund", nonce });

function throws(name, fn, expected) {
  let message = null;
  try {
    fn();
  } catch (e) {
    message = e?.message ?? String(e);
  }
  check(name, message, expected);
}

// --- §5.5: decoding a real Teller log ----------------------------------------
{
  console.log("Decoding a real Deposit log (spec §5.5)");
  const log = decodeDepositLog(RAW_DEPOSIT_B);
  check("kind", log.kind, "deposit");
  check("nonce from topics[1]", log.nonce, "3");
  check("asset from topics[3]", log.asset.toLowerCase(), USDC_ADDRESS.toLowerCase());
  check("depositAmount (USDC, 6 dp)", log.depositAmount, 4000000000n);
  check("shareAmount (18 dp)", log.shareAmount, 4001616653127863656917n);
  // Raw log → average deposit cost → the rendered sub-line, end to end.
  const t = reconstructDeposits([log], DECIMALS);
  check("avgCost to 8 dp", t.avgCost.toFixed(8), "0.99959600");
  check(
    "earnings at 1.001004",
    fmtSignedUsd(computeEarnings(4001.616653127863656917, SHARE_PRICE, t.avgCost)),
    "+$5.63"
  );
}
{
  // No DepositRefunded has ever been emitted by this Teller, so this log is
  // synthesised from the event's ABI: topics [signature, nonce, user], with the
  // unindexed depositHash in data.
  console.log("Decoding a DepositRefunded log (spec §5.5)");
  const log = decodeDepositLog({
    topics: [
      TOPIC_DEPOSIT_REFUNDED,
      "0x0000000000000000000000000000000000000000000000000000000000000003",
      "0x000000000000000000000000b4b0a5b761133860a39d2e89d59a8c6f6769cbe0",
    ],
    data: "0x1111111111111111111111111111111111111111111111111111111111111111",
  });
  check("kind", log.kind, "refund");
  check("nonce from topics[1]", log.nonce, "3");
  // The refunded deposit is cancelled even when both come from the same scan.
  const t = reconstructDeposits([decodeDepositLog(RAW_DEPOSIT_B), log], DECIMALS);
  check("nothing survives", t.sharesMinted, 0);
  check("avgCost", t.avgCost, null);
}

// --- §9: reconstructing each real depositor from their Deposit logs ----------
{
  console.log("Reconstruction A (spec §9) — 2 deposits, 990 USDT");
  const t = reconstructDeposits(depositsOf(WALLET_A), DECIMALS);
  check("deposited", t.deposited, 990);
  near("sharesMinted", t.sharesMinted, 990.363746953769322806, 1e-9);
  check("avgCost to 8 dp", t.avgCost.toFixed(8), "0.99963271");
  // End to end: raw log amounts → average deposit cost → the rendered sub-line.
  // sharesHeld is balanceOf (10 CCUSD of the 990.36 minted were redeemed).
  check(
    "earnings at 1.001004",
    fmtSignedUsd(computeEarnings(980.363746953769322806, SHARE_PRICE, t.avgCost)),
    "+$1.34"
  );
}
{
  console.log("Reconstruction B (spec §9) — 1 deposit, 4,000 USDC");
  const t = reconstructDeposits(depositsOf(WALLET_B), DECIMALS);
  check("deposited", t.deposited, 4000);
  near("sharesMinted", t.sharesMinted, 4001.616653127863656917, 1e-9);
  check("avgCost to 8 dp", t.avgCost.toFixed(8), "0.99959600");
  check(
    "earnings at 1.001004",
    fmtSignedUsd(computeEarnings(4001.616653127863656917, SHARE_PRICE, t.avgCost)),
    "+$5.63"
  );
}

// --- §9: refunded deposits contribute nothing --------------------------------
// refundDeposit burns the shares within the 24 h lock but leaves the original
// Deposit log in place, so a reconstruction has to subtract the refunded nonce.
{
  console.log("Refund exclusion (spec §9)");
  const logs = [...depositsOf(WALLET_A), refundOf("2")];
  const t = reconstructDeposits(logs, DECIMALS);
  check("deposited counts only nonce 1", t.deposited, 90);
  near("sharesMinted counts only nonce 1", t.sharesMinted, 90, 1e-9);
  check("avgCost", t.avgCost, 1);
  // Order is irrelevant — the refund may be scanned before or after (a tail
  // scan folds new logs in at the end).
  const reordered = reconstructDeposits([refundOf("2"), ...depositsOf(WALLET_A)], DECIMALS);
  check("same when the refund is scanned first", reordered.deposited, 90);
}
{
  console.log("All deposits refunded ⇒ no deposit history (spec §5.5)");
  const logs = [...depositsOf(WALLET_A), refundOf("1"), refundOf("2")];
  const t = reconstructDeposits(logs, DECIMALS);
  check("deposited", t.deposited, 0);
  check("sharesMinted", t.sharesMinted, 0);
  // sharesMinted === 0 ⇒ the hook reports status "none", never a 0/0 avgCost.
  check("avgCost", t.avgCost, null);
}
{
  console.log("Deposit asset handling (spec §5.5)");
  // Topics carry the address in whatever case the log has; DEPOSIT_TOKENS is
  // matched case-insensitively.
  const upper = [{ ...depositsOf(WALLET_B)[0], asset: USDC_ADDRESS.toUpperCase() }];
  check("asset lookup is case-insensitive", reconstructDeposits(upper, DECIMALS).deposited, 4000);
  const unknown = [{ ...depositsOf(WALLET_B)[0], asset: "0x6B175474E89094C44Da98b954EedeAC495271d0F" }];
  throws(
    "an asset outside DEPOSIT_TOKENS",
    () => reconstructDeposits(unknown, DECIMALS),
    UNKNOWN_DEPOSIT_ASSET
  );
  // A refunded deposit is dropped before its asset is ever looked up.
  const refundedUnknown = [...unknown, refundOf("3")];
  check("a refunded unknown asset", reconstructDeposits(refundedUnknown, DECIMALS).avgCost, null);
}

{
  console.log("A nonce is counted once, however often it is scanned (§5.5)");
  // A tail scan resuming from a cursor that moved backwards re-reads blocks it
  // already folded in; the same deposit must not be counted twice.
  const once = reconstructDeposits(depositsOf(WALLET_A), DECIMALS);
  const twice = reconstructDeposits([...depositsOf(WALLET_A), ...depositsOf(WALLET_A)], DECIMALS);
  check("deposited is unchanged", twice.deposited, once.deposited);
  check("sharesMinted is unchanged", twice.sharesMinted, once.sharesMinted);
  check("avgCost is unchanged", twice.avgCost, once.avgCost);
  // The realistic overlap re-reads only the tail, so just the LATEST deposit
  // repeats — and that one does skew the average deposit cost, because the
  // doubling no longer cancels between the sums.
  const [first, latest] = depositsOf(WALLET_A);
  const partial = reconstructDeposits([first, latest, latest], DECIMALS);
  check("a re-scanned tail deposit counts once", partial.deposited, 990);
  check("avgCost to 8 dp", partial.avgCost.toFixed(8), "0.99963271");
  // A duplicated refund is just as harmless.
  const withRefunds = reconstructDeposits(
    [...depositsOf(WALLET_A), refundOf("2"), refundOf("2")],
    DECIMALS
  );
  check("a repeated refund still excludes once", withRefunds.deposited, 90);
}

// --- §9: earnings for the two real depositors --------------------------------
// sharesHeld is each wallet's live balanceOf and avgCost the spec's figure, so
// these are the numbers the widget shows today at a share price of 1.001004
// (docs/research/apy-deposit-history.md, "Two worked reconstructions").
{
  console.log("Earnings A (spec §9) — wallet 0x4636…30f9");
  // Holds less than it minted: 10 CCUSD were redeemed, which leaves avgCost
  // untouched (average cost, not FIFO).
  const usd = computeEarnings(980.363746953769322806, SHARE_PRICE, 0.99963271);
  near("earningsUsd", usd, 1.3444, 5e-4);
  check("fmtSignedUsd", fmtSignedUsd(usd), "+$1.34");
}
{
  console.log("Earnings B (spec §9) — wallet 0xb4b0…cbe0");
  const usd = computeEarnings(4001.616653127863656917, SHARE_PRICE, 0.999596);
  near("earningsUsd", usd, 5.6343, 5e-4);
  check("fmtSignedUsd", fmtSignedUsd(usd), "+$5.63");
}
{
  console.log("Earnings — sign, zero and missing inputs (spec §5.6)");
  // A share price below the wallet's average deposit cost is a real loss and is
  // shown as one, never clamped.
  check("below average deposit cost", fmtSignedUsd(computeEarnings(100, 0.99, 1)), "−$1.00");
  check("exactly at cost", fmtSignedUsd(computeEarnings(100, 1, 1)), "$0.00");
  check("no shares", computeEarnings(0, 1.001004, 0.9996), 0);
  // Earnings needs all three inputs: shares, the live share price and a
  // reconstructed average deposit cost.
  check("shares unknown", computeEarnings(null, 1.001004, 0.9996), null);
  check("share price unknown", computeEarnings(100, null, 0.9996), null);
  check("no deposit history", computeEarnings(100, 1.001004, undefined), null);
}

// --- §6.5: fmtSignedUsd ------------------------------------------------------
{
  console.log("fmtSignedUsd (spec §6.5)");
  check("null", fmtSignedUsd(null), "—");
  check("undefined", fmtSignedUsd(undefined), "—");
  check("positive is signed", fmtSignedUsd(12.34), "+$12.34");
  check("negative uses U+2212", fmtSignedUsd(-0.2), "−$0.20");
  check("zero is unsigned", fmtSignedUsd(0), "$0.00");
  check("rounds to 2 dp", fmtSignedUsd(1.344258), "+$1.34");
  check("a tiny gain that rounds to zero", fmtSignedUsd(0.001), "$0.00");
  check("a tiny loss that rounds to zero", fmtSignedUsd(-0.001), "$0.00");
  check("thousands separator", fmtSignedUsd(4005.6), "+$4,005.60");
}

// =============================================================================
// Deposit-scan bookkeeping (spec §5.5, §5.7) — src/lib/scanRuns.ts.
//
// Which scan may run, and which may commit what it found. The hook that owns
// the network side keeps this state in a ref and does as it says, so the rules
// that used to be tangled with promises and refs are asserted here instead.
// =============================================================================

const KEY_A = "0x4636…30f9:deposited";
const KEY_B = "0xb4b0…cbe0:deposited";

// --- §5.5/§5.7: a failed full scan stays recoverable -------------------------
// No automatic retry — but the next legitimate trigger (the wallet's own
// deposit succeeding, or an address change) must be able to scan again.
{
  console.log("A failed full scan leaves nothing scanned (spec §5.7)");
  const started = startScan(NO_SCANS, KEY_A);
  check("the scan starts from the deployment block", started.run.from, null);
  const failed = abandonScan(started.runs, started.run);
  check("no scanned key survives the failure", failed.runs.key, null);
  check("and no cursor to resume from", failed.runs.cursor, null);
  check("nothing is left running", failed.runs.running, null);

  console.log("…and the next trigger may scan again (spec §5.5, §5.7)");
  const again = startScan(failed.runs, KEY_A);
  check("the same wallet is scanned again", again.run?.kind, "full");
  const viaTail = requestTail(failed.runs, KEY_A);
  check("a tail request falls back to a full scan", viaTail.run?.kind, "full");
  check("from the deployment block", viaTail.run?.from, null);
}

// --- §5.5: a scan overtaken by another may not commit ------------------------
// A → B → A while A's first scan is still in flight: the stale run must not
// rewind the cursor or replace the logs when it finally lands.
{
  console.log("Only the newest run for the current wallet commits (spec §5.5)");
  const a1 = startScan(NO_SCANS, KEY_A);
  const b = startScan(a1.runs, KEY_B);
  const a2 = startScan(b.runs, KEY_A);
  check("the overtaken run is no longer current", isCurrent(a2.runs, a1.run), false);
  check("the newest run is", isCurrent(a2.runs, a2.run), true);

  const stale = settleScan(a2.runs, a1.run, 100n);
  check("a stale result starts nothing", stale.run, null);
  check("and does not move the cursor", stale.runs.cursor, null);
  check("nor unset the running run", stale.runs.running, a2.run.generation);
  const staleFailure = abandonScan(a2.runs, a1.run);
  check("a stale failure does not clear the scan", staleFailure.runs.key, KEY_A);
  check("nor stop the run in flight", staleFailure.runs.running, a2.run.generation);

  const landed = settleScan(a2.runs, a2.run, 200n);
  check("the current run does commit", landed.runs.cursor, 200n);
  check("and leaves nothing running", landed.runs.running, null);
}

// --- §5.5: a tail asked for mid-scan is queued, not dropped ------------------
// The wallet's own deposit is the only trigger there is; losing one leaves the
// new deposit unseen until a reload.
{
  console.log("A tail requested during a scan is queued (spec §5.5)");
  const full = startScan(NO_SCANS, KEY_A);
  const queued = requestTail(full.runs, KEY_A);
  check("nothing starts while the scan runs", queued.run, null);
  check("the tail is queued", queued.runs.pendingTail, true);
  const queuedTwice = requestTail(queued.runs, KEY_A);
  check("a second request queues no second tail", queuedTwice.runs.pendingTail, true);
  check("and still starts nothing", queuedTwice.run, null);

  const settled = settleScan(queuedTwice.runs, full.run, 500n);
  check("the queued tail runs once the scan settles", settled.run?.kind, "tail");
  check("resuming just past the cursor", settled.run?.from, 501n);
  check("the queue is empty again", settled.runs.pendingTail, false);
  check("and the tail is now the running run", settled.runs.running, settled.run.generation);

  // Settling includes failing: the deposit that triggered the queued tail is
  // still unseen, and the full scan left nothing behind, so the queued tail
  // becomes the full scan the wallet needs. One deferred trigger, not a retry
  // loop — nothing queues itself.
  const afterFailure = abandonScan(queuedTwice.runs, full.run);
  check("a queued tail survives the scan failing", afterFailure.run?.kind, "full");
  check("the queue is empty again", afterFailure.runs.pendingTail, false);
}

// --- §5.5: an ordinary tail, and a tail that fails ---------------------------
{
  console.log("A tail scan resumes from the cursor (spec §5.5)");
  const full = startScan(NO_SCANS, KEY_A);
  const scanned = settleScan(full.runs, full.run, 500n);
  const tail = requestTail(scanned.runs, KEY_A);
  check("kind", tail.run?.kind, "tail");
  check("from the block after the cursor", tail.run?.from, 501n);

  const failed = abandonScan(tail.runs, tail.run);
  check("a failed tail keeps what was scanned", failed.runs.key, KEY_A);
  check("and its cursor", failed.runs.cursor, 500n);
  const next = requestTail(failed.runs, KEY_A);
  check("so the next deposit resumes the tail", next.run?.kind, "tail");
  check("from the same cursor", next.run?.from, 501n);
}

// --- §5.5: the precondition falling away ------------------------------------
// Disconnecting, or an address whose share-unlock time is not resolved yet.
{
  console.log("Losing the precondition drops the scan (spec §5.5)");
  const full = startScan(NO_SCANS, KEY_A);
  const scanned = settleScan(full.runs, full.run, 500n);
  const forgotten = forgetScans(scanned.runs);
  check("no key", forgotten.key, null);
  check("no cursor", forgotten.cursor, null);
  const inFlight = startScan(NO_SCANS, KEY_A);
  check("an in-flight run may no longer commit", isCurrent(forgetScans(inFlight.runs), inFlight.run), false);
  check("a later run still outranks it", startScan(forgetScans(inFlight.runs), KEY_A).run.generation > inFlight.run.generation, true);
}

if (failures > 0) {
  console.error(`FAIL: ${failures} APY vector assertion(s) off spec`);
  process.exit(1);
}
console.log("PASS: APY vectors match docs/wayfinder/apy/spec.md §5, §9");
process.exit(0);
