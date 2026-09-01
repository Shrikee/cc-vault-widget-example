# Coinchange Yield Prime — End-User dApp (CCUSD, CCUSD30)

A production-style, fully custom frontend for Coinchange's **two Yield Prime
products** — USD stablecoin vaults on Polygon PoS — built on
[`boring-vault-ui@1.6.3`](https://www.npmjs.com/package/boring-vault-ui/v/1.6.3).

| Product | Share token | Share lock | Vesting term | Deployed |
|---|---|---|---|---|
| **Yield Prime** (the 24h product) | **CCUSD**, 18 dp | 1 day | 1 day | 2026-08-12 |
| **Yield Prime 30d** | **CCUSD30**, 18 dp | 1 day | 30 days | 2026-08-21 |

Both products live on Polygon PoS, both take and pay out **USDT**, and both are
served by one page: a row of chips carries each product's **headline APY** and
selects the one to act on, while the side rail shows what the connected wallet
holds in *each*. The **selected vault** lives in a `?vault=` query parameter, so
a reload keeps it and a support link can open the widget on a named product.

The **vesting term** is the product's own clock and is not the share lock: on
the 30d product shares unlock after a day but do not finish vesting for thirty,
and a holder redeeming in between is entitled to no more than what they paid
rather than to the share price on screen — a cap, not a floor. The 30d panels
say so; pricing an early exit is stage 2 (ADR-0002).

> **📖 Integrating a Coinchange vault into your own frontend?** Start with the
> [**Integration Guide**](./docs/INTEGRATION-GUIDE.md) — written against the 24h
> product, and a comprehensive,
> contract-verified walkthrough of the deposit and AtomicQueue redemption flows,
> the Coinchange solver service that fills redemptions, both library-based and
> direct-contract integration paths, and every known `boring-vault-ui@1.6.3`
> caveat with its workaround. This repository is the reference implementation
> that guide points into.

It implements the full user surface for both products: view either, deposit
**USDT** into it, and redeem via that product's own **AtomicQueue** (request →
an off-chain solver fills it to USDT; no separate claim step). Each product has
its own queue and its own solver; the Lens they are read through is shared. The
library's prebuilt Chakra components are **not** used — the UI is built directly
on `useBoringVaultV1()` so branding, validation, and error states are fully
under our control.

> **Withdraw model.** The `DelayedWithdraw` contract is deployed but **unused**
> on both products (`allowPublicWithdraws=false`). Redemption is solver-priced
> over the audited AtomicQueue, so the frontend wires the provider's
> `withdrawQueueContract` — the selected vault's — and uses the
> `queueWithdraw` flow (see the
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
npm run build             # tsc --noEmit + vite build
npm run typecheck
npm test                  # Vitest: the pure seams (yield figures, scan bookkeeping)
npm run test:withdraw     # queueWithdraw 18-decimal overflow guard
npm run test:entitlement  # the vendored solver suites, unmodified (2 files / 36 tests)
npm run drift:entitlement # the vendored copy's bytes, then those suites
```

`npm test` runs [Vitest](https://vitest.dev) over `src/**/*.test.ts` in a Node
environment, through the app's own `vite.config.ts` — no DOM library and no
component tests. `npm run test:withdraw` stays a plain Node script: it guards a
packaged-library bug (see the caveats below) and is unrelated to the seams above.

`src/entitlement/` is a **byte-exact vendored copy** of the redemption solver's entitlement
rule and its two suites, pinned at `vault-solver-service@813aede` — every early-exit ceiling
the widget quotes comes from it, and nothing in it may be edited here (see
[`src/entitlement/PROVENANCE.md`](src/entitlement/PROVENANCE.md) and ADR-0003). Because those
files are `*.spec.ts` and expect a runner's ambient globals, they run on their own
`vitest.entitlement.config.ts`, and `npm test` is scoped to `src/**/*.test.ts` so it never
picks them up. `npm run drift:entitlement` is the check that the copy is still faithful, in
both halves: it re-hashes the four files against the SHA-1s in the provenance note (exiting
non-zero naming any file whose bytes moved), then runs the suites unmodified. Run it on
vendoring, after any TypeScript/Vitest bump, and when re-vendoring.

The **Node ≥ 22.6** floor in `package.json`'s `engines` predates Vitest: the
vectors used to import the TypeScript modules directly and needed Node's type
stripping to load them. Nothing requires that any more — the floor is left as
the Node this project is developed and tested on.

### Environment

| Var | Required | Purpose |
|---|---|---|
| `VITE_RPC_URL` | **yes** | Polygon PoS RPC for all reads, and it **must be archive-capable** (QuickNode / Alchemy / Infura — an endpoint that serves ranged `eth_getLogs` and historical `eth_call`): each product's yield figures scan its accountant's share-price logs, and a wallet's deposit history comes from that product's Teller logs. It must also tolerate the widget's request **rate** — see the note below. The app does **not** verify either. |
| `VITE_HISTORY_CHUNKS_IN_FLIGHT` | no | Log-chunk requests in flight at once, as **one budget shared by every scan** rather than a limit per scan. Default `4`. |
| `VITE_WALLETCONNECT_PROJECT_ID` | no | Enables WalletConnect/mobile QR. Injected wallets (MetaMask/Rabby) work without it. |

Reads (TVL, share price, positions) need **no wallet** — both products' figures
render for anonymous visitors — but they do need a keyed archive-capable RPC.
The code still falls back to a public endpoint when `VITE_RPC_URL` is unset, and
on that endpoint (or any other that refuses ranged `eth_getLogs`) the yield
figures show "—" with an inline error, while TVL, share price, deposits and
redemptions keep working.

**The endpoint's request rate matters as much as its archive depth.** The
in-flight budget above is not by itself a rate — four requests in flight measured
51–57 req/s against QuickNode's 50/s account limit — and a chunk rejected for
rate fails its whole scan, with no retry. Scan starts are therefore paced as well
as counted, under a rate that leaves headroom for everything else the page reads
on the same endpoint. The measurements are in
[`src/config/history.ts`](./src/config/history.ts); the decision is ADR-0001's
2026-08-28 amendment.

## Deployed addresses (Polygon PoS, chainId 137)

Declared in `src/config/vaults.json` — the vault registry — and verified against
the live contracts (see [On-chain verification](#on-chain-verification) below).

**Yield Prime — CCUSD (24h).** This one is deployed at the **same addresses on
Polygon as on Ethereum** (deterministic deployment); only the chain, the asset
addresses and the explorer differ.

| Contract | Address |
|---|---|
| BoringVault (CCUSD share) | `0x844a9d1B20A3016610B5270F32eDDCc1E27787cC` |
| Teller | `0xbC65b430d01E267652694503ca1ae5543C915bB9` |
| Accountant | `0x665d264e867e45f2bFCAeE4DD1C65A784FE9d4E9` |
| AtomicQueue (`withdrawQueueContract`) | `0x1479aea1a79e10a6B8c3925f66a7b1dFe0FEeF93` |
| AtomicSolverV4 | `0x6c0f80f755f3C094587E4b5242A0D6570B2F3EAA` |

**Yield Prime 30d — CCUSD30.**

| Contract | Address |
|---|---|
| BoringVault (CCUSD30 share) | `0xc5220d7DBaefd99c1fAe5CEf3fE1deAF5BD71f66` |
| Teller | `0xfc4b85FddB8fD2527aB5dB2a9C06A7Dc7321b848` |
| Accountant | `0xa75a18784318827837e9bEA086aC8442f470Be42` |
| AtomicQueue (`withdrawQueueContract`) | `0x8234a18C39177D0f70c6dacEc4253855FAf0fB2e` |
| AtomicSolverV4 | `0x6Cac5A56d78CF34E61C1594f85A1ef4cd21EA883` |

The **Lens** (`0x5732789EB6Eef65173bA732EE3b05f3f23AB840b`) is **shared**, and
deliberately so: reading either product is the same contract call with that
product's addresses as arguments.

Assets: base = **USDT** (`0xc2132D05D31c914a87C6611C10748AEb04B58e8F`) on both
products, and it is the **only** accepted deposit asset — `teller.isSupported()`
is `false` for both native USDC and bridged USDC.e on Polygon. Redemptions pay
USDT.

## What it does

- **Product switcher** — a chip per product above the action panel, each naming
  it and carrying its **headline APY**, so the two returns sit side by side.
  Selecting one switches the deposit and withdraw panel, the vault stats, the
  pause banner, the hero and the explainer. The selection is a `?vault=` query
  parameter holding the registry's vault id, written back with a history
  replace; an absent or unrecognised value lands on the 24h product with no
  error.
- **Vault overview** (the card's own title) — leads with the selected vault's
  headline **realised trailing APY** ("3d / 7d / 30d APY", 7d by default): the linear annualisation
  of the on-chain share-price change over the trailing window, derived from that
  product's own accountant events and badged "as of" the last share-price
  update. A window reaching back before the product launched is measured since
  launch. Live TVL and share price (polled every 45s) and the vault/asset
  contract links sit below.
- **Your positions** — one block per product, labelled with its share symbol:
  share balance, USD **position value**, **earnings** (the unrealised gain on
  the shares held, at the wallet's **average deposit cost** in *that* product,
  reconstructed from that Teller's `Deposit` events), and a live **1-day share
  lock** countdown (`fetchUserUnlockTime`). Both are shown whichever product is
  selected, so money in the other one is never invisible; the figures are never
  blended into a total.
- **Deposit** — USDT amount input with balance + MAX, **projected earnings** for
  the typed amount at *that product's* headline APY, estimated shares in its
  share token, approve + deposit (two signatures), confirm dialog, 1-day
  share-lock reminder, and on the 30d product the vesting notice.
- **Redeem (AtomicQueue)** — request form in shares, advanced **spread %** (the
  haircut vs NAV the solver keeps; default 0.1%, contract max 1%, unchanged on
  both products) and request **validity (days)**. Reads the user's single open
  request **on-chain** via `AtomicQueue.getUserAtomicRequest` (the library's
  `withdrawQueueStatuses` reads a Seven Seas indexer that does not track these
  vaults), with live lifecycle — **open → filling → stopped → expired**, stated
  as an expiry rather than as a claim that the solver will fill — and a **Stop
  request** action (the approval revoke of the integration guide's §7.4). The
  request itself is listed in the side rail's **Open redemptions** card, across
  both queues. A new request *replaces* the open one (the on-chain struct is
  overwritten, not stacked). On the 30d product the panel states the vesting
  term and that an earlier exit — entitled to no more than what was paid, a cap
  and not a floor — may need a wider spread; an open or lapsed request in that
  product says on the row itself that it can be passed over, and where to ask.
- **Resilience** — network-switch banner, toasts driven off the live
  `depositStatus` / `withdrawStatus` objects with explorer links, refetch of
  everything after each successful write.

## Architecture

```
WagmiProvider → QueryClientProvider → ConnectKitProvider → Toaster → App
  └─ App mounts BoringVaultV1Provider, keyed by the selected vault id,
     around the deposit and withdraw panels — the write paths only.
```

Every read takes its vault as an argument and goes straight to the chain, so
nothing outside those two panels depends on the library's context.

- `src/config/vaults.json` — the vault registry: both Coinchange products, in
  the shape a vault entry takes in the solver service's roster so the two files
  diff by eye.
- `src/lib/vaultRegistry.ts` — the registry's shape and the guard that parses
  it, so a missing address or a bad block number fails at load with a message
  naming the field.
- `src/config/vaults.ts` — where the JSON meets the guard; also the provenance
  of the four values no chain read can confirm.
- `src/config/chain.ts` — the chain both products are on: id, label, explorer
  links. Declared once in the registry, not per vault.
- `src/config/tokens.ts` — the base asset (USDT) the widget deposits, redeems
  and prices in; both products name the same one.
- `src/config/redemption.ts` — the redemption spread and validity defaults, the
  same on both products.
- `src/config/wagmi.ts` — wagmi config + ethers read provider.
- `src/config/history.ts` — history-scan parameters that belong to the protocol
  rather than to a product: event topics, trailing windows, chunk span, and the
  two knobs that keep the widget inside the endpoint's limits — how many chunk
  requests may be in flight and how many may be started per second.
- `src/lib/boringVault.ts` — the single import boundary to the library (see notes).
- `src/lib/lens.ts` — the four vault reads (TVL, share price, shares, share-lock
  expiry) as calls to the Lens both products share, plus the decoders that turn
  what it returns into the figures on screen.
- `src/lib/useEthersSigner.ts` — local viem→ethers signer adapter (see notes).
- `src/lib/apy.ts` — the pure yield derivations: realised trailing APY per
  window, earnings, projected earnings (no network, no React).
- `src/lib/vaultSelection.ts` — which product a URL asks for, and the search
  string that names one, as pure functions of the search and the roster.
- `src/lib/logScan.ts` — chunked `eth_getLogs`; any chunk failing fails the
  whole scan, so a figure is never derived from a partial series.
- `src/lib/inFlightBudget.ts` — the one budget every scan shares: how many
  requests may be in flight and how fast starts may be paced.
- `src/lib/scanRuns.ts` — which deposit scan may run and which may commit
  (wallet switches, tail scans, failures).
- `src/lib/requestFill.ts` — what it means for a redemption request to have
  vanished from a queue, and the several ways of vanishing that are not a fill.
- `src/hooks/*` — `useProductReads` (everything the widget reads about one
  product, assembled once per product), `useVaultSelection` (the URL side of the
  selection, holding no rules), `useVaultMetrics`, `useUserPosition`,
  `useWithdrawRequest` (one product's AtomicQueue, read on chain and polled —
  one instance per product, so both queues are watched), `useShareHistory` (the
  share-price scan behind one product's APYs), `useWindowApys`,
  `useDepositHistory` (a wallet's average deposit cost in one product),
  `usePauseStatus`, `useTokenBalance`, `useStatusToasts`, `useNow`.
- `src/components/*` — custom UI, every vault-scoped one taking its vault as a
  prop: `VaultSwitcher` (the chips), `PositionCard` (both products),
  `RedemptionsCard` (open requests in both queues, outside the selection and the
  tabs), `VestingNotice` (the 30d disclosure), and the rest.
- `src/lib/*.test.ts` — the vectors, driving the real modules: the APY,
  earnings and projection derivations, the scan bookkeeping, the registry parse,
  the Lens reads, the selection resolution, the shared budget, and what a
  vanished queue request does and does not mean.

---

## On-chain verification

Checked against the live Polygon contracts over JSON-RPC on **2026-08-27**. Both
products in `src/config/vaults.json` were re-verified on **2026-08-28** at chain
head 92,835,789 — that run's full table is in
[`docs/specs/two-vault-widget.md`](./docs/specs/two-vault-widget.md), and the
provenance of the four values no chain read can confirm is in
[`src/config/vaults.ts`](./src/config/vaults.ts).

The 24h product's checks:

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
re-confirmed for both vaults:

1. **`useEthersSigner` is not importable from the package.** The `exports` map
   only exposes `"."` and `"./types"`, so all `dist/...` deep paths are blocked
   under bundlers that honor `exports` (Vite/webpack 5/esbuild). We reimplement
   the tiny viem→ethers adapter in `src/lib/useEthersSigner.ts`.

2. **Prebuilt-component deep imports won't resolve either** — same restriction.
   Only the root barrel (`BoringVaultV1Provider`, `useBoringVaultV1`,
   `DepositButton`) and `boring-vault-ui/types` are reachable.

3. **Deposit approval target.** Deposit approves the selected vault's
   **vault** (BoringVault) contract and then calls its `teller.deposit(...)`;
   our confirm dialog reflects that. Redemption approves that product's
   **shares to that product's AtomicQueue**.

4. **18-decimal version floor: never below 1.6.3.** Up to 1.6.2 the library
   converted share amounts with `BigNumber(...).toNumber()`; on an 18-decimal
   share token anything above ~0.009 shares overflows and ethers v6 rejects the
   encode, so every realistic redemption failed client-side. 1.6.3 passes
   amounts as decimal strings (`toFixed(0)`), verified exact on-wire by
   `npm run test:withdraw`. Residual: the pre-approve allowance check still
   compares as floats — worst case it skips the approve and the request
   reverts on-chain (recoverable). Both share tokens are 18-decimal, so the
   floor applies to both products.

5. **`withdrawQueueStatuses` → Seven Seas only.** The library reads open queue
   requests from `api.sevenseas.capital`, which indexes neither vault. We
   therefore read the request on-chain in `useWithdrawRequest`
   (`AtomicQueue.getUserAtomicRequest`), against the selected vault's queue.

6. **Duplicate `@wagmi/core` (environment).** Pinned to a single `@wagmi/core`
   via a `package.json` `overrides` entry to avoid a split wagmi React context.
