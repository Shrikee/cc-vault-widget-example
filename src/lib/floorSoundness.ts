// Whether the vault registry's ledger floor is sound enough to price a term
// from (spec §"The runtime ledger-floor check").
//
// The solver asserts at boot that each vault's floor is sound; the widget
// quotes off the same residual-lot logic, so it verifies the same invariant.
// The failure it prevents is the worst kind — a plausible number. A floor
// bumped past `now − vestingSeconds` on this side alone turns yesterday's
// deposits into a "vested" residual, and the ceiling that comes out is ABOVE
// the solver's: a certain skip from a figure that looks right, with nothing on
// screen looking amiss.
//
// The two arms, in the order the reads cost:
//
//   1. THE AGE ARM. The floor block's own timestamp is at least `vestingSeconds`
//      old. One `getBlock(floor)`, and where it passes nothing else is read: a
//      lot that began below a floor that old has finished vesting whatever its
//      entry price was, so no residual can be mispriced.
//   2. THE SUPPLY ARM, only on a young floor. The share `totalSupply` at
//      `floor − 1` is zero — nothing existed below the floor to be missed. An
//      ARCHIVE read, which is why it is made second and only when it is needed.
//
// Either arm alone is enough. Neither is a judgement about the holder: this is
// a fact about the REGISTRY, and a floor that fails both means the widget's own
// configuration is wrong, not that this wallet cannot be priced. The 24h
// product is exempt by construction — its shares vest before they unlock, so
// nothing there is priced against a residual at all — and the caller gates on
// the vesting gap rather than on the vault id.
//
// Pure — no chain, no React, no clock of its own; the two reads are the
// caller's (src/hooks/useLedgerFloor.ts) and the verdict is this module's, so
// ./floorSoundness.test.ts drives every arm against the solver's own vectors.

// What the two reads came back with, and the term they are judged against.
export interface LedgerFloorFacts {
  // The floor block's OWN timestamp, unix seconds — `getBlock(floor)`.
  floorBlockTime: number;
  // Unix seconds now. The check runs once per product per session, so this is
  // the moment it ran rather than a rendered clock.
  now: number;
  vestingSeconds: number;
  // The share `totalSupply` at `floor − 1`. Null says the archive read was
  // never made — either because the age arm had already answered, or because
  // it did not land.
  supplyBelowFloor: bigint | null;
}

// `sound` is permission to price from this floor; `too-young` is not.
export type FloorSoundness = "sound" | "too-young";

/**
 * The age arm on its own — and the caller's test for whether the archive read
 * below the floor is worth making at all.
 *
 * Inclusive at the boundary: a floor exactly `vestingSeconds` old dates a lot
 * whose term has just run out, and a lot that has finished vesting prices at
 * the share price whatever it paid.
 */
export function floorIsOldEnough(
  facts: Omit<LedgerFloorFacts, "supplyBelowFloor">
): boolean {
  return facts.now - facts.floorBlockTime >= facts.vestingSeconds;
}

/**
 * The verdict, over both arms.
 *
 * A young floor whose supply was never read is `too-young`, deliberately: not
 * knowing is not permission. A read that did not land leaves the widget exactly
 * as unable to establish the invariant as an unsound floor does, and both
 * degrade to the same place — nothing priced, posting still open.
 */
export function floorSoundness(facts: LedgerFloorFacts): FloorSoundness {
  if (floorIsOldEnough(facts)) return "sound";
  return facts.supplyBelowFloor === 0n ? "sound" : "too-young";
}
