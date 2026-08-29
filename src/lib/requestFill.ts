// What it means for a redemption request to have vanished from a queue.
//
// A fill is announced from an ABSENCE: the AtomicQueue struct going to zero.
// That reading is only sound because of what the contract does — `solve` zeroes
// the struct, a replacement re-populates it in place, revoking the share
// approval leaves it exactly as it was, expiry leaves it in place too, and the
// solver cannot fill past the deadline — so an open struct going to zero inside
// its deadline means the USDT has already landed in the wallet, with no claim
// step to wait for.
//
// It lives here rather than inside the effect that observes it because the
// widget now polls BOTH AtomicQueues, one hook instance per product, and the
// ways of being absent WITHOUT having been filled multiply with the second
// queue while looking identical at the call site. Pure — no chain, no React, no
// DOM — so ./requestFill.test.ts drives this exact code.
import type { Address } from "viem";

// One read of one AtomicQueue's `getUserAtomicRequest(user, offer, want)`, in
// raw contract units, tagged with what it was read FOR. The tags are not
// decoration: "did this fill?" is only meaningful between two reads of the same
// queue for the same wallet.
export interface QueueSnapshot {
  // The product whose queue was read. Two products, two queues, two structs.
  vaultId: string;
  // The wallet the struct was read for.
  owner: Address;
  offerAmount: bigint; // shares offered; 0 ⇒ no open request
  deadline: number; // unix seconds the request stays open until
  inSolve: boolean; // the solver held it when this was read
}

// How far past a remembered deadline a zeroing still counts as a fill. The
// queues are polled every 30s, so a fill that landed just inside a deadline can
// be observed just after it; without the grace that fill would be read as an
// expiry and the depositor would never be told their USDT arrived.
export const FILL_GRACE_SECONDS = 60;

// Did this queue read mean the solver filled the request?
//
// Everything below the first line is about the ways a struct can be absent
// without having been filled:
//
//   • Another queue's or another wallet's read. A remembered request answers
//     for the queue and the wallet it was read for, or for nothing.
//   • A first read. Nothing was remembered, so nothing disappeared.
//   • A replacement. The struct is re-populated, not emptied.
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
