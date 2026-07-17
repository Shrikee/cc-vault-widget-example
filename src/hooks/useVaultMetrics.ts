import { useCallback, useEffect, useRef, useState } from "react";
import { useBoringVaultV1 } from "../lib/boringVault";

export interface VaultMetrics {
  tvl: number | null;
  shareValue: number | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Polls vault-wide metrics. No wallet required — works for anonymous visitors.
// Per the doc's resilience checklist, poll rather than fetch once.
export function useVaultMetrics(pollMs = 45_000): VaultMetrics {
  const { isBoringV1ContextReady, fetchTotalAssets, fetchShareValue } =
    useBoringVaultV1();

  const [tvl, setTvl] = useState<number | null>(null);
  const [shareValue, setShareValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const refetch = useCallback(() => {
    if (!isBoringV1ContextReady || inflight.current) return;
    inflight.current = true;
    setLoading(true);
    Promise.all([fetchTotalAssets(), fetchShareValue()])
      .then(([t, s]) => {
        setTvl(t);
        setShareValue(s);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? "Failed to load vault metrics"))
      .finally(() => {
        inflight.current = false;
        setLoading(false);
      });
  }, [isBoringV1ContextReady, fetchTotalAssets, fetchShareValue]);

  useEffect(() => {
    if (!isBoringV1ContextReady) return;
    refetch();
    const id = window.setInterval(refetch, pollMs);
    return () => window.clearInterval(id);
  }, [isBoringV1ContextReady, refetch, pollMs]);

  return { tvl, shareValue, loading, error, refetch };
}
