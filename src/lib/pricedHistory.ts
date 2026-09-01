// What may be priced from a wallet's history in one product, and why not when
// nothing may be (spec §"When the widget cannot price").
//
// Three reads have to agree before a ceiling means anything: the wallet's
// holder history, the ledger floor that history was scanned from, and the fact
// that the scan finished at all. This module is the one place those three are
// put together, so the withdraw panel's quote card, the position card's
// sub-line and the side rail's request row cannot disagree about whether this
// wallet's HISTORY can be priced from.
//
// The accountant's pause is deliberately NOT folded in here. It is a read about
// the product rather than about this wallet, it arrives from a different hook,
// and each of the three surfaces does something different with it — a card, a
// sub-line, and a row shape. What the three do share is the ORDER they answer
// in, stated once here and referred to there:
//
//   PAUSED, then UNREADABLE, then STILL READING.
//
// The pause leads because it is the live operator state and the only one of the
// three that also closes the post — the contract's gate, not this widget's
// reading — so telling a holder their history failed while the button is
// disabled for another reason sends them to fix the wrong thing.
//
// TWO ABSENCES, HELD APART, and that is the whole point of the type. A history
// that is still being read and a history that could not be read both price
// nothing, but only the second owes a sentence: "couldn't read your history"
// said over a scan still in flight is a claim that is not true yet, and the
// generic vesting disclosure is what stands in until the figures land. So
// `unreadable` is null in both the good case and the reading case, and the
// caller's test for "is there a figure?" stays `history !== null`.
//
// POSTING IS NEVER GATED ON ANY OF IT. Nothing here reaches a submit button:
// the widget never posts what it can establish the solver will skip, and it has
// established nothing when it cannot read. What comes out of this module
// decides what is SAID, never what may be sent (ADR-0003).
//
// Pure — no chain, no React, no clock. The reads are the hooks'
// (src/hooks/useDepositHistory.ts, src/hooks/useLedgerFloor.ts); the meaning is
// here, where ./pricedHistory.test.ts drives it.
import type { HolderEvent } from "../entitlement/entitlement";

// Why nothing may be priced, in the shape a surface writes a sentence from.
// Named rather than collapsed into one string because the two blame different
// things and only one of them is the depositor's chain: a failed read is the
// endpoint's, and a too-young floor is this widget's own configuration.
export type HistoryUnreadable =
  // A chunk failed, a transfer date or rate read failed, or the floor check's
  // own reads did not land. `detail` is the chain's own words.
  | { kind: "read-failed"; detail: string }
  // The registry's ledger floor is younger than the product's vesting term and
  // the vault held shares below it, so a residual lot scanned from it would be
  // quoted as vested — above the solver's ceiling (./floorSoundness.ts).
  | {
      kind: "floor-too-young";
      // The registry's `eventsFromBlock`, as the sentence names it.
      floorBlock: bigint;
      // How old that block is, so the sentence can say it in days.
      ageSeconds: number;
    };

// What the floor check has to say about this product. `checking` is its own
// state rather than an optimistic "sound": nothing is priced from a floor the
// widget has not established, and the check outlives no session.
export type LedgerFloorVerdict =
  | { status: "checking" }
  | { status: "sound" }
  | { status: "unsound"; reason: HistoryUnreadable };

// The wallet scan, narrowed to what pricing cares about — so this module has no
// opinion about the hook's other four statuses (a wallet that never deposited
// still has an entitlement, and its history is simply empty).
export interface ScannedHistory {
  // The scan's holder history, once it has landed. Undefined while it has not,
  // and on a product with no vesting gap, where none is ever derived.
  history?: readonly HolderEvent[];
  // Why the scan failed, in the chain's own words; null while it is reading and
  // once it has read.
  error: string | null;
}

export interface PricedHistory {
  // The history to price from, or null wherever nothing may be priced. Null in
  // BOTH absences, which is what makes it the caller's single test.
  history: readonly HolderEvent[] | null;
  // The reason to say out loud, or null when none is owed — the history is in
  // hand, or it is still on its way.
  unreadable: HistoryUnreadable | null;
}

/**
 * The one decision, made once per product.
 *
 * The floor is answered FIRST and outranks the scan. A history scanned from a
 * floor that cannot be established is not a history worth quoting whatever the
 * scan did, and of the two reasons it is the actionable one: a failed chunk is
 * the endpoint having a bad minute, a too-young floor is the widget shipped
 * wrong.
 */
export function pricedHistory(
  floor: LedgerFloorVerdict,
  scan: ScannedHistory
): PricedHistory {
  if (floor.status === "unsound")
    return { history: null, unreadable: floor.reason };
  if (floor.status === "checking") return { history: null, unreadable: null };

  // A failed scan leaves nothing priceable behind, whatever it managed to fold
  // in first: a history missing a transfer-in quotes an unvested lot at the
  // full share price, which is exactly the over-quote the solver passes over.
  if (scan.error !== null)
    return {
      history: null,
      unreadable: { kind: "read-failed", detail: scan.error },
    };

  return { history: scan.history ?? null, unreadable: null };
}
