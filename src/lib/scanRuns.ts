// Which log scan may run, and which may commit what it found.
//
// A wallet's deposit scan has three moving parts that a pile of refs kept
// getting wrong: a full scan runs once per wallet, a tail scan resumes from
// where the last one stopped, and the wallet can change (or change back) while
// a scan is still in flight. This module is that bookkeeping, pure and on its
// own, so scripts/apy-vectors.mjs pins the rules and the hook only has to do
// what it is told. No React, no network, no bundler globals.
//
// The rules (spec §5.5, §5.7):
//   • One full scan per wallet key; a tail scan resumes from the cursor.
//   • Only the newest run for the current key may commit — a run overtaken by
//     an address switch lands too late and is dropped, cursor and all.
//   • A failed full scan leaves NOTHING scanned, so the next legitimate trigger
//     can scan again. Never a retry on its own: only the wallet's own deposit
//     or an address change starts anything.
//   • A failed tail scan keeps its cursor: everything up to it is still good.
//   • At most one tail may be queued behind a running scan, and it runs when
//     that scan settles — succeeded or failed. A deposit that lands mid-scan
//     must not go unseen.

// A full scan reads the wallet's whole history from the Teller's deployment
// block; a tail scan reads only what is new.
export type ScanKind = "full" | "tail";

export interface ScanRun {
  // Monotonic: the newest run of all wins, which is what makes an overtaken
  // run recognisable when it finally lands.
  generation: number;
  kind: ScanKind;
  // Whose history this run is reading — the caller's opaque wallet key.
  key: string;
  // The block to resume from; null means "from the deployment block".
  from: bigint | null;
}

export interface ScanRuns {
  // The key the cursor (and the caller's folded logs) belong to. null when
  // nothing usable is held: nothing scanned yet, the precondition gone, or a
  // full scan that failed.
  key: string | null;
  // The block the last committed scan reached.
  cursor: bigint | null;
  // Generation of the run in flight, or null when nothing is running.
  running: number | null;
  // One tail waiting for the running scan to settle. At most one: a second
  // request while one waits is the same request.
  pendingTail: boolean;
  generation: number;
}

// What the caller should do: store `runs`, and start `run` if it is not null.
export interface ScanStep {
  runs: ScanRuns;
  run: ScanRun | null;
}

export const NO_SCANS: ScanRuns = {
  key: null,
  cursor: null,
  running: null,
  pendingTail: false,
  generation: 0,
};

function begin(runs: ScanRuns, key: string, kind: ScanKind, from: bigint | null): ScanStep {
  const generation = runs.generation + 1;
  return {
    runs: {
      key,
      // A full scan starts from nothing; a tail keeps the cursor until it
      // commits a new one.
      cursor: kind === "full" ? null : runs.cursor,
      running: generation,
      pendingTail: false,
      generation,
    },
    run: { generation, kind, key, from },
  };
}

// The wallet's one full scan, requested when the precondition first holds for
// a key. A key already scanned (or being scanned) starts nothing.
export function startScan(runs: ScanRuns, key: string): ScanStep {
  if (runs.key === key) return { runs, run: null };
  return begin(runs, key, "full", null);
}

// Everything since the cursor, requested after the wallet's own deposit
// succeeds — the only thing that moves its average deposit cost.
export function requestTail(runs: ScanRuns, key: string): ScanStep {
  // A scan is already reading this wallet — its full scan, or an earlier tail.
  // Queue behind it rather than drop the request (or race it); it runs when
  // that scan settles.
  if (runs.running !== null && runs.key === key) {
    return { runs: { ...runs, pendingTail: true }, run: null };
  }
  // Nothing scanned for this wallet — never scanned, a full scan that failed,
  // or a scan of some other wallet in flight. There is no tail without a
  // cursor, so this is the full scan, and it supersedes whatever was running.
  if (runs.key !== key || runs.cursor === null) {
    return begin(runs, key, "full", null);
  }
  return begin(runs, key, "tail", runs.cursor + 1n);
}

// Whether a run's result is still wanted. A run overtaken by another (an
// address switch, or a switch back) fails this and must touch nothing.
export function isCurrent(runs: ScanRuns, run: ScanRun): boolean {
  return runs.running === run.generation;
}

// A run finished and its logs were folded in: the cursor moves to the block it
// reached, and any queued tail starts now.
export function settleScan(runs: ScanRuns, run: ScanRun, cursor: bigint): ScanStep {
  if (!isCurrent(runs, run)) return { runs, run: null };
  const settled: ScanRuns = {
    key: run.key,
    cursor,
    running: null,
    pendingTail: false,
    generation: runs.generation,
  };
  return runs.pendingTail ? requestTail(settled, run.key) : { runs: settled, run: null };
}

// A run failed. No partial data and no retry: a full scan leaves nothing
// behind (so the next trigger may scan the wallet again), a tail scan keeps
// the cursor it started from (everything up to it is still good).
export function abandonScan(runs: ScanRuns, run: ScanRun): ScanStep {
  if (!isCurrent(runs, run)) return { runs, run: null };
  const abandoned: ScanRuns =
    run.kind === "full"
      ? { ...NO_SCANS, generation: runs.generation }
      : { ...runs, running: null, pendingTail: false };
  // A tail was queued because the wallet deposited while this scan ran: that
  // deposit is still unseen, so the deferred trigger runs now. It cannot loop
  // — only a caller ever queues a tail.
  return runs.pendingTail
    ? requestTail(abandoned, run.key)
    : { runs: abandoned, run: null };
}

// The precondition fell away — disconnected, or an address whose share-unlock
// time is not resolved yet. Nothing held is about this wallet any more, and
// anything in flight is now stale (the generation keeps climbing, so a run
// started later still outranks it).
export function forgetScans(runs: ScanRuns): ScanRuns {
  return { ...NO_SCANS, generation: runs.generation };
}
