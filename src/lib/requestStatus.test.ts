// What the widget may say about a redemption request — src/lib/requestStatus.ts.
//
// The vectors below are the four states a request struct can be read in, and
// what each is allowed to claim. They exist because the claim is the thing that
// was wrong: a request whose deadline is a week away used to be called
// "Fillable for 7d", which the widget has no way of knowing — the solver's
// pre-filter declines requests for reasons this page never reads.
//
// Nothing here is per product. `describeRequest` takes a queue struct and one
// product fact (whether shares can be redeemable while still unvested), so the
// wording cannot diverge between the two queues by construction; the vectors
// pin that the one fact it does take changes only the note, never the status.
import { describe, expect, it } from "vitest";

import { describeRequest, type RequestFacts } from "./requestStatus";

const NOW = 1_800_000_000;

// A request in the 24h product's queue, posted with the default 7-day validity
// and a day into it: approved, untouched by the solver, well inside its
// deadline.
const OPEN: RequestFacts = {
  deadline: NOW + 6 * 86_400,
  inSolve: false,
  approved: true,
  vestingGap: false,
};
// The same request in the 30d product's queue. The only difference the widget
// has: on that product the share lock is a day and the vesting term is thirty,
// so shares can be redeemable and unvested at once.
const OPEN_30D: RequestFacts = { ...OPEN, vestingGap: true };

describe("an open request", () => {
  it("is described as open and expiring, not as fillable", () => {
    const { status, badge, detail } = describeRequest(OPEN, NOW);
    expect(status).toBe("open");
    expect(badge).toBe("Open");
    expect(detail).toBe("Expires in 6d");
  });

  it("says the same on both products", () => {
    // The 30d product is where the hazard is, but the over-claim was never
    // 30d-specific: allowance, balance, the deposit lock and a marked-down share
    // price decline a 24h request just as well.
    const { status, badge, detail } = describeRequest(OPEN_30D, NOW);
    expect({ status, badge, detail }).toEqual({
      status: "open",
      badge: "Open",
      detail: "Expires in 6d",
    });
  });

  it("counts down to the deadline in the depositor's own units", () => {
    expect(describeRequest({ ...OPEN, deadline: NOW + 3600 }, NOW).detail).toBe(
      "Expires in 1h"
    );
    expect(describeRequest({ ...OPEN, deadline: NOW + 90 }, NOW).detail).toBe(
      "Expires in 1m 30s"
    );
  });
});

describe("a request the solver is holding", () => {
  // `inSolve` is the queue's own flag — the one moment the widget can say
  // something is being filled without guessing at it.
  const solving: RequestFacts = { ...OPEN, inSolve: true };

  it("keeps its own state", () => {
    const { status, badge, detail } = describeRequest(solving, NOW);
    expect(status).toBe("solving");
    expect(badge).toBe("Filling");
    expect(detail).toBe("Solver is filling your request");
  });

  it("is still being filled after its deadline lapses", () => {
    // A fill in flight, not an expiry: the solver took the request while it was
    // open, and the transaction lands after. Reading this as expired would tell
    // a depositor nothing is coming moments before their USDT arrives.
    const late = { ...solving, deadline: NOW - 600 };
    expect(describeRequest(late, NOW).status).toBe("solving");
  });
});

describe("a request whose approval was revoked", () => {
  // The only "stop" either queue supports (integration guide §7.4): the raw
  // cancel is admin-gated on both vaults, so a depositor prevents a fill by
  // revoking the share approval.
  // The state stays because the widget genuinely observes it — allowance below
  // the offer — and because what it asserts is a negative.
  const stopped: RequestFacts = { ...OPEN, approved: false };

  it("keeps its own state", () => {
    const { status, badge, detail } = describeRequest(stopped, NOW);
    expect(status).toBe("stopped");
    expect(badge).toBe("Stopped");
    expect(detail).toBe(
      "Approval revoked — won't be filled; clears at its deadline"
    );
  });

  it("is only said while there is still something to stop", () => {
    // Past its deadline the request is over whatever the allowance is, and
    // "clears at its deadline" would be describing something that has happened.
    const lapsed = { ...stopped, deadline: NOW - 60 };
    expect(describeRequest(lapsed, NOW).status).toBe("expired");
  });

  it("is not said about a request the solver already holds", () => {
    // The shares were pulled before the approval went; the revoke came too late
    // to stop anything.
    const tooLate = { ...stopped, inSolve: true };
    expect(describeRequest(tooLate, NOW).status).toBe("solving");
  });
});

describe("a request whose deadline has lapsed", () => {
  const expired: RequestFacts = { ...OPEN, deadline: NOW - 86_400 };

  it("says so, and says what to do about it", () => {
    const { status, badge, detail } = describeRequest(expired, NOW);
    expect(status).toBe("expired");
    expect(badge).toBe("Expired");
    expect(detail).toBe("Expired — submit a new request to redeem");
  });

  it("expires the moment the deadline is reached, not a second later", () => {
    expect(describeRequest({ ...OPEN, deadline: NOW }, NOW).status).toBe("expired");
    expect(describeRequest({ ...OPEN, deadline: NOW + 1 }, NOW).status).toBe("open");
  });
});

describe("the vesting note", () => {
  it("is on an open request in a product whose shares can be unvested", () => {
    const { note } = describeRequest(OPEN_30D, NOW);
    expect(note).toContain("capped at what you paid");
    expect(note).toContain("stays open until its deadline");
    expect(note).toContain("Coinchange support");
  });

  it("is not on the product where the lock and the vesting term are one day", () => {
    // Every share the 24h product can redeem has vested, so the gate cannot
    // bind and the note would be a warning about nothing.
    expect(describeRequest(OPEN, NOW).note).toBeNull();
  });

  it("is said again once the deadline has lapsed", () => {
    // The outcome the whole disclosure is about: the solver cannot fill below
    // what a request asks, so one it passes over is never refused with an error
    // — it runs out of time. "Expired" alone leaves a depositor who has just
    // watched that happen with nothing to read.
    const { note } = describeRequest({ ...OPEN_30D, deadline: NOW - 60 }, NOW);
    expect(note).toContain("capped at what you paid");
    expect(note).toContain("wider redemption spread");
    expect(note).toContain("Coinchange support");
  });

  it("is not on a request nothing is waiting on", () => {
    // Filling and stopped each already say why: the solver has it, or the
    // depositor revoked the approval themselves.
    expect(describeRequest({ ...OPEN_30D, inSolve: true }, NOW).note).toBeNull();
    expect(describeRequest({ ...OPEN_30D, approved: false }, NOW).note).toBeNull();
  });

  it("is on neither state of a request in the 24h product", () => {
    expect(describeRequest({ ...OPEN, deadline: NOW - 60 }, NOW).note).toBeNull();
  });

  it("claims nothing about this holder's own shares", () => {
    // Whether these shares have vested needs the entitlement arithmetic, which
    // is stage 2. Both notes are about the product, and hedge.
    expect(describeRequest(OPEN_30D, NOW).note).toContain(
      "may pass this request over"
    );
    expect(
      describeRequest({ ...OPEN_30D, deadline: NOW - 60 }, NOW).note
    ).toContain("can also go unfilled");
    for (const state of [OPEN_30D, { ...OPEN_30D, deadline: NOW - 60 }]) {
      expect(describeRequest(state, NOW).note).not.toMatch(
        /your shares (are|have)/i
      );
    }
  });
});

describe("no state promises a fill", () => {
  const states: RequestFacts[] = [
    OPEN,
    OPEN_30D,
    { ...OPEN, inSolve: true },
    { ...OPEN, approved: false },
    { ...OPEN, deadline: NOW - 86_400 },
    { ...OPEN_30D, deadline: NOW - 86_400 },
  ];

  it("anywhere in its wording", () => {
    // The solver decides fills against facts the widget does not read. The one
    // sentence that names a fill at all is the solver actually holding the
    // request, and the one that names not being filled is the depositor having
    // revoked the approval that would allow it.
    for (const state of states) {
      const { detail, note } = describeRequest(state, NOW);
      expect(`${detail} ${note ?? ""}`).not.toMatch(/fillable/i);
      expect(`${detail} ${note ?? ""}`).not.toMatch(/will be filled/i);
    }
  });
});
