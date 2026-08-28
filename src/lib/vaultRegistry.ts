// The vault registry's shape, and the guard that turns the JSON into it.
//
// The widget serves two Coinchange products from one page, so vault identity —
// addresses, deploy blocks, share symbol — cannot live in TypeScript constants
// that name one of them. It lives in src/config/vaults.json, shaped like a
// vault entry in the solver service's roster: the same key names and the same
// nesting, so checking the widget against the authority is reading two files
// side by side rather than translating between them. The fields only this
// widget needs sit in a nested `ui` block, which keeps the shared keys
// diffable.
//
// The guard exists because the failure it prevents is silent. A typo'd address
// key does not throw at the call site: the address is `undefined`, an
// eth_getLogs against it returns nothing, and the widget renders a plausible
// blank vault. Parsing once at load, loudly, converts that into an error
// naming the field.
//
// Pure — no network, no React, no DOM — so ./vaultRegistry.test.ts drives this
// exact code against malformed registries.
import type { Address } from "viem";

// Chain keys the widget knows how to talk to. Both products are on Polygon PoS
// and multi-chain support is deliberately out of scope, so this is a list of
// one: it exists to make an unrecognised key in the JSON a loud failure rather
// than a string that flows into a wagmi call and fails much later.
export const CHAIN_KEYS = ["polygon"] as const;
export type ChainKey = (typeof CHAIN_KEYS)[number];

// Declared once rather than per vault: both products share the chain, and its
// explorer and chain id are properties of the chain, not of a product.
export interface ChainConfig {
  key: ChainKey;
  chainId: number;
  label: string;
  explorer: string;
}

export interface VaultAddresses {
  vault: Address;
  teller: Address;
  // The AtomicQueue a redemption request is posted to. Provenance: the
  // contracts repository — see the note in src/config/vaults.ts.
  queue: Address;
  // The solver that fills requests from that queue. Provenance: as above.
  solver: Address;
  // The redemption's `want` token — the base asset the vault accounts in and
  // pays out. Carried per vault because the solver roster carries it per vault;
  // both products name the same Polygon USDT.
  want: Address;
  accountant: Address;
  // The Lens both products are read through. Deliberately the same address in
  // both entries: reading either product is the same contract call with
  // different arguments.
  lens: Address;
}

// Everything only this widget needs. Kept in its own block so the keys above it
// still line up name-for-name with the solver roster.
export interface VaultUi {
  // vault.name() / symbol() / decimals(), read from the chain.
  name: string;
  symbol: string;
  decimals: number;
  // teller.shareLockPeriod(), seconds. 86,400 on both products — this is the
  // anti-MEV deposit lock, NOT the vesting term.
  shareLockPeriod: number;
  // Deploy blocks, each confirmed by asserting code exists at that block and
  // does not at the block before it. The share-price scan reads the
  // accountant's logs and the deposit scan the teller's; `vault` is carried
  // because it was verified alongside them, and nothing reads it.
  deployBlocks: { vault: number; accountant: number; teller: number };
  // The accountant's deploy BLOCK timestamp, unix seconds — the anchor for a
  // trailing window measured since launch. Read from the chain rather than from
  // a deployment record; see the note in src/config/vaults.ts.
  deployTimestamp: number;
}

export interface Vault {
  // The solver roster's own id, so one product has one name across all three
  // repositories and a URL naming it is greppable in any of them.
  id: string;
  // Repeated from the chain block above because the roster's entries repeat it.
  // The guard holds it to the declared chain.
  chain: ChainKey;
  addresses: VaultAddresses;
  // Ledger floor: the block the solver's holder ledger is built from, below
  // which no event of this vault's matters. Provenance: the solver service —
  // see the note in src/config/vaults.ts.
  eventsFromBlock: number;
  // The product's vesting term, seconds — one day on the 24h line, thirty on
  // the 30d line. Carried and reviewable, but NOT read by any code path yet:
  // pricing an early exit with it is stage 2. Provenance: as above.
  vestingSeconds: number;
  ui: VaultUi;
}

export interface VaultRoster {
  chain: ChainConfig;
  vaults: Vault[];
}

// Every failure reads "Vault registry: <path> <what was wrong>", so an operator
// who mistypes a key is told which one.
function fail(path: string, problem: string): never {
  throw new Error(`Vault registry: ${path} ${problem}`);
}

// Values are quoted back as JSON so a wrong type is visible: 91901943 and
// "91901943" read differently here, which is the whole point of the message.
function show(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

type Fields = Record<string, unknown>;

function fields(value: unknown, path: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, `is not an object: ${show(value)}`);
  }
  return value as Fields;
}

function text(from: Fields, key: string, path: string): string {
  const value = from[key];
  if (value === undefined || value === null) fail(`${path}.${key}`, "is missing");
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${path}.${key}`, `is not a non-empty string: ${show(value)}`);
  }
  return value;
}

// A 20-byte hex address. Checksum case is not enforced — the registry is read
// side by side with a roster that may not checksum — but the shape is, because
// an address one nibble short is a call that reverts for no visible reason.
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function address(from: Fields, key: string, path: string): Address {
  const value = from[key];
  if (value === undefined || value === null) fail(`${path}.${key}`, "is missing");
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    fail(`${path}.${key}`, `is not a 20-byte hex address: ${show(value)}`);
  }
  return value as Address;
}

// Block numbers, block spans and second counts are all whole and non-negative,
// and all four uses want the same complaint when they are not. A quoted number
// fails here on purpose: the roster's numbers are numbers, and a string that
// happens to parse would hide a shape difference between the two files.
function whole(from: Fields, key: string, path: string, what: string): number {
  const value = from[key];
  if (value === undefined || value === null) fail(`${path}.${key}`, "is missing");
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(`${path}.${key}`, `is not ${what}: ${show(value)}`);
  }
  return value;
}

function chainKey(value: unknown, path: string): ChainKey {
  if (typeof value !== "string" || !CHAIN_KEYS.includes(value as ChainKey)) {
    fail(path, `is not a chain this widget knows: ${show(value)} (known: ${CHAIN_KEYS.join(", ")})`);
  }
  return value as ChainKey;
}

function parseChain(raw: unknown): ChainConfig {
  const from = fields(raw, "chain");
  return {
    key: chainKey(from.key, "chain.key"),
    chainId: whole(from, "chainId", "chain", "a chain id"),
    label: text(from, "label", "chain"),
    explorer: text(from, "explorer", "chain"),
  };
}

function parseVault(raw: unknown, chain: ChainConfig, path: string): Vault {
  const from = fields(raw, path);
  const addresses = fields(from.addresses, `${path}.addresses`);
  const ui = fields(from.ui, `${path}.ui`);
  const deployBlocks = fields(ui.deployBlocks, `${path}.ui.deployBlocks`);

  const declared = chainKey(from.chain, `${path}.chain`);
  if (declared !== chain.key) {
    fail(`${path}.chain`, `is ${show(declared)}, but the registry declares ${show(chain.key)}`);
  }

  const block = (key: string, at: Fields, atPath: string) =>
    whole(at, key, atPath, "a block number");

  return {
    id: text(from, "id", path),
    chain: declared,
    addresses: {
      vault: address(addresses, "vault", `${path}.addresses`),
      teller: address(addresses, "teller", `${path}.addresses`),
      queue: address(addresses, "queue", `${path}.addresses`),
      solver: address(addresses, "solver", `${path}.addresses`),
      want: address(addresses, "want", `${path}.addresses`),
      accountant: address(addresses, "accountant", `${path}.addresses`),
      lens: address(addresses, "lens", `${path}.addresses`),
    },
    eventsFromBlock: block("eventsFromBlock", from, path),
    vestingSeconds: whole(from, "vestingSeconds", path, "a number of seconds"),
    ui: {
      name: text(ui, "name", `${path}.ui`),
      symbol: text(ui, "symbol", `${path}.ui`),
      decimals: whole(ui, "decimals", `${path}.ui`, "a decimal count"),
      shareLockPeriod: whole(ui, "shareLockPeriod", `${path}.ui`, "a number of seconds"),
      deployBlocks: {
        vault: block("vault", deployBlocks, `${path}.ui.deployBlocks`),
        accountant: block("accountant", deployBlocks, `${path}.ui.deployBlocks`),
        teller: block("teller", deployBlocks, `${path}.ui.deployBlocks`),
      },
      deployTimestamp: whole(ui, "deployTimestamp", `${path}.ui`, "a unix timestamp"),
    },
  };
}

// Parse the registry, or throw naming what was wrong.
//
// Keys the widget does not know are ignored rather than rejected: the file is
// meant to be kept alongside the solver roster, and a field this widget has no
// use for is not a mistake. Everything it DOES read is checked.
export function parseVaultRegistry(raw: unknown): VaultRoster {
  const root = fields(raw, "registry");
  const chain = parseChain(root.chain);

  const entries = root.vaults;
  if (!Array.isArray(entries)) fail("vaults", `is not an array: ${show(entries)}`);
  if (entries.length === 0) fail("vaults", "declares no vaults");

  const vaults = entries.map((entry, i) => parseVault(entry, chain, `vaults[${i}]`));

  // Ids address a vault from a URL and from the code, so two entries answering
  // to the same one is a registry that cannot be read unambiguously.
  const seen = new Set<string>();
  for (const [i, vault] of vaults.entries()) {
    if (seen.has(vault.id)) fail(`vaults[${i}].id`, `is a duplicate: ${show(vault.id)}`);
    seen.add(vault.id);
  }

  return { chain, vaults };
}

// The roster's one lookup. An id the registry does not declare is a programming
// error — a constant that drifted from the JSON, not a visitor's typo — so it
// throws rather than falling back. Resolving an untrusted id (a URL parameter)
// to a product is a different job, and does not come through here.
export function vaultById(roster: VaultRoster, id: string): Vault {
  const vault = roster.vaults.find((v) => v.id === id);
  if (!vault) {
    const declared = roster.vaults.map((v) => v.id).join(", ");
    fail("vaults", `declares no vault with id ${show(id)} (declared: ${declared})`);
  }
  return vault;
}
