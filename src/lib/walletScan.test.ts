// One wallet's scan, end to end against a forged chain — src/lib/walletScan.ts
// (spec, "The holder-history read"; ADR-0003).
//
// The planner's vectors (./scanPlan.test.ts) say what ranges a scan is made of
// and the replay's (./holderHistory.test.ts) say what a history is; neither
// says what the scan ASKS THE CHAIN FOR, and that is what over-quotes a holder
// when it is wrong. So these vectors drive the real thing — the real filters,
// the real chunking, the real in-flight budget — against a fake RPC that
// answers eth_getLogs by applying the filter it was given. A range the scan
// forgot to ask for, a rate read at the wrong block or a second read of a block
// already held all show up here as a request that was or was not made.
//
// The chain is forged rather than fixtured: what ticket 03 wrote down is the
// history that came OUT (./holderHistory.test.ts asserts against it), and what
// is under test here is the round trip from logs to figures, one wallet's worth.
import { describe, expect, it, beforeAll } from "vitest";

import type { Hex, PublicClient } from "viem";

import {
  TOPIC_DEPOSIT,
  TOPIC_DEPOSIT_REFUNDED,
  TOPIC_FULFILLED,
  TOPIC_TRANSFER,
} from "../config/history";
import { ROSTER } from "../config/vaults";
import { decodeDepositLog, reconstructDeposits } from "./apy";
import type { RawLog } from "./logScan";
import { vaultById, type Vault } from "./vaultRegistry";
import { deriveWallet, readWalletScan, type WalletScan } from "./walletScan";

const VAULT_24H = vaultById(ROSTER, "coinchange-24h-polygon");
const VAULT_30D = vaultById(ROSTER, "coinchange-30d-polygon");

// The wallet under test, a stranger it trades with, and the solver a fill moves
// its shares through.
const WALLET = "0x5df638485db34ff4fb5a1c565b9b27c12851ed38";
const STRANGER = "0x00000000000000000000000000000000000a1ice";
const OUTSIDER = "0x00000000000000000000000000000000000b0b0b";
const SOLVER = "0x0000000000000000000000000000000000501ffe";
const ZERO = "0x0000000000000000000000000000000000000000";
// USDT, 6 dp — the registry's `want` and the only deposit asset (config/tokens).
const USDT = ROSTER.baseAsset;

const pad32 = (address: string): Hex =>
  `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
const word = (value: bigint | number): string => BigInt(value).toString(16).padStart(64, "0");
const hex = (n: bigint | number): Hex => `0x${BigInt(n).toString(16)}`;

// =============================================================================
// A chain to scan.
// =============================================================================

// One action per block, so (blockNumber, logIndex) alone orders the result and
// what the second phase must read can be read off the script: a transfer this
// wallet is a party to needs its block dated, and one it RECEIVES needs that
// block's rate as well.
type Action =
  | { kind: "deposit"; nonce: number; t: number; shares: bigint; assets: bigint }
  // The refund of an earlier deposit: the Teller burns the shares and leaves the
  // Deposit log standing (spec: "No refund exclusion in this reading").
  | { kind: "refund"; nonce: number; shares: bigint }
  | { kind: "transfer"; from: string; to: string; shares: bigint; rate: bigint }
  | { kind: "fill"; t: number; shares: bigint };

interface Chain {
  // Every log the products emitted, one flat list across all three contracts —
  // what the fake RPC filters, so the scan's own topics decide what it sees.
  logs: RawLog[];
  timeAt: Map<bigint, number>;
  rateAt: Map<bigint, bigint>;
}

// Blocks are the product's own: a scan starts at the ledger floor, and a forged
// log below it would never be fetched.
const floorOf = (vault: Vault) => BigInt(vault.eventsFromBlock);
const blockOf = (vault: Vault, i: number) => floorOf(vault) + 100n + BigInt(i) * 10n;
// Close enough to the floor that every range is one chunk (LOG_CHUNK_SPAN), so
// a request in the record is a RANGE rather than an arbitrary slice of one.
const headOf = (vault: Vault) => floorOf(vault) + 5_000n;

function forge(vault: Vault, actions: Action[], from = 0): Chain {
  const logs: RawLog[] = [];
  const timeAt = new Map<bigint, number>();
  const rateAt = new Map<bigint, bigint>();

  actions.forEach((action, i) => {
    const blockNumber = blockOf(vault, from + i);
    const transactionHash = hex(BigInt(from + i + 1) * 7919n);
    const at = (
      logIndex: number,
      log: Omit<RawLog, "blockNumber" | "logIndex" | "transactionHash">
    ): void => {
      logs.push({ ...log, blockNumber: hex(blockNumber), logIndex: hex(logIndex), transactionHash });
    };
    const transfer = (logIndex: number, sender: string, to: string, shares: bigint): void =>
      at(logIndex, {
        address: vault.addresses.vault,
        topics: [TOPIC_TRANSFER, pad32(sender), pad32(to)],
        data: `0x${word(shares)}`,
      });

    if (action.kind === "deposit") {
      timeAt.set(blockNumber, action.t);
      // The Teller mints, then logs the deposit.
      transfer(0, ZERO, WALLET, action.shares);
      at(1, {
        address: vault.addresses.teller,
        topics: [TOPIC_DEPOSIT, hex(action.nonce), pad32(WALLET), pad32(USDT)],
        // depositAmount, shareAmount, depositTimestamp, shareLockPeriod.
        data: `0x${word(action.assets)}${word(action.shares)}${word(action.t)}${word(86_400)}`,
      });
    } else if (action.kind === "refund") {
      // refundDeposit → vault.exit → _burn: a burn Transfer the replay excludes,
      // and a DepositRefunded the average deposit cost reads.
      transfer(0, WALLET, ZERO, action.shares);
      at(1, {
        address: vault.addresses.teller,
        topics: [TOPIC_DEPOSIT_REFUNDED, hex(action.nonce), pad32(WALLET)],
        data: `0x${word(0)}`,
      });
    } else if (action.kind === "fill") {
      timeAt.set(blockNumber, action.t);
      // The holder's share leg to the solver, the solver's burn, then the fill.
      transfer(0, WALLET, SOLVER, action.shares);
      transfer(1, SOLVER, ZERO, action.shares);
      at(2, {
        address: vault.addresses.queue,
        topics: [
          TOPIC_FULFILLED,
          pad32(WALLET),
          pad32(vault.addresses.vault),
          pad32(vault.addresses.want),
        ],
        // offerAmountSpent, wantAmountReceived, timestamp.
        data: `0x${word(action.shares)}${word(action.shares)}${word(action.t)}`,
      });
    } else {
      timeAt.set(blockNumber, 1_800_000_000 + from + i);
      rateAt.set(blockNumber, action.rate);
      transfer(0, action.from, action.to, action.shares);
    }
  });

  return { logs, timeAt, rateAt };
}

// =============================================================================
// The RPC, faked — and recording.
// =============================================================================

interface Request {
  method: string;
  params: readonly unknown[];
}
// An eth_getLogs filter as the scan spells it.
interface LogFilter {
  address: Hex;
  topics: (Hex | Hex[] | null)[];
  fromBlock: Hex;
  toBlock: Hex;
}

const matches = (log: RawLog, filter: LogFilter): boolean => {
  if (log.address.toLowerCase() !== filter.address.toLowerCase()) return false;
  const block = BigInt(log.blockNumber);
  if (block < BigInt(filter.fromBlock) || block > BigInt(filter.toBlock)) return false;
  return filter.topics.every((topic, i) => {
    if (topic === null) return true;
    const wanted = (Array.isArray(topic) ? topic : [topic]).map((t) => t.toLowerCase());
    return wanted.includes((log.topics[i] ?? "").toLowerCase());
  });
};

// A client that answers the three methods a wallet scan makes, from the forged
// chain, and keeps every request it was asked — the record IS the assertion for
// what the scan reads and what it does not read twice.
//
// `fails` makes one method fail, which is how the all-or-nothing contract is
// asserted: the whole scan must reject, not come back short.
function fakeChain(chain: Chain, fails?: string) {
  const seen: Request[] = [];
  const request = async ({ method, params }: Request): Promise<unknown> => {
    seen.push({ method, params });
    if (method === fails) throw new Error(`${method} is down`);
    if (method === "eth_getLogs") {
      const filter = params[0] as LogFilter;
      return chain.logs.filter((log) => matches(log, filter));
    }
    if (method === "eth_getBlockByNumber") {
      const found = chain.timeAt.get(BigInt(params[0] as string));
      return found === undefined ? null : { timestamp: hex(found) };
    }
    if (method === "eth_call") {
      const rate = chain.rateAt.get(BigInt(params[1] as string));
      return hex(rate ?? 0n);
    }
    throw new Error(`unexpected ${method}`);
  };
  // The scan takes a viem client and calls one method on it; the rest of that
  // type is nothing this fake has to be.
  return { seen, client: { request } as unknown as PublicClient };
}

const of = (seen: Request[], method: string) => seen.filter((r) => r.method === method);
const filters = (seen: Request[]) => of(seen, "eth_getLogs").map((r) => r.params[0] as LogFilter);

// =============================================================================
// The scan a 30d holder gets on connect.
// =============================================================================

// A holder that did all five things: deposited, was sent shares, had a deposit
// refunded, was filled once, and sent shares on. The stranger's transfer is the
// share token's own noise — the unfiltered range brings it back and nothing may
// be read for it.
const SCRIPT: Action[] = [
  { kind: "deposit", nonce: 1, t: 1_790_000_000, shares: 100n * 10n ** 18n, assets: 100_000000n },
  { kind: "transfer", from: STRANGER, to: WALLET, shares: 40n * 10n ** 18n, rate: 1_010_000n },
  { kind: "deposit", nonce: 2, t: 1_790_100_000, shares: 50n * 10n ** 18n, assets: 51_000000n },
  { kind: "refund", nonce: 2, shares: 50n * 10n ** 18n },
  { kind: "fill", t: 1_790_200_000, shares: 30n * 10n ** 18n },
  { kind: "transfer", from: WALLET, to: OUTSIDER, shares: 10n * 10n ** 18n, rate: 1_020_000n },
  { kind: "transfer", from: STRANGER, to: OUTSIDER, shares: 5n * 10n ** 18n, rate: 1_030_000n },
];

const TRANSFER_IN_BLOCK = blockOf(VAULT_30D, 1);
const TRANSFER_OUT_BLOCK = blockOf(VAULT_30D, 5);

describe("what a 30d wallet's scan reads", () => {
  const chain = forge(VAULT_30D, SCRIPT);
  let seen: Request[];
  let scan: WalletScan;

  beforeAll(async () => {
    const rpc = fakeChain(chain);
    seen = rpc.seen;
    scan = await readWalletScan({
      client: rpc.client,
      vault: VAULT_30D,
      wallet: WALLET,
      resumeFrom: null,
      head: headOf(VAULT_30D),
      held: null,
    });
  });

  it("fetches the three ranges from the ledger floor, in one scan", () => {
    expect(filters(seen)).toHaveLength(3);
    for (const filter of filters(seen)) {
      expect(BigInt(filter.fromBlock)).toBe(floorOf(VAULT_30D));
      expect(BigInt(filter.toBlock)).toBe(headOf(VAULT_30D));
    }
    // The planner's filters, issued: the Teller pair filtered to the wallet, the
    // share transfers unfiltered, the queue's fills pinned to this product.
    expect(filters(seen).map((f) => f.address.toLowerCase())).toEqual([
      VAULT_30D.addresses.teller.toLowerCase(),
      VAULT_30D.addresses.vault.toLowerCase(),
      VAULT_30D.addresses.queue.toLowerCase(),
    ]);
    expect(filters(seen)[0].topics).toEqual([
      [TOPIC_DEPOSIT, TOPIC_DEPOSIT_REFUNDED],
      null,
      pad32(WALLET),
    ]);
    expect(filters(seen)[1].topics).toEqual([TOPIC_TRANSFER]);
  });

  it("holds the raw logs once, each kind as it came back", () => {
    // Two deposits and the refund on the Teller; every transfer the product had
    // — two mints, the refund's burn, the fill's leg and the solver's burn, and
    // the three transfers between holders; the one fill.
    expect(scan.logs.deposits).toHaveLength(3);
    expect(scan.logs.transfers).toHaveLength(8);
    expect(scan.logs.fills).toHaveLength(1);
  });

  it("dates every block the wallet's transfers are in, once each", () => {
    const dated = of(seen, "eth_getBlockByNumber").map((r) => BigInt(r.params[0] as string));
    expect(dated).toEqual([TRANSFER_IN_BLOCK, TRANSFER_OUT_BLOCK]);
    expect(scan.reads.blockTimes.get(TRANSFER_IN_BLOCK)).toBe(chain.timeAt.get(TRANSFER_IN_BLOCK));
  });

  it("rates the transfers IN, at their own block, through the unguarded read", () => {
    // getRateInQuote(want) — unguarded, so a transfer received during a past
    // pause stays readable — as an ARCHIVE call at the block the shares landed.
    const called = of(seen, "eth_call");
    expect(called).toHaveLength(1);
    expect(called[0].params[0]).toEqual({
      to: VAULT_30D.addresses.accountant,
      data: `0x1dcbb110${pad32(VAULT_30D.addresses.want).slice(2)}`,
    });
    expect(BigInt(called[0].params[1] as string)).toBe(TRANSFER_IN_BLOCK);
    expect(scan.reads.rates.get(TRANSFER_IN_BLOCK)).toBe(1_010_000n);
    // Shares leaving carry no entry price, and a stranger's transfer is not this
    // wallet's business at all.
    expect(scan.reads.rates.has(TRANSFER_OUT_BLOCK)).toBe(false);
  });
});

// =============================================================================
// The two derivations over those raw logs.
// =============================================================================

describe("what the raw logs derive", () => {
  const chain = forge(VAULT_30D, SCRIPT);
  let scan: WalletScan;

  beforeAll(async () => {
    const rpc = fakeChain(chain);
    scan = await readWalletScan({
      client: rpc.client,
      vault: VAULT_30D,
      wallet: WALLET,
      resumeFrom: null,
      head: headOf(VAULT_30D),
      held: null,
    });
  });

  it("computes the average deposit cost exactly as stage 1 does", () => {
    const { depositCost } = deriveWallet(scan, VAULT_30D, WALLET);
    // The refunded deposit is out: 100 USDT for 100 shares, and the 51-for-50
    // lot never really happened.
    expect(depositCost).toEqual({ deposited: 100, sharesMinted: 100, avgCost: 1 });
    expect(depositCost).toEqual(
      reconstructDeposits(scan.logs.deposits.map(decodeDepositLog), {
        [USDT.toLowerCase()]: 6,
      })
    );
  });

  it("replays the history the ledger would, refunds and all", () => {
    const { history } = deriveWallet(scan, VAULT_30D, WALLET);
    // The refunded LOT stays (the ledger never reads DepositRefunded) and its
    // burn is excluded, as are the mints and the fill's share leg. The
    // stranger's transfer is nobody's history but the stranger's.
    expect(history).toEqual([
      { kind: "deposit", t: 1_790_000_000, shares: 100n * 10n ** 18n, assets: 100_000000n },
      {
        kind: "transfer-in",
        t: chain.timeAt.get(TRANSFER_IN_BLOCK),
        shares: 40n * 10n ** 18n,
        rate: 1_010_000n,
      },
      { kind: "deposit", t: 1_790_100_000, shares: 50n * 10n ** 18n, assets: 51_000000n },
      { kind: "fill", t: 1_790_200_000, shares: 30n * 10n ** 18n },
      {
        kind: "transfer-out",
        t: chain.timeAt.get(TRANSFER_OUT_BLOCK),
        shares: 10n * 10n ** 18n,
      },
    ]);
  });

  it("gives a wallet that only ever received shares a history and no earnings", async () => {
    // The fork scenario's recipient: shareUnlockTime 0, one unvested lot, and
    // unread it would quote as a vested residual at full share price.
    const received = forge(VAULT_30D, [
      { kind: "transfer", from: STRANGER, to: WALLET, shares: 400n * 10n ** 18n, rate: 1_005_000n },
    ]);
    const rpc = fakeChain(received);
    const only = await readWalletScan({
      client: rpc.client,
      vault: VAULT_30D,
      wallet: WALLET,
      resumeFrom: null,
      head: headOf(VAULT_30D),
      held: null,
    });
    const { depositCost, history } = deriveWallet(only, VAULT_30D, WALLET);

    // "—" under the position value, exactly as today: it paid nothing for them.
    expect(depositCost.avgCost).toBeNull();
    expect(history).toEqual([
      {
        kind: "transfer-in",
        t: received.timeAt.get(blockOf(VAULT_30D, 0)),
        shares: 400n * 10n ** 18n,
        rate: 1_005_000n,
      },
    ]);
  });
});

// =============================================================================
// The 24h product, untouched.
// =============================================================================

describe("a product with no vesting gap", () => {
  it("scans Deposit only, reads nothing else, and derives no history", async () => {
    const chain = forge(VAULT_24H, SCRIPT);
    const rpc = fakeChain(chain);
    const scan = await readWalletScan({
      client: rpc.client,
      vault: VAULT_24H,
      wallet: WALLET,
      resumeFrom: null,
      head: headOf(VAULT_24H),
      held: null,
    });

    expect(filters(rpc.seen)).toHaveLength(1);
    expect(filters(rpc.seen)[0].address.toLowerCase()).toBe(
      VAULT_24H.addresses.teller.toLowerCase()
    );
    // Nothing is priced against a ceiling here, so there is no second phase and
    // no history — and the earnings figure is the one stage 1 computed.
    expect(of(rpc.seen, "eth_getBlockByNumber")).toHaveLength(0);
    expect(of(rpc.seen, "eth_call")).toHaveLength(0);
    expect(scan.logs.transfers).toEqual([]);
    expect(scan.logs.fills).toEqual([]);

    const { depositCost, history } = deriveWallet(scan, VAULT_24H, WALLET);
    expect(history).toBeUndefined();
    expect(depositCost).toEqual({ deposited: 100, sharesMinted: 100, avgCost: 1 });
  });
});

// =============================================================================
// All or nothing.
// =============================================================================

describe("one read that fails", () => {
  const scanning = (fails: string) => {
    const rpc = fakeChain(forge(VAULT_30D, SCRIPT), fails);
    return readWalletScan({
      client: rpc.client,
      vault: VAULT_30D,
      wallet: WALLET,
      resumeFrom: null,
      head: headOf(VAULT_30D),
      held: null,
    });
  };

  // A history missing a chunk, a date or a rate is the OVER-QUOTING kind of
  // wrong — it prices lots the solver knows are unvested — so the scan comes
  // back whole or not at all, and the hook has no partial history to hold.
  it("fails the whole scan when a chunk fails", async () => {
    await expect(scanning("eth_getLogs")).rejects.toThrow("eth_getLogs is down");
  });

  it("fails the whole scan when a transfer block cannot be dated", async () => {
    await expect(scanning("eth_getBlockByNumber")).rejects.toThrow("is down");
  });

  it("fails the whole scan when a transfer-in cannot be rated", async () => {
    await expect(scanning("eth_call")).rejects.toThrow("is down");
  });

  it("fails the whole scan when a transfer block is not there to date", async () => {
    // A null block is not a dated one: the replay would throw on it later, and
    // later is after the figures went out.
    const chain = forge(VAULT_30D, SCRIPT);
    chain.timeAt.delete(TRANSFER_IN_BLOCK);
    const rpc = fakeChain(chain);
    await expect(
      readWalletScan({
        client: rpc.client,
        vault: VAULT_30D,
        wallet: WALLET,
        resumeFrom: null,
        head: headOf(VAULT_30D),
        held: null,
      })
    ).rejects.toThrow(/cannot be dated/);
  });
});

// =============================================================================
// The tail after the wallet's own deposit.
// =============================================================================

describe("a tail folding into what is held", () => {
  it("reads only what is new, and re-reads no block it already has", async () => {
    const first = forge(VAULT_30D, SCRIPT);
    const opening = fakeChain(first);
    const head = headOf(VAULT_30D);
    const held = await readWalletScan({
      client: opening.client,
      vault: VAULT_30D,
      wallet: WALLET,
      resumeFrom: null,
      head,
      held: null,
    });

    // The wallet deposits again, and is sent more shares, past the cursor.
    const later = forge(
      VAULT_30D,
      [
        { kind: "deposit", nonce: 3, t: 1_790_300_000, shares: 20n * 10n ** 18n, assets: 21_000000n },
        { kind: "transfer", from: STRANGER, to: WALLET, shares: 7n * 10n ** 18n, rate: 1_040_000n },
      ],
      600
    );
    const chain: Chain = {
      logs: [...first.logs, ...later.logs],
      timeAt: new Map([...first.timeAt, ...later.timeAt]),
      rateAt: new Map([...first.rateAt, ...later.rateAt]),
    };
    const tailing = fakeChain(chain);
    const scan = await readWalletScan({
      client: tailing.client,
      vault: VAULT_30D,
      wallet: WALLET,
      resumeFrom: head + 1n,
      head: head + 10_000n,
      held,
    });

    // The tail resumes at the cursor, on all three ranges.
    for (const filter of filters(tailing.seen)) {
      expect(BigInt(filter.fromBlock)).toBe(head + 1n);
    }
    // The transfer block held from the full scan is not dated or rated again:
    // a block has one timestamp and one rate, and this is the read that costs.
    const newTransfer = blockOf(VAULT_30D, 601);
    expect(
      of(tailing.seen, "eth_getBlockByNumber").map((r) => BigInt(r.params[0] as string))
    ).toEqual([newTransfer]);
    expect(of(tailing.seen, "eth_call").map((r) => BigInt(r.params[1] as string))).toEqual([
      newTransfer,
    ]);
    expect(scan.reads.blockTimes.get(TRANSFER_IN_BLOCK)).toBe(
      first.timeAt.get(TRANSFER_IN_BLOCK)
    );

    // And the folded history is the whole of it, in chain order.
    const { depositCost, history } = deriveWallet(scan, VAULT_30D, WALLET);
    expect(depositCost.sharesMinted).toBe(120);
    expect(history?.map((event) => event.kind)).toEqual([
      "deposit",
      "transfer-in",
      "deposit",
      "fill",
      "transfer-out",
      "deposit",
      "transfer-in",
    ]);
  });
});
