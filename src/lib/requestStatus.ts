// What state an open redemption request is in, and what the widget may say
// about it.
//
// The widget cannot know that a request WILL be filled. Filling is the solver's
// decision, taken against facts this page never reads: its pre-filter declines a
// request whose deadline has passed, whose shares are still inside the deposit
// lock, whose share balance or whose allowance to the queue no longer covers the
// offer, whose asking price sits above the share price after a markdown, and —
// on the 30d product — whose holder has not vested. The last of those is the
// entitlement arithmetic, which is stage 2 (ADR-0002). So a row says the one
// thing the struct it was read from actually establishes: when the deadline
// lapses. That is why "Fillable for N days" is gone from both products, not only
// from the 30d one.
//
// Two states survive that reduction because the widget genuinely observes them.
// `inSolve` is the queue's own flag, set while the solver holds the request.
// And an allowance below the offer is this deployment's "stop" (integration
// guide §7.4): the raw cancel is admin-gated, so revoking the share approval is
// how a depositor prevents a fill, and a request the solver cannot pull shares
// for will not be filled at all — a negative the widget can assert.
//
// The wording lives here rather than in the row because it is a decision — which
// of four states a request is in — and because it has to read the same wherever
// a request is named. Pure: no chain, no React, and no dates, since
// `toLocaleString` answers differently per environment while the states do not.
// The caller renders the deadline itself. ./requestStatus.test.ts drives this
// exact code.
import { formatDuration } from "./time";

export type RequestStatus = "solving" | "stopped" | "open" | "expired";

// One read of one queue's request struct, plus the single product fact the
// wording turns on.
export interface RequestFacts {
  deadline: number; // unix seconds the request stays open until
  inSolve: boolean; // the solver held it when the queue was read
  approved: boolean; // the share allowance to the queue still covers the offer
  // Whether this product's shares can be redeemable and unvested at once —
  // `hasVestingGap`, true on the 30d product and false on the 24h one, where the
  // share lock and the vesting term are the same day. It changes no status: it
  // decides only whether an open request carries the note below, because "this
  // may sit open" is worth saying exactly where a vesting term can cause it.
  vestingGap: boolean;
}

export interface RequestDescription {
  status: RequestStatus;
  tone: "info" | "success" | "warning" | "danger";
  // The badge beside the amount.
  badge: string;
  // The sentence under it. Date-free by design — see the header.
  detail: string;
  // An extra line, or nothing. Only an open request in a vesting product has
  // one, and it is where the depositor is when the copy matters: looking at a
  // request that has not filled. The panels say the same thing forwards, before
  // a deposit and beside the spread control that is the remedy.
  note: string | null;
}

// The note an open request in a vesting product carries.
//
// It says what the widget knows about the PRODUCT — that unvested shares are
// capped at what their holder paid, so the solver can pass a request over rather
// than fill it — and not what it knows about this holder, which is nothing:
// whether these particular shares have vested needs the entitlement arithmetic
// of stage 2. "Capped" is the whole claim on purpose. The cap is not a floor: a
// share price that has fallen below what a holder paid prices them at the share
// price, and this repository holds no support URL, so support is named and not
// linked (ADR-0002).
const VESTING_NOTE =
  "Shares that haven't finished vesting are capped at what you paid, so the " +
  "solver may pass this request over and it stays open until its deadline. If " +
  "it does, ask Coinchange support — the solver records a reason for every " +
  "request it passes over.";

// Order is the decision, and it is not the order the fields are written in:
//
//   • `inSolve` first, because the solver holding a request outranks everything
//     else that could be said about it — including a deadline that lapsed while
//     it was held, which is a fill in flight and not an expiry.
//   • expiry before the approval, because a lapsed request is over whatever its
//     allowance is; "stopped" is only meaningful while there is still something
//     to stop.
export function describeRequest(
  request: RequestFacts,
  now: number
): RequestDescription {
  if (request.inSolve) {
    return {
      status: "solving",
      tone: "success",
      badge: "Filling",
      detail: "Solver is filling your request",
      note: null,
    };
  }
  if (now >= request.deadline) {
    return {
      status: "expired",
      tone: "danger",
      badge: "Expired",
      detail: "Expired — submit a new request to redeem",
      note: null,
    };
  }
  if (!request.approved) {
    return {
      status: "stopped",
      tone: "warning",
      badge: "Stopped",
      detail: "Approval revoked — won't be filled; clears at its deadline",
      note: null,
    };
  }
  return {
    status: "open",
    tone: "info",
    badge: "Open",
    // The whole point of the ticket: an expiry, which the deadline establishes,
    // rather than a fillability the solver alone decides.
    detail: `Expires in ${formatDuration(request.deadline - now)}`,
    note: request.vestingGap ? VESTING_NOTE : null,
  };
}
