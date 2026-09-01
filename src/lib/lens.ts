// Every vault read the widget makes, and what it means.
//
// TWO GROUPS, one reason to change. Most of it is the shared Lens: a stateless
// view contract both products name, read with their own addresses as
// arguments. The rest — at the bottom — is the confirm pin's, which goes to the
// accountant and the share token DIRECTLY, because a pin needs to see what the
// Lens smooths over and needs every figure at ONE block. Both groups are the
// same thing to a reader: the places a vault's addresses become call
// arguments, so "does this product read its own contracts?" is still answered
// by reading one short file.
//
// The BoringVault Lens is a stateless view contract: each of its functions
// takes the vault's own contracts as arguments and reads them. Both Coinchange
// products name the SAME Lens in the registry, deliberately, because reading
// either one is the same call with different arguments. That is what lets the
// widget read two products without two libraries, two providers or any
// per-vault state — and it is why these reads left boring-vault-ui's React
// context, which could only ever be configured for one product at a time.
//
// The four functions here are exactly the four the library's context exposed
// (boring-vault-ui@1.6.3, dist/contexts/v1/BoringVaultContextV1.js):
//
//   fetchTotalAssets      lens.totalAssets(vault, accountant)   -> TVL
//   fetchShareValue       lens.exchangeRate(accountant)         -> share price
//   fetchUserShares       lens.balanceOf(user, vault)           -> shares held
//   fetchUserUnlockTime   lens.userUnlockTime(user, teller)     -> share lock
//
// and the ABI fragments below are copied from that package's own
// dist/abis/v1/BoringLensABI.js. The library still owns the write paths, so
// this is not a fork of it: it is the read half, taken off a context that
// cannot hold two vaults.
//
// The decoders matter as much as the calls. The library returned JavaScript
// numbers, not bigints — it divided `Number(raw)` by a power of ten — and every
// figure the widget shows is derived from those numbers: position value,
// earnings against the average deposit cost, the realised trailing APY against
// the share price. Reproducing that arithmetic digit for digit, precision loss
// included, is what keeps the 24h product's figures identical across this
// change. ./lens.test.ts holds them to it.
import type { Address } from "viem";

import { CHAIN_ID } from "../config/chain";
import type { Vault } from "./vaultRegistry";

// Only the four read functions the widget uses. `totalAssets` returns two
// separate outputs rather than a struct, so it decodes to a pair.
export const LENS_ABI = [
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [
      { name: "boringVault", type: "address" },
      { name: "accountant", type: "address" },
    ],
    outputs: [
      { name: "asset", type: "address" },
      { name: "assets", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "exchangeRate",
    stateMutability: "view",
    inputs: [{ name: "accountant", type: "address" }],
    outputs: [{ name: "rate", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "boringVault", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "userUnlockTime",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "teller", type: "address" },
    ],
    outputs: [{ name: "time", type: "uint256" }],
  },
] as const;

// The two reads the widget makes, each as the pair of calls it takes. Grouped
// under one name because the grouping is the point: these are the only places
// a vault's addresses become call arguments, so "does this product read its own
// contracts?" is answered by reading one short file.
//
// Every call names the chain it is made on, and it is the vault's chain rather
// than the connected wallet's. The library read through its own Polygon
// provider, so a wallet on the wrong network still saw TVL, the share price and
// its own position behind the switch-network banner; letting the connection
// decide would take that away. Declaring it here rather than at each call site
// means there is one place to be wrong.
export const lensCalls = {
  // Vault-wide, and wallet-free: TVL and the share price render for a visitor
  // with nothing connected.
  vaultMetrics: (vault: Vault) =>
    [
      {
        chainId: CHAIN_ID,
        address: vault.addresses.lens,
        abi: LENS_ABI,
        functionName: "totalAssets",
        args: [vault.addresses.vault, vault.addresses.accountant],
      },
      {
        chainId: CHAIN_ID,
        address: vault.addresses.lens,
        abi: LENS_ABI,
        functionName: "exchangeRate",
        args: [vault.addresses.accountant],
      },
    ] as const,

  // One wallet's holding in one product. The share lock lives on the teller,
  // not the vault, so the unlock time is read against the teller.
  //
  // `user` is optional because these two calls only exist for a connected
  // wallet: with no address there are no arguments to make them with, and the
  // caller leaves the read disabled rather than asking about nobody.
  userPosition: (vault: Vault, user: Address | undefined) =>
    [
      {
        chainId: CHAIN_ID,
        address: vault.addresses.lens,
        abi: LENS_ABI,
        functionName: "balanceOf",
        args: user ? ([user, vault.addresses.vault] as const) : undefined,
      },
      {
        chainId: CHAIN_ID,
        address: vault.addresses.lens,
        abi: LENS_ABI,
        functionName: "userUnlockTime",
        args: user ? ([user, vault.addresses.teller] as const) : undefined,
      },
    ] as const,
};

// ---- the confirm pin ----
//
// The reads the CONFIRM STEP makes, which are not the Lens's.
//
//   • `getRateInQuoteSafe` is the GUARDED rate read. Its revert IS the answer:
//     a paused accountant refuses to price, and a widget that pinned a rate
//     from anywhere else would show a share price nobody is standing behind.
//     (Its unguarded twin `getRateInQuote` is what src/lib/walletScan.ts reads
//     for a past lot's entry price, deliberately — a transfer received during
//     an old pause must still have one.)
//   • `accountantState` carries `lastUpdateTimestamp` and `isPaused`, the two
//     the Confirm re-check compares against.
//
//     THIS IS THE ONLY SPELLING of the twelve-field struct. It used to be
//     written twice — src/hooks/usePauseStatus.ts kept its own copy for the
//     pause banner — and that was a silent drift hazard rather than a
//     duplication anyone would notice: the fields are positional, so a struct
//     change makes a stale copy decode the WRONG field rather than fail. The
//     banner reads this one now, through the two accessors below. What was
//     never the reason to have two: the poll. The pin reads this at a pinned
//     block and the banner every 30 seconds, but that is a difference of CALL,
//     not of fragment.
//   • `balanceOf` is the vault share token's own, so the balance is pinned to
//     the same block as the rate with no third contract in the path.
export const ACCOUNTANT_ABI = [
  {
    type: "function",
    name: "getRateInQuoteSafe",
    stateMutability: "view",
    inputs: [{ name: "quote", type: "address" }],
    outputs: [{ name: "rate", type: "uint256" }],
  },
  {
    type: "function",
    name: "accountantState",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "payoutAddress", type: "address" },
      { name: "highwaterMark", type: "uint96" },
      { name: "feesOwedInBase", type: "uint128" },
      { name: "totalSharesLastUpdate", type: "uint128" },
      { name: "exchangeRate", type: "uint96" },
      { name: "allowedExchangeRateChangeUpper", type: "uint16" },
      { name: "allowedExchangeRateChangeLower", type: "uint16" },
      { name: "lastUpdateTimestamp", type: "uint64" },
      { name: "isPaused", type: "bool" },
      { name: "minimumUpdateDelayInSeconds", type: "uint24" },
      { name: "managementFee", type: "uint16" },
      { name: "performanceFee", type: "uint16" },
    ],
  },
] as const;

export const SHARE_TOKEN_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    // The ledger floor's supply arm (src/lib/floorSoundness.ts): how many
    // shares existed at `eventsFromBlock − 1`. An ARCHIVE read, made once per
    // vesting-gap product per session and only when the floor is younger than
    // the vesting term — which is why it is a call at a past block rather than
    // anything the widget polls.
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "shares", type: "uint256" }],
  },
] as const;

// The auto-generated getter returns the struct's fields flattened, in
// declaration order. Two of them are read, and they are read through these two
// functions rather than by index at the call site: an index is a number that
// looks right in a diff whichever field it points at.
export type AccountantState = readonly [
  Address, bigint, bigint, bigint, bigint, number, number, bigint, boolean,
  number, number, number
];
export const lastRateUpdate = (state: AccountantState): number => Number(state[7]);
export const isAccountantPaused = (state: AccountantState): boolean => state[8];

// Unlike `lensCalls` these carry no `chainId`: they are made through a public
// client that is already pinned to the vault's chain and to ONE BLOCK, which is
// the whole point of them — wagmi's `useReadContracts` needs to be told which
// chain, a pinned `multicall` does not.
export const pinCalls = {
  // ONE BATCH, at one head block: the share price, the balance and the state
  // the re-check will compare against. `allowFailure` is what makes the
  // guarded rate's revert readable as the pause it is rather than as a thrown
  // batch (src/lib/confirmPin.ts turns it into the wording).
  pin: (vault: Vault, user: Address) =>
    [
      {
        address: vault.addresses.accountant,
        abi: ACCOUNTANT_ABI,
        functionName: "getRateInQuoteSafe",
        args: [vault.addresses.want],
      },
      {
        address: vault.addresses.vault,
        abi: SHARE_TOKEN_ABI,
        functionName: "balanceOf",
        args: [user],
      },
      {
        address: vault.addresses.accountant,
        abi: ACCOUNTANT_ABI,
        functionName: "accountantState",
        args: [],
      },
    ] as const,

  // The ONE multicall on Confirm: `accountantState` and `balanceOf`, exactly
  // the three facts the re-check predicate takes (./confirmRecheck.ts). The
  // rate itself is not re-read — a moved `lastUpdateTimestamp` already says it
  // moved, and re-reading it would invite pinning a second one.
  recheck: (vault: Vault, user: Address) =>
    [
      {
        address: vault.addresses.accountant,
        abi: ACCOUNTANT_ABI,
        functionName: "accountantState",
        args: [],
      },
      {
        address: vault.addresses.vault,
        abi: SHARE_TOKEN_ABI,
        functionName: "balanceOf",
        args: [user],
      },
    ] as const,
};

// What the two calls of each read decode to, in declaration order.
export type VaultMetricsResult = readonly [readonly [Address, bigint], bigint];
export type UserPositionResult = readonly [bigint, bigint];

export interface VaultMetricsFigures {
  // Total value the vault holds, in the base asset.
  tvl: number;
  // The value of one share in the base asset.
  sharePrice: number;
  // The same rate undivided, in want units per whole share. The float above is
  // what the stats show; this is what an exit is PRICED from — the entitlement
  // ceiling, the required spread and the ask are all computed against it in
  // bigints, and a rate that had been through a double could not be compared to
  // a ceiling that had not.
  sharePriceRaw: bigint;
}

export interface UserPositionFigures {
  shares: number;
  // The same balance in raw share units, undivided. The float above is what the
  // stats show; this is what a redemption is posted over, because an 18-dp
  // balance has more significant digits than a double holds and MAX has to
  // offer the whole of it, to the wei (src/lib/postingRule.ts).
  sharesRaw: bigint;
  // Unix seconds; 0 ⇒ the wallet has never deposited.
  unlockAt: number;
}

// `baseDecimals` is the base asset's, not the vault's: both figures are
// denominated in what the accountant prices in (USDT, 6 dp), which is why a
// share price of 1.000122 arrives as 1_000_122.
export function decodeVaultMetrics(
  result: VaultMetricsResult,
  baseDecimals: number
): VaultMetricsFigures {
  const [totalAssets, exchangeRate] = result;
  return {
    // totalAssets returns (asset, assets); the widget shows the second.
    tvl: Number(totalAssets[1]) / 10 ** baseDecimals,
    sharePrice: Number(exchangeRate) / 10 ** baseDecimals,
    sharePriceRaw: exchangeRate,
  };
}

// `shareDecimals` is the VAULT's, not the base asset's (18 against 6 on both
// products) — the one place where the two scales in play must not be swapped.
export function decodeUserPosition(
  result: UserPositionResult,
  shareDecimals: number
): UserPositionFigures {
  const [balance, unlockTime] = result;
  return {
    shares: Number(balance) / 10 ** shareDecimals,
    sharesRaw: balance,
    unlockAt: Number(unlockTime),
  };
}
