// The shared Lens — every vault read the widget makes, and what it means.
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

// What the two calls of each read decode to, in declaration order.
export type VaultMetricsResult = readonly [readonly [Address, bigint], bigint];
export type UserPositionResult = readonly [bigint, bigint];

export interface VaultMetricsFigures {
  // Total value the vault holds, in the base asset.
  tvl: number;
  // The value of one share in the base asset.
  sharePrice: number;
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
