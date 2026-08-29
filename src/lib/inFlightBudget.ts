// One in-flight budget, shared by every log scan in the app.
//
// The concurrency limit used to belong to a scan: each call to scanLogs ran its
// own chunks a few at a time, which was right while the widget had one product
// and one scan at a time. It stops being right the moment two products are on
// screen. A cold load now starts a share-price scan and a deposit scan for each
// product, and four scans holding four requests each is sixteen concurrent
// eth_getLogs against an endpoint that rate-limits the whole account
// (src/config/history.ts). The number that matters is the endpoint's, so the
// budget has to be the endpoint's too: one, shared, for the whole app.
//
// The budget counts two things, because the endpoint limits two things. It
// limits how many requests are in flight — that is the number src/config/
// history.ts records — and it limits how many arrive per second, which is what
// QuickNode's 50/s account limit actually is. Concurrency alone is a proxy for
// the second, and a poor one: how many requests four in flight come to depends
// entirely on how fast the endpoint answers. Measured against the archive
// endpoint on 2026-08-28, four in flight ran at 51-57 eth_getLogs a second at
// 68-94 ms latency, and a two-product cold load drew code -32007 — the very
// error the in-flight budget was raised to prevent, arriving by the other door.
// So the budget also paces itself.
//
// The queue is FIFO across scans rather than fair between them. A scan that
// queues behind another therefore starts later than it used to, which is the
// cost of the trade and is why the cold load is slower with two products until
// the scans are windowed (the next ticket).
//
// Pure — no network, no React, no bundler globals — so ./inFlightBudget.test.ts
// drives it with a counting fake and asserts the property that matters: never
// more than N in flight, and every scan still completes.

export interface InFlightBudget {
  // Wait for a slot and for this request's turn in the second, run the task,
  // and hand the slot on. Rejections pass straight through, with the slot
  // released either way.
  run<T>(task: () => Promise<T>): Promise<T>;
}

// Time, so the pacing can be asserted exactly instead of raced against a timer.
// The default is the real one; the vectors pass a clock they move themselves.
export interface BudgetClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const REAL_CLOCK: BudgetClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

export interface BudgetOptions {
  // Requests a second, across every scan. The app always sets it; omitting it
  // paces nothing, which is how the vectors hold the two properties apart —
  // the in-flight count is asserted without the clock in play.
  requestsPerSecond?: number;
  clock?: BudgetClock;
}

export function createInFlightBudget(
  limit: number,
  { requestsPerSecond, clock = REAL_CLOCK }: BudgetOptions = {}
): InFlightBudget {
  const size = Math.max(1, Math.floor(limit));
  // Starts are spaced by this, so a second can never hold more than the rate
  // allows. Evenly rather than in bursts: the limiter counts the burst, not
  // the average.
  const spacingMs =
    requestsPerSecond && requestsPerSecond > 0 ? 1000 / requestsPerSecond : 0;
  // Slots taken, not tasks running: a slot stays taken while it is handed from
  // a finished task to the next waiter, so nothing can slip into the gap
  // between the two. Re-checking `taken < size` on release instead would leave
  // exactly that gap — the release and the waiter resuming are separate
  // microtasks, and a task starting in between would put the budget over.
  let taken = 0;
  const waiting: (() => void)[] = [];

  const acquire = (): Promise<void> => {
    if (taken < size) {
      taken++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiting.push(resolve));
  };

  const release = (): void => {
    const next = waiting.shift();
    if (next) next();
    else taken--;
  };

  // The earliest moment the next request may start. Reserving is synchronous,
  // so two tasks that reach it in the same tick take different slots — which is
  // what makes the spacing hold across scans and not merely within one.
  let nextStartAt = 0;
  const reserveDelay = (): number => {
    if (spacingMs === 0) return 0;
    const now = clock.now();
    const startAt = Math.max(now, nextStartAt);
    nextStartAt = startAt + spacingMs;
    return startAt - now;
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        const delay = reserveDelay();
        if (delay > 0) await clock.sleep(delay);
        return await task();
      } finally {
        release();
      }
    },
  };
}

// Run `fn` over `items` under a budget, preserving order.
//
// Every item is submitted at once and the budget decides when each one starts.
// The first rejection rejects the whole run: no retry, no backoff and no
// partial result, because a scan missing a chunk would silently understate the
// share-price history or a wallet's deposits. Items already queued still run —
// as they did under the per-scan limit, whose remaining workers also kept going
// — they simply have nowhere to be delivered.
export function mapWithBudget<T, R>(
  items: T[],
  budget: InFlightBudget,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  return Promise.all(items.map((item) => budget.run(() => fn(item))));
}
