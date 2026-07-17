# Coinchange Boring Vault — Frontend Integration Guide (v2)

> **Target library:** [`boring-vault-ui@1.6.1`](https://www.npmjs.com/package/boring-vault-ui/v/1.6.1)
> **Audience:** engineers building the production, end-user-facing frontend for the Coinchange Boring Vault.
> **Scope:** depositing into and withdrawing from the vault from a browser dApp. This is the *user* surface (deposit / withdraw / view position).


## 1. Overview

End-user interactions with a Boring Vault are driven through a single React context provider, `BoringVaultV1Provider`, and one hook, `useBoringVaultV1()`. The provider wires up the on-chain contracts (vault, teller, accountant, lens, and optionally a delayed-withdraw or withdraw-queue contract) from an ethers provider; the hook exposes typed read and write functions plus transaction status objects. You can build a fully custom UI on top of the hook — the library's prebuilt Chakra UI components ([§12](#12-prebuilt-components-optional)) are optional and not required.

**Data flow**

```
  Your React app
        │
        ├─ BoringVaultV1Provider  ──────────────┐
        │     (vault / teller / accountant /     │  ethers.Contract instances
        │      lens / delayWithdraw / queue)     │  built from ethersProvider
        │                                        ▼
        └─ useBoringVaultV1()              Ethereum JSON-RPC (reads)
              │                                  │
              │  reads  ── fetchTotalAssets,     │
              │            fetchShareValue,      ▼
              │            fetchUserShares,   BoringVault + Teller + Accountant
              │            fetchUserUnlockTime,  Lens + DelayedWithdraw contracts
              │            delayWithdrawStatuses (on-chain)
              │
              │  writes ── deposit, delayWithdraw, delayWithdrawCancel,
              │            delayWithdrawComplete, queueWithdraw,
              │            withdrawQueueCancel
              │                  └─ signed via an ethers JsonRpcSigner
              │                     (from your wagmi/viem wallet)
              │
              └─ withdrawQueueStatuses ──▶ Seven Seas API
                                          https://api.sevenseas.capital
                                          (off-chain indexer, queue vaults only)
```

> **Key takeaway for Coinchange:** the production WBTC vault is a **delayed-withdraw** vault, not a withdraw-queue vault. The delayed-withdraw flow ([§10.1](#101-delayed-withdraws-coinchange-wbtc-vault)) is the one you implement. The withdraw-queue flow ([§10.2](#102-withdraw-queue-atomicsolver-vaults)) is documented for completeness and for any future vault that deploys a queue contract.

---

## 2. Installation & peer dependencies

```bash
npm install boring-vault-ui@1.6.1
```

The library is built around this stack (install if not already present):

```bash
npm install ethers@^6 viem wagmi @tanstack/react-query \
  @chakra-ui/react @emotion/react @emotion/styled framer-motion \
  bignumber.js connectkit
```

Notes:
- **ethers v6** is required for the `JsonRpcSigner` / `Provider` types used throughout.
- `viem` + `wagmi` drive wallet connection.
- The prebuilt components use **Chakra UI**; if you build a fully custom UI off the hook you can skip *rendering* Chakra, but it is a declared dependency and is pulled in transitively (see [§12](#12-prebuilt-components-optional)).
- Pin the version (`1.6.1`) in `package.json` — the library's API has shifted across minor versions.

### 2.1 Required: dedupe `@wagmi/core` (fixes #5)

`boring-vault-ui` declares `@wagmi/core ^2.6.16`, and `wagmi@2.x` depends on a
newer `@wagmi/core`. npm installs **two copies**. Symptoms:

- A TypeScript error when you pass ConnectKit's `getDefaultConfig({...})` into
  wagmi's `createConfig(...)` — the two configs are typed against different
  `@wagmi/core` builds (`CreateConnectorFn` / `StorageItemMap` mismatch).
- At runtime, ConnectKit and your `WagmiProvider` can end up using different
  wagmi instances → the wallet "connects" but your hooks don't see it.

Force a single copy via `overrides` in `package.json`, then reinstall:

```jsonc
// package.json
{
  "overrides": {
    "@wagmi/core": "2.22.1"   // the version wagmi@2.x resolves; same major as boring-vault-ui's range
  }
}
```

```bash
rm -rf node_modules package-lock.json && npm install
# verify a single copy:
find node_modules -path "*@wagmi/core/package.json"   # should print exactly one
```

> Yarn/pnpm: use the equivalent `resolutions` (yarn) or `pnpm.overrides`.

---

## 3. Coinchange WBTC vault — production parameters

All addresses are **Ethereum mainnet** and come from `deployments/CCFStakingRewardsWBTCVault.json`. **Verify against the deployment file before each release** — addresses change when a vault is redeployed.

### Contract addresses

| Role | Provider prop | Address |
|---|---|---|
| BoringVault (share token) | `vaultContract` | `0x4E34a7B04e6DF1e4C5dF68A30dC8460F63873F74` |
| Teller (deposits) | `tellerContract` | `0x6EDfa0315A6d9476057681292Fef5cfcBE8B8D31` |
| Accountant (rate / NAV) | `accountantContract` | `0x0675A0E2F2885fC391Bd6f626939e89b90D04444` |
| Lens (read-only views) | `lensContract` | `0x65bf8AcAac9E7dCeBD5A7b6A50640B0901283d85` |
| DelayedWithdraw | `delayWithdrawContract` | `0x6F26eD1b8b83679A5baa5F92821ad1185f353925` |
| WithdrawQueue | `withdrawQueueContract` | *not deployed for this vault* |

> **Verified on-chain (v2):** `lens.totalAssets(vault, accountant)` and
> `lens.exchangeRate(accountant)` return sane WBTC values against these
> addresses; `vault.decimals()` returns **8** and `vault.symbol()` is
> `SRcoinBTC`.

### Tokens

| | Address | Decimals |
|---|---|---|
| Base asset (`baseAsset`) | WBTC `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` | 8 |
| Deposit token (`depositTokens[0]`) | WBTC (same) | 8 |
| Withdraw token (`withdrawTokens[0]`) | WBTC (same) | 8 |
| Vault shares (`vaultDecimals`) | — | **8** (confirmed via `vault.decimals()`) |

### Behavioral parameters (drive your UX copy & validation)

| Parameter | Raw value | Human-readable | Where it shows up in the UI |
|---|---|---|---|
| `ShareLockPeriod` | `172800` | **2 days** | After deposit, shares cannot be transferred or withdrawn. Surface via `fetchUserUnlockTime`. |
| `WithdrawDelay` | `172800` | **2 days** | Time between a withdraw request and when it becomes claimable (`maturity`). |
| `CompletionWindow` | `259200` | **3 days** | After `maturity`, the user has 3 days to claim before the request expires. |
| `MaxLoss` (default) | `500` | **5%** | Default max share-price deviation tolerated for a delayed withdraw; used when `maxLoss = "0"` is passed. |
| `WithdrawFee` | `0` | **0%** | No withdraw fee. |
| `AllowedExchangeRateChange` | `9500` / `10500` | **±5%** | Accountant guardrails on rate updates (informational). |
| `AllowPublicDeposits` | `true` | open | Anyone can deposit. |
| `AllowPublicWithdraws` | `true` | open | Anyone can request a withdraw. |
| `isPeggedToBase` (WBTC) | `true` | 1:1 | WBTC is treated 1:1 with the WBTC base asset. |

**End-to-end timing a user must understand:** deposit → wait **2 days** (share lock) → request withdraw → wait **2 days** (withdraw delay) → claim within the next **3 days** (completion window). Build the UI so this is never a surprise.

---

## 4. Architecture: provider + hook

```
<WagmiProvider>                     ← wallet connection (viem)
  <QueryClientProvider>             ← @tanstack/react-query (wagmi dependency)
    <ConnectKitProvider>            ← connect button / modal (optional)
      <ChakraProvider>              ← ONLY if you render the prebuilt components
        <BoringVaultV1Provider …>   ← wires up the vault contracts
          <YourVaultUI />           ← calls useBoringVaultV1()
        </BoringVaultV1Provider>
      </ChakraProvider>
    </ConnectKitProvider>
  </QueryClientProvider>
</WagmiProvider>
```

> The provider/hook themselves do **not** import Chakra (verified). A fully custom
> UI can omit `ChakraProvider` entirely; you only need it if you render the
> prebuilt components from [§12](#12-prebuilt-components-optional).

---

## 5. Wallet & provider setup

The library separates **reads** (an ethers `Provider`, no wallet needed) from **writes** (an ethers `JsonRpcSigner`, derived from the connected wallet).

```tsx
import { ethers } from "ethers";
import { createConfig, http, WagmiProvider } from "wagmi";
import { mainnet } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getDefaultConfig, ConnectKitProvider, ConnectKitButton } from "connectkit";

// Read provider — used by all fetch* functions, no wallet required.
const ethersProvider = new ethers.JsonRpcProvider(RPC_URL, "mainnet");

// Wallet config (viem/wagmi).
const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [mainnet],
    transports: {
      [mainnet.id]: http(RPC_URL),
    },
    walletConnectProjectId: process.env.WALLETCONNECT_PROJECT_ID!,
    appName: "Coinchange Vault",
  })
);

const queryClient = new QueryClient();
```

> If `createConfig(getDefaultConfig(...))` errors on type, you still have the
> duplicate `@wagmi/core` — apply [§2.1](#21-required-dedupe-wagmicore-fixes-5).

### 5.1 Getting a signer for writes (viem → ethers) — **corrected (fix #1)**

Every write function (`deposit`, `delayWithdraw`, `queueWithdraw`, …) takes an
ethers `JsonRpcSigner`. v1 told you to import the library's `useEthersSigner`:

```tsx
// ❌ Does NOT work in 1.6.1 — neither of these resolves:
import { useEthersSigner } from "boring-vault-ui";                 // not re-exported from root
import { useEthersSigner } from "boring-vault-ui/dist/hooks/ethers"; // blocked by package "exports"
```

**Why:** `boring-vault-ui`'s `package.json` declares

```jsonc
"exports": { ".": "./dist/index.js", "./types": "./dist/types/index.d.ts" }
```

so the only importable specifiers are `"boring-vault-ui"` and
`"boring-vault-ui/types"`. Any `boring-vault-ui/dist/...` path throws
`ERR_PACKAGE_PATH_NOT_EXPORTED` (Node) or fails resolution under Vite / webpack 5
/ esbuild. And the root barrel (`dist/index.js`) only exports `DepositButton`,
`BoringVaultV1Provider`, and `useBoringVaultV1` — not `useEthersSigner`.

**Fix:** reimplement the adapter yourself. It is the standard, well-documented
viem-`WalletClient` → ethers-`JsonRpcSigner` conversion — the exact code the
library uses internally:

```tsx
// src/lib/useEthersSigner.ts
import { useMemo } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { useConnectorClient, type Config } from "wagmi";
import type { Account, Chain, Client, Transport } from "viem";

function clientToSigner(client: Client<Transport, Chain, Account>) {
  const { account, chain, transport } = client;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  const provider = new BrowserProvider(transport, network);
  return new JsonRpcSigner(provider, account.address);
}

export function useEthersSigner(
  { chainId }: { chainId?: number } = {}
): JsonRpcSigner | undefined {
  const { data: client } = useConnectorClient<Config>({ chainId });
  return useMemo(() => (client ? clientToSigner(client) : undefined), [client]);
}
```

```tsx
import { useEthersSigner } from "./lib/useEthersSigner";

function MyComponent() {
  const signer = useEthersSigner();          // JsonRpcSigner | undefined
  // signer is undefined until a wallet is connected on the right chain.
}
```

`useEthersSigner({ chainId })` accepts an optional `chainId` if your app is multi-chain.

### 5.2 Recommended import boundary

Because the package only exposes two specifiers, keep them behind one module so
any future packaging change is a one-line fix:

```tsx
// src/lib/boringVault.ts
export { BoringVaultV1Provider, useBoringVaultV1 } from "boring-vault-ui";
export { useEthersSigner } from "./useEthersSigner";
export type {
  Token, DepositStatus, WithdrawStatus, DelayWithdrawStatus, WithdrawQueueStatus,
} from "boring-vault-ui/types";   // note: "/types", not "/dist/types/..."
```

---

## 6. `BoringVaultV1Provider`

Wrap the part of your app that talks to the vault. All `…Contract` addresses are provided by the Coinchange team (see [§3](#3-coinchange-wbtc-vault--production-parameters)).

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `chain` | `string` | ✅ | Chain identifier, lowercase. `"ethereum"` for the Coinchange WBTC vault. Used for context readiness and the Seven Seas queue-status API URL. |
| `vaultContract` | `string` | ✅ | BoringVault address (also the share/vault token). |
| `tellerContract` | `string` | ✅ | Teller that mints/redeems shares on deposit. |
| `accountantContract` | `string` | ✅ | Accountant that manages exchange rate / NAV. |
| `lensContract` | `string` | ✅ | Read-only views over the vault. |
| `delayWithdrawContract` | `string` | optional | DelayedWithdraw contract. **Required for the Coinchange WBTC delayed-withdraw flow.** |
| `withdrawQueueContract` | `string` | optional | Atomic/solver withdraw-queue contract. Omit for the WBTC vault. |
| `depositTokens` | `Token[]` | ✅ (≥1) | Tokens accepted for deposit. |
| `withdrawTokens` | `Token[]` | ✅ (≥1) | Tokens the vault can pay out on withdrawal. |
| `ethersProvider` | `ethers.Provider` | ✅ | Read provider. |
| `baseAsset` | `Token` | ✅ | Primary accounting asset of the vault (WBTC). |
| `vaultDecimals` | `number` | ✅ | Decimal precision of the vault share token (8 for WBTC vault). |

> The context only becomes ready (`isBoringV1ContextReady === true`) once **all required props** are present and `depositTokens` **and** `withdrawTokens` each have at least one entry. A missing `chain`, empty `withdrawTokens`, or `vaultDecimals` of `0` will silently keep the context "not ready". (Confirmed: the init effect requires `chain && vaultContract && tellerContract && accountantContract && lensContract && ethersProvider && baseAsset && vaultDecimals && depositTokens.length > 0 && withdrawTokens.length > 0`.)

### `Token` shape

```ts
interface Token {
  address: string;
  decimals: number;
  abi?: any;          // optional, rarely needed
  image?: string;     // logo URL for prebuilt components
  displayName?: string;
}
```

### Coinchange WBTC configuration

```tsx
import { BoringVaultV1Provider } from "boring-vault-ui";

const WBTC: Token = {
  address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  decimals: 8,
  displayName: "WBTC",
  image: "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png",
};

export function VaultProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>
          <BoringVaultV1Provider
            chain="ethereum"
            vaultContract="0x4E34a7B04e6DF1e4C5dF68A30dC8460F63873F74"
            tellerContract="0x6EDfa0315A6d9476057681292Fef5cfcBE8B8D31"
            accountantContract="0x0675A0E2F2885fC391Bd6f626939e89b90D04444"
            lensContract="0x65bf8AcAac9E7dCeBD5A7b6A50640B0901283d85"
            delayWithdrawContract="0x6F26eD1b8b83679A5baa5F92821ad1185f353925"
            ethersProvider={ethersProvider}
            depositTokens={[WBTC]}
            withdrawTokens={[WBTC]}
            baseAsset={WBTC}
            vaultDecimals={8}
          >
            {children}
          </BoringVaultV1Provider>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

---

## 7. The `useBoringVaultV1()` hook — full API

```ts
const {
  // readiness
  isBoringV1ContextReady,            // boolean

  // passthrough context (rarely needed directly)
  chain, ethersProvider, baseToken, vaultDecimals,
  depositTokens, withdrawTokens,
  vaultEthersContract, tellerEthersContract, accountantEthersContract,
  lensEthersContract, delayWithdrawEthersContract, withdrawQueueEthersContract,

  // metadata reads
  fetchTotalAssets,                  // () => Promise<number>
  fetchShareValue,                   // () => Promise<number>
  fetchUserShares,                   // (userAddress: string) => Promise<number>
  fetchUserUnlockTime,               // (userAddress: string) => Promise<number>  (unix seconds)

  // deposit
  deposit,                           // (signer, amount, token) => Promise<DepositStatus>
  depositStatus,                     // DepositStatus (live)

  // delayed withdraw (Coinchange WBTC)
  delayWithdraw,                     // (signer, shareAmount, tokenOut, maxLoss, thirdPartyClaimer) => Promise<WithdrawStatus>
  delayWithdrawStatuses,             // (signer) => Promise<DelayWithdrawStatus[]>
  delayWithdrawCancel,               // (signer, tokenOut) => Promise<WithdrawStatus>
  delayWithdrawComplete,             // (signer, tokenOut) => Promise<WithdrawStatus>

  // withdraw queue (atomic/solver vaults only)
  queueWithdraw,                     // (signer, amount, token, discountPercent, daysValid) => Promise<WithdrawStatus>
  withdrawQueueCancel,               // (signer, token) => Promise<WithdrawStatus>
  withdrawQueueStatuses,             // (signer) => Promise<WithdrawQueueStatus[]>

  // shared write status
  withdrawStatus,                    // WithdrawStatus (live, shared by all withdraw actions)
} = useBoringVaultV1();
```

> **Gate every call on `isBoringV1ContextReady`.** Read functions reject ("Contracts not ready") if the contracts aren't initialized yet; write functions need a connected `signer`.

---

## 8. Metadata reads (no wallet required)

All return decimal-adjusted (human-readable) JS `number`s. Implementations verified:

| Function | Underlying call |
|---|---|
| `fetchTotalAssets` | `lens.totalAssets(vault, accountant)` → `Number(result[1]) / 10**baseToken.decimals` |
| `fetchShareValue` | `lens.exchangeRate(accountant)` → `/ 10**baseToken.decimals` |
| `fetchUserShares` | `lens.balanceOf(user, vault)` → `/ 10**vaultDecimals` |
| `fetchUserUnlockTime` | `lens.userUnlockTime(user, teller)` → raw unix seconds |

### `fetchTotalAssets(): Promise<number>`
Vault TVL denominated in the base asset (WBTC).

```tsx
const { isBoringV1ContextReady, fetchTotalAssets } = useBoringVaultV1();
const [tvl, setTvl] = useState(0);

useEffect(() => {
  if (!isBoringV1ContextReady) return;
  fetchTotalAssets().then(setTvl).catch(console.error);
}, [isBoringV1ContextReady]);
```

### `fetchShareValue(): Promise<number>`
Value of **1 share** in terms of the base asset (i.e. the exchange rate). Multiply by a user's share balance to get their position value.

### `fetchUserShares(userAddress): Promise<number>`
Human-readable share balance for an address.

### `fetchUserUnlockTime(userAddress): Promise<number>`
Unix-seconds timestamp at which the user's shares unlock (deposit `ShareLockPeriod`, 2 days for WBTC). Before this time shares can't be transferred or withdrawn. Use it to disable the withdraw button and show a countdown.

```tsx
const { fetchUserShares, fetchShareValue, fetchUserUnlockTime } = useBoringVaultV1();
const { address } = useAccount(); // wagmi

const [shares, setShares] = useState(0);
const [price, setPrice] = useState(0);
const [unlockAt, setUnlockAt] = useState(0);

useEffect(() => {
  if (!isBoringV1ContextReady || !address) return;
  fetchUserShares(address).then(setShares);
  fetchShareValue().then(setPrice);
  fetchUserUnlockTime(address).then(setUnlockAt);
}, [isBoringV1ContextReady, address]);

const positionValueWbtc = shares * price;
const locked = Date.now() / 1000 < unlockAt;
```

---

## 9. Deposits

### `deposit(signer, amount, token): Promise<DepositStatus>`

Checks the user's ERC-20 allowance **to the vault (BoringVault) contract**; if insufficient it prompts an `approve` to the vault, then calls `teller.deposit(token, amount, 0)`. Two wallet signatures may be requested (approve + deposit).

> **Corrected (fix #3):** v1 said the allowance/approve target is the *teller*.
> In 1.6.1 the code approves the **vault** address (`erc20.approve(vaultContract, …)`)
> and only the `deposit` call goes through the teller. In any "confirm" dialog,
> show the **vault** address as the spender/destination of the approval.

| Arg | Type | Notes |
|---|---|---|
| `signer` | `JsonRpcSigner` | from `useEthersSigner()` |
| `amount` | `string` | **human-readable** amount of `token` (e.g. `"0.5"` for 0.5 WBTC) |
| `token` | `Token` | one of `depositTokens` |

```tsx
const { deposit, depositStatus } = useBoringVaultV1();
const signer = useEthersSigner();

async function onDeposit(amount: string) {
  if (!signer) return;
  await deposit(signer, amount, WBTC);
  // observe progress via depositStatus, or the resolved DepositStatus
}
```

> **Precision caveat (fix #4):** internally the amount becomes
> `new BigNumber(amount).multipliedBy(10**token.decimals).toNumber()`, and the
> existing allowance is read with `Number(...)`. For **WBTC (8 decimals)** and
> normal amounts this is exact. It is **not** safe for 18-decimal tokens (values
> can exceed `Number.MAX_SAFE_INTEGER`) or for max/"infinite" allowances. If you
> add an 18-decimal deposit token later, validate amounts and don't rely on this
> path for large values.

### `depositStatus: DepositStatus` (live object)

```ts
interface DepositStatus {
  initiated: boolean;   // deposit() called, in progress
  loading: boolean;     // an approval or deposit tx is mining
  success?: boolean;
  error?: string;       // e.g. "insufficient balance", "approval rejected"
  tx_hash?: string;     // deposit tx hash on success
}
```

Drive toasts/UI off this object:

```tsx
const { depositStatus } = useBoringVaultV1();
useEffect(() => {
  if (depositStatus.loading) showToast("Processing deposit…");
  else if (depositStatus.success) showToast(`Deposited — ${depositStatus.tx_hash}`, "success");
  else if (depositStatus.error) showToast(depositStatus.error, "error");
}, [depositStatus]);
```

**Deposit UX checklist**
- Disable the button until `isBoringV1ContextReady && signer && amount > 0 && amount <= walletBalance`.
- Remind users of the **2-day share lock** after deposit before showing a withdraw CTA.
- After success, refetch `fetchUserShares` and `fetchUserUnlockTime`.
- In the confirmation dialog show the **vault** address (approval/destination) and the **teller** (executor).

---

## 10. Withdrawals

There are **two independent withdrawal models**. A given vault deploys one (or both) of the underlying contracts. **The Coinchange WBTC vault uses the delayed-withdraw model ([§10.1](#101-delayed-withdraws-coinchange-wbtc-vault)).**

Both models share one live status object:

### `withdrawStatus: WithdrawStatus`

```ts
interface WithdrawStatus {
  initiated: boolean;
  loading: boolean;
  success?: boolean;
  error?: string;
  tx_hash?: string;
}
```

It is updated by **every** withdraw write (`delayWithdraw`, `delayWithdrawCancel`, `delayWithdrawComplete`, `queueWithdraw`, `withdrawQueueCancel`). If you render multiple withdraw actions at once, track which one is in flight yourself — they all write the same object.

---

### 10.1 Delayed withdraws (Coinchange WBTC vault)

A delayed withdraw is a two-phase flow: **request now → claim later.** The request specifies how many shares to redeem and into which token; after the `WithdrawDelay` (2 days) the request matures and can be **completed** (claimed) within the `CompletionWindow` (3 days).

#### Lifecycle

```
 request (delayWithdraw)
        │  approves shares → records request
        ▼
 maturing  ── now < maturity ──────────────┐  (2 days)
        │                                    │  user may cancel (delayWithdrawCancel)
        ▼                                    │
 claimable ── maturity ≤ now < maturity+3d ─┤  user completes (delayWithdrawComplete)
        │                                    │
        ▼                                    │
 expired   ── now ≥ maturity + 3d ──────────┘  must cancel & re-request
```

#### `delayWithdraw(signer, shareAmount, tokenOut, maxLoss, thirdPartyClaimer): Promise<WithdrawStatus>`

Checks/prompts approval of vault shares **to the DelayedWithdraw contract** (verified: `vault.approve(delayWithdrawContract, …)`), then calls `delayWithdraw.requestWithdraw(tokenOut.address, shares, maxLoss*100, thirdPartyClaimer)`.

| Arg | Type | Notes |
|---|---|---|
| `signer` | `JsonRpcSigner` | |
| `shareAmount` | `string` | human-readable **shares** to withdraw |
| `tokenOut` | `Token` | one of `withdrawTokens` (WBTC) |
| `maxLoss` | `string` | max share-price deviation tolerated, as a percent string (`"1"` = 1%, sent on-chain as `100` bps). **`"0"` ⇒ use the contract default (5% for WBTC).** If the price moves more than this (up or down) before completion, the claim becomes invalid. |
| `thirdPartyClaimer` | `boolean` | if `true`, anyone may call complete on the user's behalf (the user still receives the funds). |

> ⚠️ **Requests for the same `tokenOut` STACK.** Calling `delayWithdraw` twice for WBTC **adds** to the outstanding request rather than replacing it. Disable the request action while one is already outstanding for that token (check `delayWithdrawStatuses`).

```tsx
const { delayWithdraw } = useBoringVaultV1();
const signer = useEthersSigner();

await delayWithdraw(
  signer!,
  "0.25",     // shares
  WBTC,       // tokenOut
  "0",        // maxLoss "0" → contract default (5%)
  false       // thirdPartyClaimer
);
```

#### `delayWithdrawStatuses(signer): Promise<DelayWithdrawStatus[]>`

Reads the user's outstanding requests **on-chain** from the DelayedWithdraw contract. Returns only non-zero requests.

```ts
interface DelayWithdrawStatus {
  allowThirdPartyToComplete: boolean;
  maxLoss: number;                     // percent, e.g. 1 = 1%
  maturity: number;                    // unix seconds — claimable at/after this
  shares: number;                      // human-readable shares requested
  exchangeRateAtTimeOfRequest: number; // informational
  token: Token;                        // output token
}
```

```tsx
const { delayWithdrawStatuses } = useBoringVaultV1();
const signer = useEthersSigner();
const [requests, setRequests] = useState<DelayWithdrawStatus[]>([]);

useEffect(() => {
  if (!signer) return;
  delayWithdrawStatuses(signer).then(setRequests).catch(console.error);
}, [signer]);

// Derive UI state per request:
function phase(r: DelayWithdrawStatus) {
  const now = Date.now() / 1000;
  const expiry = r.maturity + 259200; // CompletionWindow = 3 days
  if (now < r.maturity) return "maturing";
  if (now < expiry) return "claimable";
  return "expired";
}
```

#### `delayWithdrawComplete(signer, tokenOut): Promise<WithdrawStatus>`

Claims a matured request and transfers `tokenOut` to the original requester.

> ⚠️ **Only call when `maturity ≤ now`.** Calling before maturity reverts. Also block it once `now ≥ maturity + CompletionWindow` (expired) — guide the user to cancel instead.

```tsx
await delayWithdrawComplete(signer!, WBTC);
```

#### `delayWithdrawCancel(signer, tokenOut): Promise<WithdrawStatus>`

Cancels the user's outstanding request for `tokenOut`, returning the shares. Use it for expired requests or when the user changes their mind.

```tsx
await delayWithdrawCancel(signer!, WBTC);
```

#### Putting it together (WBTC withdraw panel)

```tsx
function WithdrawPanel() {
  const {
    isBoringV1ContextReady,
    delayWithdraw, delayWithdrawStatuses,
    delayWithdrawComplete, delayWithdrawCancel,
    withdrawStatus,
  } = useBoringVaultV1();
  const signer = useEthersSigner();
  const [requests, setRequests] = useState<any[]>([]);

  const refresh = useCallback(() => {
    if (signer) delayWithdrawStatuses(signer).then(setRequests);
  }, [signer]);

  useEffect(() => { if (isBoringV1ContextReady) refresh(); }, [isBoringV1ContextReady, refresh]);
  useEffect(() => { if (withdrawStatus.success) refresh(); }, [withdrawStatus.success]);

  const hasOpenWbtc = requests.some(r => r.token.address.toLowerCase() === WBTC.address.toLowerCase());

  return (
    <>
      <RequestForm
        disabled={hasOpenWbtc}                      // requests stack — block a second one
        onSubmit={(shares) => delayWithdraw(signer!, shares, WBTC, "0", false)}
      />
      {requests.map((r) => {
        const now = Date.now() / 1000;
        const claimable = now >= r.maturity && now < r.maturity + 259200;
        const expired = now >= r.maturity + 259200;
        return (
          <RequestRow key={r.token.address} request={r}>
            <button disabled={!claimable} onClick={() => delayWithdrawComplete(signer!, r.token)}>Claim</button>
            <button onClick={() => delayWithdrawCancel(signer!, r.token)}>
              {expired ? "Cancel (expired)" : "Cancel"}
            </button>
          </RequestRow>
        );
      })}
    </>
  );
}
```

---

### 10.2 Withdraw queue (atomic/solver vaults)

> Not used by the Coinchange WBTC vault. Implement only for a vault deployed with a `withdrawQueueContract`.

In the queue model, the user posts an **atomic withdraw request** (an offer to sell shares for a chosen token at no worse than a discounted price, valid for N days). A solver fulfills it. Internally `queueWithdraw` approves shares to the queue contract and calls `safeUpdateAtomicRequest`.

#### `queueWithdraw(signer, amount, token, discountPercent, daysValid): Promise<WithdrawStatus>`

| Arg | Type | Notes |
|---|---|---|
| `signer` | `JsonRpcSigner` | |
| `amount` | `string` | human-readable **shares** to redeem |
| `token` | `Token` | output token (one of `withdrawTokens`) |
| `discountPercent` | `string` | percent string. `"1"` = accept a price up to 1% below the current share value (e.g. share value 1.00 → floor 0.99). Sets the minimum acceptable price. |
| `daysValid` | `string` | days until the request expires if unfulfilled (`deadline = now + daysValid × 86400`). |

> ⚠️ Unlike delayed withdraws, re-posting for the same token **replaces** the existing request (it's an "update atomic request"), not stacks.

```tsx
await queueWithdraw(signer!, "0.25", USDC, "1", "3"); // 0.25 shares, ≤1% discount, valid 3 days
```

#### `withdrawQueueStatuses(signer): Promise<WithdrawQueueStatus[]>`

Reads the user's open queue requests from the **Seven Seas off-chain API**:
`https://api.sevenseas.capital/withdrawRequests/{chain}/{vaultContract}/{userAddress}`.

> This depends on the `chain` prop being a value the API recognizes (lowercased), and on the indexer being available. Handle network failures gracefully — it returns `[]` on error.

```ts
interface WithdrawQueueStatus {
  sharesWithdrawing: number;            // human-readable shares
  blockNumberOpened: number;
  deadlineUnixSeconds: number;          // request expiry
  errorCode: number;                    // 0 = ok
  minSharePrice: number;                // floor price the user accepts
  timestampOpenedUnixSeconds: number;
  transactionHashOpened: string;
  tokenOut: Token;
}
```

#### `withdrawQueueCancel(signer, token): Promise<WithdrawStatus>`

Cancels the user's open queue request for `token`.

---

## 11. Type reference

Import types from the **`boring-vault-ui/types`** subpath (the only typed
subpath the package exposes — see [§5.2](#52-recommended-import-boundary)):

```ts
import type {
  Token, DepositStatus, WithdrawStatus, DelayWithdrawStatus, WithdrawQueueStatus,
} from "boring-vault-ui/types";
```

```ts
interface Token {
  address: string; decimals: number; abi?: any; image?: string; displayName?: string;
}
interface VaultState {           // shape of the vault contract bundle
  vaultAddress: string; accountantAddress: string; tellerAddress: string; lensAddress: string;
}
interface DepositStatus  { initiated: boolean; loading: boolean; success?: boolean; error?: string; tx_hash?: string; }
interface WithdrawStatus { initiated: boolean; loading: boolean; success?: boolean; error?: string; tx_hash?: string; }
interface DelayWithdrawStatus {
  allowThirdPartyToComplete: boolean; maxLoss: number; maturity: number;
  shares: number; exchangeRateAtTimeOfRequest: number; token: Token;
}
interface WithdrawQueueStatus {
  sharesWithdrawing: number; blockNumberOpened: number; deadlineUnixSeconds: number;
  errorCode: number; minSharePrice: number; timestampOpenedUnixSeconds: number;
  transactionHashOpened: string; tokenOut: Token;
}
```

All numeric fields are already decimal-adjusted (human-readable) — do **not** divide by `10**decimals` again.

---

## 12. Prebuilt components (optional) — **corrected (fix #2)**

The library *contains* Chakra-based components, but in 1.6.1 the only one you can
actually import is **`DepositButton`** (re-exported from the package root). The
deep paths v1 listed do **not** resolve under bundlers that honor `exports`:

```tsx
// ✅ works — root export
import { DepositButton } from "boring-vault-ui";

// ❌ does NOT resolve in 1.6.1 (blocked by package "exports")
import DelayWithdrawButton from "boring-vault-ui/dist/components/v1/DelayWithdrawButton";
import PendingDelayedWithdraws from "boring-vault-ui/dist/components/v1/PendingDelayedWithdraws";
```

| Component | Reachable in 1.6.1? |
|---|---|
| `DepositButton` | ✅ `import { DepositButton } from "boring-vault-ui"` |
| `DelayWithdrawButton` | ❌ deep path blocked |
| `DelayWithdrawClaim` / `DelayWithdrawCancelButton` | ❌ deep path blocked |
| `PendingDelayedWithdraws` | ❌ deep path blocked |
| `WithdrawQueueButton` / `WithdrawQueueCancelButton` | ❌ deep path blocked |
| `PendingWithdrawQueueStatuses` | ❌ deep path blocked |

**Recommendation:** for the Coinchange end-user app, **build custom UI off
`useBoringVaultV1()`** (this also gives you branding, validation, and error-state
control). That is the supported path for everything except `DepositButton`.

> If you genuinely need the prebuilt withdraw components, you'd have to fork/patch
> the package's `exports` map or vendor the files — not recommended for production.
> If you *do* render any prebuilt component, wrap that subtree in `ChakraProvider`
> (`@chakra-ui/react`); `DepositButton` imports Chakra.

---

## 13. Production checklist & gotchas

**Packaging / build (new in v2)**
- [ ] Add the `@wagmi/core` `overrides` pin and confirm a single copy is installed ([§2.1](#21-required-dedupe-wagmicore-fixes-5)).
- [ ] Import provider/hook from `"boring-vault-ui"`, types from `"boring-vault-ui/types"`. **Do not** import any `boring-vault-ui/dist/...` path — it won't resolve.
- [ ] Provide your own `useEthersSigner` ([§5.1](#51-getting-a-signer-for-writes-viem--ethers--corrected-fix-1)); the library's is unreachable.
- [ ] Don't ship `ChakraProvider` unless you render `DepositButton` or another prebuilt component.

**Correctness**
- [ ] Pin `boring-vault-ui@1.6.1`. Re-validate the API on any upgrade.
- [ ] `chain="ethereum"` and `vaultDecimals=8` for the WBTC vault; confirm `vaultDecimals` against `vault.decimals()` after any redeploy.
- [ ] Provide **both** `depositTokens` and `withdrawTokens` (≥1 each) or the context never becomes ready.
- [ ] Amounts passed to `deposit`/`delayWithdraw`/`queueWithdraw` are **human-readable strings**, not wei.
- [ ] Returned status numbers are already decimal-adjusted — don't re-scale.
- [ ] For deposit, the approval/destination is the **vault** contract; the executor is the **teller**. Surface the vault address in confirmations.
- [ ] Internal amount math uses `.toNumber()` — safe for WBTC (8 dp); revisit before adding any 18-decimal token.

**Delayed-withdraw UX (the WBTC vault)**
- [ ] Block the withdraw CTA until `now ≥ fetchUserUnlockTime(user)` (2-day share lock).
- [ ] Disable a second `delayWithdraw` for WBTC while one is outstanding (requests **stack**).
- [ ] Only enable **Claim** (`delayWithdrawComplete`) when `maturity ≤ now < maturity + 3 days`.
- [ ] Show an **expired** state and steer users to **Cancel** once past the completion window.
- [ ] Pass `maxLoss="0"` to use the 5% contract default unless you expose an advanced control.

**Wallet / network**
- [ ] `signer` is `undefined` until a wallet connects on mainnet — gate all write buttons on it.
- [ ] Ensure the connected wallet chain matches the vault chain; prompt a network switch otherwise.
- [ ] Reads use `ethersProvider` and work without a wallet (TVL, share value can render for anonymous visitors).

**Resilience**
- [ ] `withdrawQueueStatuses` hits the Seven Seas API and returns `[]` on failure — never assume "empty = no requests" without surfacing the error. (N/A for WBTC, which uses on-chain `delayWithdrawStatuses`.)
- [ ] Poll `fetchShareValue` / `fetchTotalAssets` on an interval (e.g. 30–60s) rather than once.
- [ ] Refetch user shares, unlock time, and withdraw statuses after every successful write (`depositStatus.success` / `withdrawStatus.success`).
- [ ] Surface `error` strings from the status objects directly to users; they include approval rejections and balance issues.

**Security**
- [ ] No secrets in the bundle — only public addresses and a public RPC/Infura key restricted by referrer.
- [ ] HTTPS only in production.
- [ ] Show the destination contract address (vault for deposits, DelayedWithdraw for withdraw requests) in confirmation dialogs.

---

## 14. End-to-end skeleton

```tsx
import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { useBoringVaultV1 } from "boring-vault-ui";
import { useEthersSigner } from "./lib/useEthersSigner"; // local — see §5.1

const WBTC = {
  address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  decimals: 8, displayName: "WBTC",
};

export function VaultWidget() {
  const {
    isBoringV1ContextReady,
    fetchTotalAssets, fetchShareValue, fetchUserShares, fetchUserUnlockTime,
    deposit, depositStatus,
    delayWithdraw, delayWithdrawStatuses, delayWithdrawComplete, delayWithdrawCancel,
    withdrawStatus,
  } = useBoringVaultV1();
  const { address } = useAccount();
  const signer = useEthersSigner();

  const [tvl, setTvl] = useState(0);
  const [price, setPrice] = useState(0);
  const [shares, setShares] = useState(0);
  const [unlockAt, setUnlockAt] = useState(0);
  const [requests, setRequests] = useState<any[]>([]);

  const loadVault = useCallback(() => {
    if (!isBoringV1ContextReady) return;
    fetchTotalAssets().then(setTvl);
    fetchShareValue().then(setPrice);
  }, [isBoringV1ContextReady]);

  const loadUser = useCallback(() => {
    if (!isBoringV1ContextReady || !address) return;
    fetchUserShares(address).then(setShares);
    fetchUserUnlockTime(address).then(setUnlockAt);
    if (signer) delayWithdrawStatuses(signer).then(setRequests);
  }, [isBoringV1ContextReady, address, signer]);

  useEffect(loadVault, [loadVault]);
  useEffect(loadUser, [loadUser]);
  useEffect(() => { if (depositStatus.success || withdrawStatus.success) loadUser(); },
            [depositStatus.success, withdrawStatus.success]);

  const locked = Date.now() / 1000 < unlockAt;

  return (
    <div>
      <p>TVL: {tvl} WBTC</p>
      <p>Share value: {price} WBTC</p>
      <p>Your shares: {shares} ({(shares * price).toFixed(8)} WBTC)</p>
      {locked && <p>Shares unlock at {new Date(unlockAt * 1000).toLocaleString()}</p>}

      <button
        disabled={!signer || depositStatus.loading}
        onClick={() => deposit(signer!, "0.1", WBTC)}
      >Deposit 0.1 WBTC</button>

      <button
        disabled={!signer || locked || withdrawStatus.loading}
        onClick={() => delayWithdraw(signer!, "0.05", WBTC, "0", false)}
      >Request withdraw 0.05 shares</button>

      {requests.map((r) => {
        const now = Date.now() / 1000;
        const claimable = now >= r.maturity && now < r.maturity + 259200;
        return (
          <div key={r.token.address}>
            {r.shares} shares → {r.token.displayName}, matures {new Date(r.maturity * 1000).toLocaleString()}
            <button disabled={!claimable} onClick={() => delayWithdrawComplete(signer!, r.token)}>Claim</button>
            <button onClick={() => delayWithdrawCancel(signer!, r.token)}>Cancel</button>
          </div>
        );
      })}
    </div>
  );
}
```

---

## 15. Quick reference

| Function | Signature | Wallet? | Source |
|---|---|---|---|
| `isBoringV1ContextReady` | `boolean` | no | context |
| `fetchTotalAssets` | `() => Promise<number>` | no | on-chain (lens) |
| `fetchShareValue` | `() => Promise<number>` | no | on-chain (lens/accountant) |
| `fetchUserShares` | `(addr) => Promise<number>` | no | on-chain (lens/vault) |
| `fetchUserUnlockTime` | `(addr) => Promise<number>` | no | on-chain (lens/teller) |
| `deposit` | `(signer, amount, token) => Promise<DepositStatus>` | yes | approve→vault, then teller.deposit |
| `delayWithdraw` | `(signer, shares, tokenOut, maxLoss, thirdParty) => Promise<WithdrawStatus>` | yes | approve→delayedWithdraw, then requestWithdraw |
| `delayWithdrawStatuses` | `(signer) => Promise<DelayWithdrawStatus[]>` | yes | on-chain |
| `delayWithdrawComplete` | `(signer, tokenOut) => Promise<WithdrawStatus>` | yes | delayedWithdraw |
| `delayWithdrawCancel` | `(signer, tokenOut) => Promise<WithdrawStatus>` | yes | delayedWithdraw |
| `queueWithdraw` | `(signer, amount, token, discount, daysValid) => Promise<WithdrawStatus>` | yes | withdrawQueue |
| `withdrawQueueStatuses` | `(signer) => Promise<WithdrawQueueStatus[]>` | yes | Seven Seas API |
| `withdrawQueueCancel` | `(signer, token) => Promise<WithdrawStatus>` | yes | withdrawQueue |
| `useEthersSigner` | `({ chainId? }?) => JsonRpcSigner \| undefined` | — | **your local module** (§5.1) |

**Importable specifiers in 1.6.1:** `"boring-vault-ui"` (→ `DepositButton`,
`BoringVaultV1Provider`, `useBoringVaultV1`) and `"boring-vault-ui/types"`
(→ the interfaces in [§11](#11-type-reference)). Nothing else.

**Coinchange WBTC vault uses:** the metadata reads, `deposit`, and the `delayWithdraw*` family. The `queueWithdraw*` family is for queue-enabled vaults only.

---

### Sources & verification
- Package & types: `boring-vault-ui@1.6.1` (`dist/index.{js,d.ts}`, `dist/types/index.d.ts`, `dist/contexts/v1/BoringVaultContextV1.js`, `dist/hooks/ethers.d.ts`, `dist/components/v1/DepositButton.js`) inspected from the npm tarball.
- Packaging facts (the `exports` map, missing `useEthersSigner` re-export, deposit approval target, `.toNumber()` conversions, duplicate `@wagmi/core`) were reproduced directly against 1.6.1.
- On-chain checks (TVL, share value, `vault.decimals()`, `vault.symbol()`) run against Ethereum mainnet using the library's own Lens ABI and the [§3](#3-coinchange-wbtc-vault--production-parameters) addresses.
- GitHub: https://github.com/Se7en-Seas/boring-vault-ui
- Vault parameters: `deployments/CCFStakingRewardsWBTCVault.json` (this repo).
```
