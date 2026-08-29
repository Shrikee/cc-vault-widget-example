import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider } from "connectkit";

import { BoringVaultV1Provider } from "./lib/boringVault";
import { ethersProvider, wagmiConfig } from "./config/wagmi";
import { Toaster } from "./components/Toaster";
import type { Vault } from "./lib/vaultRegistry";
import {
  BASE_ASSET,
  CHAIN,
  DEPOSIT_TOKENS,
  WITHDRAW_TOKENS,
} from "./config/vault";

const queryClient = new QueryClient();

// Provider stack from the integration doc §4:
//   WagmiProvider -> QueryClientProvider -> ConnectKitProvider
//     -> Toaster -> app
// No ChakraProvider: we build a fully custom UI off useBoringVaultV1().
//
// The library's own provider is NOT here. It is mounted per product, around the
// panels that write — see VaultWriteProvider below.
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="midnight"
          options={{ enforceSupportedChains: false }}
        >
          <Toaster>{children}</Toaster>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// The library's vault context, mounted for one product, and used only by the
// deposit and withdraw panels — the write paths.
//
// It sits this far down the tree for two reasons. It can only ever hold one
// vault's contracts, and the widget serves two: reads take their vault as an
// argument instead and never come through here. And what it does hold beyond
// those contracts is write state — the live depositStatus and withdrawStatus
// objects the panels drive their toasts from — which belongs to the product
// being acted on.
//
// Hence the key. Switching products remounts the provider, which throws that
// write state away rather than letting a deposit's status linger over the
// product it did not happen in.
//
// This vault redeems via the AtomicQueue, so it is passed
// `withdrawQueueContract` (and no `delayWithdrawContract`) — the queue flow
// (integration doc §10.2).
export function VaultWriteProvider({
  vault,
  children,
}: {
  vault: Vault;
  children: ReactNode;
}) {
  return (
    <BoringVaultV1Provider
      key={vault.id}
      chain={CHAIN}
      vaultContract={vault.addresses.vault}
      tellerContract={vault.addresses.teller}
      accountantContract={vault.addresses.accountant}
      lensContract={vault.addresses.lens}
      withdrawQueueContract={vault.addresses.queue}
      ethersProvider={ethersProvider}
      depositTokens={DEPOSIT_TOKENS}
      withdrawTokens={WITHDRAW_TOKENS}
      baseAsset={BASE_ASSET}
      vaultDecimals={vault.ui.decimals}
    >
      {children}
    </BoringVaultV1Provider>
  );
}
