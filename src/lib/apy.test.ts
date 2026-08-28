// Test vectors for the yield figures' pure seams (run: npm test)
//
// Drives the real module src/lib/apy.ts — the same code the widget runs —
// against the spec (docs/wayfinder/apy/spec.md §5, §9). No network, no React,
// no DOM: arithmetic and log decoding only.
//
// These began as scripts/apy-vectors.mjs — a plain Node script with its own
// check()/near() runner, removed in the change that added this file. Every
// expected value below is the one that script asserted.
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

import {
  UNKNOWN_DEPOSIT_ASSET,
  apyHint,
  computeEarnings,
  computeWindowApy,
  decodeDepositLog,
  projectEarnings,
  reconstructDeposits,
  trailingWindowHint,
  type DepositLog,
  type LaunchAnchors,
} from "./apy";
import { fmtPct, fmtSignedUsd, formatUsd } from "./format";
import type { RawLog } from "./logScan";
import { TOPIC_DEPOSIT, TOPIC_DEPOSIT_REFUNDED } from "../config/history";

// The real share-price series: 28 ExchangeRateUpdated events emitted by the
// accountant between deployment and 2026-08-25T13:06:47Z, inlined from
// docs/research/apy-share-price-history.csv (git-ignored) so the vectors run in
// a fresh clone. Columns: block, event currentTime, and the share price before
// and after the update (uint96 base-asset units, USDT 6 dp).
const SERIES: [number, string, number, number][] = [
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

// SERIES was recorded against a vault launched at this instant, and the vectors
// now say so: computeWindowApy takes its launch anchors as an argument, so the
// fixture no longer has to be shifted onto whatever launch the app happens to
// be configured for. What the vectors measure is the derivation, not the chain
// the widget points at.
//
// The accountant's constructor sets its `exchangeRate` to 1.000000 base/share,
// so that is the opening point of a since-launch figure.
const SERIES_LAUNCH = Math.floor(Date.parse("2026-06-26T11:27:59Z") / 1000);
const LAUNCH: LaunchAnchors = {
  deployTimestamp: SERIES_LAUNCH,
  initialSharePrice: 1,
};

// Share prices are uint96 base-asset units (USDT, 6 dp): 1_001_004 ⇒ 1.001004.
// Block numbers are carried as recorded: they order and dedup logs, never time.
const EVENTS = SERIES.map(([block, iso, before, after], i) => ({
  block,
  logIndex: i,
  time: Math.floor(Date.parse(iso) / 1000),
  oldPrice: before / 1e6,
  newPrice: after / 1e6,
}));

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
// The series a scan holds at a given moment: it reaches the head block, so it
// ends at `now`. Replaying an earlier `now` against the whole recorded history
// has to truncate it the same way (spec §5.3).
const seriesAt = (now: number) => EVENTS.filter((e) => e.time <= now);
const SHARE_PRICE = 1.001004; // the share price at 2026-08-25T13:06:47Z

// The hand-rolled runner compared with an absolute tolerance; toBeCloseTo's
// `digits` is the same check written as 10^-digits / 2, so 3 digits is the
// 5e-4 the vectors used throughout and 9 the exact-arithmetic cases.
const TOL_DIGITS = 3;

describe("computeWindowApy — the realised trailing APY (spec §5.3, §9)", () => {
  it("measures the 7d headline window from the first update after t0", () => {
    // now 2026-08-25T15:00:00Z ⇒ startPrice 0.999821 (the share price before
    // the first update inside the trailing window) ⇒ 6.1696 % ⇒ "6.17%".
    const w = computeWindowApy(LAUNCH, EVENTS, SHARE_PRICE, at("2026-08-25T15:00:00Z"), 7);
    expect(w.label).toBe("7d APY");
    expect(w.windowDays).toBe(7);
    expect(w.days).toBe(7);
    expect(w.sinceLaunch).toBe(false);
    expect(w.noUpdates).toBe(false);
    expect(w.apyPct).toBeCloseTo(6.1696, TOL_DIGITS);
    expect(fmtPct(w.apyPct)).toBe("6.17%");
  });

  it("measures the 3d window — startPrice 1.000497", () => {
    const w = computeWindowApy(LAUNCH, EVENTS, SHARE_PRICE, at("2026-08-25T15:00:00Z"), 3);
    expect(w.label).toBe("3d APY");
    expect(w.days).toBe(3);
    expect(w.apyPct).toBeCloseTo(6.1654, TOL_DIGITS);
    expect(fmtPct(w.apyPct)).toBe("6.17%");
  });

  it("measures the 30d window — startPrice 0.999596", () => {
    // Same `now`; the 30d window straddles the 43-day gap in the series, which
    // is why its figure is a third of the 7d one.
    const w = computeWindowApy(LAUNCH, EVENTS, SHARE_PRICE, at("2026-08-25T15:00:00Z"), 30);
    expect(w.label).toBe("30d APY");
    expect(w.days).toBe(30);
    expect(w.sinceLaunch).toBe(false);
    expect(w.apyPct).toBeCloseTo(1.7138, TOL_DIGITS);
    expect(fmtPct(w.apyPct)).toBe("1.71%");
  });

  it("measures since launch when the window predates the vault", () => {
    // now 2026-07-08T11:27:59Z: 12 days after launch, share price 0.999596 —
    // still below the 1.000000 the accountant started at, so the figure is
    // negative and is rendered as such, never clamped.
    const w = computeWindowApy(LAUNCH, EVENTS, 0.999596, at("2026-07-08T11:27:59Z"), 30);
    expect(w.label).toBe("APY since launch");
    expect(w.windowDays).toBe(30);
    expect(w.sinceLaunch).toBe(true);
    expect(w.days).toBe(12);
    expect(w.apyPct).toBeCloseTo(-1.2288, TOL_DIGITS);
    expect(fmtPct(w.apyPct)).toBe("−1.23%");
  });

  it.each([3, 7])(
    "reports an exact zero when no update landed in the %sd window",
    (windowDays) => {
      // now 2026-08-10T00:00:00Z sits inside the 43-day gap: the 3d and 7d
      // windows contain no update, so the share price did not move and the APY
      // is 0.00 %. The series is truncated at `now` first — see "the window's
      // start" below.
      const now = at("2026-08-10T00:00:00Z");
      const w = computeWindowApy(LAUNCH, seriesAt(now), 0.999596, now, windowDays);
      expect(w.label).toBe(`${windowDays}d APY`);
      expect(w.noUpdates).toBe(true);
      expect(w.sinceLaunch).toBe(false);
      expect(w.apyPct).toBeCloseTo(0, TOL_DIGITS);
      expect(fmtPct(w.apyPct)).toBe("0.00%");
    }
  );

  // --- §5.3: the window's start is the first update strictly after t0 --------
  // The predicate is exactly `e.time > t0` — nothing else. The window has no
  // upper bound because it needs none: a scan reaches the head block, so the
  // series a caller holds never contains an update from the future. Handing the
  // derivation a series that does (as a vector replaying an old `now` against
  // the whole recorded history can) is the caller's truncation to do, not the
  // derivation's guess.
  it("starts the window at the first update strictly after t0", () => {
    const now = at("2026-08-25T15:00:00Z");
    const t0 = now - 7 * 86400;
    // An update landing exactly on t0 is outside the window; the next one
    // starts it.
    const onT0 = { block: 1, logIndex: 0, time: t0, oldPrice: 0.5, newPrice: 0.6 };
    const justAfter = { block: 2, logIndex: 1, time: t0 + 1, oldPrice: 0.9, newPrice: 1 };
    const w = computeWindowApy(LAUNCH, [onT0, justAfter], 1, now, 7);
    expect(w.noUpdates).toBe(false);
    // startPrice 0.9 (justAfter.oldPrice), not 0.5: (1/0.9 − 1) × 365/7 × 100.
    expect(w.apyPct).toBeCloseTo(((1 / 0.9 - 1) * 365 * 100) / 7, 9);
  });

  it("does not bound the window at `now` — truncating is the caller's job", () => {
    // Same series, same `now`, truncated or not: the difference is the caller's.
    const now = at("2026-08-10T00:00:00Z");
    expect(computeWindowApy(LAUNCH, EVENTS, 0.999596, now, 3).noUpdates).toBe(false);
    expect(computeWindowApy(LAUNCH, seriesAt(now), 0.999596, now, 3).noUpdates).toBe(true);
  });

  // --- §5.3 [fill-in]: a vault younger than a day ----------------------------
  it("has no figure for a vault younger than a day", () => {
    // Annualising a few hours is noise, so there is no figure yet: "—".
    const twelveHoursIn = SERIES_LAUNCH + 12 * 3600;
    const w = computeWindowApy(LAUNCH, [], 1.000002, twelveHoursIn, 7);
    expect(w.label).toBe("APY since launch");
    expect(w.sinceLaunch).toBe(true);
    expect(w.days).toBe(0.5);
    expect(w.apyPct).toBeNull();
    expect(fmtPct(w.apyPct)).toBe("—");
  });

  it("has a figure once the vault is exactly one day old", () => {
    const oneDayIn = SERIES_LAUNCH + 24 * 3600;
    const w = computeWindowApy(LAUNCH, [], 1.0001, oneDayIn, 7);
    expect(w.days).toBe(1);
    expect(w.apyPct).toBeCloseTo(3.65, TOL_DIGITS);
    expect(fmtPct(w.apyPct)).toBe("3.65%");
  });
});

// The widget serves two products with different launches, so "does this window
// predate the vault?" has two answers for the same window at the same moment.
// These vectors hold the derivation to the anchors it is handed rather than to
// anything it knows on its own.
describe("computeWindowApy — per-vault launch anchors", () => {
  const now = at("2026-08-25T15:00:00Z");
  // A vault deployed fifteen days before `now`: the same 30-day window that is
  // an ordinary trailing window on the older vault predates this one.
  const YOUNG: LaunchAnchors = {
    deployTimestamp: now - 15 * 86400,
    initialSharePrice: 1,
  };

  it("measures the same window against each vault's own launch", () => {
    const older = computeWindowApy(LAUNCH, EVENTS, SHARE_PRICE, now, 30);
    expect(older.sinceLaunch).toBe(false);
    expect(older.days).toBe(30);

    const younger = computeWindowApy(YOUNG, EVENTS, SHARE_PRICE, now, 30);
    expect(younger.sinceLaunch).toBe(true);
    expect(younger.days).toBe(15);
    expect(younger.label).toBe("APY since launch");
  });

  it("opens a since-launch figure at the anchored launch share price", () => {
    // A vault whose accountant started above par: the growth measured is
    // 1.001004 / 1.000500, not 1.001004 / 1.000000.
    const abovePar: LaunchAnchors = { ...YOUNG, initialSharePrice: 1.0005 };
    const w = computeWindowApy(abovePar, EVENTS, SHARE_PRICE, now, 30);
    expect(w.apyPct).toBeCloseTo(((SHARE_PRICE / 1.0005 - 1) * 365 * 100) / 15, 9);
  });

  it("still reports no updates in an empty window on a young vault", () => {
    // Inside the window and after the vault's launch, but with no update in it:
    // the share price did not move, so the figure is an exact zero — the same
    // behaviour a window with no events has on the older vault.
    const quiet: LaunchAnchors = { deployTimestamp: at("2026-08-01T00:00:00Z"), initialSharePrice: 1 };
    const quietNow = at("2026-08-10T00:00:00Z");
    const w = computeWindowApy(quiet, seriesAt(quietNow), 0.999596, quietNow, 3);
    expect(w.sinceLaunch).toBe(false);
    expect(w.noUpdates).toBe(true);
    expect(fmtPct(w.apyPct)).toBe("0.00%");
  });
});

describe("fmtPct (spec §6.5)", () => {
  it("renders every state the APY can be in", () => {
    expect(fmtPct(null)).toBe("—");
    expect(fmtPct(0)).toBe("0.00%");
    expect(fmtPct(-0.71)).toBe("−0.71%"); // negative uses U+2212
    expect(fmtPct(-123.456)).toBe("−123.46%"); // never clamped
    expect(fmtPct(-0.001)).toBe("0.00%"); // a negative that rounds to zero
    expect(fmtPct(6.1696)).toBe("6.17%"); // rounds to 2 dp
  });
});

describe("projectEarnings (spec §9, §5.6, §6.3)", () => {
  it("quotes the typed amount at the headline APY", () => {
    // What the deposit panel quotes while an amount is being typed: the typed
    // amount grown for a year at the headline (7 d) APY, and a twelfth of that
    // per month. `formatUsd(…, 2)` is what the callout renders, so assert the
    // strings too.
    const p = projectEarnings(1000, 6.1696);
    expect(p?.perYear).toBeCloseTo(61.696, TOL_DIGITS);
    expect(p?.perMonth).toBeCloseTo(5.1413, TOL_DIGITS);
    expect(formatUsd(p?.perYear ?? null, 2)).toBe("$61.70");
    expect(formatUsd(p?.perMonth ?? null, 2)).toBe("$5.14");
  });

  it("shows nothing without both halves", () => {
    // This is what keeps the callout off screen while the amount is empty and
    // while the share-price history is loading or errored.
    expect(projectEarnings(null, 6.1696)).toBeNull();
    expect(projectEarnings(0, 6.1696)).toBeNull();
    expect(projectEarnings(-10, 6.1696)).toBeNull();
    // No APY: loading, errored, or a vault younger than a day.
    expect(projectEarnings(1000, null)).toBeNull();
  });

  it("still projects a negative APY", () => {
    expect(projectEarnings(1000, -1.2288)?.perYear).toBeCloseTo(-12.288, TOL_DIGITS);
  });
});

// The four hint states that follow from the derivation itself (the fifth, the
// RPC-error hint, belongs to the component: no WindowApy exists to describe
// it). Copy is verbatim from spec §6.4 — these assertions are the guard against
// it drifting.
describe("apyHint — the hero hint each APY state reads (spec §6.4)", () => {
  it.each([3, 7, 30])("reads a normal %sd trailing window", (windowDays) => {
    const w = computeWindowApy(
      LAUNCH,
      EVENTS,
      SHARE_PRICE,
      at("2026-08-25T15:00:00Z"),
      windowDays
    );
    expect(apyHint(w)).toBe(`Last ${windowDays} days, annualised — not guaranteed.`);
  });

  it("says the same sentence from the helper before any figure exists", () => {
    expect(trailingWindowHint(7)).toBe("Last 7 days, annualised — not guaranteed.");
  });

  it("reads since launch when the window predates the vault", () => {
    // The 30d window predates the vault: 12 days of history, measured since
    // launch.
    const w = computeWindowApy(LAUNCH, EVENTS, 0.999596, at("2026-07-08T11:27:59Z"), 30);
    expect(apyHint(w)).toBe("Since launch (12 days), annualised — not guaranteed.");
  });

  it("counts whole elapsed days only", () => {
    // A part-day of vault age counts only whole elapsed days: 12.7 ⇒ "12 days".
    const w = computeWindowApy(
      LAUNCH,
      EVENTS,
      0.999596,
      SERIES_LAUNCH + Math.round(12.7 * 86400),
      30
    );
    expect(apyHint(w)).toBe("Since launch (12 days), annualised — not guaranteed.");
  });

  it.each([3, 7])("reads no update in the last %s days", (windowDays) => {
    const now = at("2026-08-10T00:00:00Z");
    const w = computeWindowApy(LAUNCH, seriesAt(now), 0.999596, now, windowDays);
    expect(apyHint(w)).toBe(`No share-price updates in the last ${windowDays} days.`);
    // The number beside this hint is an exact zero, not a "—".
    expect(fmtPct(w.apyPct)).toBe("0.00%");
  });

  it("reads under-a-day for a vault younger than a day", () => {
    const w = computeWindowApy(LAUNCH, [], 1.000002, SERIES_LAUNCH + 12 * 3600, 7);
    expect(apyHint(w)).toBe("Since launch (<1 day) — APY available after 24 hours.");
    expect(fmtPct(w.apyPct)).toBe("—");
  });
});

// =============================================================================
// Earnings vectors — a connected wallet's unrealised gain (spec §9, §6.5).
// =============================================================================

// A log's `data` is one hex blob; splitting it into its 32-byte words keeps the
// fixtures readable, and building it in a template literal keeps it typed as
// Hex (concatenating with `+` would widen it to string).
const words = (...w: string[]): Hex => `0x${w.join("")}`;

// Verbatim from eth_getLogs on the Teller (block 25733026, tx 0x68529fdd…) —
// wallet B's only deposit, so this one log reconstructs its whole position.
// `address`, `blockNumber` and `logIndex` complete the RawLog shape the scan
// hands the decoder; only topics and data are read.
const RAW_DEPOSIT_B: RawLog = {
  address: "0x0000000000000000000000000000000000000000",
  blockNumber: "0x188a7a2",
  logIndex: "0x0",
  topics: [
    TOPIC_DEPOSIT,
    "0x0000000000000000000000000000000000000000000000000000000000000003",
    "0x000000000000000000000000b4b0a5b761133860a39d2e89d59a8c6f6769cbe0",
    "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  ],
  // depositAmount, shareAmount, depositTimestamp, shareLockPeriodAtTimeOfDeposit.
  data: words(
    "00000000000000000000000000000000000000000000000000000000ee6b2800",
    "0000000000000000000000000000000000000000000000d8ed96388bcdd661d5",
    "000000000000000000000000000000000000000000000000000000006a7b515b",
    "0000000000000000000000000000000000000000000000000000000000015180"
  ),
};

// Every Teller Deposit event to date, inlined from
// docs/research/apy-deposit-history.csv (git-ignored) so the vectors run in a
// fresh clone. Columns: nonce, receiver, asset, depositAmount (asset units),
// shareAmount (18 dp) — exactly the fields the scan decodes from a log.
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WALLET_A = "0x463639c13d578dd17e8164d83ab7fc6135d130f9";
const WALLET_B = "0xb4b0a5b761133860a39d2e89d59a8c6f6769cbe0";
const DEPOSITS: [string, string, string, string, string][] = [
  ["1", WALLET_A, USDT_ADDRESS, "90000000", "90000000000000000000"],
  ["2", WALLET_A, USDT_ADDRESS, "900000000", "900363746953769322806"],
  ["3", WALLET_B, USDC_ADDRESS, "4000000000", "4001616653127863656917"],
];

// DEPOSIT_TOKENS' decimals, keyed lowercase (src/config/vault.ts is not
// imported here — it pulls in the React/wagmi stack).
const DECIMALS = { [USDT_ADDRESS.toLowerCase()]: 6, [USDC_ADDRESS.toLowerCase()]: 6 };

// The deposit half of the DepositLog union — narrowed so a fixture can be
// spread and one field overridden.
type DepositEntry = Extract<DepositLog, { kind: "deposit" }>;

const depositsOf = (wallet: string): DepositEntry[] =>
  DEPOSITS.filter(([, receiver]) => receiver === wallet).map(
    ([nonce, , asset, depositAmount, shareAmount]) => ({
      kind: "deposit",
      nonce,
      asset,
      depositAmount: BigInt(depositAmount),
      shareAmount: BigInt(shareAmount),
    })
  );
const refundOf = (nonce: string): DepositLog => ({ kind: "refund", nonce });

describe("decodeDepositLog (spec §5.5)", () => {
  it("decodes a real Deposit log end to end", () => {
    const log = decodeDepositLog(RAW_DEPOSIT_B);
    expect(log).toEqual({
      kind: "deposit",
      nonce: "3", // topics[1]
      asset: USDC_ADDRESS.toLowerCase(), // topics[3], right-aligned in the word
      depositAmount: 4000000000n, // data word 0 — USDC, 6 dp
      shareAmount: 4001616653127863656917n, // data word 1 — always 18 dp
    });
    // Raw log → average deposit cost → the rendered sub-line, end to end.
    const t = reconstructDeposits([log], DECIMALS);
    expect(t.avgCost?.toFixed(8)).toBe("0.99959600");
    expect(
      fmtSignedUsd(computeEarnings(4001.616653127863656917, SHARE_PRICE, t.avgCost))
    ).toBe("+$5.63");
  });

  it("decodes a DepositRefunded log and cancels its deposit", () => {
    // No DepositRefunded has ever been emitted by this Teller, so this log is
    // synthesised from the event's ABI: topics [signature, nonce, user], with
    // the unindexed depositHash in data.
    const log = decodeDepositLog({
      address: "0x0000000000000000000000000000000000000000",
      blockNumber: "0x188a7a2",
      logIndex: "0x1",
      topics: [
        TOPIC_DEPOSIT_REFUNDED,
        "0x0000000000000000000000000000000000000000000000000000000000000003",
        "0x000000000000000000000000b4b0a5b761133860a39d2e89d59a8c6f6769cbe0",
      ],
      data: "0x1111111111111111111111111111111111111111111111111111111111111111",
    });
    expect(log).toEqual({ kind: "refund", nonce: "3" });
    // The refunded deposit is cancelled even when both come from the same scan.
    const t = reconstructDeposits([decodeDepositLog(RAW_DEPOSIT_B), log], DECIMALS);
    expect(t.sharesMinted).toBe(0);
    expect(t.avgCost).toBeNull();
  });
});

describe("reconstructDeposits — the average deposit cost (spec §5.5, §9)", () => {
  it("reconstructs wallet A — 2 deposits, 990 USDT", () => {
    const t = reconstructDeposits(depositsOf(WALLET_A), DECIMALS);
    expect(t.deposited).toBe(990);
    expect(t.sharesMinted).toBeCloseTo(990.363746953769322806, 9);
    expect(t.avgCost?.toFixed(8)).toBe("0.99963271");
    // End to end: raw log amounts → average deposit cost → the rendered
    // sub-line. sharesHeld is balanceOf (10 CCUSD of the 990.36 minted were
    // redeemed).
    expect(
      fmtSignedUsd(computeEarnings(980.363746953769322806, SHARE_PRICE, t.avgCost))
    ).toBe("+$1.34");
  });

  it("reconstructs wallet B — 1 deposit, 4,000 USDC", () => {
    const t = reconstructDeposits(depositsOf(WALLET_B), DECIMALS);
    expect(t.deposited).toBe(4000);
    expect(t.sharesMinted).toBeCloseTo(4001.616653127863656917, 9);
    expect(t.avgCost?.toFixed(8)).toBe("0.99959600");
    expect(
      fmtSignedUsd(computeEarnings(4001.616653127863656917, SHARE_PRICE, t.avgCost))
    ).toBe("+$5.63");
  });

  // refundDeposit burns the shares within the 24 h lock but leaves the original
  // Deposit log in place, so a reconstruction has to subtract the refunded
  // nonce.
  it("excludes a refunded deposit whichever order it is scanned in", () => {
    const t = reconstructDeposits([...depositsOf(WALLET_A), refundOf("2")], DECIMALS);
    expect(t.deposited).toBe(90); // only nonce 1
    expect(t.sharesMinted).toBeCloseTo(90, 9);
    expect(t.avgCost).toBe(1);
    // Order is irrelevant — the refund may be scanned before or after (a tail
    // scan folds new logs in at the end).
    const reordered = reconstructDeposits(
      [refundOf("2"), ...depositsOf(WALLET_A)],
      DECIMALS
    );
    expect(reordered.deposited).toBe(90);
  });

  it("reports no deposit history when every deposit is refunded", () => {
    const logs = [...depositsOf(WALLET_A), refundOf("1"), refundOf("2")];
    const t = reconstructDeposits(logs, DECIMALS);
    expect(t.deposited).toBe(0);
    expect(t.sharesMinted).toBe(0);
    // sharesMinted === 0 ⇒ the hook reports status "none", never a 0/0 avgCost.
    expect(t.avgCost).toBeNull();
  });

  it("matches the deposit asset case-insensitively", () => {
    // Topics carry the address in whatever case the log has; DEPOSIT_TOKENS is
    // matched case-insensitively.
    const upper = [{ ...depositsOf(WALLET_B)[0], asset: USDC_ADDRESS.toUpperCase() }];
    expect(reconstructDeposits(upper, DECIMALS).deposited).toBe(4000);
  });

  it("refuses a deposit asset it cannot value", () => {
    const unknown = [
      { ...depositsOf(WALLET_B)[0], asset: "0x6B175474E89094C44Da98b954EedeAC495271d0F" },
    ];
    expect(() => reconstructDeposits(unknown, DECIMALS)).toThrow(UNKNOWN_DEPOSIT_ASSET);
    // A refunded deposit is dropped before its asset is ever looked up.
    expect(reconstructDeposits([...unknown, refundOf("3")], DECIMALS).avgCost).toBeNull();
  });

  it("counts a nonce once, however often it is scanned", () => {
    // A tail scan resuming from a cursor that moved backwards re-reads blocks it
    // already folded in; the same deposit must not be counted twice.
    const once = reconstructDeposits(depositsOf(WALLET_A), DECIMALS);
    const twice = reconstructDeposits(
      [...depositsOf(WALLET_A), ...depositsOf(WALLET_A)],
      DECIMALS
    );
    expect(twice.deposited).toBe(once.deposited);
    expect(twice.sharesMinted).toBe(once.sharesMinted);
    expect(twice.avgCost).toBe(once.avgCost);

    // The realistic overlap re-reads only the tail, so just the LATEST deposit
    // repeats — and that one does skew the average deposit cost, because the
    // doubling no longer cancels between the sums.
    const [first, latest] = depositsOf(WALLET_A);
    const partial = reconstructDeposits([first, latest, latest], DECIMALS);
    expect(partial.deposited).toBe(990);
    expect(partial.avgCost?.toFixed(8)).toBe("0.99963271");

    // A duplicated refund is just as harmless.
    const withRefunds = reconstructDeposits(
      [...depositsOf(WALLET_A), refundOf("2"), refundOf("2")],
      DECIMALS
    );
    expect(withRefunds.deposited).toBe(90);
  });
});

// sharesHeld is each wallet's live balanceOf and avgCost the spec's figure, so
// these are the numbers the widget shows today at a share price of 1.001004
// (docs/research/apy-deposit-history.md, "Two worked reconstructions").
describe("computeEarnings (spec §9, §5.6)", () => {
  it("values wallet A's position — 0x4636…30f9", () => {
    // Holds less than it minted: 10 CCUSD were redeemed, which leaves avgCost
    // untouched (average cost, not FIFO).
    const usd = computeEarnings(980.363746953769322806, SHARE_PRICE, 0.99963271);
    expect(usd).toBeCloseTo(1.3444, TOL_DIGITS);
    expect(fmtSignedUsd(usd)).toBe("+$1.34");
  });

  it("values wallet B's position — 0xb4b0…cbe0", () => {
    const usd = computeEarnings(4001.616653127863656917, SHARE_PRICE, 0.999596);
    expect(usd).toBeCloseTo(5.6343, TOL_DIGITS);
    expect(fmtSignedUsd(usd)).toBe("+$5.63");
  });

  it("shows a loss as a loss, and zero as zero", () => {
    // A share price below the wallet's average deposit cost is a real loss and
    // is shown as one, never clamped.
    expect(fmtSignedUsd(computeEarnings(100, 0.99, 1))).toBe("−$1.00");
    expect(fmtSignedUsd(computeEarnings(100, 1, 1))).toBe("$0.00");
    expect(computeEarnings(0, 1.001004, 0.9996)).toBe(0);
  });

  it("needs all three inputs", () => {
    // Shares, the live share price and a reconstructed average deposit cost.
    expect(computeEarnings(null, 1.001004, 0.9996)).toBeNull();
    expect(computeEarnings(100, null, 0.9996)).toBeNull();
    expect(computeEarnings(100, 1.001004, undefined)).toBeNull();
  });
});

describe("fmtSignedUsd (spec §6.5)", () => {
  it("renders every state the earnings figure can be in", () => {
    expect(fmtSignedUsd(null)).toBe("—");
    expect(fmtSignedUsd(undefined)).toBe("—");
    expect(fmtSignedUsd(12.34)).toBe("+$12.34"); // positive is signed
    expect(fmtSignedUsd(-0.2)).toBe("−$0.20"); // negative uses U+2212
    expect(fmtSignedUsd(0)).toBe("$0.00"); // zero is unsigned
    expect(fmtSignedUsd(1.344258)).toBe("+$1.34"); // rounds to 2 dp
    expect(fmtSignedUsd(0.001)).toBe("$0.00"); // a tiny gain that rounds to zero
    expect(fmtSignedUsd(-0.001)).toBe("$0.00"); // a tiny loss that rounds to zero
    expect(fmtSignedUsd(4005.6)).toBe("+$4,005.60"); // thousands separator
  });
});
