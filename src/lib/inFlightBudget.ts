// One in-flight budget, shared by every log scan in the app.
//
// The concurrency limit used to belong to a scan: each call to scanLogs ran its
// own chunks a few at a time, which was right while the widget had one product
// and one scan at a time. It stops being right the moment two products are on
// screen. A cold load now starts a share-price scan and a deposit scan for each
// product, and four scans holding four requests each is sixteen concurrent
// eth_getLogs against an endpoint where 4 is measured safe and 8 already trips
// the rate limiter with code -32007 (src/config/history.ts). The number that
// matters is the endpoint's, so the budget has to be the endpoint's too: one,
// shared, for the whole app.
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
  // Wait for a slot, run the task, and hand the slot on. Rejections pass
  // straight through, with the slot released either way.
  run<T>(task: () => Promise<T>): Promise<T>;
  // The budget as it was actually applied — at least one, whatever it was
  // configured with.
  readonly limit: number;
}

export function createInFlightBudget(limit: number): InFlightBudget {
  const size = Math.max(1, Math.floor(limit));
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

  return {
    limit: size,
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
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
