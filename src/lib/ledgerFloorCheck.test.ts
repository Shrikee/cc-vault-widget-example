// The ledger-floor check against a forged chain — src/lib/ledgerFloorCheck.ts.
//
// ./floorSoundness.test.ts says what the two arms DECIDE; these say what is
// actually asked of the chain, and what happens when the chain does not answer.
// That second half is the one that matters most: the whole point of the check
// is to degrade rather than quote from a floor it could not verify, so a broken
// endpoint has to come out as a reason a surface can say — never as a silent
// `sound`, and never as a throw the caller has to interpret.
//
// The vault is the registry's real 30d entry, so the floor block and the
// vesting term below are the ones the widget actually ships with.
import { describe, expect, it } from "vitest";

import { ROSTER } from "../config/vaults";
import { readLedgerFloor } from "./ledgerFloorCheck";
import { vaultById } from "./vaultRegistry";

const DAY = 86_400;
const NOW = 1_788_264_000; // 2026-09-01T12:00:00Z
const VAULT_30D = vaultById(ROSTER, "coinchange-30d-polygon");
const VAULT_24H = vaultById(ROSTER, "coinchange-24h-polygon");
const FLOOR = BigInt(VAULT_30D.eventsFromBlock);

// What was asked of the chain, so a read the check should not have made shows
// up as a request in the record.
interface Asked {
  blocks: bigint[];
  supplyAt: bigint[];
}

// A chain that dates the floor block `ageDays` back and holds `supply` shares
// below it. `broken` refuses everything, the way a dead endpoint does.
function chain(options: {
  ageDays?: number;
  supply?: bigint;
  broken?: string;
  supplyBroken?: string;
}) {
  const asked: Asked = { blocks: [], supplyAt: [] };
  const client = {
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => {
      asked.blocks.push(blockNumber);
      if (options.broken) throw new Error(options.broken);
      return {
        timestamp: BigInt(NOW - Math.round((options.ageDays ?? 40) * DAY)),
      };
    },
    readContract: async ({ blockNumber }: { blockNumber: bigint }) => {
      asked.supplyAt.push(blockNumber);
      if (options.supplyBroken) throw new Error(options.supplyBroken);
      return options.supply ?? 0n;
    },
    // The check only ever reaches for these two.
  } as unknown as Parameters<typeof readLedgerFloor>[0];
  return { client, asked };
}

describe("what it asks the chain for", () => {
  it("dates the registry's own floor block, and stops there when it is old enough", () => {
    const { client, asked } = chain({ ageDays: 40 });
    return readLedgerFloor(client, VAULT_30D, NOW).then((verdict) => {
      expect(verdict).toEqual({ status: "sound" });
      expect(asked.blocks).toEqual([FLOOR]);
      // No archive read at all: a floor past the term has no residual lot that
      // could be mispriced, and a call the widget does not need is one more way
      // to fail.
      expect(asked.supplyAt).toEqual([]);
    });
  });

  it("reads the supply BELOW the floor, not at it, on a young floor", async () => {
    const { client, asked } = chain({ ageDays: 15, supply: 0n });
    expect(await readLedgerFloor(client, VAULT_30D, NOW)).toEqual({
      status: "sound",
    });
    // floor − 1: the invariant is that nothing existed before the block the
    // ledger starts from. Asking AT the floor would read the block the first
    // deposit may be in.
    expect(asked.supplyAt).toEqual([FLOOR - 1n]);
  });

  it("makes no read at all where the term is a day — the 24h floor is long past it", async () => {
    const { client, asked } = chain({ ageDays: 40 });
    expect(await readLedgerFloor(client, VAULT_24H, NOW)).toEqual({
      status: "sound",
    });
    expect(asked.supplyAt).toEqual([]);
  });
});

describe("the live 30d floor", () => {
  it("passes on the supply arm — young, with nothing below it", async () => {
    // The spec's recorded fact: fifteen days old under a thirty-day term, and
    // no shares below the floor.
    expect(
      await readLedgerFloor(chain({ ageDays: 15, supply: 0n }).client, VAULT_30D, NOW)
    ).toEqual({ status: "sound" });
  });
});

describe("a floor that cannot be priced from", () => {
  it("names the block and its age when shares were minted below it", async () => {
    const verdict = await readLedgerFloor(
      chain({ ageDays: 15, supply: 1n }).client,
      VAULT_30D,
      NOW
    );
    expect(verdict).toEqual({
      status: "unsound",
      reason: {
        kind: "floor-too-young",
        floorBlock: FLOOR,
        ageSeconds: 15 * DAY,
      },
    });
  });
});

describe("when the RPC is broken", () => {
  it("degrades with the chain's own words rather than throwing", async () => {
    const verdict = await readLedgerFloor(
      chain({ broken: "HTTP request failed" }).client,
      VAULT_30D,
      NOW
    );
    expect(verdict).toEqual({
      status: "unsound",
      reason: { kind: "read-failed", detail: "HTTP request failed" },
    });
  });

  it("degrades the same way when only the archive read fails", async () => {
    // A node that serves the head but not an old block: the age arm answers,
    // the supply arm cannot, and a floor half-established is not established.
    const verdict = await readLedgerFloor(
      chain({ ageDays: 15, supplyBroken: "missing trie node" }).client,
      VAULT_30D,
      NOW
    );
    expect(verdict).toEqual({
      status: "unsound",
      reason: { kind: "read-failed", detail: "missing trie node" },
    });
  });

  it("never comes back sound from a chain that answered nothing", async () => {
    // The property the whole check exists for, stated on its own: silence is
    // not permission.
    for (const options of [
      { broken: "ECONNREFUSED" },
      { ageDays: 15, supplyBroken: "ECONNREFUSED" },
    ]) {
      const verdict = await readLedgerFloor(chain(options).client, VAULT_30D, NOW);
      expect(verdict.status).toBe("unsound");
    }
  });
});
