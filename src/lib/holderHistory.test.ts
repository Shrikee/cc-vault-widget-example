// The holder-history replay, against the JSON both sides wrote (spec, "The
// holder-history read"; "Modules under test" → the replay).
//
// Ticket 03 ran the solver's own ledger and this reading of it over the same
// chain and printed both. Its output files are the expectations here — the two
// live products' holders, and the fork scenario's three moments — so a replay
// that drifts by one event fails against a figure the authority itself wrote,
// not against one restated in this file.
//
// WHAT THESE VECTORS CAN AND CANNOT PROVE. The fixtures hold what came OUT
// (per-holder histories, share balances, the ledger's tallies, the raw
// exclusion counts); the logs that went in were never written down. So each
// setting's chain is FORGED back from its own histories — a mint per deposit, a
// leg and a burn per fill, both legs of every transfer — which makes the
// event-for-event comparison partly a round trip. Three things stop it being
// only that:
//
//   • the forge's shape is held to the fixture's own `raw` counts, so the chain
//     it builds has the mints, burns and legs the real one had — and every one
//     of those is an exclusion the replay has to make;
//   • each holder's replayed events must add up to the SHARE BALANCE the
//     fixture recorded from the chain — a number no history in this file was
//     derived from, and the one that catches a lot invented or dropped;
//   • the per-holder replays, summed, must equal the ledger's own product-wide
//     tally, so nothing is double-counted across holders or quietly lost.
//
// Everything below the fixtures is a vector in its own right: the exclusions
// one at a time, the ordering, the refund, and what the second phase asks the
// chain for.
import * as fs from "fs";

import { describe, expect, it } from "vitest";

import {
  TOPIC_DEPOSIT,
  TOPIC_DEPOSIT_REFUNDED,
  TOPIC_FULFILLED,
  TOPIC_TRANSFER,
} from "../config/history";
import type { HolderEvent } from "../entitlement/entitlement";
import { decodeDepositLog, reconstructDeposits } from "./apy";
import { holderHistory, transferReads } from "./holderHistory";
import type { RawLog } from "./logScan";

// =============================================================================
// Ticket 03's output, read from disk.
// =============================================================================

const OUT = new URL(
  "../../docs/wayfinder/entitlement/assets/03-the-same-number/out/",
  import.meta.url
);
const fixture = <T>(name: string): T =>
  JSON.parse(fs.readFileSync(new URL(name, OUT), "utf8")) as T;

// A HolderEvent as JSON writes it: bigints as decimal strings.
interface FixtureEvent {
  kind: HolderEvent["kind"];
  t: number;
  shares: string;
  assets?: string;
  rate?: string;
}
// The ledger's own tally of what it kept — `transfer` counts BOTH legs.
interface Tallies {
  deposit: number;
  transfer: number;
  fill: number;
}
// The log stream underneath it, and what the exclusions dropped out of it.
interface RawTallies {
  deposits: number;
  transfers: number;
  fills: number;
  mints: number;
  burns: number;
  legs: number;
}
interface Holding {
  history: FixtureEvent[];
  shareBalance: string;
}
interface LiveFixture {
  counts: Tallies;
  raw: RawTallies;
  holders: Record<string, Holding>;
}
interface ForkFixture {
  moments: {
    label: string;
    widgetCounts: Tallies;
    widgetRaw: RawTallies;
    holders: Record<string, { address: string; widget: Holding }>;
  }[];
}

const events = (history: FixtureEvent[]): HolderEvent[] =>
  history.map((e) => {
    switch (e.kind) {
      case "deposit":
        return { kind: "deposit", t: e.t, shares: BigInt(e.shares), assets: BigInt(e.assets!) };
      case "transfer-in":
        return { kind: "transfer-in", t: e.t, shares: BigInt(e.shares), rate: BigInt(e.rate!) };
      case "transfer-out":
        return { kind: "transfer-out", t: e.t, shares: BigInt(e.shares) };
      case "fill":
        return { kind: "fill", t: e.t, shares: BigInt(e.shares) };
    }
  });

// One setting to check, however the file it came from is shaped.
interface Setting {
  holders: Record<string, Holding>;
  counts: Tallies;
  raw: RawTallies;
}

// =============================================================================
// The forge — a chain that would have produced a given set of histories.
// =============================================================================

const ZERO = "0x0000000000000000000000000000000000000000";
// The solver: a fill moves the holder's shares to it and it burns them. Its
// address appears in both excluded legs and in nothing the replay keeps, which
// is the point — the exclusion is keyed on the transaction and the holder, so
// this address is never consulted.
const SOLVER = "0x0000000000000000000000000000000000501ffe";
const TELLER = "0x0000000000000000000000000000000000007e11";
const SHARE = "0x0000000000000000000000000000000000005ba7e";
const QUEUE = "0x0000000000000000000000000000000000000f1f0";
// USDT on Polygon, 6 dp — the deposit asset both products take.
const USDT = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const DECIMALS = { [USDT.toLowerCase()]: 6 };

const pad32 = (address: string): `0x${string}` =>
  `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
const word = (value: bigint | number): string => BigInt(value).toString(16).padStart(64, "0");
const hex = (n: bigint | number): `0x${string}` => `0x${BigInt(n).toString(16)}`;

type Action =
  | { kind: "deposit"; wallet: string; t: number; shares: bigint; assets: bigint }
  | { kind: "transfer"; from: string; to: string; t: number; shares: bigint; rate: bigint }
  | { kind: "fill"; wallet: string; t: number; shares: bigint };

interface Forged {
  // Mutable so a vector can add the one log it is about — a batch fill's second
  // leg, a refund's burn — to a forged chain.
  logs: { deposits: RawLog[]; transfers: RawLog[]; fills: RawLog[] };
  // The log stream this script comes to, in the fixtures' own terms. Counted
  // from the ACTIONS rather than from the logs, so it says what was built and
  // can be held against what ticket 03 saw.
  shape: RawTallies;
  // What eth_getBlockByNumber and the accountant's unguarded getRateInQuote(want)
  // would answer at each block — consulted only for the blocks transferReads asks
  // about, exactly as the scan's second phase consults the chain.
  timeAt: Map<bigint, number>;
  rateAt: Map<bigint, bigint>;
}

// One action per block, so (blockNumber, logIndex) alone orders the result and
// the exclusion counts are readable off the script.
const BASE_BLOCK = 92_500_000n;

function forge(actions: Action[]): Forged {
  const deposits: RawLog[] = [];
  const transfers: RawLog[] = [];
  const fills: RawLog[] = [];
  const timeAt = new Map<bigint, number>();
  const rateAt = new Map<bigint, bigint>();

  actions.forEach((action, i) => {
    const blockNumber = BASE_BLOCK + BigInt(i) * 10n;
    const transactionHash = `0x${(i + 1).toString(16).padStart(64, "0")}` as `0x${string}`;
    const at = (
      logIndex: number,
      log: Omit<RawLog, "blockNumber" | "logIndex" | "transactionHash">
    ): RawLog => ({
      ...log,
      blockNumber: hex(blockNumber),
      logIndex: hex(logIndex),
      transactionHash,
    });
    const transfer = (logIndex: number, from: string, to: string, shares: bigint): RawLog =>
      at(logIndex, {
        address: SHARE,
        topics: [TOPIC_TRANSFER, pad32(from), pad32(to)],
        data: `0x${word(shares)}`,
      });

    timeAt.set(blockNumber, action.t);
    if (action.kind === "deposit") {
      // The mint the Teller's own deposit makes, then the Deposit log.
      transfers.push(transfer(0, ZERO, action.wallet, action.shares));
      deposits.push(
        at(1, {
          address: TELLER,
          topics: [TOPIC_DEPOSIT, `0x${word(i + 1)}`, pad32(action.wallet), pad32(USDT)],
          // depositAmount, shareAmount, depositTimestamp, shareLockPeriod.
          data: `0x${word(action.assets)}${word(action.shares)}${word(action.t)}${word(86_400)}`,
        })
      );
    } else if (action.kind === "fill") {
      // The share leg to the solver, the solver's burn, then the fill itself.
      transfers.push(transfer(0, action.wallet, SOLVER, action.shares));
      transfers.push(transfer(1, SOLVER, ZERO, action.shares));
      fills.push(
        at(2, {
          address: QUEUE,
          topics: [TOPIC_FULFILLED, pad32(action.wallet), pad32(SHARE), pad32(USDT)],
          // offerAmountSpent, wantAmountReceived, timestamp.
          data: `0x${word(action.shares)}${word(action.shares)}${word(action.t)}`,
        })
      );
    } else {
      transfers.push(transfer(0, action.from, action.to, action.shares));
      rateAt.set(blockNumber, action.rate);
    }
  });

  const count = (kind: Action["kind"]) => actions.filter((a) => a.kind === kind).length;
  return {
    logs: { deposits, transfers, fills },
    // A deposit mints; a fill moves a leg to the solver and the solver burns it.
    shape: {
      deposits: count("deposit"),
      transfers: transfers.length,
      fills: fills.length,
      mints: count("deposit"),
      burns: count("fill"),
      legs: count("fill"),
    },
    timeAt,
    rateAt,
  };
}

// The scan's two phases for one wallet, run as the hook will run them: the
// replay is given the answers to the reads the planner asked for and NOTHING
// else, so a block it needs but never asked about throws rather than passing.
function scan(forged: Forged, wallet: string) {
  const reads = transferReads(forged.logs, wallet);
  const missing = (what: string, block: bigint): never => {
    throw new Error(`the forge has no ${what} at block ${block}`);
  };
  const blockTimes = new Map(
    reads.dateBlocks.map((b) => [b, forged.timeAt.get(b) ?? missing("timestamp", b)] as const)
  );
  const rates = new Map(
    reads.rateBlocks.map((b) => [b, forged.rateAt.get(b) ?? missing("rate", b)] as const)
  );
  return { reads, history: holderHistory(forged.logs, { blockTimes, rates }, wallet) };
}

const historyOf = (forged: Forged, wallet: string) => scan(forged, wallet).history;
const kindsOf = (forged: Forged, wallet: string) => historyOf(forged, wallet).map((e) => e.kind);

// The shares a history accounts for. Every fixture holder's balance is fully
// explained by its own events — the ledger floor sits below all of this
// activity — so this must come to the balance the chain reported, with no
// residual lot left to make up the difference.
const held = (history: HolderEvent[]): bigint =>
  history.reduce(
    (shares, event) =>
      event.kind === "deposit" || event.kind === "transfer-in"
        ? shares + event.shares
        : shares - event.shares,
    0n
  );

// A fixture's histories, forged back into the chain that produced them.
//
// Every deposit is a deposit, every fill a fill; a transfer is one action with
// two legs, so each holder's `transfer-out` is matched to the counterpart
// `transfer-in` (same shares, same second) and the pairing is asserted rather
// than assumed. Ordered by the events' own timestamps, which is chain order:
// a deposit's `t` is the block's, a fill's is the queue's stamp at the fill.
function chainOf(holders: Record<string, Holding>): Action[] {
  const histories = Object.entries(holders).map(([w, h]) => [w, h.history] as const);
  const actions: Action[] = [];
  let ins = 0;
  for (const [wallet, history] of histories) {
    for (const event of history) {
      if (event.kind === "transfer-in") ins += 1;
      if (event.kind === "deposit") {
        actions.push({
          kind: "deposit",
          wallet,
          t: event.t,
          shares: BigInt(event.shares),
          assets: BigInt(event.assets!),
        });
      } else if (event.kind === "fill") {
        actions.push({ kind: "fill", wallet, t: event.t, shares: BigInt(event.shares) });
      } else if (event.kind === "transfer-out") {
        const matches = (e: FixtureEvent) =>
          e.kind === "transfer-in" && e.t === event.t && e.shares === event.shares;
        const recipient = histories.find(
          ([other, theirs]) => other !== wallet && theirs.some(matches)
        );
        if (!recipient) throw new Error(`no recipient for ${wallet}'s transfer at ${event.t}`);
        actions.push({
          kind: "transfer",
          from: wallet,
          to: recipient[0],
          t: event.t,
          shares: BigInt(event.shares),
          rate: BigInt(recipient[1].find(matches)!.rate!),
        });
      }
    }
  }
  const paired = actions.filter((a) => a.kind === "transfer").length;
  if (paired !== ins) throw new Error(`${ins} transfers in, ${paired} paired`);
  return actions.sort((a, b) => a.t - b.t);
}

// =============================================================================
// The three settings of ticket 03.
// =============================================================================

const live = (vault: string): Setting => {
  const widget = fixture<LiveFixture>(`widget-${vault}.json`);
  return { holders: widget.holders, counts: widget.counts, raw: widget.raw };
};
const fork = fixture<ForkFixture>("fork.json");
const moment = (i: number): Setting => {
  const m = fork.moments[i];
  return {
    holders: Object.fromEntries(Object.values(m.holders).map((h) => [h.address, h.widget])),
    counts: m.widgetCounts,
    raw: m.widgetRaw,
  };
};

describe.each([
  ["the live 30d holders", live("coinchange-30d-polygon")],
  ["the live 24h holders", live("coinchange-24h-polygon")],
  [`the fork — ${fork.moments[0].label}`, moment(0)],
  [`the fork — ${fork.moments[1].label}`, moment(1)],
  [`the fork — ${fork.moments[2].label}`, moment(2)],
])("%s", (_label, setting) => {
  const forged = forge(chainOf(setting.holders));
  const wallets = Object.keys(setting.holders);

  it("forges the chain the fixture's own raw tallies describe", () => {
    // Every mint, burn and leg in that count is an exclusion the replay below
    // has to make; without this, the round trip could be forging an easy chain.
    expect(forged.shape).toEqual(setting.raw);
  });

  it("replays each holder's history event for event", () => {
    for (const wallet of wallets) {
      expect(historyOf(forged, wallet)).toEqual(events(setting.holders[wallet].history));
    }
  });

  it("accounts for every holder's share balance, with nothing left over", () => {
    // The balance came off the chain, not out of any history in this file: it
    // is what catches a lot invented, dropped, or spent twice.
    for (const wallet of wallets) {
      expect(held(historyOf(forged, wallet))).toBe(BigInt(setting.holders[wallet].shareBalance));
    }
  });

  it("keeps, across all its holders, exactly what the ledger tallied", () => {
    const counts: Tallies = { deposit: 0, transfer: 0, fill: 0 };
    for (const wallet of wallets) {
      for (const event of historyOf(forged, wallet)) {
        if (event.kind === "deposit") counts.deposit += 1;
        else if (event.kind === "fill") counts.fill += 1;
        // The ledger counts a transfer as the two events it is.
        else counts.transfer += 1;
      }
    }
    expect(counts).toEqual(setting.counts);
  });
});

describe.each([["coinchange-30d-polygon"], ["coinchange-24h-polygon"]])(
  "%s — the solver's own file, over the same chain",
  (vault) => {
    it("replays to what the solver's ledger wrote, not just to the widget's copy", () => {
      const widget = live(vault);
      const solver = fixture<LiveFixture>(`solver-${vault}.json`);
      const forged = forge(chainOf(widget.holders));
      expect(Object.keys(solver.holders)).toEqual(Object.keys(widget.holders));
      for (const [wallet, holding] of Object.entries(solver.holders)) {
        expect(historyOf(forged, wallet)).toEqual(events(holding.history));
      }
    });
  }
);

describe("the fork's named cases", () => {
  const forged = forge(chainOf(moment(1).holders));
  const { A, C, D } = fork.moments[1].holders;

  it("gives the transfer recipient a transfer-in lot at the transfer block's rate", () => {
    // Holder D never deposited. Unread, its balance would quote as a VESTED
    // residual lot at full share price — the over-quote the solver skips.
    const { reads, history } = scan(forged, D.address);
    expect(history).toEqual([
      {
        kind: "transfer-in",
        t: 1_788_362_882,
        shares: 400_000_000_000_000_000_000n,
        rate: 1_000_000n,
      },
    ]);
    // One transfer of its own: one block to date, one rate to read.
    expect(reads.dateBlocks).toHaveLength(1);
    expect(reads.rateBlocks).toEqual(reads.dateBlocks);
  });

  it("leaves the filled holder's history `deposit, fill` — the leg is not an event", () => {
    expect(kindsOf(forged, A.address)).toEqual(["deposit", "fill"]);
    // And its own fill cost it no transfer read at all.
    expect(scan(forged, A.address).reads).toEqual({ dateBlocks: [], rateBlocks: [] });
  });

  it("charges the sender a date but no rate — shares leaving carry no entry price", () => {
    expect(kindsOf(forged, C.address)).toEqual(["deposit", "transfer-out"]);
    const { reads } = scan(forged, C.address);
    expect(reads.dateBlocks).toHaveLength(1);
    expect(reads.rateBlocks).toEqual([]);
  });
});

// =============================================================================
// The exclusions, one at a time.
// =============================================================================

const ALICE = "0xAAaaAAaaAaaAAaaAaAAaaAaAaAaAaaAAAAaAaAA1";
const BOB = "0xbBBbbbBbbbBBBBbBbbBBBb00000000000000BbB2";
const CAROL = "0xcCCCCCcccCCCcCCcCcCCcccC0000000000000cC3";
const ONE = 10n ** 18n;

describe("what the replay excludes", () => {
  it("drops the mint that accompanies a deposit, keeping the deposit lot", () => {
    const forged = forge([
      { kind: "deposit", wallet: ALICE, t: 1_788_000_000, shares: ONE, assets: 1_000_000n },
    ]);
    expect(historyOf(forged, ALICE)).toEqual([
      { kind: "deposit", t: 1_788_000_000, shares: ONE, assets: 1_000_000n },
    ]);
    // A mint read as a transfer-in would be a second lot, at the block's rate,
    // for shares the deposit already accounts for.
    expect(scan(forged, ALICE).reads).toEqual({ dateBlocks: [], rateBlocks: [] });
  });

  it("drops a burn, whoever burns", () => {
    const forged = forge([
      { kind: "deposit", wallet: ALICE, t: 1_788_000_000, shares: ONE, assets: 1_000_000n },
    ]);
    forged.logs.transfers.push({
      address: SHARE,
      topics: [TOPIC_TRANSFER, pad32(ALICE), pad32(ZERO)],
      data: `0x${word(ONE)}`,
      blockNumber: hex(BASE_BLOCK + 50n),
      logIndex: "0x0",
      transactionHash: `0x${"f".repeat(64)}`,
    });
    // Dropped before anything is dated: there is nothing to read for it.
    expect(scan(forged, ALICE).reads.dateBlocks).toEqual([]);
    expect(kindsOf(forged, ALICE)).toEqual(["deposit"]);
  });

  it("drops a fill's share leg on the (transaction, holder) pair, not on the solver", () => {
    // One batch fill moving two holders' shares, and — in the same transaction —
    // a genuine transfer from a third holder. Keying the exclusion on the
    // solver's address, or on the transaction alone, would swallow Carol's.
    const forged = forge([
      { kind: "deposit", wallet: ALICE, t: 1_788_000_000, shares: ONE, assets: 1_000_000n },
      { kind: "deposit", wallet: BOB, t: 1_788_000_100, shares: ONE, assets: 1_000_000n },
      { kind: "deposit", wallet: CAROL, t: 1_788_000_200, shares: ONE, assets: 1_000_000n },
      { kind: "fill", wallet: ALICE, t: 1_788_100_000, shares: ONE },
    ]);
    const batch = BASE_BLOCK + 30n;
    const tx = `0x${"4".padStart(64, "0")}` as `0x${string}`;
    const inBatch = (from: string, logIndex: `0x${string}`): RawLog => ({
      address: SHARE,
      topics: [TOPIC_TRANSFER, pad32(from), pad32(SOLVER)],
      data: `0x${word(ONE)}`,
      blockNumber: hex(batch),
      logIndex,
      transactionHash: tx,
    });
    // Bob's leg and Carol's transfer, in the fill's own transaction.
    forged.logs.transfers.push(inBatch(BOB, "0x3"), inBatch(CAROL, "0x4"));
    forged.logs.fills.push({
      address: QUEUE,
      topics: [TOPIC_FULFILLED, pad32(BOB), pad32(SHARE), pad32(USDT)],
      data: `0x${word(ONE)}${word(ONE)}${word(1_788_100_000)}`,
      blockNumber: hex(batch),
      logIndex: "0x5",
      transactionHash: tx,
    });
    forged.rateAt.set(batch, 1_000_500n);

    expect(kindsOf(forged, ALICE)).toEqual(["deposit", "fill"]);
    expect(kindsOf(forged, BOB)).toEqual(["deposit", "fill"]);
    // Carol's transfer out of the same transaction is hers, and it is an event.
    expect(historyOf(forged, CAROL)).toEqual([
      { kind: "deposit", t: 1_788_000_200, shares: ONE, assets: 1_000_000n },
      { kind: "transfer-out", t: 1_788_100_000, shares: ONE },
    ]);
    // And from the solver's own side: two legs it was handed are not lots of
    // its, the one transfer it was sent is.
    expect(historyOf(forged, SOLVER)).toEqual([
      { kind: "transfer-in", t: 1_788_100_000, shares: ONE, rate: 1_000_500n },
    ]);
  });

  it("excludes a leg only in its own transaction", () => {
    const forged = forge([
      { kind: "deposit", wallet: ALICE, t: 1_788_000_000, shares: 2n * ONE, assets: 2_000_000n },
      { kind: "fill", wallet: ALICE, t: 1_788_100_000, shares: ONE },
      // The same two addresses, one block later: a transfer, not a leg.
      {
        kind: "transfer",
        from: ALICE,
        to: SOLVER,
        t: 1_788_100_100,
        shares: ONE,
        rate: 1_000_500n,
      },
    ]);
    expect(kindsOf(forged, ALICE)).toEqual(["deposit", "fill", "transfer-out"]);
  });

  it("keeps only the wallet's own legs out of an unfiltered transfer range", () => {
    // The transfer range is scanned unfiltered, so it carries strangers'
    // movements. They are not this wallet's events — and, the reason it matters,
    // they must not cost it a block date or an archive rate call either.
    const forged = forge([
      { kind: "deposit", wallet: ALICE, t: 1_788_000_000, shares: ONE, assets: 1_000_000n },
      { kind: "transfer", from: BOB, to: CAROL, t: 1_788_100_000, shares: ONE, rate: 1_000_500n },
    ]);
    expect(historyOf(forged, ALICE)).toHaveLength(1);
    expect(scan(forged, ALICE).reads).toEqual({ dateBlocks: [], rateBlocks: [] });
    // The same logs, read for a wallet that IS a party to it.
    expect(scan(forged, CAROL).reads.rateBlocks).toHaveLength(1);
  });
});

// =============================================================================
// Order, and the refund the replay is built to ignore.
// =============================================================================

describe("the order the replay reads events in", () => {
  const script: Action[] = [
    { kind: "deposit", wallet: ALICE, t: 1_788_000_000, shares: ONE, assets: 1_000_000n },
    { kind: "fill", wallet: ALICE, t: 1_788_100_000, shares: 5n * 10n ** 17n },
    { kind: "deposit", wallet: ALICE, t: 1_788_200_000, shares: ONE, assets: 1_000_100n },
    {
      kind: "transfer",
      from: ALICE,
      to: BOB,
      t: 1_788_300_000,
      shares: 10n ** 17n,
      rate: 1_000_500n,
    },
  ];

  it("is the chain's, whatever order the scans hand the logs back in", () => {
    const forged = forge(script);
    const shuffled: Forged = {
      ...forged,
      logs: {
        deposits: [...forged.logs.deposits].reverse(),
        transfers: [...forged.logs.transfers].reverse(),
        fills: forged.logs.fills,
      },
    };
    expect(historyOf(shuffled, ALICE)).toEqual(historyOf(forged, ALICE));
    expect(kindsOf(shuffled, ALICE)).toEqual(["deposit", "fill", "deposit", "transfer-out"]);
  });

  it("breaks a tie within one block on logIndex", () => {
    // A holder who deposits and sends the shares on inside one block. Nothing
    // but logIndex separates the two events, and which way round they fall
    // decides whether the lot exists to be spent.
    const block = BASE_BLOCK;
    const deposit: RawLog = {
      address: TELLER,
      topics: [TOPIC_DEPOSIT, `0x${word(1)}`, pad32(ALICE), pad32(USDT)],
      data: `0x${word(1_000_000n)}${word(ONE)}${word(1_788_000_000)}${word(86_400)}`,
      blockNumber: hex(block),
      logIndex: "0x1",
      transactionHash: `0x${"e".repeat(64)}`,
    };
    const sent: RawLog = {
      address: SHARE,
      topics: [TOPIC_TRANSFER, pad32(ALICE), pad32(BOB)],
      data: `0x${word(ONE)}`,
      blockNumber: hex(block),
      logIndex: "0x2",
      transactionHash: `0x${"e".repeat(64)}`,
    };
    const reads = {
      blockTimes: new Map([[block, 1_788_000_000]]),
      rates: new Map([[block, 1_000_500n]]),
    };
    const kinds = (deposited: `0x${string}`, transferred: `0x${string}`): string[] =>
      holderHistory(
        {
          deposits: [{ ...deposit, logIndex: deposited }],
          transfers: [{ ...sent, logIndex: transferred }],
          fills: [],
        },
        reads,
        ALICE
      ).map((e) => e.kind);

    expect(kinds("0x1", "0x2")).toEqual(["deposit", "transfer-out"]);
    expect(kinds("0x2", "0x1")).toEqual(["transfer-out", "deposit"]);
    // Hex, not string order: log 16 comes after log 9.
    expect(kinds("0x9", "0x10")).toEqual(["deposit", "transfer-out"]);
  });
});

describe("a refunded deposit (spec: no refund exclusion in this reading)", () => {
  // Teller.refundDeposit → vault.exit → _burn: the shares go, the Deposit log
  // stays, and the ledger never reads DepositRefunded. No refund has been
  // emitted on either product and none appears in the fork scenario, so this
  // vector is the only place the two derivations are seen to diverge at all.
  const forged = forge([
    { kind: "deposit", wallet: ALICE, t: 1_788_000_000, shares: ONE, assets: 1_000_000n },
  ]);
  const nonce = forged.logs.deposits[0].topics[1];
  const refundBlock = BASE_BLOCK + 5n;
  const refundTx = `0x${"a".repeat(64)}` as `0x${string}`;
  forged.logs.deposits.push({
    address: TELLER,
    topics: [TOPIC_DEPOSIT_REFUNDED, nonce, pad32(ALICE)],
    data: `0x${"1".repeat(64)}`,
    blockNumber: hex(refundBlock),
    logIndex: "0x1",
    transactionHash: refundTx,
  });
  // The refund's own burn, in the same transaction.
  forged.logs.transfers.push({
    address: SHARE,
    topics: [TOPIC_TRANSFER, pad32(ALICE), pad32(ZERO)],
    data: `0x${word(ONE)}`,
    blockNumber: hex(refundBlock),
    logIndex: "0x0",
    transactionHash: refundTx,
  });

  it("drops the deposit from the earnings derivation", () => {
    const totals = reconstructDeposits(forged.logs.deposits.map(decodeDepositLog), DECIMALS);
    expect(totals.sharesMinted).toBe(0);
    expect(totals.avgCost).toBeNull();
  });

  it("keeps the lot in the history and excludes the refund's burn", () => {
    expect(historyOf(forged, ALICE)).toEqual([
      { kind: "deposit", t: 1_788_000_000, shares: ONE, assets: 1_000_000n },
    ]);
  });
});

// =============================================================================
// The second phase — which blocks to date, which transfers to rate.
// =============================================================================

describe("transferReads", () => {
  it("asks for nothing when every transfer is excluded", () => {
    // The 24h product's whole production history: five mints, two legs, two
    // burns and not one transfer between wallets.
    const setting = live("coinchange-24h-polygon");
    const forged = forge(chainOf(setting.holders));
    for (const wallet of Object.keys(setting.holders)) {
      expect(transferReads(forged.logs, wallet)).toEqual({ dateBlocks: [], rateBlocks: [] });
    }
  });

  it("dates a block once however many transfers it brought the wallet", () => {
    const forged = forge([
      { kind: "deposit", wallet: ALICE, t: 1_788_000_000, shares: 2n * ONE, assets: 2_000_000n },
      { kind: "transfer", from: ALICE, to: BOB, t: 1_788_100_000, shares: ONE, rate: 1_000_500n },
    ]);
    const block = BigInt(forged.logs.transfers[forged.logs.transfers.length - 1].blockNumber);
    // A second transfer in that same block, also into Bob.
    forged.logs.transfers.push({
      address: SHARE,
      topics: [TOPIC_TRANSFER, pad32(CAROL), pad32(BOB)],
      data: `0x${word(ONE)}`,
      blockNumber: hex(block),
      logIndex: "0x1",
      transactionHash: `0x${"b".repeat(64)}`,
    });
    const reads = transferReads(forged.logs, BOB);
    expect(reads.dateBlocks).toEqual([block]);
    // One rate read per transfer-in, as the ledger makes them — the list is the
    // cost, and two lots arriving in one block are still two lots.
    expect(reads.rateBlocks).toEqual([block, block]);
  });

  it("is what the replay is allowed to need: a lost read is a failed scan", () => {
    const forged = forge([
      { kind: "deposit", wallet: ALICE, t: 1_788_000_000, shares: ONE, assets: 1_000_000n },
      { kind: "transfer", from: ALICE, to: BOB, t: 1_788_100_000, shares: ONE, rate: 1_000_500n },
    ]);
    const reads = transferReads(forged.logs, BOB);
    const blockTimes = new Map(reads.dateBlocks.map((b) => [b, forged.timeAt.get(b)!] as const));
    const rates = new Map(reads.rateBlocks.map((b) => [b, forged.rateAt.get(b)!] as const));

    expect(() => holderHistory(forged.logs, { blockTimes: new Map(), rates }, BOB)).toThrow(
      /cannot be dated/
    );
    expect(() => holderHistory(forged.logs, { blockTimes, rates: new Map() }, BOB)).toThrow(
      /no rate/
    );
  });
});
