import { useCallback, useEffect, useState } from "react";
import { useBoringVaultV1 } from "../lib/boringVault";

export interface UserPosition {
  shares: number | null;
  unlockAt: number | null; // unix seconds; shares locked until this time
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// User's share balance + share-lock unlock time. Requires a connected address.
export function useUserPosition(address?: string): UserPosition {
  const { isBoringV1ContextReady, fetchUserShares, fetchUserUnlockTime } =
    useBoringVaultV1();

  const [shares, setShares] = useState<number | null>(null);
  const [unlockAt, setUnlockAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!isBoringV1ContextReady || !address) {
      setShares(null);
      setUnlockAt(null);
      return;
    }
    setLoading(true);
    Promise.all([fetchUserShares(address), fetchUserUnlockTime(address)])
      .then(([s, u]) => {
        setShares(s);
        setUnlockAt(u);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? "Failed to load your position"))
      .finally(() => setLoading(false));
  }, [isBoringV1ContextReady, address, fetchUserShares, fetchUserUnlockTime]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { shares, unlockAt, loading, error, refetch };
}
