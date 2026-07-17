# Does any `boring-vault-ui` release after 1.6.1 fix our documented workarounds?

- **Date:** 2026-07-17
- **Version range analyzed:** `1.6.1` (2024-07-25) → `1.9.13` (2025-10-31, current `latest`)
- **Question:** for each shortcoming/workaround documented in [`docs/INTEGRATION-GUIDE.md` §11](../INTEGRATION-GUIDE.md#11-known-boring-vault-ui163-issues-and-required-workarounds), is it fixed in a later published version?

> **Point-in-time snapshot.** This analysis was written against the repo as it stood *before* the upgrade it recommends: pinned to `1.6.1` with `patches/boring-vault-ui+1.6.1.patch` applied via `patch-package`. The repo has since adopted Option A (pinned `1.6.3`, patch and `patch-package` removed), so statements below about "our patch", the `patches/` file, and the guide pinning `1.6.1` describe that pre-upgrade state, kept as the evidence trail for the decision.
- **Method:** primary sources only — npm registry metadata, the published tarballs themselves (`npm pack`, extracted and inspected under `/Users/romanholubovskyi/.claude/jobs/efaef36b/tmp/bvui/<version>/`), and the package's own GitHub repository ([Veda-Labs/boring-vault-ui](https://github.com/Veda-Labs/boring-vault-ui), formerly `Se7en-Seas/boring-vault-ui`; npm publishes **no** `repository` field, the repo was located via GitHub search). Every verdict below was verified in the shipped `dist/` code of the relevant tarball, not just commit messages.

## TL;DR — should we upgrade?

**Two of our nine workarounds are fixed upstream; the rest are not, at any version up to 1.9.13.**

- The **blocking bug (#1, `queueWithdraw` `.toNumber()` overflow)** and its latent deposit-side twin (**#8**) were fixed in **1.6.3** (2024-09-06), one commit after 1.6.2. Upgrading `1.6.1 → 1.6.3` is a near-zero-risk, drop-in change (2 commits, no API changes) that lets us **retire `patches/boring-vault-ui+1.6.1.patch` and `patch-package`**.
- **Nothing else we work around is fixed even in 1.9.13**: `withdrawQueueCancel` still calls the admin-gated `updateAtomicRequest`, `withdrawQueueStatuses` still reads the Seven Seas indexer, `useEthersSigner` is still not importable, `@wagmi/core`/`wagmi`/`react` are still hard dependencies (not peers), `minimumMint` is still `0`, and the shared `withdrawStatus` object remains (though since **1.8.31** each function also *returns* its final status, a usable partial mitigation).
- **1.9.x is a poor trade for this app**: the dependency list balloons from 13 to 26 hard dependencies (Solana: `@coral-xyz/anchor`, `@solana/spl-token`, `@mysten/sui`; oracles: Pyth, Switchboard; LayerZero; `gill`; `next@^14`) for features this Ethereum-mainnet AtomicQueue vault does not use, and none of our remaining issues get fixed in exchange.

**Recommendation: upgrade to `boring-vault-ui@1.6.3`, drop the patch, keep every other workaround and keep `npm run test:withdraw` as the regression guard** (1.6.3's shipped code passes it — the calldata carries the full 18-decimal amount). Do not chase 1.9.13 unless we need Boring Queue, bridging, or Solana support.

## Per-workaround verdict table

Issue numbers match `INTEGRATION-GUIDE.md` §11.

| # | Issue (as documented) | Verdict | Fixed in | Evidence |
|---|---|---|---|---|
| 1 | `queueWithdraw` converts share amounts with `BigNumber.toNumber()` → ethers v6 overflow, every realistic redemption fails | **Fixed** (tx-encoding sites; a benign float allowance-compare remains — see [E1](#e1)) | **1.6.3** | Commit [`523c8ab` "Better large number handling"](https://github.com/Veda-Labs/boring-vault-ui/commit/523c8abbd109375b1d0219b5d230cd73f4e6af39); release [v1.6.3 "Improved large number handling"](https://github.com/Veda-Labs/boring-vault-ui/releases/tag/v1.6.3); verified in tarball `1.6.3/dist/contexts/v1/BoringVaultContextV1.js` lines 805, 840 |
| 2 | `withdrawQueueCancel` calls the admin-gated raw `updateAtomicRequest` → reverts for end users | **Not fixed** as of 1.9.13 | — | `1.9.13/dist/contexts/v1/BoringVaultContextV1.js` line 1319 still calls `updateAtomicRequest(..., [0,0,0,false])` ([E2](#e2)) |
| 3 | `withdrawQueueStatuses` reads the Seven Seas indexer → always `[]` for this unindexed vault | **Not fixed** as of 1.9.13 | — | `1.9.13/dist/contexts/v1/BoringVaultContextV1.js` line 72 (`SEVEN_SEAS_BASE_API_URL`) and line ~1402: `fetch("https://api.sevenseas.capital/withdrawRequests/{chain}/{vault}/{user}")` ([E3](#e3)) |
| 4 | `useEthersSigner` not exported; `dist/…` deep imports blocked by the `exports` map | **Not fixed** as of 1.9.13 | — | 1.9.13 `package.json` `exports`: only `"."`, `"./types"`, `"./solana"`; `dist/index.js` re-exports only 4 buttons + provider + hook + LayerZero utils; `dist/hooks/ethers.d.ts` (which contains `useEthersSigner`) is not reachable ([E4](#e4)) |
| 5 | Duplicate `@wagmi/core` (library pins an old range as a hard dependency) | **Not structurally fixed** — range loosened (`^2.6.16` → `^2.13.4` in 1.6.2 → `^2.17.0` in 1.8.33+), but it remains a hard `dependency`, never a `peerDependency`; keep the override | — | `npm view boring-vault-ui@{1.6.1,1.6.2,1.6.3,1.8.33,1.9.13} dependencies`; no version declares `peerDependencies` ([E5](#e5)) |
| 6 | One shared `withdrawStatus` object across all withdraw actions | **Partially fixed** — every withdraw function now *returns* its final `WithdrawStatus`, so callers need not read the shared state; the single shared state object itself remains | **1.8.31** | [PR #5 "Return temporary values in callbacks instead of react state"](https://github.com/Veda-Labs/boring-vault-ui/pull/5) (merged 2025-03-14, released in [v1.8.31](https://github.com/Veda-Labs/boring-vault-ui/releases/tag/v1.8.31)); verified in `1.9.13/dist/.../BoringVaultContextV1.js` (single `withdrawStatus` state at line 98; `return [2, tempSuccess]` etc.) ([E6](#e6)) |
| 7 | `deposit` passes `minimumMint = 0` (no slippage floor) | **Not fixed** as of 1.9.13 | — | `1.9.13/dist/.../BoringVaultContextV1.js` lines 450–462 (`deposit(..., 0, ...)`) and 665 (`minimumMint = 0` in `depositWithPermit`) ([E7](#e7)) |
| 8 | Deposit path also uses `.toNumber()` (latent for 6-decimal tokens) | **Fixed** (same caveat as #1) | **1.6.3** | Same commit [`523c8ab`](https://github.com/Veda-Labs/boring-vault-ui/commit/523c8abbd109375b1d0219b5d230cd73f4e6af39); verified in `1.6.3/dist/.../BoringVaultContextV1.js` lines 336, 358 ([E8](#e8)) |
| 9 | Only `DepositButton` importable; drags in Chakra UI; no queue-withdraw component | **Not fixed** as of 1.9.13 — more buttons exported (`BridgeButton`, `DepositAndBridgeButton`, `InstantWithdrawButton`) but still no AtomicQueue withdraw component, `@chakra-ui/react` still a hard dependency, deep imports still blocked | — | `1.9.13/dist/index.js` export list; `npm view boring-vault-ui@1.9.13 dependencies` includes `@chakra-ui/react ^2.8.2` ([E9](#e9)) |

**Note on 1.6.2:** it does *not* contain the #1 fix — `1.6.2/dist/.../BoringVaultContextV1.js` lines 805/840 still use `.toNumber()` for the queue approve and `offerAmount`. 1.6.2 is only the "Latest NPM Audit" dependency bump ([release v1.6.2](https://github.com/Veda-Labs/boring-vault-ui/releases/tag/v1.6.2)). The minimum version that unblocks redemptions is **1.6.3**.

## Evidence

Tarballs were fetched with `npm pack boring-vault-ui@<version>` and extracted to `/Users/romanholubovskyi/.claude/jobs/efaef36b/tmp/bvui/<version>/` (versions inspected: 1.6.2, 1.6.3, 1.7.0, 1.8.0, 1.8.1, 1.8.33, 1.9.5, 1.9.13; 1.6.1 from this repo's `node_modules`). Publish dates from `npm view boring-vault-ui time --json`.

### E1 — Issue #1: overflow fix landed in 1.6.3 {#e1}

`git compare v1.6.1...v1.6.3` in the upstream repo contains exactly two commits:

- [`353bdbb` "New packages, npm audit"](https://github.com/Veda-Labs/boring-vault-ui/commit/353bdbb1) (= release 1.6.2)
- [`523c8ab` "Better large number handling"](https://github.com/Veda-Labs/boring-vault-ui/commit/523c8abbd109375b1d0219b5d230cd73f4e6af39) (= release 1.6.3, files touched: `package.json`, `src/contexts/v1/BoringVaultContextV1.tsx`)

The `523c8ab` diff replaces `.toNumber()` with `.toFixed(0)` at every transaction-encoding site — deposit approve, `teller.deposit`, delay-withdraw approve, `requestWithdraw`, queue approve, and the `safeUpdateAtomicRequest` `deadline`/`offerAmount` — i.e., a superset of what our patch (`patches/boring-vault-ui+1.6.1.patch`) fixes at the encoding level. Verified in the shipped 1.6.3 tarball (`dist/contexts/v1/BoringVaultContextV1.js`):

```js
// 1.6.3, line 805 / 840  (1.6.2 still has .toNumber() at both sites)
vaultContractWithSigner.approve(withdrawQueueContract, amountWithdrawBaseDenom.toFixed(0))
...
amountWithdrawBaseDenom.toFixed(0), // offerAmount
```

**Residual difference vs our patch:** upstream (through 1.9.13, line 1190) still compares the allowance as floats — `Number(allowance) < amountWithdrawBaseDenom.toNumber()` — where our patch compares as `BigInt`. This cannot throw; the worst case is a float-epsilon misjudgment that skips the approve and lets `safeUpdateAtomicRequest` revert on-chain (recoverable, no fund risk). Our `scripts/queue-withdraw-regression.cjs` asserts on the emitted calldata, which 1.6.3's code satisfies, so the CI guard keeps working unchanged.

### E2 — Issue #2: cancel still admin-gated {#e2}

`1.9.13/dist/contexts/v1/BoringVaultContextV1.js`, line 1319 (inside `withdrawQueueCancel`):

```js
withdrawQueueContractWithSigner.updateAtomicRequest(
    outputTokenContract ? outputTokenContract : vaultContract, // Offer
    token.address, // Want
    [0, 0, 0, false])
```

Still the raw `updateAtomicRequest`, which is admin-gated on the Coinchange deployment (INTEGRATION-GUIDE §7.4). No version between 1.6.2 and 1.9.13 adds an approval-revoke ("stop") pattern for the AtomicQueue. (The newer *Boring Queue* family added `boringQueueCancel` in 1.7.0+, but that targets the `BoringOnChainQueue` contract, which this vault does not deploy.) Our stop-via-`approve(queue, 0)` workaround remains required.

### E3 — Issue #3: statuses still off the Seven Seas indexer {#e3}

`1.9.13/dist/contexts/v1/BoringVaultContextV1.js`:

```js
// line 72
var SEVEN_SEAS_BASE_API_URL = "https://api.sevenseas.capital";
// ~line 1398-1402 (withdrawQueueStatuses)
"".concat(SEVEN_SEAS_BASE_API_URL, "/withdrawRequests/").concat(chainName, "/").concat(vaultContract, "/") ...
fetch(withdrawURL)
```

The endpoint path changed since 1.6.1 (`/withdrawQueue/…` → `/withdrawRequests/…?string_values=true`) but it is still the Seven Seas indexer, which does not index the Coinchange vault. Our on-chain `getUserAtomicRequest` reader (`src/hooks/useWithdrawRequest.ts`) remains required.

### E4 — Issue #4: signer hook still unreachable {#e4}

1.9.13 `package.json` (`npm view boring-vault-ui@1.9.13 exports --json`):

```json
{ ".": "./dist/index.js", "./types": "./dist/types/index.d.ts", "./solana": { ... } }
```

`1.9.13/dist/index.js` exports exactly: `DepositButton`, `BridgeButton`, `DepositAndBridgeButton`, `InstantWithdrawButton`, `BoringVaultV1Provider`, `useBoringVaultV1`, plus `utils/layerzero-chains`. The signer hook exists in the shipped code at `dist/hooks/ethers.d.ts` (`export declare function useEthersSigner(...)`) but is neither re-exported from the root nor reachable through the `exports` map. Our local `src/lib/useEthersSigner.ts` remains required.

### E5 — Issue #5: `@wagmi/core` still a hard dependency {#e5}

From `npm view boring-vault-ui@<v> dependencies --json` (registry data):

| Version | `@wagmi/core` range | `wagmi` range | total deps | peerDependencies |
|---|---|---|---|---|
| 1.6.1 | `^2.6.16` | `^2.9.2`-era | 11 | none |
| 1.6.2 / 1.6.3 | `^2.13.4` | `^2.5.19` | 13 | none |
| 1.8.33 | `^2.17.0` | `^2.15.0` | 14 | none |
| 1.9.13 | `^2.17.0` | `^2.15.0` | 26 | none |

Because `wagmi`/`@wagmi/core`/`react`/`ethers` are always `dependencies` (never `peerDependencies`), npm can still resolve a second copy alongside the app's own. The `"overrides": { "@wagmi/core": "2.22.1" }` in our `package.json` stays (all later ranges are caret-compatible with 2.22.1, so the override remains valid at any target version).

### E6 — Issue #6: status objects returned since 1.8.31 {#e6}

[PR #5](https://github.com/Veda-Labs/boring-vault-ui/pull/5) ("Return temporary values in callbacks instead of react state", merged 2025-03-14) made every deposit/withdraw function build a local status object, `setWithdrawStatus(temp)` it, **and return it** — released in [v1.8.31](https://github.com/Veda-Labs/boring-vault-ui/releases/tag/v1.8.31). Verified in `1.9.13/dist/.../BoringVaultContextV1.js` (e.g. `return [2 /*return*/, tempSuccess]`). The context still holds one shared `withdrawStatus` React state (line 98) used by delay-withdraw, queue-withdraw, boring-queue and cancel alike, so UIs that render the *shared* state during concurrent actions still need our "track which action is in flight" workaround; UIs that consume the *return value* do not.

### E7 — Issue #7: `minimumMint` still 0 {#e7}

`1.9.13/dist/.../BoringVaultContextV1.js` lines 450–462: both deposit variants call `tellerContractWithSigner.deposit(token.address, amountDepositBaseDenom.toFixed(0), 0, ...)` — third argument (`minimumMint`) hard-coded `0`. Line 665: `minimumMint = 0;` in `depositWithPermit`. Unchanged across the whole range.

### E8 — Issue #8: deposit-side `.toNumber()` fixed in 1.6.3 {#e8}

Same commit as E1. Shipped 1.6.3, `dist/.../BoringVaultContextV1.js`:

```js
// line 336 (1.6.2: .toNumber())
erc20Contract.approve(vaultContract, amountDepositBaseDenom.toFixed(0))
// line 358 (1.6.2: .toNumber())
tellerContractWithSigner.deposit(token.address, amountDepositBaseDenom.toFixed(0), 0)
```

The allowance float-compare caveat of E1 applies here too (latent only for 6-decimal deposit tokens).

### E9 — Issue #9: components still Chakra-bound, deep imports blocked {#e9}

`npm view boring-vault-ui@1.9.13 dependencies` includes `@chakra-ui/react ^2.8.2`, `@emotion/react`, `@emotion/styled`, `framer-motion`. `dist/index.js` exports four prebuilt buttons (all Chakra-based); no AtomicQueue withdraw component exists at any version. Building custom UI off the hook remains the right call.

## Upgrade risk notes

### Option A — `1.6.3` (recommended)

- **Delta from 1.6.1:** exactly 2 commits ([compare v1.6.1...v1.6.3](https://github.com/Veda-Labs/boring-vault-ui/compare/v1.6.1...v1.6.3)); only `package.json` and `BoringVaultContextV1.tsx` change. The `.d.ts` API surface (provider props, `queueWithdraw`/`deposit` signatures) is byte-identical for everything we use; `exports` map unchanged (`"."` + `"./types"`).
- **What we retire:** `patches/boring-vault-ui+1.6.1.patch`, the `patch-package` postinstall (if nothing else ever needs patching). Rename/retarget the patch check in CI; **keep `npm run test:withdraw`** — it passes against unpatched 1.6.3 and guards any future regression.
- **What we keep:** workarounds #2, #3, #4, #5 (override), #6, #7, #9 — all still needed.
- **New deps pulled in:** 1.6.2's audit bump added `@safe-global/safe-apps-sdk`/`-provider` and bumped wagmi-family ranges; all compatible with this app's `react ^18.3.1`, `wagmi ^2.12.25`, `viem ^2.21.37`, `ethers ^6.13.4`.
- **Doc duty:** INTEGRATION-GUIDE §5.1/§11/§12 pin `1.6.1` + patch; an upgrade must update the guide (per its own instruction to "re-validate everything on any upgrade").

### Option B — `1.9.13` (latest) — works, but not worth it today

- **API compatibility (verified in `1.9.13/dist/contexts/v1/BoringVaultContextV1.d.ts`):** all provider props we pass still exist; every new prop (`outputTokenContract`, `boringQueueContract`, `layerZeroTellerContract`, `incentiveDistributorContract`, `isTellerReferralEnabled`, …) is optional. `queueWithdraw(signer, amount, token, discountPercent, daysValid)` is unchanged. `deposit` gains an optional `referralAddress` and only switches to the 4-arg referral Teller ABI when `isTellerReferralEnabled` is set — left unset, it uses the legacy 3-arg `deposit` our Teller expects (verified at lines 442–462).
- **Behavioral changes to re-test:** deposits now run `estimateGas` and submit with a 1.5× gas limit; `withdrawQueueStatuses` hits a different indexer path (still returns `[]` for us); `chain: "ethereum"` handling unchanged.
- **Main risk — dependency bloat:** 26 hard dependencies including `@coral-xyz/anchor`, `@solana/spl-token`, `@mysten/sui`, `@mysten/bcs`, `@pythnetwork/*`, `@switchboard-xyz/*`, `@layerzerolabs/*`, `gill`, and `next ^14.2.28` — all installed into a Vite SPA that uses none of them. Larger install, larger attack/audit surface, more transitive-conflict opportunities.
- **Payoff:** none of our remaining workarounds (#2, #3, #4, #7) are fixed, and the features added (Boring Queue, bridging, Merkle claims, Solana/Sui) do not apply to the CCUSD AtomicQueue vault. The only genuine improvement over 1.6.3 for us is #6's return-value mitigation (1.8.31+), which our in-flight tracking already covers.

### If we ever move past 1.6.3

The minimum version worth considering after 1.6.3 would be **1.8.31+** (status objects returned from calls, [PR #5](https://github.com/Veda-Labs/boring-vault-ui/pull/5)); between 1.6.3 and 1.8.31 the releases add Boring Queue (1.7.0), output-token vaults (1.8.0), Merkle claims (1.8.2) — nothing this vault uses. Release-note trail: [releases page](https://github.com/Veda-Labs/boring-vault-ui/releases).

## Source index

- npm registry: `npm view boring-vault-ui versions|time|dist-tags|dependencies|exports --json` (registry.npmjs.org, queried 2026-07-17). Versions after 1.6.1: 1.6.2, 1.6.3, 1.7.0, 1.8.0, 1.8.1, 1.8.2, 1.8.3, 1.8.31, 1.8.32, 1.8.33, 1.9.5–1.9.13.
- Upstream repo: <https://github.com/Veda-Labs/boring-vault-ui> (redirects from `Se7en-Seas/boring-vault-ui`; latest release v1.9.13, 2025-10-31). npm metadata contains no `repository` field — located via GitHub repository search.
- Fix commit for #1/#8: <https://github.com/Veda-Labs/boring-vault-ui/commit/523c8abbd109375b1d0219b5d230cd73f4e6af39>
- Partial fix for #6: <https://github.com/Veda-Labs/boring-vault-ui/pull/5> (released v1.8.31)
- Shipped-code verification: extracted tarballs at `/Users/romanholubovskyi/.claude/jobs/efaef36b/tmp/bvui/{1.6.2,1.6.3,1.7.0,1.8.0,1.8.1,1.8.33,1.9.5,1.9.13}/dist/…` (temp dir; re-create with `npm pack boring-vault-ui@<version>`), plus this repo's installed `node_modules/boring-vault-ui` (1.6.1) and `patches/boring-vault-ui+1.6.1.patch`.
