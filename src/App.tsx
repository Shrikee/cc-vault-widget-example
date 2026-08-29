import { useCallback, useState } from "react";
import { useAccount } from "wagmi";

import { useBoringVaultV1, useEthersSigner } from "./lib/boringVault";
import { useVaultMetrics } from "./hooks/useVaultMetrics";
import { useShareHistory } from "./hooks/useShareHistory";
import { useUserPosition } from "./hooks/useUserPosition";
import { useDepositHistory } from "./hooks/useDepositHistory";
import { useWithdrawRequest } from "./hooks/useWithdrawRequest";
import { usePauseStatus } from "./hooks/usePauseStatus";
import { useWindowApys } from "./hooks/useWindowApys";
import { CHAIN_ID, CHAIN_LABEL, SHARE_SYMBOL, VAULT_NAME } from "./config/vault";
import { DEFAULT_VAULT_ID, ROSTER } from "./config/vaults";
import { vaultById } from "./lib/vaultRegistry";

import { Header } from "./components/Header";
import { NetworkBanner } from "./components/NetworkBanner";
import { PauseBanner } from "./components/PauseBanner";
import { useToast } from "./components/Toaster";
import { VaultStats } from "./components/VaultStats";
import { PositionCard } from "./components/PositionCard";
import { HowItWorks } from "./components/HowItWorks";
import { DepositPanel } from "./components/DepositPanel";
import { WithdrawPanel } from "./components/WithdrawPanel";
import { Card } from "./components/ui";

type Tab = "deposit" | "withdraw";

export function App() {
  // The product every read below is for. It is a constant while one product
  // renders; the chips and the URL parameter that make it a selection are the
  // next change, and they replace this line and nothing else.
  const selectedId = DEFAULT_VAULT_ID;
  const vault = vaultById(ROSTER, selectedId);

  const { isBoringV1ContextReady } = useBoringVaultV1();
  const { address, isConnected, chainId } = useAccount();
  const signer = useEthersSigner({ chainId: CHAIN_ID });
  const rightChain = chainId === CHAIN_ID;

  const [tab, setTab] = useState<Tab>("deposit");

  const metrics = useVaultMetrics(vault);
  const history = useShareHistory();
  const position = useUserPosition(vault, address);
  // The wallet's share-unlock time is the deposit scan's precondition; when the
  // position read failed there is none, and the sub-line says so rather than
  // waiting forever.
  const depositHistory = useDepositHistory(
    address,
    position.unlockAt,
    position.error
  );
  const pause = usePauseStatus();
  const { show } = useToast();
  // The realised trailing APY for every window, derived once here: the hero
  // shows the selected one, the deposit panel's projection always quotes the
  // headline (7 d) figure whatever the toggle shows.
  const apys = useWindowApys(history, metrics);

  // Celebrate a solver fill (guide §9 FILLED): the request vanishing from the
  // queue means the USDT already landed in the user's wallet.
  const onFilled = useCallback(() => {
    show("Redemption filled — USDT has been sent to your wallet", "success");
    metrics.refetch();
    position.refetch();
  }, [show, metrics, position]);
  const withdrawRequest = useWithdrawRequest(address, onFilled);

  // After any successful write, refresh everything the user can see.
  const refreshAll = useCallback(() => {
    metrics.refetch();
    position.refetch();
    withdrawRequest.refetch();
    // The wallet's own deposit is the only thing that moves its average deposit
    // cost: one tail chunk, never a poll.
    depositHistory.refetchTail();
  }, [metrics, position, withdrawRequest, depositHistory.refetchTail]);

  return (
    <div className="app">
      <Header />

      <main className="container">
        <NetworkBanner />
        <PauseBanner status={pause} />

        <div className="hero">
          <h1>Coinchange {VAULT_NAME}</h1>
          <p>
            Deposit USDT to earn yield in {VAULT_NAME} ({SHARE_SYMBOL}).
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
                    sharesHeld={position.shares}
                    shareValue={metrics.shareValue}
                    rightChain={rightChain}
                    paused={pause.depositsPaused}
                    projection={apys.headline}
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
                    paused={pause.withdrawalsPaused}
                    request={withdrawRequest.request}
                    refetchRequest={withdrawRequest.refetch}
                    onSuccess={refreshAll}
                  />
                )}
              </Card>
            </div>

            <aside className="layout__side">
              <VaultStats
                metrics={metrics}
                history={history}
                windows={apys.windows}
                lastSharePriceUpdateAt={pause.lastSharePriceUpdateAt}
              />
              <PositionCard
                connected={isConnected}
                shares={position.shares}
                shareValue={metrics.shareValue}
                unlockAt={position.unlockAt}
                depositHistory={depositHistory}
              />
              <HowItWorks />
            </aside>
          </div>
        )}

        <footer className="site-footer">
          <span>
            Built on{" "}
            <a
              href="https://www.npmjs.com/package/boring-vault-ui/v/1.6.3"
              target="_blank"
              rel="noreferrer"
            >
              boring-vault-ui@1.6.3
            </a>
          </span>
          <span>
            {CHAIN_LABEL} · {SHARE_SYMBOL}
          </span>
        </footer>
      </main>
    </div>
  );
}
