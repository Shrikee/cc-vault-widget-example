import { useCallback, useEffect, useRef, useState } from "react";
import { useBoringVaultV1 } from "../lib/boringVault";

export interface UserPosition {
  shares: number | null;
  // unix seconds; shares locked until this time. 0 ⇒ the wallet has never
  // deposited. null while it is not known for the address asked about.
  unlockAt: number | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// What one read resolved, kept with the address it was read for.
interface ResolvedPosition {
  address: string;
  shares: number | null;
  unlockAt: number | null;
}

// User's share balance + share-lock unlock time. Requires a connected address.
export function useUserPosition(address?: string): UserPosition {
  const { isBoringV1ContextReady, fetchUserShares, fetchUserUnlockTime } =
    useBoringVaultV1();

  const [resolved, setResolved] = useState<ResolvedPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the newest read may land: switching wallets twice in quick succession
  // can resolve out of order, and the older answer is not the current one.
  const latestRead = useRef(0);

  const refetch = useCallback(() => {
    const read = ++latestRead.current;
    setError(null);
    if (!isBoringV1ContextReady || !address) {
      setResolved(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([fetchUserShares(address), fetchUserUnlockTime(address)])
      .then(([s, u]) => {
        if (latestRead.current !== read) return;
        setResolved({ address, shares: s, unlockAt: u });
      })
      .catch((e) => {
        if (latestRead.current !== read) return;
        setError(e?.message ?? "Failed to load your position");
      })
      .finally(() => {
        if (latestRead.current === read) setLoading(false);
      });
  }, [isBoringV1ContextReady, address, fetchUserShares, fetchUserUnlockTime]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // The values belong to the address they were read for. After a switch the
  // previous wallet's are not this one's — reporting them as this wallet's
  // would, among other things, scan a never-deposited wallet's whole deposit
  // history or claim a depositor has none (spec §5.5).
  const current = resolved && resolved.address === address ? resolved : null;

  return {
    shares: current?.shares ?? null,
    unlockAt: current?.unlockAt ?? null,
    loading,
    error,
    refetch,
  };
}
