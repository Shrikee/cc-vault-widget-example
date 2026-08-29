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
