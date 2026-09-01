import { useReadContracts } from "wagmi";

import {
  ACCOUNTANT_ABI,
  isAccountantPaused,
  lastRateUpdate,
} from "../lib/lens";
import type { Vault } from "../lib/vaultRegistry";

// The system has three independent pause flags (integration guide §10):
//   • teller.isPaused()          — blocks deposits
//   • accountantState().isPaused — blocks all pricing (getRate*Safe reverts), so
//                                  both deposits and redemption requests fail
//   • queue.isPaused()           — blocks posting/replacing requests and fills
// Poll them and surface a banner instead of letting transactions revert.

const IS_PAUSED_ABI = [
  {
    type: "function",
    name: "isPaused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;

export interface PauseStatus {
  tellerPaused: boolean;
  accountantPaused: boolean;
  queuePaused: boolean;
  // Derived gates for the two user flows.
  depositsPaused: boolean;
  withdrawalsPaused: boolean;
  anyPaused: boolean;
  // The accountant's flag as a surface that PRICES must read it: true while the
  // share price is under review, false while it is not, and null until this
  // poll has answered at all. The booleans above default to "not paused" until
  // then (see below), which is the right stance for gating a transaction and
  // the wrong one for quoting a number — the auto-pause stores the
  // out-of-bounds rate BEFORE pausing, so the unguarded rate the Lens serves
  // while paused is the number under review, and a flag nobody has read yet is
  // not permission to price against it (spec §"When the widget cannot price").
  // Only the accountant: a paused queue blocks posting, not pricing.
  pricingPaused: boolean | null;
  // When the accountant last posted a share price, in unix seconds; null until
  // the first poll resolves (or if it never has). Read off the accountantState()
  // poll above, so it costs no extra request and is at most 30 s stale.
  lastSharePriceUpdateAt: number | null;
}

// The three flags belong to one product's contracts, so the vault being looked
// at is the argument: a pause on the other product must not block a page the
// visitor can actually use.
export function usePauseStatus(vault: Vault): PauseStatus {
  const { data } = useReadContracts({
    contracts: [
      {
        address: vault.addresses.teller,
        abi: IS_PAUSED_ABI,
        functionName: "isPaused",
      },
      {
        address: vault.addresses.accountant,
        abi: ACCOUNTANT_ABI,
        functionName: "accountantState",
      },
      {
        address: vault.addresses.queue,
        abi: IS_PAUSED_ABI,
        functionName: "isPaused",
      },
    ],
    query: { refetchInterval: 30_000 },
  });

  // On read failure, err on the side of "not paused" — the flow still surfaces
  // the real revert, and we avoid falsely locking the UI on an RPC hiccup. That
  // is the right stance for GATING A TRANSACTION and the wrong one for quoting
  // a number, which is why `pricingPaused` below is derived separately.
  const tellerPaused = data?.[0]?.result === true;
  const queuePaused = data?.[2]?.result === true;

  // The struct's fields, through the accessors in src/lib/lens.ts rather than
  // by index here. They are positional, so an index is a number that looks
  // right in a diff whichever field it points at — and this hook and the
  // confirm pin read the SAME two, which is exactly the pair that must never
  // drift apart.
  const state = data?.[1]?.result;
  const accountantPaused = state !== undefined && isAccountantPaused(state);

  // When the accountant last posted a share price. 0 means none ever has been,
  // which is no more knowable than an unresolved poll, so both collapse to null
  // and the caller omits the badge.
  const lastUpdate = state === undefined ? null : lastRateUpdate(state);
  const lastSharePriceUpdateAt =
    lastUpdate === null || lastUpdate === 0 ? null : lastUpdate;

  return {
    tellerPaused,
    accountantPaused,
    queuePaused,
    depositsPaused: tellerPaused || accountantPaused,
    withdrawalsPaused: queuePaused || accountantPaused,
    anyPaused: tellerPaused || accountantPaused || queuePaused,
    // NOT `accountantPaused` above, and the difference is the whole point.
    // `useReadContracts` allows failures per call, so a batch where only the
    // accountant read failed comes back DEFINED with an undefined result — and
    // collapsing that to `false` would hand every priced surface permission to
    // quote against a flag that never landed. One unread state, however the
    // read failed to arrive: unresolved batch, failed call, or reverted call.
    pricingPaused: state === undefined ? null : isAccountantPaused(state),
    lastSharePriceUpdateAt,
  };
}
