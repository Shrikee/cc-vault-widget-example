// Open redemption requests, across both queues.
//
// The two products have SEPARATE AtomicQueues — deliberately, so that pausing
// one product's queue cannot halt the other's redemptions — and a wallet can
// hold an open request in both at once. Both are polled, and the side rail
// lists whatever either of them holds regardless of which product is selected
// or which tab is open, so money in flight is never hidden by looking
// elsewhere.
//
// Two decisions come with that, and they live here because they are decisions
// rather than plumbing: what it means for a request to have been FILLED, and
// which of the two queues' requests the card lists. Pure — no chain, no React,
// no DOM — so ./redemptions.test.ts drives this exact code.

// One read of one AtomicQueue's `getUserAtomicRequest(user, offer, want)`, in
// raw contract units, tagged with what it was read FOR. The tags are not
// decoration: the answer to "did this fill?" is only meaningful between two
// reads of the same queue for the same wallet, and with two queues polled
// there is now more than one way for that to be untrue.
export interface QueueSnapshot {
  // The product whose queue was read. Two products, two queues, two structs.
  vaultId: string;
  // The wallet the struct was read for.
  owner: string;
  offerAmount: bigint; // shares offered; 0 ⇒ no open request
  deadline: number; // unix seconds the request stays fillable until
  inSolve: boolean; // the solver held it when this was read
}

// How far past a remembered deadline a zeroing still counts as a fill. The
// queues are polled every 30s, so a fill that landed just inside a deadline can
// be observed just after it; without the grace that fill would be reported as
// an expiry and the depositor would never be told their USDT arrived.
export const FILL_GRACE_SECONDS = 60;

// Did this queue read mean the solver filled the request?
//
// The contract makes the absence readable: `solve` zeroes the struct, and
// nothing else does within the deadline. A replacement re-populates it in
// place, "stop" (revoking the share approval) leaves it exactly as it was,
// expiry leaves it in place too, and the solver cannot fill past the deadline.
// So an open struct going to zero, inside its deadline, means the USDT already
// landed in the wallet — there is no claim step to wait for.
//
// Everything else here is about the ways a struct can be absent WITHOUT having
// been filled, which is where two queues make the mistake easy to make:
//
//   • The other product's queue answering. Each product's request is polled by
//     its own hook instance, but a remembered request still answers only for
//     the queue it was read from — never for the other one, and never for a
//     hook that has been handed a different vault.
//   • A wallet switch. The previous wallet's request is not this one's.
//   • A first read. Nothing was remembered, so nothing disappeared.
//   • An admin cleanup long after the deadline. Zeroing an expired struct pays
//     nobody, and announcing it as a fill would be a lie about money.
export function isFillTransition(
  prev: QueueSnapshot | null,
  next: QueueSnapshot,
  now: number
): boolean {
  if (!prev) return false;
  if (prev.vaultId !== next.vaultId) return false;
  if (prev.owner !== next.owner) return false;
  if (prev.offerAmount === 0n || next.offerAmount !== 0n) return false;
  return prev.inSolve || now <= prev.deadline + FILL_GRACE_SECONDS;
}

// A product whose request is known to be there, so the row rendering it needs
// no null check for something the card already decided.
export type WithOpenRequest<P extends { request: unknown }> = P & {
  request: NonNullable<P["request"]>;
};

// The products with an open request, in the order they were given — which is
// the roster's order, so the two rows do not reshuffle under a depositor when
// one queue's poll resolves before the other's.
//
// The selection is deliberately not a parameter. The card exists precisely so
// that what is on screen does not decide what money is visible.
export function openRedemptions<P extends { request: unknown }>(
  products: readonly P[]
): WithOpenRequest<P>[] {
  return products.filter(
    (product): product is WithOpenRequest<P> => product.request != null
  );
}
