import { ethers } from "ethers";
import { createConfig, http } from "wagmi";
import { polygon } from "wagmi/chains";
import { getDefaultConfig } from "connectkit";

import { CHAIN_ID } from "./vault";

const RPC_URL =
  import.meta.env.VITE_RPC_URL || "https://polygon-rpc.com";

const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "";

// Read provider — used by every fetch* function in the vault hook. No wallet
// required, so TVL / share value / positions render for anonymous visitors.
//
// Pin the network by chain id rather than by name: ethers has no "polygon"
// alias (its registered name is "matic"), so passing CHAIN as a string here
// would throw "unknown network".
export const ethersProvider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);

// Wallet config (viem / wagmi) — drives connection and the JsonRpcSigner used
// for writes (deposit / queueWithdraw / withdrawQueueCancel).
export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [polygon],
    transports: {
      [polygon.id]: http(RPC_URL),
    },
    walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
    appName: "Coinchange Yield Prime",
    appDescription:
      "Deposit USDT into the Coinchange Yield Prime (CCUSD) vault on Polygon and redeem to USDT.",
  })
);

export const hasWalletConnect = Boolean(WALLETCONNECT_PROJECT_ID);
