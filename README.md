# Coinchange Yield Prime (CCUSD) — End-User dApp

A production-style, fully custom frontend for the **Coinchange Yield Prime**
vault — a USD stablecoin vault on Ethereum mainnet whose share token is
**CCUSD** (`name: "Yield Prime"`, 18 decimals) — built on
[`boring-vault-ui@1.6.3`](https://www.npmjs.com/package/boring-vault-ui/v/1.6.3).

> **📖 Integrating this vault into your own frontend?** Start with the
> [**Integration Guide**](./docs/INTEGRATION-GUIDE.md) — a comprehensive,
> contract-verified walkthrough of the deposit and AtomicQueue redemption flows,
> the Coinchange solver service that fills redemptions, both library-based and
> direct-contract integration paths, and every known `boring-vault-ui@1.6.3`
> caveat with its workaround. This repository is the reference implementation
> that guide points into.

It implements the full user surface: view the vault, deposit **USDC or USDT**,
and redeem via the **AtomicQueue** (request → an off-chain solver fills it to
USDT; no separate claim step). The library's prebuilt Chakra components are
**not** used — the UI is built directly on `useBoringVaultV1()` so branding,
validation, and error states are fully under our control.

> **Withdraw model.** This vault's `DelayedWithdraw` contract is deployed but
> **unused** (`allowPublicWithdraws=false`). Redemption is solver-priced over
> the audited AtomicQueue, so the frontend wires the provider's
> `withdrawQueueContract` and uses the `queueWithdraw` flow (see the
> [Integration Guide](./docs/INTEGRATION-GUIDE.md)).

## Stack

- **React 18 + TypeScript + Vite**
- **wagmi + viem + ConnectKit** — wallet connection
- **ethers v6** — read provider + signer for writes
- **`boring-vault-ui@1.6.3`** — `BoringVaultV1Provider` + `useBoringVaultV1()`

## Run it

```bash
npm install
cp .env.example .env     # optional — sensible public defaults are baked in
npm run dev              # http://localhost:5173
```

```bash
npm run build            # tsc --noEmit + vite build
npm run typecheck
```

### Environment

| Var | Required | Purpose |
|---|---|---|
| `VITE_RPC_URL` | no | Mainnet RPC for reads. Defaults to a public endpoint; set Infura/Alchemy for production. |
| `VITE_WALLETCONNECT_PROJECT_ID` | no | Enables WalletConnect/mobile QR. Injected wallets (MetaMask/Rabby) work without it. |

Reads (TVL, share value, positions) work with **no wallet** — the vault overview
renders for anonymous visitors straight off the public RPC.

## Deployed addresses (Ethereum mainnet)

Defined in `src/config/vault.ts` and verified against the live contracts
(see [On-chain verification](#on-chain-verification-2026-06-26) below).

| Contract | Address |
|---|---|
| BoringVault (CCUSD share) | `0x844a9d1B20A3016610B5270F32eDDCc1E27787cC` |
| Teller | `0xbC65b430d01E267652694503ca1ae5543C915bB9` |
| Accountant | `0x665d264e867e45f2bFCAeE4DD1C65A784FE9d4E9` |
| Lens | `0x5732789EB6Eef65173bA732EE3b05f3f23AB840b` |
| AtomicQueue (`withdrawQueueContract`) | `0x1479aea1a79e10a6B8c3925f66a7b1dFe0FEeF93` |
| AtomicSolverV4 | `0x6c0f80f755f3C094587E4b5242A0D6570B2F3EAA` |

Assets: base = **USDT** (`0xdAC17…ec7`); deposits accept **USDC**
(`0xA0b86…eB48`) and USDT (both pegged 1:1); redemptions pay **USDT**.

## What it does

- **Vault overview** — live TVL and share price (polled every 45s), vault/asset
  contract links.
- **Your position** — CCUSD balance, USD position value, and a live **1-day
  share lock** countdown (`fetchUserUnlockTime`).
- **Deposit** — USDC/USDT token selector, amount input with balance + MAX,
  estimated CCUSD shares, approve + deposit (two signatures), confirm dialog,
  1-day share-lock reminder.
- **Redeem (AtomicQueue)** — request form in shares, advanced **spread %** (the
  haircut vs NAV the solver keeps; default 0.1%, contract max 1%) and request
  **validity (days)**. Reads the user's single open request **on-chain** via
  `AtomicQueue.getUserAtomicRequest` (the library's `withdrawQueueStatuses` reads
  a Seven Seas indexer that does not track this vault), with live lifecycle —
  **open → filling → expired** — and a **Cancel** action. A new request
  *replaces* the open one (the on-chain struct is overwritten, not stacked).
- **Resilience** — network-switch banner, toasts driven off the live
  `depositStatus` / `withdrawStatus` objects with explorer links, refetch of
  everything after each successful write.

## Architecture

```
WagmiProvider → QueryClientProvider → ConnectKitProvider
  → BoringVaultV1Provider → Toaster → App
```

- `src/config/vault.ts` — addresses, tokens, behavioral params (verified, see below).
- `src/config/wagmi.ts` — wagmi config + ethers read provider.
- `src/lib/boringVault.ts` — the single import boundary to the library (see notes).
- `src/lib/useEthersSigner.ts` — local viem→ethers signer adapter (see notes).
- `src/hooks/*` — `useVaultMetrics`, `useUserPosition`, `useWithdrawRequest`
  (on-chain AtomicQueue read), `useTokenBalance`, `useStatusToasts`, `useNow`.
- `src/components/*` — custom UI.

---

## On-chain verification (2026-06-26)

Checked against the live contracts with `cast`:

| Check | Result |
|---|---|
| `vault.symbol()` / `name()` / `decimals()` | `CCUSD` / `Yield Prime` / **18** ✓ |
| `accountant.getRate()` | `1e6` (1 CCUSD ≈ 1 USDT) ✓ |
| `accountant.getRateInQuoteSafe(USDC/USDT)` | `1e6` ✓ |
| `teller.shareLockPeriod()` | `86400` (1 day) ✓ |
| `AtomicQueue.isPaused()` | `false` ✓ |
| `safeUpdateAtomicRequest` is a public capability | `true` ✓ (end users can self-submit) |
| RPC / chain | mainnet, chainId 1 ✓ |

## Library notes / caveats

These are properties of `boring-vault-ui@1.6.3` itself, carried over and
re-confirmed for this vault:

1. **`useEthersSigner` is not importable from the package.** The `exports` map
   only exposes `"."` and `"./types"`, so all `dist/...` deep paths are blocked
   under bundlers that honor `exports` (Vite/webpack 5/esbuild). We reimplement
   the tiny viem→ethers adapter in `src/lib/useEthersSigner.ts`.

2. **Prebuilt-component deep imports won't resolve either** — same restriction.
   Only the root barrel (`BoringVaultV1Provider`, `useBoringVaultV1`,
   `DepositButton`) and `boring-vault-ui/types` are reachable.

3. **Deposit approval target.** Deposit approves the **vault** (BoringVault)
   contract and then calls `teller.deposit(...)`; our confirm dialog reflects
   that. Redemption approves **CCUSD shares to the AtomicQueue**.

4. **18-decimal version floor: never below 1.6.3.** Up to 1.6.2 the library
   converted share amounts with `BigNumber(...).toNumber()`; on 18-decimal
   CCUSD anything above ~0.009 shares overflows and ethers v6 rejects the
   encode, so every realistic redemption failed client-side. 1.6.3 passes
   amounts as decimal strings (`toFixed(0)`), verified exact on-wire by
   `npm run test:withdraw`. Residual: the pre-approve allowance check still
   compares as floats — worst case it skips the approve and the request
   reverts on-chain (recoverable).

5. **`withdrawQueueStatuses` → Seven Seas only.** The library reads open queue
   requests from `api.sevenseas.capital`, which does not index this vault. We
   therefore read the request on-chain in `useWithdrawRequest`
   (`AtomicQueue.getUserAtomicRequest`).

6. **Duplicate `@wagmi/core` (environment).** Pinned to a single `@wagmi/core`
   via a `package.json` `overrides` entry to avoid a split wagmi React context.
