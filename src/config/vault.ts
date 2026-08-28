import type { Token } from "../lib/boringVault";
import { DEFAULT_VAULT, ROSTER } from "./vaults";

// =============================================================================
// The one vault the widget currently renders, read off the registry.
//
// Every value below used to be a literal here; the addresses, deploy figures
// and share-token identity now come from src/config/vaults.json (see
// src/config/vaults.ts for the verification date and the provenance of the four
// values no chain read can confirm). This module is what is left: the widget's
// own behavioural parameters, plus a singular view of the default product for
// the components and hooks that still take their vault at module scope.
//
// That singular view is temporary. The next change gives every vault-scoped
// component and hook an explicit vault argument, at which point this module
// goes away and the registry is read directly.
//
// NOTE on the withdraw model: this vault redeems via the audited AtomicQueue
// (solver-priced). The DelayedWithdraw contract is deployed but left
// UNUSED (allowPublicWithdraws=false), so the frontend uses the queue flow.
// =============================================================================

export const CHAIN = ROSTER.chain.key;
export const CHAIN_ID = ROSTER.chain.chainId;

// Human-readable chain name — used in UI copy and the wrong-network prompt.
export const CHAIN_LABEL = ROSTER.chain.label;

// Vault share token identity.
export const VAULT_NAME = DEFAULT_VAULT.ui.name;
export const SHARE_SYMBOL = DEFAULT_VAULT.ui.symbol;
export const VAULT_DECIMALS = DEFAULT_VAULT.ui.decimals;

// The registry names these the way the solver roster does; the library and the
// hooks here name two of them differently, so the mapping happens once, here.
export const CONTRACTS = {
  vault: DEFAULT_VAULT.addresses.vault,
  teller: DEFAULT_VAULT.addresses.teller,
  accountant: DEFAULT_VAULT.addresses.accountant,
  lens: DEFAULT_VAULT.addresses.lens,
  // AtomicQueue — shares are redeemed by submitting a request here; an off-chain
  // solver fills it. Passed to the provider as `withdrawQueueContract`.
  withdrawQueue: DEFAULT_VAULT.addresses.queue,
  atomicSolver: DEFAULT_VAULT.addresses.solver,
  // delayWithdraw is deployed but unused for this vault.
} as const;

// -----------------------------------------------------------------------------
// Assets. Base/unit-of-account is USDT (6 decimals) — accountant.base(), and the
// registry's `want`, which both products name identically.
//
// USDT is the ONLY accepted deposit asset on Polygon: teller.isSupported() is
// false for both native USDC (0x3c49…3359) and bridged USDC.e (0x2791…4174),
// so offering USDC here would let a user pick an asset whose deposit reverts.
// Re-check isSupported() before adding one back.
//
// The address comes from the registry; the decimals and the display metadata do
// not, because they are not vault identity — they are what the widget needs to
// render a token the roster only has to address.
// -----------------------------------------------------------------------------
export const USDT: Token = {
  address: DEFAULT_VAULT.addresses.want,
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
// long after a deposit. teller.shareLockPeriod() = 86400 on both products.
// NOT the vesting term: on the 30d product the lock is still one day while the
// term is thirty, which is the hazard stage 2 exists to price.
export const SHARE_LOCK_PERIOD = DEFAULT_VAULT.ui.shareLockPeriod;

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
export const EXPLORER = ROSTER.chain.explorer;
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${EXPLORER}/address/${addr}`;
