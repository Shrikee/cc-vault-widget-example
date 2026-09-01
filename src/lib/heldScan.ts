// The latest settled wallet scan, kept where the confirm step can tail from it.
//
// A wallet's scan is owned by ONE hook per wallet-in-product
// (src/hooks/useDepositHistory.ts): it holds the raw logs and the cursor it
// reached, recomputes both derivations over the whole set, and renders only the
// derived figures. The confirm step needs something else — to run one more tail
// FROM EXACTLY WHERE THAT SCAN STOPPED and fold it into exactly those logs, so
// the pinned history is the scanned history plus the gap and nothing else.
//
// The two are in different subtrees of one render and the cursor is bookkeeping
// rather than a rendered figure, so it is published here instead of threaded
// through every component between them. That is the whole of it: a
// module-scoped cache keyed by wallet-in-product (./scanRuns.ts's `scanKey`),
// written only by the hook that owns the scan and read only by the pin.
//
// Two properties keep it honest:
//
//   • THE KEY CARRIES THE WALLET AND THE PRODUCT. A scan held for one wallet
//     can never be tailed for another, or one product's for the other's, which
//     is the same guarantee the scan's own bookkeeping gives.
//   • IT IS DROPPED WHENEVER THE HELD LOGS ARE. The scan hook resets its logs
//     and drops its entry through one helper, so there is no path that keeps a
//     cursor whose logs are gone — a failed full scan, a wallet or product
//     switch, and a re-scan from the floor all clear both together. A tail can
//     therefore never fold into logs that are not the ones it resumed from.
import type { WalletScan } from "./walletScan";

export interface HeldScan {
  scan: WalletScan;
  // The block the scan reached. A tail resumes at `cursor + 1`.
  cursor: bigint;
}

const held = new Map<string, HeldScan>();

// Publish what a settled scan is holding. Called once per settled run, with the
// same objects the hook keeps — nothing is copied, so this costs no memory the
// scan was not already using.
export function holdScan(key: string, scan: WalletScan, cursor: bigint): void {
  held.set(key, { scan, cursor });
}

// What is held for this wallet-in-product, or null when nothing is — no scan
// yet, a failed one, or a wallet that was switched away from.
export function heldScan(key: string): HeldScan | null {
  return held.get(key) ?? null;
}

export function dropScan(key: string): void {
  held.delete(key);
}
