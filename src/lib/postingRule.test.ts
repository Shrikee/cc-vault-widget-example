// The arithmetic between the ceiling and the queue — src/lib/postingRule.ts.
//
// Every vector here is the spec's (§"The posting rule", §"Modules under test"),
// and every one of them is about a rounding direction or a unit, because those
// are the two ways this arithmetic can cost a depositor a fill: a discount
// rounded DOWN posts one want unit above the ceiling and the solver skips it,
// and a discount that does not survive the library's string conversion posts a
// different number from the one the modal showed.
import BigNumber from "bignumber.js";
import { describe, expect, it } from "vitest";

import {
  MAX_DISCOUNT_PPM,
  amountStringOf,
  askPrice,
  fitsMaximumSpread,
  formatDiscountPercent,
  offerSharesOf,
  payout,
  postedDiscount,
  requiredSpread,
} from "./postingRule";

// want units per whole share, 6 dp — the accountant's scale on both products.
const price = (s: string): bigint => BigInt(s.replace(".", "").padEnd(7, "0"));

describe("requiredSpread", () => {
  it("is the runbook's pair: 1.001000 over a 1.000000 ceiling needs 1000 ppm", () => {
    expect(requiredSpread(price("1.001000"), price("1.000000"))).toBe(1000n);
  });

  it("rounds UP: one want unit under 2.000000 needs a whole ppm, not half of one", () => {
    // (2000000 − 1999999) × 1e6 / 2000000 = 0.5 exactly. Floored it is 0 — a
    // discount of nothing, an ask of the full share price, and a certain skip.
    expect(requiredSpread(price("2.000000"), price("1.999999"))).toBe(1n);
  });

  it("is 274 for the live 30d pair — entry 1.000122 against NAV 1.000396", () => {
    // The spec's "Live facts" pair (§"Live facts the copy and tests anchor
    // to"): both live 30d holders sit here today, below the 0.1% default.
    // (§"Modules under test" writes the ceiling as 1.000121 — a typo; 274 is
    // the number the live facts, the runbook and the prototype all carry, and
    // it is the 1.000122 ceiling that produces it.)
    expect(requiredSpread(price("1.000396"), price("1.000122"))).toBe(274n);
  });

  it("rounds the live pair's neighbour up too — one unit lower needs 275", () => {
    // 275 × 1e6 / 1000396 = 274.89… The round-up is the whole point: 274 would
    // ask a unit above the ceiling.
    expect(requiredSpread(price("1.000396"), price("1.000121"))).toBe(275n);
  });

  it("is zero when the ceiling is at the share price — a fully vested holder", () => {
    expect(requiredSpread(price("1.002740"), price("1.002740"))).toBe(0n);
  });

  it("is zero when the ceiling is above the share price — never negative", () => {
    // The rule never quotes above NAV, but a total function says what it does
    // if one ever did: nothing is required, not a negative discount.
    expect(requiredSpread(price("1.000000"), price("1.001000"))).toBe(0n);
  });

  it("keeps the number past the 1% maximum instead of clamping to it", () => {
    // The prototype's clamp scenario: a 5-day-old lot at 1.000000 against a
    // share price of 1.015000. 14,779 ppm is what the refusal names ("1.4779%
    // below the share price"); clamping it to 10,000 would both hide the cause
    // and post a request the solver skips.
    const required = requiredSpread(price("1.015000"), price("1.000000"));
    expect(required).toBe(14_779n);
    expect(required).toBeGreaterThan(MAX_DISCOUNT_PPM);
  });
});

describe("fitsMaximumSpread", () => {
  it("is the contract's 1% maximum, inclusive, and nothing else", () => {
    // One gate, asked in two places: turning a required spread into a posted
    // one, and searching for the largest amount that still prices.
    expect(fitsMaximumSpread(0n)).toBe(true);
    expect(fitsMaximumSpread(MAX_DISCOUNT_PPM)).toBe(true);
    expect(fitsMaximumSpread(MAX_DISCOUNT_PPM + 1n)).toBe(false);
    expect(fitsMaximumSpread(14_779n)).toBe(false);
  });
});

describe("postedDiscount", () => {
  it("posts the holder's spread when it is the wider one — 0.1% over a required 274", () => {
    const posted = postedDiscount(1000n, 274n);
    expect(posted).toEqual({
      kind: "postable",
      ppm: 1000n,
      required: 274n,
      isRequired: false,
    });
  });

  it("posts the required spread when it is the wider one — 0.1% under a required 1026", () => {
    const posted = postedDiscount(1000n, 1026n);
    expect(posted).toEqual({
      kind: "postable",
      ppm: 1026n,
      required: 1026n,
      isRequired: true,
    });
  });

  it("keeps a holder's wider spread over the required one — 0.5% over 1026", () => {
    // The spread control keeps its stage-1 meaning: the holder's FLOOR on the
    // haircut. A holder who widens it still posts what they asked for.
    const posted = postedDiscount(5000n, 1026n);
    expect(posted).toEqual({
      kind: "postable",
      ppm: 5000n,
      required: 1026n,
      isRequired: false,
    });
  });

  it("posts the required spread when the two are equal, marked as the holder's", () => {
    const posted = postedDiscount(1000n, 1000n);
    expect(posted).toEqual({
      kind: "postable",
      ppm: 1000n,
      required: 1000n,
      isRequired: false,
    });
  });

  it("refuses past the contract's 1% maximum, and still carries the number", () => {
    expect(postedDiscount(1000n, 14_779n)).toEqual({
      kind: "unfillable",
      required: 14_779n,
    });
  });

  it("is postable at exactly the 1% maximum — the boundary is inclusive", () => {
    expect(postedDiscount(1000n, MAX_DISCOUNT_PPM)).toEqual({
      kind: "postable",
      ppm: 10_000n,
      required: 10_000n,
      isRequired: true,
    });
  });
});

describe("askPrice and payout", () => {
  it("stamps the queue's ask: NAV less the posted spread, floored", () => {
    // The worked example: 1.001370 at the required 1369 ppm.
    expect(askPrice(price("1.001370"), 1369n)).toBe(999_999n);
  });

  it("pays ask × shares / one whole share, at the product's own decimals", () => {
    expect(payout(999_999n, 10_000n * 10n ** 18n, 18)).toBe(9_999_990_000n);
    expect(payout(999_999n, 10_000n * 10n ** 6n, 6)).toBe(9_999_990_000n);
  });
});

describe("offerSharesOf", () => {
  const decimals = 18;
  // What the library does with the amount string it is handed:
  // `new BigNumber(x).multipliedBy(10 ** decimals).decimalPlaces(0, ROUND_DOWN)`.
  const throughTheLibrary = (amount: string): bigint =>
    BigInt(
      new BigNumber(amount)
        .multipliedBy(new BigNumber(10).pow(decimals))
        .decimalPlaces(0, BigNumber.ROUND_DOWN)
        .toFixed(0)
    );

  it("converts a whole amount — '1000' is 1000 × 10^18", () => {
    expect(offerSharesOf("1000", decimals)).toBe(1000n * 10n ** 18n);
  });

  it("truncates a 19-dp string, exactly as the wire does", () => {
    const nineteen = "1.0000000000000000009";
    expect(offerSharesOf(nineteen, decimals)).toBe(10n ** 18n);
    expect(offerSharesOf(nineteen, decimals)).toBe(throughTheLibrary(nineteen));
  });

  it("truncates rather than rounds — a 19th digit of 9 is dropped, not carried", () => {
    // The distinction matters: rounding up here would offer shares the holder
    // does not hold.
    const rounder = "0.9999999999999999999";
    expect(offerSharesOf(rounder, decimals)).toBe(999_999_999_999_999_999n);
    expect(offerSharesOf(rounder, decimals)).toBe(throughTheLibrary(rounder));
  });

  it("mirrors the library on every shape the amount box can produce", () => {
    for (const amount of [
      "0",
      "0.0",
      "1",
      "10",
      "0.5",
      ".5",
      "10000.123456789012345678",
      "0.000000000000000001",
      "1.10",
      "9999999.999999999999999999",
    ]) {
      expect(offerSharesOf(amount, decimals)).toBe(throughTheLibrary(amount));
    }
  });

  it("is zero for what the amount box cannot post — empty, blank, junk", () => {
    expect(offerSharesOf("", decimals)).toBe(0n);
    expect(offerSharesOf("   ", decimals)).toBe(0n);
    expect(offerSharesOf("abc", decimals)).toBe(0n);
    expect(offerSharesOf("1.2.3", decimals)).toBe(0n);
    expect(offerSharesOf("-1", decimals)).toBe(0n);
  });

  it("converts at the product's own decimals, not a fixed 18", () => {
    expect(offerSharesOf("1.5", 6)).toBe(1_500_000n);
  });
});

describe("amountStringOf — what MAX puts in the box", () => {
  const decimals = 18;

  it("round-trips a raw balance to the wei", () => {
    // The reason the position hook keeps the raw bigint beside its float: a
    // balance of 10,000.123456789012345678 shares does not survive a JS number
    // (it has 23 significant digits), and MAX has to offer the whole balance.
    const raw = 10_000_123_456_789_012_345_678n;
    expect(Number(raw) / 1e18).not.toBe(10_000.123456789012345678); // the float cannot
    const typed = amountStringOf(raw, decimals);
    expect(typed).toBe("10000.123456789012345678");
    expect(offerSharesOf(typed, decimals)).toBe(raw);
  });

  it("round-trips every awkward balance shape", () => {
    for (const raw of [
      0n,
      1n,
      10n ** 18n,
      10n ** 18n - 1n,
      999_999_999_999_999_999_999_999n,
      1_000_000_000_000_000_010n,
    ]) {
      expect(offerSharesOf(amountStringOf(raw, decimals), decimals)).toBe(raw);
    }
  });

  it("drops a trailing fraction of zeros rather than typing them", () => {
    expect(amountStringOf(10n ** 18n, decimals)).toBe("1");
    expect(amountStringOf(1_500_000_000_000_000_000n, decimals)).toBe("1.5");
    expect(amountStringOf(0n, decimals)).toBe("0");
  });
});

describe("formatDiscountPercent", () => {
  it("is the 4-dp percent string the library takes — 1000 ppm is '0.1'", () => {
    expect(formatDiscountPercent(1000n)).toBe("0.1");
    expect(formatDiscountPercent(274n)).toBe("0.0274");
    expect(formatDiscountPercent(10_000n)).toBe("1");
    expect(formatDiscountPercent(0n)).toBe("0");
  });

  it("survives the library's × 10⁴ → toFixed(0) for every d in 0..10000", () => {
    // The spec's claim, re-run here against the INSTALLED bignumber.js rather
    // than trusted: what the modal shows is what the queue is handed, for every
    // discount the widget can post. A single d that came back different would
    // mean a request posted at a price the depositor was never shown.
    for (let d = 0; d <= 10_000; d++) {
      const onTheWire = new BigNumber(formatDiscountPercent(BigInt(d)))
        .multipliedBy(new BigNumber(10_000))
        .toFixed(0);
      expect(onTheWire).toBe(String(d));
    }
  });
});
