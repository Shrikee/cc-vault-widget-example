// The Confirm re-check — src/lib/confirmRecheck.ts.
//
// Three ways the pin can go stale between opening the modal and pressing
// Confirm, and one vector for each, plus the two that must NOT re-pin: a
// balance that exactly covers the amount, and one that grew.
import { describe, expect, it } from "vitest";

import { recheckBeforePost } from "./confirmRecheck";

const SHARE = 10n ** 18n;

describe("recheckBeforePost", () => {
  const pinned = { rateUpdatedAt: 1_799_999_000, offerShares: 10_000n * SHARE };
  const unchanged = {
    rateUpdatedAt: 1_799_999_000,
    paused: false,
    shareBalance: 10_000n * SHARE,
  };

  it("posts when nothing moved between the pin and Confirm", () => {
    expect(recheckBeforePost(pinned, unchanged)).toEqual({ verdict: "post" });
  });

  it("re-pins when the share price ticked — an unvested ask rises with it, the ceiling does not", () => {
    // The whole reason for the re-check: between pin and transaction an
    // unvested lot's ask follows the share price while its ceiling stays where
    // it was, so a tick in the gap is a certain skip. Never post, re-pin.
    expect(
      recheckBeforePost(pinned, { ...unchanged, rateUpdatedAt: 1_800_000_100 })
    ).toEqual({ verdict: "re-pin", cause: "rate-moved" });
  });

  it("re-pins when the accountant paused", () => {
    expect(recheckBeforePost(pinned, { ...unchanged, paused: true })).toEqual({
      verdict: "re-pin",
      cause: "paused",
    });
  });

  it("names the pause, not the tick, when the auto-pause moved the rate too", () => {
    // The accountant's auto-pause stores the out-of-bounds rate BEFORE pausing,
    // so both are true at once and only one of them is the cause.
    expect(
      recheckBeforePost(pinned, {
        rateUpdatedAt: 1_800_000_100,
        paused: true,
        shareBalance: 10_000n * SHARE,
      })
    ).toEqual({ verdict: "re-pin", cause: "paused" });
  });

  it("re-pins when the balance no longer covers the amount", () => {
    expect(
      recheckBeforePost(pinned, {
        ...unchanged,
        shareBalance: 9_999n * SHARE,
      })
    ).toEqual({ verdict: "re-pin", cause: "balance-short" });
  });

  it("posts on a balance that exactly covers the amount", () => {
    expect(
      recheckBeforePost(pinned, { ...unchanged, shareBalance: 10_000n * SHARE })
    ).toEqual({ verdict: "post" });
  });

  it("posts when the balance GREW — more shares is not a reason to re-pin", () => {
    expect(
      recheckBeforePost(pinned, { ...unchanged, shareBalance: 20_000n * SHARE })
    ).toEqual({ verdict: "post" });
  });
});
