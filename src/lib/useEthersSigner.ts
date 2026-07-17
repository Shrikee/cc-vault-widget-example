import { useMemo } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { useConnectorClient, type Config } from "wagmi";
import type { Account, Chain, Client, Transport } from "viem";

// Local reimplementation of boring-vault-ui's `useEthersSigner`.
//
// The library ships this hook at "boring-vault-ui/dist/hooks/ethers", but the
// package's `exports` map only exposes "." and "./types", so that deep path is
// unreachable under bundlers that honor `exports` (Vite/webpack 5/esbuild) — and
// it is NOT re-exported from the root. This is the standard, well-documented
// viem-WalletClient -> ethers JsonRpcSigner adapter (same code the library uses).
function clientToSigner(client: Client<Transport, Chain, Account>) {
  const { account, chain, transport } = client;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  const provider = new BrowserProvider(transport, network);
  return new JsonRpcSigner(provider, account.address);
}

export function useEthersSigner({ chainId }: { chainId?: number } = {}):
  | JsonRpcSigner
  | undefined {
  const { data: client } = useConnectorClient<Config>({ chainId });
  return useMemo(
    () => (client ? clientToSigner(client) : undefined),
    [client]
  );
}
