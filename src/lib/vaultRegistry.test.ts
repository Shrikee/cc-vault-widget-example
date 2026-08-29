// The vault registry: what the shipped file declares, and how a broken one
// fails.
//
// Two things are asserted here. First, that src/config/vaults.json still
// carries the values verified against the live Polygon contracts on 2026-08-28
// — this is the guard against an edit quietly moving an address or a deploy
// block, which no type checker would catch. Second, that a malformed registry
// fails at load with a message naming the field, because the alternative is an
// `undefined` address reaching a contract call and a blank vault on screen.
import { describe, expect, it } from "vitest";

import shipped from "../config/vaults.json";
import { DEFAULT_VAULT_ID, ROSTER } from "../config/vaults";
import {
  hasVestingGap,
  parseVaultRegistry,
  vaultById,
  vestingDays,
} from "./vaultRegistry";

// Clone the shipped registry and break exactly one field, addressed by path
// ("vaults.1.addresses.teller"). Everything else stays valid, so the guard's
// complaint can only be about the field named. Omitting `value` deletes it.
function broken(path: string, value?: unknown): unknown {
  const root = structuredClone(shipped) as Record<string, unknown>;
  const keys = path.split(".");
  let node = root;
  for (const key of keys.slice(0, -1)) {
    node = node[key] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (value === undefined) delete node[last];
  else node[last] = value;
  return root;
}

const parseBroken = (path: string, value?: unknown) => () =>
  parseVaultRegistry(broken(path, value));

describe("the shipped registry", () => {
  it("parses, and declares both products", () => {
    expect(ROSTER.vaults.map((v) => v.id)).toEqual([
      "coinchange-24h-polygon",
      "coinchange-30d-polygon",
    ]);
    expect(DEFAULT_VAULT_ID).toBe("coinchange-24h-polygon");
    expect(vaultById(ROSTER, DEFAULT_VAULT_ID).ui.symbol).toBe("CCUSD");
  });

  it("declares one chain, shared by both products", () => {
    expect(ROSTER.chain).toEqual({
      key: "polygon",
      chainId: 137,
      label: "Polygon",
      explorer: "https://polygonscan.com",
    });
    expect(ROSTER.vaults.every((v) => v.chain === ROSTER.chain.key)).toBe(true);
  });

  // Verified on-chain 2026-08-28 at head 92,835,789 (spec, Further Notes). The
  // four values no chain read can confirm — queue, solver, ledger floor and
  // vesting term — carry their provenance in src/config/vaults.ts.
  it("carries the 24h product's verified values", () => {
    const v = vaultById(ROSTER, "coinchange-24h-polygon");
    expect(v.addresses).toEqual({
      vault: "0x844a9d1B20A3016610B5270F32eDDCc1E27787cC",
      teller: "0xbC65b430d01E267652694503ca1ae5543C915bB9",
      queue: "0x1479aea1a79e10a6B8c3925f66a7b1dFe0FEeF93",
      solver: "0x6c0f80f755f3C094587E4b5242A0D6570B2F3EAA",
      want: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      accountant: "0x665d264e867e45f2bFCAeE4DD1C65A784FE9d4E9",
      lens: "0x5732789EB6Eef65173bA732EE3b05f3f23AB840b",
    });
    expect(v.eventsFromBlock).toBe(91901943);
    expect(v.vestingSeconds).toBe(86400);
    expect(v.ui).toEqual({
      name: "Yield Prime",
      symbol: "CCUSD",
      decimals: 18,
      shareLockPeriod: 86400,
      deployBlocks: { vault: 91901943, accountant: 91901948, teller: 91901950 },
      deployTimestamp: 1786557949,
    });
  });

  it("carries the 30d product's verified values", () => {
    const v = vaultById(ROSTER, "coinchange-30d-polygon");
    expect(v.addresses).toEqual({
      vault: "0xc5220d7DBaefd99c1fAe5CEf3fE1deAF5BD71f66",
      teller: "0xfc4b85FddB8fD2527aB5dB2a9C06A7Dc7321b848",
      queue: "0x8234a18C39177D0f70c6dacEc4253855FAf0fB2e",
      solver: "0x6Cac5A56d78CF34E61C1594f85A1ef4cd21EA883",
      want: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      accountant: "0xa75a18784318827837e9bEA086aC8442f470Be42",
      lens: "0x5732789EB6Eef65173bA732EE3b05f3f23AB840b",
    });
    expect(v.eventsFromBlock).toBe(92416354);
    // Thirty days. The share lock stays one day on this product, which is
    // exactly why the two are separate fields.
    expect(v.vestingSeconds).toBe(2592000);
    expect(v.ui).toEqual({
      name: "Yield Prime 30d",
      symbol: "CCUSD30",
      decimals: 18,
      shareLockPeriod: 86400,
      deployBlocks: { vault: 92415693, accountant: 92415698, teller: 92415700 },
      // The accountant's deploy BLOCK timestamp (2026-08-21T16:09:34Z), not the
      // broadcast time the contracts repository's deployment record holds.
      deployTimestamp: 1787328574,
    });
  });

  it("shares one Lens between both products, on purpose", () => {
    const [a, b] = ROSTER.vaults;
    expect(a.addresses.lens).toBe(b.addresses.lens);
  });

  it("hands back the one base asset both products name", () => {
    // Chain-level by the spec's reckoning, per vault in the file: parsing is
    // where the two views meet, so nothing downstream picks a vault to ask.
    expect(ROSTER.baseAsset).toBe("0xc2132D05D31c914a87C6611C10748AEb04B58e8F");
    expect(ROSTER.vaults.every((v) => v.addresses.want === ROSTER.baseAsset)).toBe(true);
  });
});

describe("a malformed registry", () => {
  it("names a missing address", () => {
    expect(parseBroken("vaults.1.addresses.teller")).toThrow(
      "Vault registry: vaults[1].addresses.teller is missing"
    );
  });

  it("names an address that is not one", () => {
    expect(parseBroken("vaults.0.addresses.accountant", "0x665d264e")).toThrow(
      'Vault registry: vaults[0].addresses.accountant is not a 20-byte hex address: "0x665d264e"'
    );
  });

  it("names an unparseable block number", () => {
    // A quoted number fails on purpose: the roster's numbers are numbers, and a
    // string that happens to parse would hide a shape difference between the
    // two files.
    expect(parseBroken("vaults.1.eventsFromBlock", "92416354")).toThrow(
      'Vault registry: vaults[1].eventsFromBlock is not a block number: "92416354"'
    );
    expect(parseBroken("vaults.0.ui.deployBlocks.teller", 91901950.5)).toThrow(
      "Vault registry: vaults[0].ui.deployBlocks.teller is not a block number: 91901950.5"
    );
    expect(parseBroken("vaults.0.ui.deployBlocks.accountant", -1)).toThrow(
      "Vault registry: vaults[0].ui.deployBlocks.accountant is not a block number: -1"
    );
  });

  it("names an unknown chain key", () => {
    expect(parseBroken("chain.key", "ethereum")).toThrow(
      'Vault registry: chain.key is not a chain this widget knows: "ethereum" (known: polygon)'
    );
  });

  it("names a vault declared on some other chain", () => {
    expect(parseBroken("vaults.1.chain", "arbitrum")).toThrow(
      'Vault registry: vaults[1].chain is not a chain this widget knows: "arbitrum" (known: polygon)'
    );
  });

  it("names a product declaring a different base asset", () => {
    // Native USDC on Polygon — a real address, and the wrong one: the widget
    // holds one base asset with one set of decimals, so a second would put this
    // product's figures on the wrong scale with nothing on screen looking wrong.
    expect(
      parseBroken(
        "vaults.1.addresses.want",
        "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
      )
    ).toThrow(
      'Vault registry: vaults[1].addresses.want is "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", ' +
        'but "coinchange-24h-polygon" names "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" — ' +
        "this widget prices every product in one base asset"
    );
  });

  it("names a duplicated vault id", () => {
    expect(parseBroken("vaults.1.id", "coinchange-24h-polygon")).toThrow(
      'Vault registry: vaults[1].id is a duplicate: "coinchange-24h-polygon"'
    );
  });

  it("refuses a registry with no vaults at all", () => {
    expect(parseBroken("vaults", [])).toThrow(
      "Vault registry: vaults declares no vaults"
    );
    expect(() => parseVaultRegistry(null)).toThrow(
      "Vault registry: registry is not an object: null"
    );
  });

  it("ignores keys it does not know", () => {
    // The file is meant to be kept alongside the solver roster, so a field this
    // widget has no use for is not a mistake.
    const withExtra = broken("vaults.0.strategist", "0xdeadbeef");
    expect(parseVaultRegistry(withExtra).vaults[0].id).toBe("coinchange-24h-polygon");
  });
});

describe("vaultById", () => {
  it("finds a declared product", () => {
    expect(vaultById(ROSTER, "coinchange-30d-polygon").ui.symbol).toBe("CCUSD30");
  });

  it("names an id the registry does not declare, and what it does", () => {
    // A constant that drifted from the JSON, not a visitor's typo: this is a
    // programming error and it throws rather than falling back.
    expect(() => vaultById(ROSTER, "coinchange-90d-polygon")).toThrow(
      'Vault registry: vaults declares no vault with id "coinchange-90d-polygon" ' +
        "(declared: coinchange-24h-polygon, coinchange-30d-polygon)"
    );
  });
});

// The vesting term is carried for stage 2 and priced by nothing, but two
// surfaces already say it out loud — the 30d panels' notice and the explainer's
// extra step — and which products they say it on is decided here.
describe("what a product's vesting term means", () => {
  const vault24h = vaultById(ROSTER, "coinchange-24h-polygon");
  const vault30d = vaultById(ROSTER, "coinchange-30d-polygon");

  it("is a gap only where shares unlock before they vest", () => {
    // 24h: the share lock and the vesting term are the same day, so a share
    // that can be redeemed has already vested and nothing needs disclosing.
    expect(hasVestingGap(vault24h)).toBe(false);
    // 30d: one day locked, thirty days vesting — twenty-nine days in which a
    // depositor can redeem shares the solver prices at what they paid.
    expect(hasVestingGap(vault30d)).toBe(true);
  });

  it("reads in whole days, as the copy says it", () => {
    expect(vestingDays(vault24h)).toBe(1);
    expect(vestingDays(vault30d)).toBe(30);
  });
});
