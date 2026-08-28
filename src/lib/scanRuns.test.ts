// Deposit-scan bookkeeping vectors (spec §5.5, §5.7) — src/lib/scanRuns.ts.
//
// Which scan may run, and which may commit what it found. The hook that owns
// the network side keeps this state in a ref and does as it says, so the rules
// that used to be tangled with promises and refs are asserted here instead.
//
// These began as the last section of scripts/apy-vectors.mjs, a plain Node
// script removed in the change that added this file; the rules and their
// expected values are unchanged.
import { describe, expect, it } from "vitest";

import {
  NO_SCANS,
  abandonScan,
  forgetScans,
  isCurrent,
  requestTail,
  settleScan,
  startScan,
  type ScanRun,
  type ScanStep,
} from "./scanRuns";

const KEY_A = "0x4636…30f9:deposited";
const KEY_B = "0xb4b0…cbe0:deposited";

// A step says "store these runs, and start this run if it is not null". A
// vector that goes on to talk about the run it started needs the run itself,
// so it takes it through here rather than asserting on a maybe-null.
function started(step: ScanStep): ScanRun {
  if (step.run === null) throw new Error("expected the step to start a run");
  return step.run;
}

describe("a failed full scan (spec §5.5, §5.7)", () => {
  // No automatic retry — but the next legitimate trigger (the wallet's own
  // deposit succeeding, or an address change) must be able to scan again.
  it("leaves nothing scanned", () => {
    const scan = startScan(NO_SCANS, KEY_A);
    expect(started(scan).from).toBeNull(); // i.e. from the deployment block
    const failed = abandonScan(scan.runs, started(scan));
    expect(failed.runs.key).toBeNull(); // no scanned key survives the failure
    expect(failed.runs.cursor).toBeNull(); // and no cursor to resume from
    expect(failed.runs.running).toBeNull(); // nothing is left running
  });

  it("may be scanned again by the next trigger", () => {
    const scan = startScan(NO_SCANS, KEY_A);
    const failed = abandonScan(scan.runs, started(scan));

    expect(startScan(failed.runs, KEY_A).run?.kind).toBe("full");
    // A tail request falls back to a full scan, from the deployment block.
    const viaTail = requestTail(failed.runs, KEY_A);
    expect(viaTail.run?.kind).toBe("full");
    expect(viaTail.run?.from).toBeNull();
  });
});

// A → B → A while A's first scan is still in flight: the stale run must not
// rewind the cursor or replace the logs when it finally lands.
describe("a scan overtaken by another (spec §5.5)", () => {
  it("is no longer the current run", () => {
    const a1 = startScan(NO_SCANS, KEY_A);
    const b = startScan(a1.runs, KEY_B);
    const a2 = startScan(b.runs, KEY_A);
    expect(isCurrent(a2.runs, started(a1))).toBe(false);
    expect(isCurrent(a2.runs, started(a2))).toBe(true);
  });

  it("may not commit, and may not clear the run that overtook it", () => {
    const a1 = startScan(NO_SCANS, KEY_A);
    const b = startScan(a1.runs, KEY_B);
    const a2 = startScan(b.runs, KEY_A);

    const stale = settleScan(a2.runs, started(a1), 100n);
    expect(stale.run).toBeNull(); // a stale result starts nothing
    expect(stale.runs.cursor).toBeNull(); // and does not move the cursor
    expect(stale.runs.running).toBe(started(a2).generation); // nor unset the run

    const staleFailure = abandonScan(a2.runs, started(a1));
    expect(staleFailure.runs.key).toBe(KEY_A); // does not clear the scan
    expect(staleFailure.runs.running).toBe(started(a2).generation); // nor stop it

    const landed = settleScan(a2.runs, started(a2), 200n);
    expect(landed.runs.cursor).toBe(200n); // the current run does commit
    expect(landed.runs.running).toBeNull(); // and leaves nothing running
  });
});

// The wallet's own deposit is the only trigger there is; losing one leaves the
// new deposit unseen until a reload.
describe("a tail requested during a scan (spec §5.5)", () => {
  it("is queued once, and runs when the scan settles", () => {
    const full = startScan(NO_SCANS, KEY_A);
    const queued = requestTail(full.runs, KEY_A);
    expect(queued.run).toBeNull(); // nothing starts while the scan runs
    expect(queued.runs.pendingTail).toBe(true);

    const queuedTwice = requestTail(queued.runs, KEY_A);
    expect(queuedTwice.runs.pendingTail).toBe(true); // no second tail
    expect(queuedTwice.run).toBeNull();

    const settled = settleScan(queuedTwice.runs, started(full), 500n);
    expect(settled.run?.kind).toBe("tail");
    expect(settled.run?.from).toBe(501n); // resuming just past the cursor
    expect(settled.runs.pendingTail).toBe(false); // the queue is empty again
    expect(settled.runs.running).toBe(started(settled).generation);
  });

  it("becomes the full scan the wallet needs when the scan fails", () => {
    // Settling includes failing: the deposit that triggered the queued tail is
    // still unseen, and the full scan left nothing behind. One deferred
    // trigger, not a retry loop — nothing queues itself.
    const full = startScan(NO_SCANS, KEY_A);
    const queued = requestTail(full.runs, KEY_A);
    const afterFailure = abandonScan(queued.runs, started(full));
    expect(afterFailure.run?.kind).toBe("full");
    expect(afterFailure.runs.pendingTail).toBe(false);
  });
});

describe("an ordinary tail scan (spec §5.5)", () => {
  it("resumes from the cursor", () => {
    const full = startScan(NO_SCANS, KEY_A);
    const scanned = settleScan(full.runs, started(full), 500n);
    const tail = requestTail(scanned.runs, KEY_A);
    expect(tail.run?.kind).toBe("tail");
    expect(tail.run?.from).toBe(501n); // the block after the cursor
  });

  it("keeps what was already scanned when it fails", () => {
    const full = startScan(NO_SCANS, KEY_A);
    const scanned = settleScan(full.runs, started(full), 500n);
    const tail = requestTail(scanned.runs, KEY_A);

    const failed = abandonScan(tail.runs, started(tail));
    expect(failed.runs.key).toBe(KEY_A);
    expect(failed.runs.cursor).toBe(500n);
    // So the next deposit resumes the tail from the same cursor.
    const next = requestTail(failed.runs, KEY_A);
    expect(next.run?.kind).toBe("tail");
    expect(next.run?.from).toBe(501n);
  });
});

// Disconnecting, or an address whose share-unlock time is not resolved yet.
describe("losing the precondition (spec §5.5)", () => {
  it("drops what was scanned", () => {
    const full = startScan(NO_SCANS, KEY_A);
    const scanned = settleScan(full.runs, started(full), 500n);
    const forgotten = forgetScans(scanned.runs);
    expect(forgotten.key).toBeNull();
    expect(forgotten.cursor).toBeNull();
  });

  it("stops an in-flight run from committing, and a later run outranks it", () => {
    const inFlight = startScan(NO_SCANS, KEY_A);
    const forgotten = forgetScans(inFlight.runs);
    expect(isCurrent(forgotten, started(inFlight))).toBe(false);
    expect(started(startScan(forgotten, KEY_A)).generation).toBeGreaterThan(
      started(inFlight).generation
    );
  });
});
