// The vault registry, parsed once at load.
//
// src/config/vaults.json declares both Coinchange products — Yield Prime
// (CCUSD, 24h) and Yield Prime 30d (CCUSD30, 30d) — in the shape a vault entry
// takes in the solver service's roster, so the two files diff by eye. The shape
// and the guard live in src/lib/vaultRegistry.ts; this module is where the JSON
// meets it.
//
// Parsing here, at module scope, is deliberate: an unreadable registry stops
// the widget at load with a message naming the field, rather than letting an
// `undefined` address reach a contract call and render a blank vault.
//
// =============================================================================
// VERIFICATION AND PROVENANCE
//
// Every value below was verified against the live Polygon contracts on
// 2026-08-28, at chain head 92,835,789, and all checks passed: name, symbol,
// decimals, the accountant's base asset, the share price, all three pause
// flags, the teller's share lock and its support for the base asset, and each
// deploy block (confirmed by asserting code exists at that block and does not
// at the block before it). Re-verify when either vault is redeployed.
//
// Four values cannot be confirmed by any chain read, because nothing on chain
// asserts them. Their authority is elsewhere, and this is where it lives:
//
//   addresses.queue    boring-vault repo,
//   addresses.solver     deployments/Polygon/Coinchange{24h,30d}VaultDeploy.json
//                        deployments/Polygon/Coinchange{24h,30d}SolverDeploy.json
//
//   eventsFromBlock    vault-solver-service repo, config.json
//   vestingSeconds       (the ledger floor and the product's vesting term)
//
// One trap worth stating plainly, because it is the kind this repository keeps
// getting caught by. The 30d vault's `deployTimestamp` here is 1787328574 —
// 2026-08-21T16:09:34Z — which does NOT match the contracts repository's
// deployment record for that stack (16:12:59Z). The record holds the foundry
// broadcast time, as its own notes say; the value the registry needs is the
// accountant's deploy BLOCK timestamp, because it anchors the "measured since
// launch" path of the realised trailing APY. The chain value is the right one,
// and it is 3m25s earlier.
// =============================================================================
import registry from "./vaults.json";
import { parseVaultRegistry } from "../lib/vaultRegistry";

export const ROSTER = parseVaultRegistry(registry);

// The 24h product: the established one, and the widget's default — what an
// absent or unrecognised selection resolves to. An ID and not a vault, on
// purpose: nothing may hold one product at module scope, and the vault this
// names is looked up where a product is being chosen. The id is the solver
// roster's own, so a mismatch between this constant and the JSON is a loud
// failure at the lookup rather than one returning nothing.
export const DEFAULT_VAULT_ID = "coinchange-24h-polygon";
