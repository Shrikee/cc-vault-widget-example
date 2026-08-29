// The shared Lens: which call each product's reads make, and what the numbers
// they come back with mean.
//
// Two decisions are pinned here. First, that reading either product is the same
// call to the same Lens with that product's own addresses as arguments — the
// claim that makes reading both vaults off one contract safe, and the reason no
// per-vault library state has to be reproduced. Second, that the arithmetic
// turning a raw return value into a displayed figure is the one the vault
// library used, digit for digit: the widget read these four values through
// boring-vault-ui's context until this change, and every figure derived from
// them — position value, earnings, the realised trailing APY — must be
// unchanged by moving the read.
//
// The shipped registry is the fixture on purpose: it is the thing that has to
// hold both products, and its 24h/30d values were verified against the live
// contracts (see ./vaultRegistry.test.ts).
import { describe, expect, it } from "vitest";

import { ROSTER } from "../config/vaults";
import { decodeUserPosition, decodeVaultMetrics, lensCalls } from "./lens";
import { vaultById } from "./vaultRegistry";

const YIELD_PRIME = vaultById(ROSTER, "coinchange-24h-polygon");
const YIELD_PRIME_30D = vaultById(ROSTER, "coinchange-30d-polygon");

// USDT, the base asset both products account in.
const BASE_DECIMALS = 6;

const HOLDER = "0x1111111111111111111111111111111111111111" as const;

describe("reading a vault through the Lens", () => {
  it("asks the same Lens for either product, with that product's own addresses", () => {
    const [total24, rate24] = lensCalls.vaultMetrics(YIELD_PRIME);
    const [total30, rate30] = lensCalls.vaultMetrics(YIELD_PRIME_30D);

    // One Lens, deliberately: both registry entries name it, and this is what
    // the two calls differing only in their arguments looks like.
    expect(total24.address).toBe(YIELD_PRIME.addresses.lens);
    expect(total30.address).toBe(YIELD_PRIME_30D.addresses.lens);
    expect(total30.address).toBe(total24.address);

    expect(total24.functionName).toBe("totalAssets");
    expect(total24.args).toEqual([
      YIELD_PRIME.addresses.vault,
      YIELD_PRIME.addresses.accountant,
    ]);
    expect(total30.args).toEqual([
      YIELD_PRIME_30D.addresses.vault,
      YIELD_PRIME_30D.addresses.accountant,
    ]);

    expect(rate24.functionName).toBe("exchangeRate");
    expect(rate24.args).toEqual([YIELD_PRIME.addresses.accountant]);
    expect(rate30.args).toEqual([YIELD_PRIME_30D.addresses.accountant]);
  });

  it("asks for a holder's position with that product's vault and teller", () => {
    const [shares24, unlock24] = lensCalls.userPosition(YIELD_PRIME, HOLDER);
    const [shares30, unlock30] = lensCalls.userPosition(YIELD_PRIME_30D, HOLDER);

    expect(shares30.address).toBe(shares24.address);
    expect(shares24.functionName).toBe("balanceOf");
    expect(shares24.args).toEqual([HOLDER, YIELD_PRIME.addresses.vault]);
    expect(shares30.args).toEqual([HOLDER, YIELD_PRIME_30D.addresses.vault]);

    // The share lock is the teller's, so the unlock time is read against the
    // teller and not the vault.
    expect(unlock24.functionName).toBe("userUnlockTime");
    expect(unlock24.args).toEqual([HOLDER, YIELD_PRIME.addresses.teller]);
    expect(unlock30.args).toEqual([HOLDER, YIELD_PRIME_30D.addresses.teller]);
  });
});

// The library's arithmetic, from
// node_modules/boring-vault-ui/dist/contexts/v1/BoringVaultContextV1.js@1.6.3:
//   totalAssets    Number(assets[1]) / Math.pow(10, baseToken.decimals)
//   exchangeRate   Number(shareValue) / Math.pow(10, baseToken.decimals)
//   balanceOf      Number(balance) / Math.pow(10, decimals)   // vaultDecimals
//   userUnlockTime Number(userUnlockTime)
describe("the figures those calls come back with", () => {
  it("values TVL in the base asset, not in shares", () => {
    // totalAssets returns (asset, assets); the widget shows the second, and the
    // first is the base asset it is denominated in.
    const { tvl } = decodeVaultMetrics(
      [["0xc2132D05D31c914a87C6611C10748AEb04B58e8F", 1_050_000n], 1_000_000n],
      BASE_DECIMALS
    );
    // 1.05 USDT — the seed balance the 24h vault held at verification.
    expect(tvl).toBe(1.05);
  });

  it("reads the share price at the accountant's six decimals", () => {
    // The verified figures, both products: 1.000000 on the 24h line, 1.000122
    // on the 30d one.
    expect(decodeVaultMetrics([["0x00", 0n], 1_000_000n], BASE_DECIMALS).shareValue).toBe(1);
    expect(decodeVaultMetrics([["0x00", 0n], 1_000_122n], BASE_DECIMALS).shareValue).toBe(
      1.000122
    );
  });

  it("keeps TVL and the share price on the base asset's scale", () => {
    const { tvl, shareValue } = decodeVaultMetrics(
      [["0x00", 1_234_567_891n], 1_004_321n],
      BASE_DECIMALS
    );
    expect(tvl).toBe(1234.567891);
    expect(shareValue).toBe(1.004321);
  });

  it("reads shares at the vault's own decimals", () => {
    const { shares } = decodeUserPosition([1_050_000_000_000_000_000n, 0n], YIELD_PRIME);
    expect(YIELD_PRIME.ui.decimals).toBe(18);
    expect(shares).toBe(1.05);
  });

  it("loses the same precision on a large balance as the library did", () => {
    // 12.345678901234567890 shares does not survive a double, and the last
    // three digits go. That is what the widget has always shown — the library
    // divided a Number by a power of ten too — so it is what this must show.
    const { shares } = decodeUserPosition([12_345_678_901_234_567_890n, 0n], YIELD_PRIME);
    expect(shares).toBe(12.345678901234567);
  });

  it("reads the share-unlock time as plain unix seconds", () => {
    const { unlockAt } = decodeUserPosition([0n, 1_787_328_574n], YIELD_PRIME);
    expect(unlockAt).toBe(1787328574);
  });

  it("keeps a never-deposited wallet's unlock time at exactly zero", () => {
    // The deposit scan's precondition: 0 means the wallet has never deposited,
    // and it must not be confused with "not read yet".
    const { shares, unlockAt } = decodeUserPosition([0n, 0n], YIELD_PRIME);
    expect(shares).toBe(0);
    expect(unlockAt).toBe(0);
  });
});
