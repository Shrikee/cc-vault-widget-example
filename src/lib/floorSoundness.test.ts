// The ledger floor's soundness — src/lib/floorSoundness.ts.
//
// The vectors are the solver's own two arms (spec §"The runtime ledger-floor
// check") and the live 30d floor the spec records: block 92,416,354, fifteen
// days old under a thirty-day term, with no shares below it — young on the age
// arm and sound on the supply arm, which is the case the widget actually runs
// in today.
import { describe, expect, it } from "vitest";

import {
  floorIsOldEnough,
  floorSoundness,
  type LedgerFloorFacts,
} from "./floorSoundness";

const DAY = 86_400;
const VESTING = 2_592_000; // 30 days — the Yield Prime 30d term
// 2026-09-01T12:00:00Z — the day the spec's live facts are anchored to.
const NOW = 1_788_264_000;

// A floor forty days old: past the term, so the age arm answers on its own and
// the archive read is never made.
const facts = (extra: Partial<LedgerFloorFacts> = {}): LedgerFloorFacts => ({
  floorBlockTime: NOW - 40 * DAY,
  now: NOW,
  vestingSeconds: VESTING,
  supplyBelowFloor: null,
  ...extra,
});

describe("the age arm", () => {
  it("passes a floor at least a vesting term old, with no supply read at all", () => {
    expect(floorIsOldEnough(facts())).toBe(true);
    expect(floorSoundness(facts())).toBe("sound");
  });

  it("passes at exactly a vesting term old — the boundary is inclusive", () => {
    const at = facts({ floorBlockTime: NOW - VESTING });
    expect(floorIsOldEnough(at)).toBe(true);
    expect(floorSoundness(at)).toBe("sound");
  });

  it("fails one second short of the term, which is where the supply arm starts", () => {
    expect(floorIsOldEnough(facts({ floorBlockTime: NOW - VESTING + 1 }))).toBe(
      false
    );
  });

  it("is the whole check on a product whose term is a day", () => {
    // The 24h product is exempt by construction: any floor older than a day
    // passes, and its shares vest before they unlock either way.
    expect(
      floorIsOldEnough(
        facts({ floorBlockTime: NOW - 2 * DAY, vestingSeconds: DAY })
      )
    ).toBe(true);
  });
});

describe("the supply arm, on a young floor", () => {
  const young = (supplyBelowFloor: bigint | null): LedgerFloorFacts =>
    facts({ floorBlockTime: NOW - 15 * DAY, supplyBelowFloor });

  it("passes a floor below which the vault held no shares", () => {
    expect(floorSoundness(young(0n))).toBe("sound");
  });

  it("refuses a floor with shares already minted below it", () => {
    // The failure this exists to catch: a floor bumped past now − vesting turns
    // yesterday's deposits into a vested residual, and quotes above the
    // solver's ceiling.
    expect(floorSoundness(young(1n))).toBe("too-young");
    expect(floorSoundness(young(10_000n * 10n ** 18n))).toBe("too-young");
  });

  it("refuses a floor whose supply was never read", () => {
    // Not knowing is not permission. A read that did not land leaves the widget
    // exactly as unable to price as an unsound floor does.
    expect(floorSoundness(young(null))).toBe("too-young");
  });
});

describe("the live 30d floor", () => {
  it("is young and sound — block 92,416,354, fifteen days into a thirty-day term", () => {
    const live = facts({
      floorBlockTime: NOW - 15 * DAY,
      supplyBelowFloor: 0n,
    });
    expect(floorIsOldEnough(live)).toBe(false);
    expect(floorSoundness(live)).toBe("sound");
  });
});
