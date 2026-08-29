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
import type { Address } from "viem";

import type { Token } from "../lib/boringVault";
import { ROSTER } from "./vaults";

// The base asset is chain-level — both products account in it and both pay it
// out on redemption — but the registry carries it per vault, because the solver
// roster it is shaped after carries it per vault. Holding one token here is
// therefore only sound while every product names the same one, so that is
// checked rather than assumed: a second base asset would bring a second decimal
// scale, and the one below would misprice the other product's figures without
// anything on screen looking wrong.
function sharedBaseAsset(): Address {
  const [first, ...rest] = ROSTER.vaults;
  const differing = rest.find(
    (vault) =>
      vault.addresses.want.toLowerCase() !== first.addresses.want.toLowerCase()
  );
  if (differing) {
    throw new Error(
      `Vault registry: ${differing.id} names base asset ${differing.addresses.want}, ` +
        `but ${first.id} names ${first.addresses.want} — this widget holds one base asset`
    );
  }
  return first.addresses.want;
}

export const USDT: Token = {
  address: sharedBaseAsset(),
  decimals: 6,
  displayName: "USDT",
  image: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
};

export const DEPOSIT_TOKENS: Token[] = [USDT];
export const WITHDRAW_TOKENS: Token[] = [USDT];
export const BASE_ASSET: Token = USDT;

// The token a user receives on redemption (the solver's `wantAddress`).
export const WITHDRAW_TOKEN: Token = USDT;
