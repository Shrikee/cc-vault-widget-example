// How a figure is written on a priced surface — once, for every surface.
//
// The quote card and the confirm modal show the SAME numbers: the modal pins
// what the card quoted, and "what the modal shows is what is posted" is only a
// fact if the two write a share price, a payout and a spread the same way. Two
// copies of these five functions would be two chances to round differently, and
// the difference a depositor would notice is exactly the one that matters — a
// want unit per share is the gap between a request that fills and one the
// solver passes over.
//
// Every one of them takes a BIGINT. A share balance is an 18-dp integer and a
// double holds about fifteen digits, so a figure that went through a `number`
// on its way to the screen is not the figure that goes on the wire.
//
// Pure, and tested through the models that use them (./withdrawQuote.test.ts,
// ./confirmPin.test.ts) rather than directly: a formatter has no meaning apart
// from the sentence it lands in.

// A non-negative bigint of `decimals` dp as a grouped decimal string, rounded
// half-up to `maxDp` and trimmed to no fewer than `minDp` places. Private: what
// callers want is a PRICE or a PAYOUT, and the five below are the only shapes a
// priced surface writes.
function decimalString(
  units: bigint,
  decimals: number,
  minDp: number,
  maxDp: number
): string {
  let scaled: bigint;
  if (maxDp >= decimals) {
    scaled = units * 10n ** BigInt(maxDp - decimals);
  } else {
    const div = 10n ** BigInt(decimals - maxDp);
    const whole = units / div;
    scaled = (units % div) * 2n >= div ? whole + 1n : whole;
  }
  const scale = 10n ** BigInt(maxDp);
  let frac = maxDp > 0 ? (scaled % scale).toString().padStart(maxDp, "0") : "";
  while (frac.length > minDp && frac.endsWith("0")) frac = frac.slice(0, -1);
  const grouped = (scaled / scale)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

// A want amount as money — "9,999.99". Always two places: it is a payout.
export const formatWant = (units: bigint): string => decimalString(units, 6, 2, 2);

// A price, want per whole share — "1.000600". Always all six places: the last
// one is a whole want unit per share, and a want unit is the difference
// between a request that fills and one the solver passes over.
export const formatPrice = (units: bigint): string => decimalString(units, 6, 6, 6);

// A share amount — "10,000" / "999.878015".
export const formatShares = (units: bigint, decimals: number): string =>
  decimalString(units, decimals, 0, 6);

// A plain count — "93,051,200". What a block number is.
export const formatCount = (units: bigint): string => decimalString(units, 0, 0, 0);

// The chain's own words, as the tail of a sentence that supplies its own full
// stop. Not a figure — but it belongs here for the same reason the five above
// do: it is written into "Couldn't read your history from the chain — {reason}."
// on the quote card and into "Couldn't re-read your history — {reason}." on the
// confirm modal, and two copies of the trim are two chances for one of them to
// render "timed out.. Nothing was posted."
export const quotedReason = (detail: string): string =>
  detail.replace(/[.\s]+$/, "");

// A spread in the queue's ppm as a percent — 1000 → "0.10%", 1369 →
// "0.1369%". Two places for a round tenth and four otherwise, because the
// required spread is rarely a round tenth and "0.14%" is not the number that
// was posted.
export function formatSpread(ppm: bigint): string {
  const dp = Number(ppm) % 100 === 0 ? 2 : 4;
  return `${(Number(ppm) / 10_000).toFixed(dp)}%`;
}
