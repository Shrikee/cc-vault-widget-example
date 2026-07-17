import type { Token } from "../lib/boringVault";

// =============================================================================
// Coinchange "Yield Prime" vault — production parameters (Ethereum mainnet).
//
// Verified on-chain (2026-06-26): vault.symbol()="CCUSD", name()="Yield Prime",
//   decimals()=18; accountant.getRate()=1e6 (1 share ≈ 1 USDT); AtomicQueue
//   safeUpdateAtomicRequest is a public capability.
//
// VERIFY these against the live contracts before each release — addresses
// change when a vault is redeployed.
//
// NOTE on the withdraw model: this vault redeems via the audited AtomicQueue
// (solver-priced). The DelayedWithdraw contract is deployed but left
// UNUSED (allowPublicWithdraws=false), so the frontend uses the queue flow.
// =============================================================================

export const CHAIN = "ethereum" as const;
export const CHAIN_ID = 1; // Ethereum mainnet

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
  // delayWithdraw (0x44D0…583e) is deployed but unused for this vault.
} as const;

// -----------------------------------------------------------------------------
// Assets. Base/unit-of-account is USDT (6 decimals); deposits accept USDC or
// USDT (both pegged 1:1); redemptions pay out USDT.
// -----------------------------------------------------------------------------
export const USDC: Token = {
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  decimals: 6,
  displayName: "USDC",
  image:
    "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png",
};

export const USDT: Token = {
  address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  decimals: 6,
  displayName: "USDT",
  image: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
};

export const DEPOSIT_TOKENS: Token[] = [USDC, USDT];
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
export const EXPLORER = "https://etherscan.io";
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${EXPLORER}/address/${addr}`;
