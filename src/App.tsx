import { useCallback, useState } from "react";
import { useAccount } from "wagmi";

import { useBoringVaultV1, useEthersSigner } from "./lib/boringVault";
import { useVaultMetrics } from "./hooks/useVaultMetrics";
import { useUserPosition } from "./hooks/useUserPosition";
import { useWithdrawRequest } from "./hooks/useWithdrawRequest";
import { CHAIN_ID, SHARE_SYMBOL, VAULT_NAME } from "./config/vault";

import { Header } from "./components/Header";
import { NetworkBanner } from "./components/NetworkBanner";
import { VaultStats } from "./components/VaultStats";
import { PositionCard } from "./components/PositionCard";
import { HowItWorks } from "./components/HowItWorks";
import { DepositPanel } from "./components/DepositPanel";
import { WithdrawPanel } from "./components/WithdrawPanel";
import { Card } from "./components/ui";

type Tab = "deposit" | "withdraw";

export function App() {
  const { isBoringV1ContextReady } = useBoringVaultV1();
  const { address, isConnected, chainId } = useAccount();
  const signer = useEthersSigner({ chainId: CHAIN_ID });
  const rightChain = chainId === CHAIN_ID;

  const [tab, setTab] = useState<Tab>("deposit");

  const metrics = useVaultMetrics();
  const position = useUserPosition(address);
  const withdrawRequest = useWithdrawRequest(address);

  // After any successful write, refresh everything the user can see.
  const refreshAll = useCallback(() => {
    metrics.refetch();
    position.refetch();
    withdrawRequest.refetch();
  }, [metrics, position, withdrawRequest]);

  return (
    <div className="app">
      <Header />

      <main className="container">
        <NetworkBanner />

        <div className="hero">
          <h1>Coinchange {VAULT_NAME}</h1>
          <p>
            Deposit USDC or USDT to earn yield in {VAULT_NAME} ({SHARE_SYMBOL}).
            To redeem, submit a request — an off-chain solver fills it and sends
            you USDT, no separate claim step.
          </p>
        </div>

        {!isBoringV1ContextReady ? (
          <Card>
            <p className="muted">Connecting to vault contracts…</p>
          </Card>
        ) : (
          <div className="layout">
            <div className="layout__main">
              <Card>
                <div className="tabs" role="tablist">
                  <button
                    role="tab"
                    aria-selected={tab === "deposit"}
                    className={`tab ${tab === "deposit" ? "tab--active" : ""}`}
                    onClick={() => setTab("deposit")}
                  >
                    Deposit
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === "withdraw"}
                    className={`tab ${tab === "withdraw" ? "tab--active" : ""}`}
                    onClick={() => setTab("withdraw")}
                  >
                    Withdraw
                  </button>
                </div>

                {tab === "deposit" ? (
                  <DepositPanel
                    signer={signer}
                    address={address}
                    shareValue={metrics.shareValue}
                    rightChain={rightChain}
                    onSuccess={refreshAll}
                  />
                ) : (
                  <WithdrawPanel
                    signer={signer}
                    address={address}
                    shares={position.shares}
                    shareValue={metrics.shareValue}
                    unlockAt={position.unlockAt}
                    rightChain={rightChain}
                    request={withdrawRequest.request}
                    refetchRequest={withdrawRequest.refetch}
                    onSuccess={refreshAll}
                  />
                )}
              </Card>
            </div>

            <aside className="layout__side">
              <VaultStats metrics={metrics} />
              <PositionCard
                connected={isConnected}
                shares={position.shares}
                shareValue={metrics.shareValue}
                unlockAt={position.unlockAt}
              />
              <HowItWorks />
            </aside>
          </div>
        )}

        <footer className="site-footer">
          <span>
            Built on{" "}
            <a
              href="https://www.npmjs.com/package/boring-vault-ui/v/1.6.1"
              target="_blank"
              rel="noreferrer"
            >
              boring-vault-ui@1.6.1
            </a>
          </span>
          <span>Ethereum mainnet · {SHARE_SYMBOL}</span>
        </footer>
      </main>
    </div>
  );
}
