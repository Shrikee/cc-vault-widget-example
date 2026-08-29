import { useReadContracts } from "wagmi";

import { CHAIN_ID } from "../config/chain";
import { BASE_ASSET } from "../config/tokens";
import { decodeVaultMetrics, lensCalls } from "../lib/lens";
import { errorMessage } from "../lib/logScan";
import type { Vault } from "../lib/vaultRegistry";

export interface VaultMetrics {
  tvl: number | null;
  shareValue: number | null;
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
  const [totalAssets, exchangeRate] = lensCalls.vaultMetrics(vault);

  const query = useReadContracts({
    // Both calls, or neither: the two figures are read together and a failure
    // in either is the read failing, which is what the library's Promise.all
    // did and what the "—" on screen means.
    allowFailure: false,
    // Pinned to the vault's chain rather than the connected wallet's. The
    // library read through its own Polygon provider, so a wallet on the wrong
    // network still saw TVL and the share price behind the switch-network
    // banner; leaving the chain to the connection would take that away.
    contracts: [
      { ...totalAssets, chainId: CHAIN_ID },
      { ...exchangeRate, chainId: CHAIN_ID },
    ],
    query: { refetchInterval: pollMs },
  });

  // A failed poll leaves the last good figures on screen and adds the reason,
  // rather than blanking the card.
  const figures = query.data
    ? decodeVaultMetrics(query.data, BASE_ASSET.decimals)
    : null;

  return {
    tvl: figures?.tvl ?? null,
    shareValue: figures?.shareValue ?? null,
    loading: query.isFetching,
    error: query.error ? errorMessage(query.error) : null,
    refetch: query.refetch,
  };
}
