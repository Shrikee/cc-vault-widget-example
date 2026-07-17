# Coinchange Yield Prime (CCUSD) — Frontend Integration Guide

> **Audience:** external developers integrating the Coinchange Boring Vault smart contracts into their own frontend.
> **Reference implementation:** this repository — a complete, production-style React dApp you can run, read, and copy from.
> **Scope:** the live **Yield Prime (CCUSD)** stablecoin vault on Ethereum mainnet: viewing the vault, depositing USDC/USDT, and redeeming shares through the **AtomicQueue**, which is filled by **Coinchange's own solver service**.
>
> Everything in this guide was verified against the deployed mainnet contracts and `boring-vault-ui@1.6.3` as shipped on npm. The contracts implement the audited Se7en-Seas/Veda "Boring Vault" architecture.

---

## Table of contents

1. [System overview](#1-system-overview)
2. [Live deployment reference](#2-live-deployment-reference)
3. [Units, decimals & encoding conventions](#3-units-decimals--encoding-conventions)
4. [Choosing an integration path](#4-choosing-an-integration-path)
5. [Path A — integrating with `boring-vault-ui@1.6.3`](#5-path-a--integrating-with-boring-vault-ui163)
6. [Path B — direct contract integration (any stack)](#6-path-b--direct-contract-integration-any-stack)
7. [The redemption flow in depth (AtomicQueue)](#7-the-redemption-flow-in-depth-atomicqueue)
8. [The Coinchange solver service — what fills your users' requests](#8-the-coinchange-solver-service--what-fills-your-users-requests)
9. [Request lifecycle & UI state machine](#9-request-lifecycle--ui-state-machine)
10. [Error handling & edge cases](#10-error-handling--edge-cases)
11. [Known `boring-vault-ui@1.6.3` issues and required workarounds](#11-known-boring-vault-ui163-issues-and-required-workarounds)
12. [Production checklist](#12-production-checklist)
13. [Appendix A — contract reference](#appendix-a--contract-reference)
14. [Appendix B — reference app file map](#appendix-b--reference-app-file-map)
15. [Appendix C — the other withdraw model (DelayedWithdraw / WBTC vault)](#appendix-c--the-other-withdraw-model-delayedwithdraw--wbtc-vault)

---

## 1. System overview

The Coinchange vault is a deployment of the audited Se7en-Seas/Veda **Boring Vault** architecture. Five on-chain contracts plus one off-chain service are relevant to a frontend:

| Piece | Kind | What it does for the frontend |
|---|---|---|
| **BoringVault** | on-chain | The vault itself **and** the ERC-20 share token (`CCUSD`, "Yield Prime", 18 decimals). Custodies assets; mints/burns shares. Deposit approvals go **to this address**. |
| **Teller** (`TellerWithMultiAssetSupport`) | on-chain | The deposit entrypoint. Prices deposits via the Accountant, mints shares, enforces the 1-day share lock and pause state. |
| **Accountant** (`AccountantWithRateProviders`) | on-chain | The exchange-rate (NAV) oracle. `getRate()` / `getRateInQuoteSafe(quote)` price everything: deposits, redemption requests, and solver fills. |
| **AtomicQueue** | on-chain | The redemption queue. A user posts a signed, on-chain "sell my shares at no less than NAV − spread" request; approvals of CCUSD shares go to this address. |
| **AtomicSolverV4** | on-chain | The solver contract. Only Coinchange's authorized solver operator can call it; it redeems queued shares at NAV via the Teller and pays users out. Your frontend never calls it. |
| **Lens** (`ArcticArchitectureLens`) | on-chain | Read-only helper views (TVL, balances, unlock times). `boring-vault-ui`'s `fetch*` functions call it under the hood. |
| **Coinchange solver service** | off-chain | A batch service that watches the queue and fills valid requests on a schedule (roughly hourly). Section [8](#8-the-coinchange-solver-service--what-fills-your-users-requests) documents the behavior your users will observe. |

### The two user flows

```
DEPOSIT (synchronous, 1–2 transactions)
  user ── approve(USDC/USDT → BoringVault) ──▶ ERC-20
  user ── deposit(asset, amount, minimumMint) ─▶ Teller ──▶ mints CCUSD to user
                                                            shares locked for 24h

REDEEM (asynchronous: request now, paid later — no claim step)
  user ── approve(CCUSD → AtomicQueue) ───────▶ BoringVault (share token)
  user ── safeUpdateAtomicRequest(...) ───────▶ AtomicQueue   (records the request)
              ...time passes (up to ~1 batch interval after shares unlock)...
  solver operator ── redeemSolve(...) ────────▶ AtomicSolverV4
        └─▶ pulls user shares from queue, redeems at NAV via Teller.bulkWithdraw,
            sends the user USDT directly. The request simply disappears when filled.
```

Key mental model for the redeem side: the queue is a **limit order book with exactly one order per (user, offer, want) pair**. The user's order says "sell `offerAmount` CCUSD at no less than `atomicPrice` USDT per share, valid until `deadline`". The solver fills orders priced at or below NAV and keeps the difference (the *spread*). Posting a new order for the same pair **replaces** the old one.

---

## 2. Live deployment reference

All addresses are **Ethereum mainnet** (`chainId 1`), verified on-chain (contracts respond with the expected `symbol()`/`name()`/rates).

### Contracts

| Contract | Address |
|---|---|
| BoringVault (CCUSD share token) | `0x844a9d1B20A3016610B5270F32eDDCc1E27787cC` |
| Teller | `0xbC65b430d01E267652694503ca1ae5543C915bB9` |
| Accountant | `0x665d264e867e45f2bFCAeE4DD1C65A784FE9d4E9` |
| Lens | `0x5732789EB6Eef65173bA732EE3b05f3f23AB840b` |
| AtomicQueue | `0x1479aea1a79e10a6B8c3925f66a7b1dFe0FEeF93` |
| AtomicSolverV4 | `0x6c0f80f755f3C094587E4b5242A0D6570B2F3EAA` |

A `DelayedWithdraw` contract is also deployed for this vault but **unused** — public withdrawals through it are disabled, so end users cannot withdraw that way. All redemptions go through the AtomicQueue.

### Tokens

| Token | Address | Decimals | Role |
|---|---|---|---|
| CCUSD (vault shares) | `0x844a9d1B20A3016610B5270F32eDDCc1E27787cC` | **18** | what depositors hold; what redeemers sell |
| USDT | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 6 | **base asset** (unit of account) *and* the redemption payout token |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6 | accepted for deposit (pegged 1:1 with USDT in the accountant) |

Deposits accept **USDC or USDT**. Redemptions pay **USDT only** — do not assume USDC; the solver is configured to fill share→USDT requests exclusively.

### Behavioral parameters

| Parameter | Value | Frontend implication |
|---|---|---|
| Share lock (`teller.shareLockPeriod()`) | `86400` (**1 day**) | After each deposit, the depositor's *entire* share balance is untransferable for 24h. Block redemption requests until `shareUnlockTime` passes (the solver skips locked holders anyway). |
| AtomicQueue `MAX_DISCOUNT` | `0.01e6` (**1%**) | Hard on-chain cap on the redemption spread a user can offer. |
| Standard solver spread | **0.1%** | The conventional discount; this repo's UI defaults to it. |
| Solver batch cadence | **~1 hour** | Expected fill latency after a request becomes fillable. |
| Request validity default (this UI) | **7 days** | The deadline this repo's UI applies; pick your own (see [§7.3](#73-choosing-discount-and-deadline)). |
| Accountant rate bounds | `9950` / `10010` (−0.5% / +0.1% per update) | Guardrails on NAV updates; informational. |
| Accountant min update delay | `3600` (1h) | NAV updates at most hourly. |
| Exchange rate | ≈ `1e6` (1 CCUSD ≈ 1 USDT) | `getRate()` is in base (USDT, 6-decimal) units. |

---

## 3. Units, decimals & encoding conventions

Getting units right is most of the work. Pin this table to your wall:

| Quantity | Unit / scale | Example |
|---|---|---|
| CCUSD share amounts (`offerAmount`, balances, approvals) | 18 decimals | 10 shares = `10_000000000000000000` = `10n * 10n**18n` |
| USDC/USDT amounts | 6 decimals | 25 USDT = `25_000000` |
| `accountant.getRate()` / `getRateInQuoteSafe(quote)` | quote-token decimals (USDT ⇒ 6) | `1_000000` = 1.00 USDT per share |
| AtomicQueue `atomicPrice` | want-token decimals (USDT ⇒ 6), **per one whole share** | `999000` = 0.999 USDT/share |
| AtomicQueue `discount` argument | parts of **1e6** | 0.1% = `1000`; 1% = `10000` (= `MAX_DISCOUNT`) |
| `boring-vault-ui` `discountPercent` argument | percent **string** | `"0.1"` → library sends `1000` (multiplies by 10⁴) |
| Payout math (in `AtomicQueue.solve`) | `assetsToUser = atomicPrice * offerAmount / 10**18` | price in 6-dp × shares in 18-dp ÷ 1e18 → USDT in 6-dp |
| DelayedWithdraw `maxLoss` / fees (other vaults) | parts of **1e4** (bps) | `500` = 5% — note the different base vs the queue! |
| `AtomicRequest` field widths | `deadline uint64`, `atomicPrice uint88`, `offerAmount uint96` | `uint96` comfortably holds any realistic 18-dp share amount |

Two of these deserve emphasis:

- **The queue's discount is /1e6; DelayedWithdraw percentages are /1e4.** If you have integrated other Boring Vaults before, do not carry the bps assumption over.
- **18-decimal share amounts do not fit in a JS `number`.** Anything above ~0.009 CCUSD exceeds `Number.MAX_SAFE_INTEGER` in base units. Use `bigint` (or decimal strings) everywhere on the share side. This exact mistake existed inside `boring-vault-ui` up to 1.6.2 — every realistic redemption failed client-side — and is why the `>= 1.6.3` version floor in [§11](#11-known-boring-vault-ui163-issues-and-required-workarounds) is mandatory.

---

## 4. Choosing an integration path

**Path A — `boring-vault-ui@1.6.3`** (what this repo does). A React context + hook that wraps deposits and queue redemptions. Fastest to production if you are on React + wagmi + ethers v6, *provided* you apply the workarounds in [§11](#11-known-boring-vault-ui163-issues-and-required-workarounds) — one of them (the `>= 1.6.3` version floor; earlier versions have an 18-decimal overflow) is a hard requirement without which redemptions do not work at all.

**Path B — direct contract calls.** The full user surface is only four state-changing calls (two approvals, `teller.deposit`, `queue.safeUpdateAtomicRequest`) plus a handful of views. If you are not on React, not on ethers v6, or simply prefer fewer dependencies, integrating directly with viem/ethers/web3 is entirely reasonable and avoids every library caveat. Section [6](#6-path-b--direct-contract-integration-any-stack) gives complete recipes.

Both paths share sections [7](#7-the-redemption-flow-in-depth-atomicqueue)–[10](#10-error-handling--edge-cases) — the queue semantics, solver behavior, lifecycle, and edge cases are identical regardless of how you submit transactions.

---

## 5. Path A — integrating with `boring-vault-ui@1.6.3`

### 5.1 Install

```bash
npm install boring-vault-ui@1.6.3
npm install ethers@^6 viem wagmi @tanstack/react-query bignumber.js connectkit
```

Pin the version exactly — the library's API has shifted across minor versions. ConnectKit is what this repo uses for wallet UX; any wagmi-compatible connector kit works.

Three install-time requirements (all are in this repo, ready to copy):

**(a) Dedupe `@wagmi/core`.** `boring-vault-ui` declares `@wagmi/core ^2.6.16` while `wagmi@2.x` resolves a newer one; npm installs two copies, which breaks ConnectKit↔wagmi typing and can split the React context (wallet "connects" but hooks don't see it). Force one copy:

```jsonc
// package.json
{
  "overrides": { "@wagmi/core": "2.22.1" }
}
```

**(b) Never go below 1.6.3 — the redemption overflow floor.** `queueWithdraw` in versions up to 1.6.2 converted the share amount to base units with `BigNumber.toNumber()`. On an 18-decimal share token, any amount above ~0.009 shares exceeds `Number.MAX_SAFE_INTEGER` and ethers v6 throws `overflow … INVALID_ARGUMENT` while encoding the approve — **every realistic redemption fails client-side before the wallet even opens.** Upstream fixed this in 1.6.3 (commit `523c8ab`, "Better large number handling": amounts pass as decimal strings via `toFixed(0)`). This repo guards the floor with a regression test (`npm run test:withdraw`, `scripts/queue-withdraw-regression.cjs`) that drives the real compiled `queueWithdraw` against a mock transport and asserts the on-wire calldata carries the full 18-decimal amount — run it in CI so a dependency change can never silently reintroduce the overflow.

One residual sharp edge survives in 1.6.3 (through at least 1.9.13): the pre-approve allowance check still compares as floats (`Number(allowance) < amount.toNumber()`). It cannot throw; the worst case is a float-epsilon misjudgment that skips the approve and lets `safeUpdateAtomicRequest` revert on-chain — recoverable, no fund risk.

**(c) Respect the package `exports` map.** Only two import specifiers resolve: `"boring-vault-ui"` (→ `BoringVaultV1Provider`, `useBoringVaultV1`, `DepositButton`) and `"boring-vault-ui/types"` (→ the TypeScript interfaces). Every `boring-vault-ui/dist/...` deep path is blocked under Vite/webpack 5/esbuild. Keep the imports behind one module (`src/lib/boringVault.ts` here) so a future packaging change is a one-line fix.

### 5.2 Provider stack

```
WagmiProvider → QueryClientProvider → ConnectKitProvider → BoringVaultV1Provider → your app
```

No ChakraProvider is needed unless you render the library's prebuilt `DepositButton` — this repo builds fully custom UI off the hook.

```tsx
// See src/providers.tsx and src/config/vault.ts for the complete version.
import { BoringVaultV1Provider } from "boring-vault-ui";

<BoringVaultV1Provider
  chain="ethereum"
  vaultContract="0x844a9d1B20A3016610B5270F32eDDCc1E27787cC"
  tellerContract="0xbC65b430d01E267652694503ca1ae5543C915bB9"
  accountantContract="0x665d264e867e45f2bFCAeE4DD1C65A784FE9d4E9"
  lensContract="0x5732789EB6Eef65173bA732EE3b05f3f23AB840b"
  withdrawQueueContract="0x1479aea1a79e10a6B8c3925f66a7b1dFe0FEeF93"
  ethersProvider={ethersProvider}          // ethers.JsonRpcProvider — reads only
  depositTokens={[USDC, USDT]}
  withdrawTokens={[USDT]}
  baseAsset={USDT}
  vaultDecimals={18}                       // CCUSD has 18 decimals — NOT the base asset's 6
>
  {children}
</BoringVaultV1Provider>
```

Notes:

- **`vaultDecimals` is 18** (the share token), even though the base asset has 6. Mixing these up corrupts every share-side conversion.
- Pass `withdrawQueueContract`, **not** `delayWithdrawContract` — this vault redeems via the queue.
- The context only becomes ready (`isBoringV1ContextReady`) when *all* required props are set and both token arrays are non-empty. A silently "not ready" context is almost always a missing prop.
- The `ethersProvider` handles all reads, so TVL/share price render for visitors with no wallet.

### 5.3 The signer adapter you must own

Every write takes an ethers `JsonRpcSigner`. The library's own `useEthersSigner` is **not importable** (not re-exported from the root; deep path blocked by `exports`). Copy `src/lib/useEthersSigner.ts` from this repo — it's the standard ~25-line viem `WalletClient` → ethers `JsonRpcSigner` adapter built on wagmi's `useConnectorClient`. The signer is `undefined` until a wallet is connected; gate every write button on it.

### 5.4 Reads

All `fetch*` functions return **decimal-adjusted, human-readable numbers** — never divide by `10**decimals` again.

| Hook function | Underlying call | Returns |
|---|---|---|
| `fetchTotalAssets()` | `lens.totalAssets(vault, accountant)` | TVL in USDT |
| `fetchShareValue()` | `lens.exchangeRate(accountant)` | USDT value of 1 CCUSD |
| `fetchUserShares(addr)` | `lens.balanceOf(addr, vault)` | CCUSD balance |
| `fetchUserUnlockTime(addr)` | `lens.userUnlockTime(addr, teller)` | unix seconds; shares locked until then |

Poll rather than fetch once (this repo polls every 45s — `src/hooks/useVaultMetrics.ts`), and refetch everything after each successful write. Reads reject with "Contracts not ready" until `isBoringV1ContextReady`.

### 5.5 Deposits

```tsx
const { deposit, depositStatus } = useBoringVaultV1();
await deposit(signer, "100.5", USDC);   // amount is a HUMAN-READABLE string
```

What happens (verified in the 1.6.3 source and the Teller contract):

1. Checks the user's USDC/USDT allowance **to the BoringVault address** (the vault, *not* the Teller — the vault pulls funds in `BoringVault.enter`). If insufficient → prompts `approve(vault, amount)`.
2. Calls `teller.deposit(asset, amount, 0)`. Shares are minted to the user at `amount × 10^18 / getRateInQuoteSafe(asset)`.
3. The user's **entire share balance** locks for 24h (`shareUnlockTime = now + 86400`) — including previously-held shares. Warn repeat depositors: topping up re-locks everything.

The user may sign twice (approve + deposit). Show the **vault** address as the approval spender in your confirm dialog, and the Teller as the executor. Progress flows through the live `depositStatus` object (`{initiated, loading, success?, error?, tx_hash?}`) — drive toasts from it (see `src/hooks/useStatusToasts.ts`).

Note the library passes `minimumMint = 0` (no slippage floor). For this vault the practical risk is negligible (NAV moves ≤ +0.1% per hourly update), but if you want a real floor, submit the deposit directly ([§6.3](#63-deposit-direct)).

### 5.6 Redemptions

```tsx
const { queueWithdraw, withdrawStatus } = useBoringVaultV1();
await queueWithdraw(
  signer,
  "250",     // CCUSD shares, human-readable string
  USDT,      // want token — must be USDT for this vault
  "0.1",     // discountPercent: "0.1" = 0.1% below NAV (the standard spread)
  "7"        // daysValid: deadline = now + 7 days
);
```

What happens (verified against the 1.6.3 source):

1. Checks CCUSD allowance to the **AtomicQueue**; if insufficient → prompts `vault.approve(queue, shares)` for the exact amount.
2. Computes `deadline = now + daysValid × 86400` and `discount = discountPercent × 10⁴` (ppm).
3. Calls `queue.safeUpdateAtomicRequest(CCUSD, USDT, {deadline, atomicPrice: 0, offerAmount, inSolve: false}, accountant, discount)`. The contract *overrides* `atomicPrice` with `getRateInQuoteSafe(USDT) × (1e6 − discount) / 1e6` — the user's floor price is always anchored to live NAV at posting time.

**Do not use these two library functions on this vault:**

- `withdrawQueueStatuses()` reads the Seven Seas indexer (`api.sevenseas.capital`), which does **not** index this Coinchange vault — it always returns `[]`. Read the request on-chain instead: `AtomicQueue.getUserAtomicRequest(user, CCUSD, USDT)` (copy `src/hooks/useWithdrawRequest.ts`, a wagmi `useReadContract` polling every 30s that also tracks the share allowance).
- `withdrawQueueCancel()` calls the raw `updateAtomicRequest`, which is **admin-gated** on this deployment — it reverts for end users. See [§7.4](#74-stopping-a-request) for the supported "stop" pattern.

One shared caveat: **all** withdraw-family functions write the same live `withdrawStatus` object. If you render multiple withdraw actions, track which one is in flight yourself.

---

## 6. Path B — direct contract integration (any stack)

Everything the library does can be done with a handful of raw calls. Examples use viem; the ABIs are in [Appendix A](#appendix-a--contract-reference).

### 6.1 Constants

```ts
const VAULT      = "0x844a9d1B20A3016610B5270F32eDDCc1E27787cC"; // CCUSD, 18 dp
const TELLER     = "0xbC65b430d01E267652694503ca1ae5543C915bB9";
const ACCOUNTANT = "0x665d264e867e45f2bFCAeE4DD1C65A784FE9d4E9";
const QUEUE      = "0x1479aea1a79e10a6B8c3925f66a7b1dFe0FEeF93";
const USDT       = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // 6 dp
const USDC       = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // 6 dp
```

### 6.2 Reads

```ts
// NAV of one share, in USDT base units (6 dp). Reverts while the accountant is paused —
// which is exactly when you want deposits/redemptions disabled, so prefer the Safe variant.
const rate = await client.readContract({
  address: ACCOUNTANT, abi: accountantAbi,
  functionName: "getRateInQuoteSafe", args: [USDT],
}); // e.g. 1_000_000n

// User's share balance (18 dp) and unlock time.
const shares   = await client.readContract({ address: VAULT,  abi: erc20Abi,  functionName: "balanceOf",       args: [user] });
const unlockAt = await client.readContract({ address: TELLER, abi: tellerAbi, functionName: "shareUnlockTime", args: [user] });

// The user's single open redemption request for the CCUSD→USDT pair.
const req = await client.readContract({
  address: QUEUE, abi: atomicQueueAbi,
  functionName: "getUserAtomicRequest", args: [user, VAULT, USDT],
}); // { deadline: uint64, atomicPrice: uint88, offerAmount: uint96, inSolve: bool }
// offerAmount === 0n  ⇒  no open request (or it was filled).

// Pause flags — gate your whole UI on these.
const tellerPaused = await client.readContract({ address: TELLER, abi: tellerAbi, functionName: "isPaused" });
const queuePaused  = await client.readContract({ address: QUEUE,  abi: atomicQueueAbi, functionName: "isPaused" });

// TVL: use the Lens — totalAssets(vault, accountant) → (asset, assets).
```

### 6.3 Deposit (direct)

```ts
// 1. Approve the VAULT (not the teller!) to pull the deposit asset.
await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [VAULT, amount6dp] });

// 2. Compute a real slippage floor (the library passes 0 here — you can do better):
const rate = await client.readContract({ address: ACCOUNTANT, abi: accountantAbi, functionName: "getRateInQuoteSafe", args: [USDC] });
const expectedShares = (amount6dp * 10n ** 18n) / rate;
const minimumMint = (expectedShares * 9990n) / 10000n; // tolerate 0.1%

// 3. Deposit via the teller. Reverts: __Paused, __AssetNotSupported, __MinimumMintNotMet.
await wallet.writeContract({
  address: TELLER, abi: tellerAbi,
  functionName: "deposit", args: [USDC, amount6dp, minimumMint],
});
```

`depositWithPermit` also exists (spender = the **vault**) — usable with USDC (which supports EIP-2612) to collapse approve+deposit into one transaction; USDT does not support permit. Watch the `Deposit` event for confirmation UX; `shareLockPeriodAtTimeOfDeposit` is right there in the event.

### 6.4 Post a redemption request (direct)

```ts
// 1. Approve CCUSD shares to the queue. safeUpdateAtomicRequest REQUIRES
//    allowance ≥ offerAmount at posting time (and balance ≥ offerAmount).
await wallet.writeContract({ address: VAULT, abi: erc20Abi, functionName: "approve", args: [QUEUE, shares18dp] });

// 2. Post the request. atomicPrice is ignored and recomputed on-chain as
//    NAV × (1e6 − discount) / 1e6, so the floor price is anchored to live NAV.
const DISCOUNT = 1_000n;                                  // 0.1% in ppm; MAX = 10_000 (1%)
const deadline = BigInt(Math.floor(Date.now() / 1000) + 7 * 86400);
await wallet.writeContract({
  address: QUEUE, abi: atomicQueueAbi,
  functionName: "safeUpdateAtomicRequest",
  args: [VAULT, USDT,
         { deadline, atomicPrice: 0n, offerAmount: shares18dp, inSolve: false },
         ACCOUNTANT, DISCOUNT],
});
```

`safeUpdateAtomicRequest` reverts if: `offerAmount` exceeds the user's share **balance**; the **allowance** to the queue is below `offerAmount`; the `deadline` is in the past; `offerAmount == 0`; `discount > 10000`; the offer token isn't the accountant's vault; or the accountant is paused (`getRateInQuoteSafe` reverts). Handle each with a specific message — the error names are in [Appendix A](#appendix-a--contract-reference).

### 6.5 Track fills (direct)

When the solver fills the request, the user receives USDT directly and the request is zeroed. Two complementary signals:

```solidity
event AtomicRequestUpdated(address indexed user, address indexed offerToken, address indexed wantToken,
    uint256 amount, uint256 deadline, uint256 minPrice, uint256 timestamp);   // fired on every post/replace
event AtomicRequestFulfilled(address indexed user, address indexed offerToken, address indexed wantToken,
    uint256 offerAmountSpent, uint256 wantAmountReceived, uint256 timestamp); // fired on fill
```

Subscribe to `AtomicRequestFulfilled` filtered by your user (all three params are indexed) for a "your redemption of X CCUSD for Y USDT completed" toast, and poll `getUserAtomicRequest` (`offerAmount → 0`) as the ground truth.

---

## 7. The redemption flow in depth (AtomicQueue)

These semantics apply to both integration paths.

### 7.1 One request per pair; posting replaces

The queue stores exactly one `AtomicRequest` per `(user, offer, want)` triple. Posting again **overwrites** the previous request — it does not stack (unlike the DelayedWithdraw model, where requests for the same asset accumulate). Your UI should surface this: "submitting a new request replaces your open one."

### 7.2 The price is pinned at posting time

`safeUpdateAtomicRequest` computes `atomicPrice = NAV × (1e6 − discount) / 1e6` **once, when the request is posted**. If NAV rises afterwards, the user still gets filled at their (now stale, lower) floor — fine; the solver fills anything priced at or below current NAV. If NAV is *marked down* after posting (accountant rate decreases beyond the spread), the request's floor is now *above* NAV and the solver will skip it until the user re-posts at the new NAV. This is deliberate vault protection — stale-high requests must never be filled at above-NAV prices.

### 7.3 Choosing discount and deadline

- **Discount (spread):** the on-chain cap is 1% (`MAX_DISCOUNT = 0.01e6`). **0.1% is the standard spread** — this repo's UI defaults to it, and it is the convention the solver is designed around. Larger values give away more of your users' value for no benefit; smaller values (down to 0%) may still fill, but the only contract-level guarantee is "at or below NAV", so treat 0.1% as the reliable choice.
- **Deadline:** must cover (any remaining share lock) + (up to one solver batch interval, ~1h) + operational headroom. A 48-hour default is a reasonable choice; this repo uses 7 days to be maximally forgiving — a request that outlives a weekend liquidity crunch fills on its own without the user re-posting. Both are fine; pick one and explain it in the UI.

### 7.4 Stopping a request

There is no user-callable cancel on this deployment:

- The raw `updateAtomicRequest` (which could zero the request) is **admin-gated** by the RolesAuthority.
- `safeUpdateAtomicRequest` explicitly reverts on `offerAmount == 0` (`AtomicQueue__SafeRequestOfferAmountZero`), so it cannot zero a request either.
- The library's `withdrawQueueCancel` therefore reverts for end users.

The supported pattern — what this repo's **Stop request** button does (`src/components/WithdrawPanel.tsx`): **revoke the share approval** — `vault.approve(queue, 0)`. The solver skips any request whose approval no longer covers it (it cannot pull the shares); the request then sits inert until its deadline lapses, after which it drops out entirely. The request struct remains visible on-chain until then — your UI should render "stopped" (allowance < offerAmount) rather than "open". Re-approving (or posting a fresh request, which re-prompts approval) re-activates it.

### 7.5 No claim step

Unlike the DelayedWithdraw model, there is nothing to claim: the solver's fill transfers USDT straight to the user's wallet. Design the UI accordingly — after the request is posted, the remaining UX is *status display*, not further actions (except Stop).

---

## 8. The Coinchange solver service — what fills your users' requests

Redemption requests are filled by an automated solver service operated by Coinchange. (This vault does not use Seven Seas' solver infrastructure or indexer — which is also why the library's indexer-backed status function returns nothing for it, [§5.6](#56-redemptions).) You never interact with the solver directly; understanding the behavior your users will observe lets your frontend set accurate expectations.

### 8.1 How filling works

The solver runs in batches, **roughly every hour**. Each run it:

1. Collects every open request for the CCUSD → USDT pair.
2. Sets aside requests that can't currently be filled (the conditions in [§8.2](#82-why-a-request-may-not-fill-and-what-your-ui-should-say)).
3. Orders the rest **first-in, first-out** by the time each request was posted.
4. Fills as many requests, in FIFO order, as the vault's available USDT liquidity covers — in a single batch transaction. Each filled user receives `atomicPrice × shares` in USDT straight to their wallet; the difference vs NAV (the spread) is retained by the solver operator.

A request that isn't filled in one batch is not cancelled — it is simply reconsidered in the next batch, keeping its FIFO position.

### 8.2 Why a request may not fill (and what your UI should say)

| Condition | What your UI should do |
|---|---|
| Shares still in the 24h deposit lock (`shareUnlockTime` in the future) | Show "fillable after {unlock time}". Prevent posting before unlock, or explain the wait. |
| Deadline has passed (`now > deadline`) | Show "expired — submit a new request". The stale struct stays visible on-chain; treat it as closed. |
| Share approval to the queue below `offerAmount` (e.g. after Stop) | Show "stopped". Re-approve to resume. |
| Share balance below `offerAmount` (user moved shares) | Show "invalid — shares no longer available". |
| NAV marked down below the request's floor price ([§7.2](#72-the-price-is-pinned-at-posting-time)) | Show "repricing required — re-submit at current NAV". |
| Vault's available USDT liquidity doesn't cover it yet | Show "queued — will fill as liquidity arrives". FIFO position is preserved. |

Every condition above is checkable client-side from the on-chain reads in [§6.2](#62-reads) — your UI can always tell the user exactly why a request is waiting, with no dependency on any off-chain service.

### 8.3 Timing expectations to communicate

- **Normal case:** posted + unlocked + liquid ⇒ filled within **one batch interval (~1 hour)**.
- **Fresh depositors:** the 24h share lock dominates: deposit → lock (24h) → next batch ⇒ realistically "within ~25 hours of deposit".
- **Liquidity crunch:** requests queue FIFO against the vault's available USDT and fill as liquidity is replenished; a request can legitimately wait longer than the UI's optimistic copy. If the deadline passes while waiting, the user must re-post (and goes to the back of the FIFO with a new post time). Suggested copy: "typically fills within a few hours; guaranteed pricing at NAV − 0.1%; if your request expires unfilled, simply re-submit."
- **Paused system:** if the queue, teller, or accountant is paused, nothing fills until operations resume. Your UI should already be showing the paused state from its own reads ([§10](#10-error-handling--edge-cases)).

---

## 9. Request lifecycle & UI state machine

Derive the state from `getUserAtomicRequest(user, CCUSD, USDT)` + the share allowance + the clock (this is exactly what `src/hooks/useWithdrawRequest.ts` + `src/components/RequestRow.tsx` implement):

```
                     offerAmount == 0
                   ┌───────────────────┐
                   │     NO REQUEST     │◀───────────────(filled: solver zeroes it;
                   └─────────┬─────────┘                  AtomicRequestFulfilled fired)
                             │ safeUpdateAtomicRequest              ▲
                             ▼                                      │
        allowance ≥ offerAmount && now ≤ deadline                   │
                   ┌───────────────────┐      solver batch          │
                   │       OPEN         │────────────────────────────┘
                   └──┬────────┬───────┘   (inSolve=true transiently
   approve(queue, 0)  │        │ now > deadline    during the fill tx)
                      ▼        ▼
              ┌──────────┐  ┌──────────┐
              │ STOPPED   │  │ EXPIRED  │   both: struct still visible on-chain,
              └──────────┘  └──────────┘   will never fill; user re-posts to retry
```

Per-state rendering used by this repo:

- **OPEN** — show shares, min payout (`atomicPrice × shares / 1e18`), deadline countdown, Stop button, and "typically fills within ~1 hour" copy.
- **STOPPED** (`allowance < offerAmount`) — "request can no longer be filled"; offer re-approval or a fresh request.
- **EXPIRED** (`now > deadline`) — "expired — submit a new request".
- **FILLED** — the request vanishes; detect the transition (previous poll had `offerAmount > 0`, now `0`, without a Stop/replace you initiated) or the `AtomicRequestFulfilled` event, then toast success and refetch balances (the user's USDT went up; CCUSD went down).
- Poll every ~30s; also refetch immediately after your own writes.

Deposit-side state is simpler: track `shareUnlockTime` and show a countdown; while `now < unlockAt`, disable the redeem form with an explanation.

---

## 10. Error handling & edge cases

**Pause states (three independent flags — check all).**

| Flag | Blocks |
|---|---|
| `teller.isPaused()` | deposits |
| accountant paused (`accountantState.isPaused`; any `getRate*Safe` call reverts) | deposit pricing, posting requests, **and** solver fills — effectively the whole system |
| `queue.isPaused()` | posting/replacing requests and solver fills |

The accountant auto-pauses if a rate update falls outside its bounds — pauses are a real operational state, not a theoretical one. Poll the flags and render a clear "temporarily suspended" banner rather than letting transactions revert.

**Deposit edge cases.**
- Asset not in `teller.isSupported(asset)` → `__AssetNotSupported`. Only USDC/USDT.
- Repeat deposits re-lock the user's entire share balance for another 24h (per-user, not per-deposit). Say so before they top up with an open redemption plan.
- USDT's non-standard `approve` (must set to 0 before changing a non-zero allowance) is handled by exact-amount approvals; if you implement infinite approvals, handle it.

**Redemption edge cases.**
- Posting reverts if allowance or balance is insufficient *at posting time* — sequence the approval strictly before the request.
- A request survives transfers of the *un-offered* remainder, but if the balance drops below `offerAmount` the solver skips it.
- NAV markdown after posting leaves the request's floor above NAV — it won't fill; tell the user to re-post ([§7.2](#72-the-price-is-pinned-at-posting-time)).
- `inSolve == true` in a read means you caught the fill mid-transaction — render "filling…", it resolves within the block.
- Amount hygiene: keep the share side in `bigint`/strings end-to-end; format for display only at the edge (`src/lib/format.ts`).

**Wallet/network.**
- Gate writes on: context ready (Path A) ∧ signer present ∧ `chainId === 1`. Show a network-switch banner otherwise (`src/components/NetworkBanner.tsx`).
- Reads work with no wallet; render the vault overview for anonymous visitors.

---

## 11. Known `boring-vault-ui@1.6.3` issues and required workarounds

Consolidated. Items 1 and 8 were fixed upstream in 1.6.3 (the version this repo pins) and stay listed as **version-floor guards**; item 2 is **blocking** for this vault; the rest cause subtle breakage. This repo carries a ready-made workaround for each. (Whether any later version fixes the rest is analyzed in [`docs/research/boring-vault-ui-upgrade-analysis.md`](research/boring-vault-ui-upgrade-analysis.md) — as of 1.9.13, none does.)

| # | Issue | Impact on this vault | Workaround (in this repo) |
|---|---|---|---|
| 1 | `queueWithdraw` in ≤ 1.6.2 converts share amounts with `BigNumber.toNumber()` — unsafe above `Number.MAX_SAFE_INTEGER` | **Every redemption > ~0.009 CCUSD fails client-side** (ethers v6 `overflow INVALID_ARGUMENT`) | Fixed upstream in 1.6.3 — never install below it; regression-guarded by `npm run test:withdraw` ([§5.1(b)](#51-install)) |
| 2 | `withdrawQueueCancel` calls the admin-gated raw `updateAtomicRequest` | Cancel always reverts for end users | Stop pattern: revoke share approval ([§7.4](#74-stopping-a-request)) |
| 3 | `withdrawQueueStatuses` reads the Seven Seas indexer | Always `[]` — this vault isn't indexed there | On-chain read: `getUserAtomicRequest` (`src/hooks/useWithdrawRequest.ts`) |
| 4 | `useEthersSigner` not exported; all `dist/…` deep imports blocked by the `exports` map | Import errors / unreachable code | Local adapter `src/lib/useEthersSigner.ts`; single import boundary `src/lib/boringVault.ts` |
| 5 | Duplicate `@wagmi/core` (library pins an old range) | Type errors; wallet connects but hooks don't see it | `"overrides": { "@wagmi/core": "2.22.1" }` |
| 6 | One shared `withdrawStatus` object across all withdraw actions | Concurrent actions overwrite each other's status | Track which action is in flight in component state |
| 7 | `deposit` passes `minimumMint = 0` | No slippage floor (low risk here: NAV moves ≤ +0.1%/h) | Accept, or deposit directly with a computed floor ([§6.3](#63-deposit-direct)) |
| 8 | Deposit path in ≤ 1.6.2 also used `.toNumber()` | Latent only — USDC/USDT are 6-decimal, values stay safe | Fixed upstream in 1.6.3 (same commit as #1); the float allowance-compare residual of [§5.1(b)](#51-install) applies |
| 9 | Prebuilt components: only `DepositButton` is importable; it drags in Chakra UI | Deep-path component imports fail | Build custom UI off the hook (this whole repo is the example) |

---

## 12. Production checklist

**Install & build**
- [ ] `boring-vault-ui` pinned to exactly `1.6.3` (never below — issue #1); re-validate everything on any upgrade.
- [ ] **`npm run test:withdraw` green in CI** (guards issue #1 — without the 1.6.3 fix redemptions are broken).
- [ ] Single `@wagmi/core` in the lockfile (`find node_modules -path "*@wagmi/core/package.json"` → exactly one).
- [ ] Imports only from `"boring-vault-ui"` and `"boring-vault-ui/types"`.

**Configuration**
- [ ] Addresses from [§2](#2-live-deployment-reference), confirmed with Coinchange; on-chain sanity check (`vault.symbol() === "CCUSD"`, `vault.decimals() === 18`, `accountant.getRate()` ≈ 1e6) at build or boot.
- [ ] `vaultDecimals = 18`; base asset USDT (6); redemption pays **USDT only**.
- [ ] `chainId 1` enforced for writes; dedicated RPC (not the public default) for production.

**Deposit UX**
- [ ] Approval spender shown = **vault** address; two-signature flow explained.
- [ ] 24h share-lock warning shown pre-deposit, including the re-lock-on-top-up behavior.
- [ ] Refetch shares + unlock time after success.

**Redemption UX**
- [ ] Redeem form disabled until `now ≥ shareUnlockTime`.
- [ ] Default spread 0.1%, capped at 1%; deadline default chosen deliberately ([§7.3](#73-choosing-discount-and-deadline)).
- [ ] "New request replaces the open one" notice when a request exists.
- [ ] Stop = approval revoke, rendered as its own state; no reliance on `withdrawQueueCancel`.
- [ ] Open request read on-chain (poll ~30s) with the full state machine of [§9](#9-request-lifecycle--ui-state-machine); fill detected and celebrated; expiry / NAV-markdown states guide the user to re-post.
- [ ] Copy sets the timing expectation: ~1h batches, FIFO under liquidity pressure, re-post after expiry.

**Resilience & safety**
- [ ] All three pause flags polled; suspension banner instead of raw reverts.
- [ ] Share-side amounts in `bigint`/strings end-to-end.
- [ ] Contract addresses shown in every confirmation dialog with explorer links.
- [ ] No secrets in the bundle; RPC keys referrer-restricted; HTTPS only.

---

## Appendix A — contract reference

Exact signatures from the deployed contracts (Se7en-Seas/Veda "Boring Vault" architecture). All user-facing functions carry `requiresAuth`; on this deployment `teller.deposit`, `depositWithPermit`, and `queue.safeUpdateAtomicRequest` are configured as public capabilities.

### TellerWithMultiAssetSupport

```solidity
function deposit(ERC20 depositAsset, uint256 depositAmount, uint256 minimumMint)
    public payable requiresAuth nonReentrant returns (uint256 shares);

function depositWithPermit(ERC20 depositAsset, uint256 depositAmount, uint256 minimumMint,
    uint256 deadline, uint8 v, bytes32 r, bytes32 s)
    public requiresAuth nonReentrant returns (uint256 shares);
// permit spender = the BoringVault. Native ETH deposits use depositAsset = 0xEeee…EEeE
// (auto-wrapped to WETH) — not applicable to this USD vault.

// Views / state
mapping(ERC20 => bool) public isSupported;          // USDC, USDT
uint64 public shareLockPeriod;                       // 86400; contract max = 3 days
bool   public isPaused;
mapping(address => uint256) public shareUnlockTime;  // per-user unlock timestamp

event Deposit(uint256 indexed nonce, address indexed receiver, address indexed depositAsset,
    uint256 depositAmount, uint256 shareAmount, uint256 depositTimestamp,
    uint256 shareLockPeriodAtTimeOfDeposit);
```

Deposit reverts: `TellerWithMultiAssetSupport__Paused`, `__AssetNotSupported`, `__MinimumMintNotMet`, `__ZeroAssets`, `__SharesAreLocked` (transfers), `__TransferDenied(from,to,operator)` (deny lists).

### AccountantWithRateProviders

```solidity
function getRate() public view returns (uint256 rate);                        // base (USDT, 6 dp)
function getRateSafe() external view returns (uint256 rate);                  // reverts when paused
function getRateInQuote(ERC20 quote) public view returns (uint256 rateInQuote);
function getRateInQuoteSafe(ERC20 quote) external view returns (uint256 rateInQuote);
// accountantState (struct) includes: uint96 exchangeRate, bool isPaused,
// uint16 allowedExchangeRateChangeUpper/Lower (/1e4), uint24 minimumUpdateDelayInSeconds,
// uint16 managementFee, uint16 performanceFee.
```

Always use the `Safe` variants in user flows — a paused accountant *should* block your writes.

### AtomicQueue

```solidity
struct AtomicRequest {
    uint64 deadline;    // unix seconds; fillable while block.timestamp <= deadline
    uint88 atomicPrice; // min accepted price per share, in want-token decimals
    uint96 offerAmount; // shares offered, in share (18) decimals; 0 = no request
    bool   inSolve;     // true only transiently during a fill
}

function safeUpdateAtomicRequest(ERC20 offer, ERC20 want, AtomicRequest memory userRequest,
    AccountantWithRateProviders accountant, uint256 discount)
    external nonReentrant requiresAuth;
// Overrides userRequest.atomicPrice with getRateInQuoteSafe(want) × (1e6 − discount) / 1e6.
// MAX_DISCOUNT = 0.01e6 (1%).

function updateAtomicRequest(ERC20 offer, ERC20 want, AtomicRequest memory userRequest)
    external nonReentrant requiresAuth;   // ADMIN-GATED on this deployment

function getUserAtomicRequest(address user, ERC20 offer, ERC20 want)
    external view returns (AtomicRequest memory);
function isAtomicRequestValid(ERC20 offer, address user, AtomicRequest calldata userRequest)
    external view returns (bool);
bool public isPaused;

event AtomicRequestUpdated(address indexed user, address indexed offerToken, address indexed wantToken,
    uint256 amount, uint256 deadline, uint256 minPrice, uint256 timestamp);
event AtomicRequestFulfilled(address indexed user, address indexed offerToken, address indexed wantToken,
    uint256 offerAmountSpent, uint256 wantAmountReceived, uint256 timestamp);
```

`safeUpdateAtomicRequest` reverts: `AtomicQueue__SafeRequestOfferAmountGreaterThanOfferBalance`, `__SafeRequestDeadlineExceeded`, `__SafeRequestInsufficientOfferAllowance`, `__SafeRequestOfferAmountZero`, `__SafeRequestDiscountTooLarge`, `__SafeRequestAccountantOfferMismatch`, `__SafeRequestCannotCastToUint88`, `__Paused`; plus the accountant's paused revert bubbling out of `getRateInQuoteSafe`.

Payout math on fill: `assetsToUser = atomicPrice × offerAmount / 10**shareDecimals` (6-dp price × 18-dp shares ÷ 1e18 → 6-dp USDT).

### AtomicSolverV4 (solver-side, informational)

```solidity
function redeemSolve(AtomicQueue queue, ERC20 offer, ERC20 want, address[] calldata users,
    uint256 minimumAssetsOut, uint256 maxAssets, TellerWithMultiAssetSupport teller)
    external requiresAuth;   // callable only by Coinchange's authorized solver operator
```

Nothing in this contract is callable by your frontend — it is listed so the fill transactions your users see on-chain make sense.

### ArcticArchitectureLens

```solidity
function totalAssets(BoringVault vault, AccountantWithRateProviders accountant)
    external view returns (ERC20 asset, uint256 assets);
function previewDeposit(ERC20 depositAsset, uint256 depositAmount, BoringVault vault,
    AccountantWithRateProviders accountant) external view returns (uint256 shares);
function balanceOf(address account, BoringVault vault) external view returns (uint256);
function balanceOfInAssets(address account, BoringVault vault, AccountantWithRateProviders accountant)
    external view returns (uint256 assets);
function exchangeRate(AccountantWithRateProviders accountant) external view returns (uint256 rate);
function userUnlockTime(address account, TellerWithMultiAssetSupport teller) external view returns (uint256);
function isTellerPaused(TellerWithMultiAssetSupport teller) external view returns (bool);
function checkUserDeposit(address account, ERC20 depositAsset, uint256 depositAmount,
    BoringVault vault, TellerWithMultiAssetSupport teller) external view returns (bool);
// note: checks the user's allowance against the VAULT — confirming the approval target.
```

---

## Appendix B — reference app file map

| File | What to copy it for |
|---|---|
| `src/config/vault.ts` | All addresses, tokens, and behavioral constants in one place |
| `src/config/wagmi.ts` | wagmi/ConnectKit config + the ethers read provider |
| `src/providers.tsx` | The full provider stack incl. `BoringVaultV1Provider` wiring |
| `src/lib/boringVault.ts` | The single import boundary to the library (packaging notes inline) |
| `src/lib/useEthersSigner.ts` | The viem→ethers signer adapter (issue #4) |
| `src/hooks/useWithdrawRequest.ts` | On-chain AtomicQueue request + allowance reader, with fill detection (issues #2/#3) |
| `src/hooks/useVaultMetrics.ts` / `useUserPosition.ts` | Polling read patterns |
| `src/hooks/usePauseStatus.ts` / `src/components/PauseBanner.tsx` | Polling the three pause flags + the suspension banner (§10) |
| `src/hooks/useStatusToasts.ts` | Driving toasts off `depositStatus`/`withdrawStatus` |
| `src/components/DepositPanel.tsx` | Full deposit UX: validation, confirm dialog, share-lock notice |
| `src/components/WithdrawPanel.tsx` | Full redemption UX: spread/validity controls, replace notice, Stop |
| `src/components/RequestRow.tsx` | Request state rendering (open/filling/stopped/expired) |
| `scripts/queue-withdraw-regression.cjs` | CI guard that the 1.6.3 overflow fix is present and effective (issue #1) |

Run it: `npm install && npm run dev` (optionally set `VITE_RPC_URL` / `VITE_WALLETCONNECT_PROJECT_ID`, see `.env.example`). Reads work with no wallet.

---

## Appendix C — the other withdraw model (DelayedWithdraw / WBTC vault)

Coinchange also operates a **WBTC vault** (`SRcoinBTC`, 8-decimal shares) that uses the *other* Boring Vault withdraw primitive, **DelayedWithdraw**: request → 2-day maturity → user claims within a 3-day completion window (`boring-vault-ui`'s `delayWithdraw*` family). Key behavioral differences from the AtomicQueue model documented here:

| | AtomicQueue (this guide, CCUSD) | DelayedWithdraw (WBTC vault) |
|---|---|---|
| Re-posting for the same token | **replaces** | **stacks** (adds) |
| Claim step | none — solver pays automatically | user must call `completeWithdraw` in the window |
| Cancel | not user-callable; stop via approval revoke | user-callable `cancelWithdraw` |
| Price tolerance units | discount /1e6, max 1% | `maxLoss` /1e4, default 5% |
| Fill counterparty | Coinchange solver service | the user themself (or a third party if allowed) |

If you are integrating the WBTC vault, contact Coinchange for that vault's addresses, parameters, and flow documentation — and do not mix the two models' assumptions.

---

*Guide compiled 2026-07-17 against the deployed mainnet contracts (addresses in §2, verified via RPC) and the published `boring-vault-ui@1.6.3` npm artifact. When in doubt, the deployed bytecode and the reference implementation in this repository are the ground truth.*
