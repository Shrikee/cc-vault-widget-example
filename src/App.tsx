import { useCallback, useState } from "react";
import { useAccount } from "wagmi";

import { useEthersSigner } from "./lib/boringVault";
import { readsById, useRosterReads } from "./hooks/useProductReads";
import { useWithdrawRequest } from "./hooks/useWithdrawRequest";
import { usePauseStatus } from "./hooks/usePauseStatus";
import { useVaultSelection } from "./hooks/useVaultSelection";
import { CHAIN_ID, CHAIN_LABEL } from "./config/chain";
import { DEFAULT_VAULT_ID, ROSTER } from "./config/vaults";
import { VaultWriteProvider } from "./providers";

import { Header } from "./components/Header";
import { NetworkBanner } from "./components/NetworkBanner";
import { PauseBanner } from "./components/PauseBanner";
import { useToast } from "./components/Toaster";
import { VaultStats } from "./components/VaultStats";
import { PositionCard } from "./components/PositionCard";
import { HowItWorks } from "./components/HowItWorks";
import { DepositPanel } from "./components/DepositPanel";
import { WithdrawPanel } from "./components/WithdrawPanel";
import { VaultSwitcher } from "./components/VaultSwitcher";
import { Card } from "./components/ui";

type Tab = "deposit" | "withdraw";

export function App() {
  // The product on show, as the URL says it. Everything below divides in two
  // along that line: what belongs to the selected product — the panels, the
  // stats, the pause banner, the hero, the explainer — and what covers both,
  // which is the chips and the side rail's positions.
  const { selectedId, select } = useVaultSelection(ROSTER, DEFAULT_VAULT_ID);

  const { address, isConnected, chainId } = useAccount();
  const signer = useEthersSigner({ chainId: CHAIN_ID });
  const rightChain = chainId === CHAIN_ID;

  const [tab, setTab] = useState<Tab>("deposit");

  // Every product is read, whichever one is selected: both chips carry their
  // own headline APY and the side rail shows a position in each, so a figure
  // that only existed for the selected product would be a blank card for the
  // one the depositor is not looking at.
  const products = useRosterReads(ROSTER, address);
  const { vault, metrics, history, apys, position, depositHistory } = readsById(
    products,
    selectedId
  );

  const pause = usePauseStatus(vault);
  const { show } = useToast();

  // Celebrate a solver fill (guide §9 FILLED): the request vanishing from the
  // queue means the USDT already landed in the user's wallet.
  const onFilled = useCallback(() => {
    show("Redemption filled — USDT has been sent to your wallet", "success");
    metrics.refetch();
    position.refetch();
  }, [show, metrics, position]);
  // The selected product's queue only. Watching both, and naming the product a
  // fill came from, is the redemptions card's job in a later change.
  const withdrawRequest = useWithdrawRequest(vault, address, onFilled);

  // After any successful write, refresh everything the user can see OF THE
  // PRODUCT IT HAPPENED IN. The other product's figures did not move, and
  // refreshing them would put a spinner over numbers that are still correct.
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
      <Header vault={vault} />

      <main className="container">
        <NetworkBanner />
        <PauseBanner status={pause} />

        <div className="hero">
          <h1>Coinchange {vault.ui.name}</h1>
          <p>
            Deposit USDT to earn yield in {vault.ui.name} ({vault.ui.symbol}).
            To redeem, submit a request — an off-chain solver fills it and sends
            you USDT, no separate claim step.
          </p>
        </div>

        <div className="layout">
          <div className="layout__main">
            {/* The switcher sits above the action panel, and each chip carries
                its product's headline APY: the two returns are side by side, so
                the reason to switch is visible without switching. */}
            <VaultSwitcher
              products={products}
              selectedId={selectedId}
              onSelect={select}
            />

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

              {/* The library's context wraps the write paths and nothing else.
                  Everything outside it reads the chain directly, per vault, so
                  the whole page no longer waits on it to be ready — the two
                  panels say so themselves, beside the button it gates.

                  It is keyed by the selected vault, so switching products
                  remounts it and a deposit's write state cannot linger over the
                  product it did not happen in. */}
              <VaultWriteProvider vault={vault}>
                {tab === "deposit" ? (
                  <DepositPanel
                    vault={vault}
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
                    vault={vault}
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
              </VaultWriteProvider>
            </Card>
          </div>

          <aside className="layout__side">
            <VaultStats
              vault={vault}
              metrics={metrics}
              history={history}
              apys={apys}
              lastSharePriceUpdateAt={pause.lastSharePriceUpdateAt}
            />
            {/* Both products, always: money in the one not being looked at is
                never invisible. */}
            <PositionCard connected={isConnected} products={products} />
            <HowItWorks vault={vault} />
          </aside>
        </div>

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
            {CHAIN_LABEL} · {vault.ui.symbol}
          </span>
        </footer>
      </main>
    </div>
  );
}
