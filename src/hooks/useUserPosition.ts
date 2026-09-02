import { useReadContracts } from "wagmi";
import type { Address } from "viem";

import { decodeUserPosition, lensCalls } from "../lib/lens";
import type { Vault } from "../lib/vaultRegistry";
import { useReportedReadError } from "./useReportedReadError";

export interface UserPosition {
  shares: number | null;
  // The same balance in raw share units — null exactly when `shares` is. Every
  // figure on screen reads the float; everything that is POSTED reads this,
  // because 18 decimals do not survive a double and a redemption is exact: MAX
  // offers the whole balance to the wei (src/lib/postingRule.ts).
  sharesRaw: bigint | null;
  // unix seconds; shares locked until this time. 0 ⇒ the wallet has never
  // deposited. null while it is not known for the address asked about.
  unlockAt: number | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// One wallet's holding in one product: share balance and share-lock unlock
// time, both off the shared Lens with this vault's own addresses as arguments.
// Requires a connected address.
//
// The values belong to the address they were read for, and after a wallet
// switch the previous wallet's are not this one's — reporting them as this
// wallet's would, among other things, scan a never-deposited wallet's whole
// deposit history or claim a depositor has none (spec §5.5). That used to need
// a "latest read wins" ref, because the reads were bare promises that could
// resolve out of order. It needs none now: the wallet is one of the call
// arguments, so a read for another address answers under another cache key and
// cannot land here. An address with nothing cached reads as "not known yet",
// which is exactly what a switch should say.
export function useUserPosition(vault: Vault, address?: Address): UserPosition {
  const query = useReadContracts({
    contracts: lensCalls.userPosition(vault, address),
    // Both calls, or neither — see useVaultMetrics.
    allowFailure: false,
    // No retry either. This read is not polled at all: it is refetched when the
    // wallet changes and after a write, so a failure is a failure until one of
    // those happens.
    query: { enabled: Boolean(address), retry: false },
  });

  // Raw error to the console, classified phrase to the card (ADR-0004) — the
  // shared shape in ./useReportedReadError.ts.
  const error = useReportedReadError("user-position read failed", query.error);

  const figures = query.data
    ? decodeUserPosition(query.data, vault.ui.decimals)
    : null;

  return {
    shares: figures?.shares ?? null,
    sharesRaw: figures?.sharesRaw ?? null,
    unlockAt: figures?.unlockAt ?? null,
    loading: query.isFetching,
    error,
    refetch: query.refetch,
  };
}
