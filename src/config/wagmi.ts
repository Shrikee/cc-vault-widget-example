import { ethers } from "ethers";
import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { getDefaultConfig } from "connectkit";

const RPC_URL =
  import.meta.env.VITE_RPC_URL || "https://ethereum-rpc.publicnode.com";

const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "";

// Read provider — used by every fetch* function in the vault hook. No wallet
// required, so TVL / share value / positions render for anonymous visitors.
export const ethersProvider = new ethers.JsonRpcProvider(RPC_URL, "mainnet");

// Wallet config (viem / wagmi) — drives connection and the JsonRpcSigner used
// for writes (deposit / queueWithdraw / withdrawQueueCancel).
export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [mainnet],
    transports: {
      [mainnet.id]: http(RPC_URL),
    },
    walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
    appName: "Coinchange Yield Prime",
    appDescription:
      "Deposit USDC or USDT into the Coinchange Yield Prime (CCUSD) vault and redeem to USDT.",
  })
);

export const hasWalletConnect = Boolean(WALLETCONNECT_PROJECT_ID);
