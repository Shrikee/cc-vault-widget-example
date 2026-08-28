import type { Token } from "../lib/boringVault";

// =============================================================================
// Coinchange "Yield Prime" vault — production parameters (Polygon PoS).
//
// The vault is deployed at the SAME addresses on Polygon as on Ethereum
// (deterministic deployment), so the address list below is unchanged from the
// mainnet build — but the chain, the asset addresses and the explorer are not.
//
// Verified on-chain against Polygon (chainId 137) on 2026-08-27:
//   vault.name()="Yield Prime", symbol()="CCUSD", decimals()=18
//   accountant.getRate()=1000000 (1 share = 1.000000 USDT), isPaused()=false
//   accountant.base()=0xc2132D05…58e8F (Polygon USDT)
//   teller.shareLockPeriod()=86400, teller.isPaused()=false
//   AtomicQueue.isPaused()=false
//
// VERIFY these against the live contracts before each release — addresses
// change when a vault is redeployed.
//
// NOTE on the withdraw model: this vault redeems via the audited AtomicQueue
// (solver-priced). The DelayedWithdraw contract is deployed but left
// UNUSED (allowPublicWithdraws=false), so the frontend uses the queue flow.
// =============================================================================

export const CHAIN = "polygon" as const;
export const CHAIN_ID = 137; // Polygon PoS

// Human-readable chain name — used in UI copy and the wrong-network prompt.
export const CHAIN_LABEL = "Polygon";

// Vault share token identity.
export const VAULT_NAME = "Yield Prime";
export const SHARE_SYMBOL = "CCUSD";
export const VAULT_DECIMALS = 18; // vault.decimals() — share token has 18 decimals

export const CONTRACTS = {
  vault: "0x844a9d1B20A3016610B5270F32eDDCc1E27787cC",
  teller: "0xbC65b430d01E267652694503ca1ae5543C915bB9",
  accountant: "0x665d264e867e45f2bFCAeE4DD1C65A784FE9d4E9",
  lens: "0x5732789EB6Eef65173bA732EE3b05f3f23AB840b",
  // AtomicQueue — shares are redeemed by submitting a request here; an off-chain
  // solver fills it. Passed to the provider as `withdrawQueueContract`.
  withdrawQueue: "0x1479aea1a79e10a6B8c3925f66a7b1dFe0FEeF93",
  atomicSolver: "0x6c0f80f755f3C094587E4b5242A0D6570B2F3EAA",
  // delayWithdraw is deployed but unused for this vault.
} as const;

// -----------------------------------------------------------------------------
// Assets. Base/unit-of-account is USDT (6 decimals) — accountant.base().
//
// USDT is the ONLY accepted deposit asset on Polygon: teller.isSupported() is
// false for both native USDC (0x3c49…3359) and bridged USDC.e (0x2791…4174),
// so offering USDC here would let a user pick an asset whose deposit reverts.
// Re-check isSupported() before adding one back.
// -----------------------------------------------------------------------------
export const USDT: Token = {
  address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  decimals: 6,
  displayName: "USDT",
  image: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
};

export const DEPOSIT_TOKENS: Token[] = [USDT];
export const WITHDRAW_TOKENS: Token[] = [USDT];
export const BASE_ASSET: Token = USDT;

// The token a user receives on redemption (the solver's `wantAddress`).
export const WITHDRAW_TOKEN: Token = USDT;

// -----------------------------------------------------------------------------
// Behavioral parameters. These drive UX copy, validation, and the redeem call.
// -----------------------------------------------------------------------------
// Anti-MEV deposit lock — shares can't be transferred (or redeemed) for this
// long after a deposit. teller.shareLockPeriod() = 86400.
export const SHARE_LOCK_PERIOD = 86400; // 1 day

// AtomicQueue redemption "discount" = the haircut vs NAV the user accepts so the
// solver can fill and keep the spread. The contract caps it at MAX_DISCOUNT (1%)
// and only guarantees fills at or below NAV; 0.1% is the standard spread the
// solver is designed around, so it is the sensible default.
export const WITHDRAW_DISCOUNT_PCT_DEFAULT = 0.1;
export const WITHDRAW_DISCOUNT_PCT_MAX = 1; // contract MAX_DISCOUNT = 0.01e6 = 1%

// How long a submitted redemption request stays valid before its deadline lapses.
// The solver runs on an hourly batch loop, so a few days is ample headroom.
export const WITHDRAW_VALID_DAYS_DEFAULT = 7;

// Block explorer for tx links / address confirmations.
export const EXPLORER = "https://polygonscan.com";
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${EXPLORER}/address/${addr}`;
