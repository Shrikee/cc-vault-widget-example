import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { useEthersSigner } from "./lib/boringVault";
import { readsById, useRosterReads } from "./hooks/useProductReads";
import { useVaultSelection } from "./hooks/useVaultSelection";
import { CHAIN_ID, CHAIN_LABEL } from "./config/chain";
import { DEFAULT_VAULT_ID, ROSTER } from "./config/vaults";
import type { RequestRepost } from "./lib/requestRow";
import type { Vault } from "./lib/vaultRegistry";
import { VaultWriteProvider } from "./providers";

import { Header } from "./components/Header";
import { NetworkBanner } from "./components/NetworkBanner";
import { PauseBanner } from "./components/PauseBanner";
import { useToast } from "./components/Toaster";
import { VaultStats } from "./components/VaultStats";
import { PositionCard } from "./components/PositionCard";
import { RedemptionsCard } from "./components/RedemptionsCard";
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
  // which is the chips and the side rail's positions and open redemptions.
  const { selectedId, select } = useVaultSelection(ROSTER, DEFAULT_VAULT_ID);

  const { address, isConnected, chainId } = useAccount();
  const signer = useEthersSigner({ chainId: CHAIN_ID });
  const rightChain = chainId === CHAIN_ID;

  const [tab, setTab] = useState<Tab>("deposit");

  // A re-post asked for from the side rail's request row: which product, and
  // which shares. It is an ASK, not a post — the withdraw panel takes it into
  // the pinned confirm, which prices those shares again at a block of its own,
  // and clears this the moment it has. Held here because the row that offers it
  // is outside the selection and outside the tabs, and the panel that posts is
  // inside both: granting it means switching to that product's withdraw tab.
  const [repost, setRepost] = useState<{
    vaultId: string;
    offer: RequestRepost;
  } | null>(null);
  const askRepost = useCallback(
    // Named for the product the request is IN, the way `onFilled` above names
    // the one that filled — and not `vault`, which is the selected product a
    // few lines down and would be shadowed here. The selection follows it
    // before the panel prices anything, exactly as a stop does.
    (asked: Vault, offer: RequestRepost) => {
      select(asked.id);
      setTab("withdraw");
      setRepost({ vaultId: asked.id, offer });
    },
    [select]
  );

  const { show } = useToast();

  // Celebrate a solver fill (guide §9 FILLED): the request vanishing from the
  // queue means the USDT already landed in the user's wallet.
  //
  // It names the product it came from, because both queues are polled and this
  // fires for whichever one filled — including the product not on screen, which
  // is the case that most needs saying. What the fill moved is refetched by that
  // product's own reads; this is only the telling.
  const onFilled = useCallback(
    (filled: Vault) => {
      show(
        `${filled.ui.name} redemption filled — USDT has been sent to your wallet`,
        "success"
      );
    },
    [show]
  );

  // Every product is read, whichever one is selected: both chips carry their
  // own headline APY, the side rail shows a position in each and lists open
  // requests from both queues, so a figure that only existed for the selected
  // product would be a blank card for the one the depositor is not looking at.
  const products = useRosterReads(ROSTER, selectedId, address, onFilled);
  const {
    vault,
    metrics,
    pause,
    history,
    apys,
    position,
    depositHistory,
    pricing,
    withdrawRequest,
  } = readsById(products, selectedId);

  // The browser tab names the selected product, like the header, hero and
  // footer do. A depositor comparing the two products has them open in two tabs
  // and tells them apart by the strip at the top, and a support link that names
  // a product opens a tab that agrees with it. index.html's static title is the
  // pre-mount default and names both products, because until this runs the page
  // has not resolved which one the URL asked for.
  useEffect(() => {
    document.title = `Coinchange ${vault.ui.name} — ${vault.ui.symbol}`;
  }, [vault]);

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
                    sharesRaw={position.sharesRaw}
                    shareValue={metrics.shareValue}
                    sharePriceRaw={metrics.sharePriceRaw}
                    pricing={pricing}
                    unlockAt={position.unlockAt}
                    rightChain={rightChain}
                    paused={pause.withdrawalsPaused}
                    pricingPaused={pause.pricingPaused}
                    request={withdrawRequest.request}
                    refetchRequest={withdrawRequest.refetch}
                    // Only ever this product's own ask: the selection has
                    // already followed it, and a panel remounted by that switch
                    // reads it on mount.
                    repost={repost?.vaultId === vault.id ? repost.offer : null}
                    onRepostHandled={() => setRepost(null)}
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
                never invisible. That holds twice over for a redemption in
                flight, which is money that has left the wallet and not yet
                arrived — hence the second card, outside the selection and
                outside the tabs. */}
            <PositionCard connected={isConnected} products={products} />
            <RedemptionsCard
              connected={isConnected}
              products={products}
              selectedId={selectedId}
              onSelect={select}
              onRepost={askRepost}
              signer={signer}
              rightChain={rightChain}
            />
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
