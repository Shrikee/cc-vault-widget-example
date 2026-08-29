// The tokens the widget deposits, redeems and prices in.
//
// Base/unit-of-account is USDT (6 decimals) — accountant.base(), and the
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
import type { Token } from "../lib/boringVault";
import { ROSTER } from "./vaults";

// One token, not one per product: the base asset is chain-level, and the parse
// guard is what makes that safe to assume — it holds every registry entry to
// the same `want` and hands it back as the roster's, so this module never has
// to pick a vault to ask.
export const USDT: Token = {
  address: ROSTER.baseAsset,
  decimals: 6,
  displayName: "USDT",
  image: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
};

export const DEPOSIT_TOKENS: Token[] = [USDT];
export const WITHDRAW_TOKENS: Token[] = [USDT];
export const BASE_ASSET: Token = USDT;

// The token a user receives on redemption (the solver's `wantAddress`).
export const WITHDRAW_TOKEN: Token = USDT;
