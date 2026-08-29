// The global in-flight budget (spec, "RPC budget") — src/lib/inFlightBudget.ts.
//
// The property under test is the one the endpoint cares about: however many
// scans are running, no more than the budgeted number of requests are ever in
// flight at once, and every scan still completes. It is asserted with a
// counting fake — a stand-in for eth_getLogs that records its own concurrency
// and finishes only when this test says so — because the real thing is a
// network call and the number that matters (4, measured safe against
// QuickNode's 50 req/s limit; 8 trips it with code -32007) is about the
// endpoint, not about any one scan.
import { describe, expect, it } from "vitest";

import { createInFlightBudget, mapWithBudget } from "./inFlightBudget";

// A fake chunk request. It never resolves on its own: `settle` finishes every
// request that has started, which is what makes the concurrency deterministic
// rather than a race against the event loop.
class CountingRequests {
  inFlight = 0;
  peak = 0;
  // Every item ever passed to the fake, in the order the budget started them.
  started: string[] = [];
  private waiting: (() => void)[] = [];

  request = (item: string): Promise<string> => {
    this.started.push(item);
    this.inFlight++;
    this.peak = Math.max(this.peak, this.inFlight);
    return new Promise<string>((resolve) => {
      this.waiting.push(() => {
        this.inFlight--;
        resolve(`${item}!`);
      });
    });
  };

  // The same, for a chunk that fails: it rejects instead of resolving.
  failing = (fails: string) => (item: string) =>
    item === fails
      ? this.request(item).then(() => {
          throw new Error(`chunk ${item} failed`);
        })
      : this.request(item);

  // Run until nothing is left waiting: each wave lets every request the budget
  // is willing to start register itself, then finishes all of them, which
  // hands the freed slots to whatever queued behind them.
  async settle(): Promise<void> {
    for (let wave = 0; wave < 500; wave++) {
      await new Promise((r) => setTimeout(r, 0));
      if (this.waiting.length === 0) return;
      for (const finish of this.waiting.splice(0)) finish();
    }
    throw new Error("the scans never settled");
  }
}

const chunks = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("several scans sharing one budget", () => {
  it("never puts more than the budget in flight, and all of them complete", async () => {
    const budget = createInFlightBudget(4);
    const chain = new CountingRequests();

    // Four scans started together — the shape that made the per-scan limit a
    // problem: four scans at four each was sixteen concurrent requests.
    const scans = ["a", "b", "c", "d"].map((prefix) =>
      mapWithBudget(chunks(prefix, 6), budget, chain.request)
    );
    await chain.settle();
    const results = await Promise.all(scans);

    expect(chain.peak).toBe(4);
    expect(chain.inFlight).toBe(0);
    // Every chunk of every scan, exactly once, and in the scan's own order.
    expect(chain.started).toHaveLength(24);
    expect(results[0]).toEqual(chunks("a", 6).map((c) => `${c}!`));
    expect(results[3]).toEqual(chunks("d", 6).map((c) => `${c}!`));
  });

  it("starts nothing beyond the budget before a slot frees", async () => {
    const budget = createInFlightBudget(2);
    const chain = new CountingRequests();

    const scan = mapWithBudget(chunks("a", 5), budget, chain.request);
    // The budget is two, so two chunks are in flight and three are queued —
    // whatever the scan asked for.
    await new Promise((r) => setTimeout(r, 0));
    expect(chain.started).toEqual(["a0", "a1"]);

    await chain.settle();
    await expect(scan).resolves.toHaveLength(5);
    expect(chain.peak).toBe(2);
  });
});

describe("a failed chunk (the existing contract)", () => {
  it("fails its whole scan, with no retry and no partial data", async () => {
    const budget = createInFlightBudget(3);
    const chain = new CountingRequests();

    const scan = mapWithBudget(chunks("a", 5), budget, chain.failing("a2"));
    const settled = chain.settle();
    await expect(scan).rejects.toThrow("chunk a2 failed");
    await settled;

    // Attempted once, never retried — the scan is simply gone, and with it
    // every chunk it did read.
    expect(chain.started.filter((c) => c === "a2")).toEqual(["a2"]);
  });

  it("leaves the budget's slots free for the scans that follow", async () => {
    const budget = createInFlightBudget(2);
    const chain = new CountingRequests();

    const failed = mapWithBudget(chunks("a", 4), budget, chain.failing("a0"));
    const settling = chain.settle();
    await expect(failed).rejects.toThrow();
    await settling;

    const next = mapWithBudget(chunks("b", 3), budget, chain.request);
    await chain.settle();
    await expect(next).resolves.toEqual(chunks("b", 3).map((c) => `${c}!`));
    expect(chain.inFlight).toBe(0);
    expect(chain.peak).toBe(2);
  });
});

describe("one scan on its own", () => {
  it("is unaffected by the budget when it fits inside it", async () => {
    const budget = createInFlightBudget(4);
    const chain = new CountingRequests();

    const scan = mapWithBudget(chunks("a", 3), budget, chain.request);
    await chain.settle();

    await expect(scan).resolves.toEqual(["a0!", "a1!", "a2!"]);
    expect(chain.peak).toBe(3);
  });

  it("has a budget of at least one, whatever it was configured with", async () => {
    const chain = new CountingRequests();
    const scan = mapWithBudget(chunks("a", 2), createInFlightBudget(0), chain.request);
    await chain.settle();
    await expect(scan).resolves.toHaveLength(2);
    expect(chain.peak).toBe(1);
  });
});

// A clock the test owns: nothing ever waits, and time jumps to whatever is
// waiting next. Pacing is then asserted exactly rather than raced against a
// real timer.
function fakeClock() {
  let now = 0;
  let waiters: { at: number; wake: () => void }[] = [];

  return {
    now: () => now,
    sleep: (ms: number) =>
      new Promise<void>((wake) => {
        waiters.push({ at: now + ms, wake });
      }),
    // Run `work` to completion, advancing to the next wake-up whenever nothing
    // else can proceed — the event loop a real timer would give, without the
    // waiting.
    async run<T>(work: Promise<T>): Promise<T> {
      let running = true;
      const finished = work.then(
        (v) => {
          running = false;
          return v;
        },
        (e) => {
          running = false;
          throw e;
        }
      );
      finished.catch(() => {}); // an early rejection is the test's to assert
      for (let step = 0; step < 1000 && running; step++) {
        await new Promise((r) => setTimeout(r, 0));
        if (!running || waiters.length === 0) continue;
        now = Math.max(now, Math.min(...waiters.map((w) => w.at)));
        const due = waiters.filter((w) => w.at <= now);
        waiters = waiters.filter((w) => w.at > now);
        for (const w of due) w.wake();
      }
      return finished;
    },
  };
}

// Concurrency is a proxy for what the endpoint actually limits, and a poor one:
// QuickNode counts 50 REQUESTS PER SECOND, so what four in flight come to
// depends entirely on how fast the endpoint answers. Measured against the
// archive endpoint on 2026-08-28, four in flight ran at 51-57 req/s at 68-94 ms
// latency and drew code -32007 on a two-product cold load. The budget therefore
// paces itself as well as counting itself.
describe("the rate the budget runs at", () => {
  it("starts no more requests in a second than it is allowed", async () => {
    const clock = fakeClock();
    const budget = createInFlightBudget(4, { requestsPerSecond: 4, clock });

    const starts: number[] = [];
    await clock.run(
      mapWithBudget(chunks("a", 9), budget, async () => {
        starts.push(clock.now());
      })
    );

    expect(starts).toHaveLength(9);
    // Every one-second window, not just the first: a burst that repaid itself
    // later would still be a burst.
    for (const start of starts) {
      const inWindow = starts.filter((t) => t >= start && t < start + 1000);
      expect(inWindow.length).toBeLessThanOrEqual(4);
    }
    // Spaced evenly rather than four at once and a wait — the limiter counts
    // the burst, not the average.
    expect(starts).toEqual([0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000]);
  });

  it("paces scans against each other, not just within one", async () => {
    const clock = fakeClock();
    const budget = createInFlightBudget(4, { requestsPerSecond: 4, clock });

    const starts: number[] = [];
    const record = async () => {
      starts.push(clock.now());
    };
    await clock.run(
      Promise.all([
        mapWithBudget(chunks("a", 3), budget, record),
        mapWithBudget(chunks("b", 3), budget, record),
      ])
    );

    expect(starts).toEqual([0, 250, 500, 750, 1000, 1250]);
  });

  it("does not pace at all when no rate is set", async () => {
    const clock = fakeClock();
    const budget = createInFlightBudget(2, { clock });

    const starts: number[] = [];
    await clock.run(
      mapWithBudget(chunks("a", 6), budget, async () => {
        starts.push(clock.now());
      })
    );

    expect(starts).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
