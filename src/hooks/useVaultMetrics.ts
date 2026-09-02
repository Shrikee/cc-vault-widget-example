import { useReadContracts } from "wagmi";

import { BASE_ASSET } from "../config/tokens";
import { decodeVaultMetrics, lensCalls } from "../lib/lens";
import type { Vault } from "../lib/vaultRegistry";
import { useReportedReadError } from "./useReportedReadError";

export interface VaultMetrics {
  tvl: number | null;
  shareValue: number | null;
  // The share price undivided, want units per whole share — what a vesting-gap
  // product's exit is priced from (src/lib/withdrawQuote.ts). Spelled the
  // glossary's way: only `shareValue` above is grandfathered. null until the
  // read lands, or after one that failed.
  sharePriceRaw: bigint | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// One product's vault-wide metrics, polled. No wallet required — works for
// anonymous visitors. Per the doc's resilience checklist, poll rather than
// fetch once.
//
// Both figures come off the shared Lens with this vault's own addresses as
// arguments (see ../lib/lens.ts), so the hook reads whichever product it is
// handed and holds no vault of its own.
export function useVaultMetrics(vault: Vault, pollMs = 45_000): VaultMetrics {
  const query = useReadContracts({
    contracts: lensCalls.vaultMetrics(vault),
    // Both calls, or neither: the two figures are read together and a failure
    // in either is the read failing, which is what the library's Promise.all
    // did and what the "—" on screen means.
    allowFailure: false,
    // No retry, as the library's bare promise had none: the poll below is the
    // retry, and a read that failed should say so now rather than after a
    // backoff that hides it. The same stance the log scan takes.
    query: { refetchInterval: pollMs, retry: false },
  });

  // Raw error to the console, classified phrase to the card (ADR-0004) — the
  // shared shape in ./useReportedReadError.ts.
  const error = useReportedReadError("vault-metrics read failed", query.error);

  // A failed poll leaves the last good figures on screen and adds the reason,
  // rather than blanking the card.
  const figures = query.data
    ? decodeVaultMetrics(query.data, BASE_ASSET.decimals)
    : null;

  return {
    tvl: figures?.tvl ?? null,
    // The glossary's term is "share price"; this field keeps the older name its
    // consumers already spell, and renaming it is a job of its own.
    shareValue: figures?.sharePrice ?? null,
    sharePriceRaw: figures?.sharePriceRaw ?? null,
    loading: query.isFetching,
    error,
    refetch: query.refetch,
  };
}
