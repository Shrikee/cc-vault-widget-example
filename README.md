# Coinchange Yield Prime (CCUSD) — End-User dApp

A production-style, fully custom frontend for the **Coinchange Yield Prime**
vault — a USD stablecoin vault on Polygon PoS whose share token is
**CCUSD** (`name: "Yield Prime"`, 18 decimals) — built on
[`boring-vault-ui@1.6.3`](https://www.npmjs.com/package/boring-vault-ui/v/1.6.3).

> **📖 Integrating this vault into your own frontend?** Start with the
> [**Integration Guide**](./docs/INTEGRATION-GUIDE.md) — a comprehensive,
> contract-verified walkthrough of the deposit and AtomicQueue redemption flows,
> the Coinchange solver service that fills redemptions, both library-based and
> direct-contract integration paths, and every known `boring-vault-ui@1.6.3`
> caveat with its workaround. This repository is the reference implementation
> that guide points into.

It implements the full user surface: view the vault, deposit **USDT**,
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
cp .env.example .env     # then set VITE_RPC_URL — required (see Environment)
npm run dev              # http://localhost:5173
```

```bash
npm run build            # tsc --noEmit + vite build
npm run typecheck
npm test                 # Vitest: the pure seams (yield figures, scan bookkeeping)
npm run test:withdraw    # queueWithdraw 18-decimal overflow guard
```

`npm test` runs [Vitest](https://vitest.dev) over `src/**/*.test.ts` in a Node
environment, through the app's own `vite.config.ts` — no DOM library and no
component tests. `npm run test:withdraw` stays a plain Node script: it guards a
packaged-library bug (see the caveats below) and is unrelated to the seams above.

### Environment

| Var | Required | Purpose |
|---|---|---|
| `VITE_RPC_URL` | **yes** | Polygon PoS RPC for all reads, and it **must be archive-capable** (QuickNode / Alchemy / Infura — an endpoint that serves ranged `eth_getLogs` and historical `eth_call`): the yield figures scan 30 days of the accountant's share-price logs, and a connected wallet's deposit history back to the Teller's deployment. The app does **not** verify this. |
| `VITE_HISTORY_CHUNKS_IN_FLIGHT` | no | Concurrent log-chunk requests during a history scan. Default `4`. |
| `VITE_WALLETCONNECT_PROJECT_ID` | no | Enables WalletConnect/mobile QR. Injected wallets (MetaMask/Rabby) work without it. |

Reads (TVL, share price, positions) need **no wallet** — the vault overview
renders for anonymous visitors — but they do need a keyed archive-capable RPC.
The code still falls back to a public endpoint when `VITE_RPC_URL` is unset, and
on that endpoint (or any other that refuses ranged `eth_getLogs`) the yield
figures show "—" with an inline error, while TVL, share price, deposits and
redemptions keep working.

## Deployed addresses (Polygon PoS, chainId 137)

Declared in `src/config/vaults.json` and verified against the live contracts
(see [On-chain verification](#on-chain-verification-2026-08-27) below).

The vault is deployed at the **same addresses on Polygon as on Ethereum**
(deterministic deployment) — only the chain, the asset addresses and the
explorer differ.

| Contract | Address |
|---|---|
| BoringVault (CCUSD share) | `0x844a9d1B20A3016610B5270F32eDDCc1E27787cC` |
| Teller | `0xbC65b430d01E267652694503ca1ae5543C915bB9` |
| Accountant | `0x665d264e867e45f2bFCAeE4DD1C65A784FE9d4E9` |
| Lens | `0x5732789EB6Eef65173bA732EE3b05f3f23AB840b` |
| AtomicQueue (`withdrawQueueContract`) | `0x1479aea1a79e10a6B8c3925f66a7b1dFe0FEeF93` |
| AtomicSolverV4 | `0x6c0f80f755f3C094587E4b5242A0D6570B2F3EAA` |

Assets: base = **USDT** (`0xc2132D05D31c914a87C6611C10748AEb04B58e8F`), which is
the **only** accepted deposit asset — `teller.isSupported()` is `false` for both
native USDC and bridged USDC.e on Polygon. Redemptions pay USDT.

## What it does

- **Vault overview** — leads with the headline **realised trailing APY**
  ("3d / 7d / 30d APY", 7d by default): the linear annualisation of the
  on-chain share-price change over the trailing window, derived from the
  accountant's own events and badged "as of" the last share-price update. Live
  TVL and share price (polled every 45s) and the vault/asset contract links sit
  below.
- **Your position** — CCUSD balance, USD position value, **earnings** (the
  unrealised gain on the shares held, at the wallet's average deposit cost
  reconstructed from its Teller `Deposit` events), and a live **1-day share
  lock** countdown (`fetchUserUnlockTime`).
- **Deposit** — USDT amount input with balance + MAX,
  **projected earnings** for the typed amount at the headline APY, estimated
  CCUSD shares, approve + deposit (two signatures), confirm dialog, 1-day
  share-lock reminder.
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

- `src/config/vaults.json` — the vault registry: both Coinchange products, in
  the shape a vault entry takes in the solver service's roster so the two files
  diff by eye. Only the 24h product is rendered today.
- `src/lib/vaultRegistry.ts` — the registry's shape and the guard that parses
  it, so a missing address or a bad block number fails at load with a message
  naming the field.
- `src/config/vaults.ts` — where the JSON meets the guard; also the provenance
  of the four values no chain read can confirm.
- `src/config/vault.ts` — the widget's behavioural params, plus a singular view
  of the default product for the hooks that still take their vault at module
  scope.
- `src/config/wagmi.ts` — wagmi config + ethers read provider.
- `src/config/history.ts` — history-scan parameters that belong to the protocol
  rather than to a product: event topics, trailing windows, chunk span and
  chunk concurrency.
- `src/lib/boringVault.ts` — the single import boundary to the library (see notes).
- `src/lib/useEthersSigner.ts` — local viem→ethers signer adapter (see notes).
- `src/lib/apy.ts` — the pure yield derivations: realised trailing APY per
  window, earnings, projected earnings (no network, no React).
- `src/lib/logScan.ts` — chunked `eth_getLogs` with a concurrency limit; any
  chunk failing fails the whole scan, so a figure is never derived from a
  partial series.
- `src/lib/scanRuns.ts` — which deposit scan may run and which may commit
  (wallet switches, tail scans, failures).
- `src/hooks/*` — `useVaultMetrics`, `useUserPosition`, `useWithdrawRequest`
  (on-chain AtomicQueue read), `useShareHistory` (one 30-day share-price scan
  per page load), `useWindowApys`, `useDepositHistory` (a wallet's average
  deposit cost), `usePauseStatus`, `useTokenBalance`, `useStatusToasts`,
  `useNow`.
- `src/components/*` — custom UI.
- `src/lib/*.test.ts` — the vectors, driving the real modules: the APY,
  earnings and projection derivations, and the scan bookkeeping.

---

## On-chain verification (2026-08-27)

Checked against the live Polygon contracts over JSON-RPC:

| Check | Result |
|---|---|
| `vault.symbol()` / `name()` / `decimals()` | `CCUSD` / `Yield Prime` / **18** ✓ |
| `accountant.getRate()` | `1e6` (1 CCUSD ≈ 1 USDT) ✓ |
| `accountant.base()` | `0xc2132D05…58e8F` (Polygon USDT) ✓ |
| `teller.isSupported(USDT)` | `true` ✓ (USDC / USDC.e: `false`) |
| `teller.shareLockPeriod()` | `86400` (1 day) ✓ |
| `AtomicQueue.isPaused()` | `false` ✓ |
| `safeUpdateAtomicRequest` is a public capability | `true` ✓ (end users can self-submit) |
| `teller.deposit(USDT, …)` simulated with an allowance | mints 1:1 ✓ |
| RPC / chain | Polygon PoS, chainId 137 ✓ |

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
