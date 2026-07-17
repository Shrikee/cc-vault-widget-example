import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider } from "connectkit";

import { BoringVaultV1Provider } from "./lib/boringVault";
import { ethersProvider, wagmiConfig } from "./config/wagmi";
import { Toaster } from "./components/Toaster";
import {
  BASE_ASSET,
  CHAIN,
  CONTRACTS,
  DEPOSIT_TOKENS,
  VAULT_DECIMALS,
  WITHDRAW_TOKENS,
} from "./config/vault";

const queryClient = new QueryClient();

// Provider stack from the integration doc §4:
//   WagmiProvider -> QueryClientProvider -> ConnectKitProvider
//     -> BoringVaultV1Provider -> app
// No ChakraProvider: we build a fully custom UI off useBoringVaultV1().
//
// This vault redeems via the AtomicQueue, so we pass `withdrawQueueContract`
// (and no `delayWithdrawContract`) — the queue flow (integration doc §10.2).
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="midnight"
          options={{ enforceSupportedChains: false }}
        >
          <BoringVaultV1Provider
            chain={CHAIN}
            vaultContract={CONTRACTS.vault}
            tellerContract={CONTRACTS.teller}
            accountantContract={CONTRACTS.accountant}
            lensContract={CONTRACTS.lens}
            withdrawQueueContract={CONTRACTS.withdrawQueue}
            ethersProvider={ethersProvider}
            depositTokens={DEPOSIT_TOKENS}
            withdrawTokens={WITHDRAW_TOKENS}
            baseAsset={BASE_ASSET}
            vaultDecimals={VAULT_DECIMALS}
          >
            <Toaster>{children}</Toaster>
          </BoringVaultV1Provider>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
