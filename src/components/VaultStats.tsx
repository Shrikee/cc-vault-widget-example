import { explorerAddress } from "../config/chain";
import { BASE_ASSET } from "../config/tokens";
import type { Vault } from "../lib/vaultRegistry";
import { formatAmount, formatUsd, shortAddress } from "../lib/format";
import { formatDateTime } from "../lib/time";
import type { VaultMetrics } from "../hooks/useVaultMetrics";
import type { ShareHistory } from "../hooks/useShareHistory";
import type { WindowApy } from "../lib/apy";
import { ApyHero } from "./ApyHero";
import { Badge, Card, InlineError, Stat } from "./ui";

export function VaultStats({
  vault,
  metrics,
  history,
  windows,
  lastSharePriceUpdateAt,
}: {
  // The product these figures are for; it names the share token and the
  // contract the card links to.
  vault: Vault;
  metrics: VaultMetrics;
  history: ShareHistory;
  // The realised trailing APY for each offered window, derived in App.
  windows: WindowApy[] | null;
  lastSharePriceUpdateAt: number | null;
}) {
  const { tvl, shareValue, error } = metrics;
  const baseSymbol = BASE_ASSET.displayName ?? "USDT";
  const symbol = vault.ui.symbol;

  return (
    <Card
      title="Vault overview"
      subtitle="Live on-chain metrics"
      right={
        // Tells the visitor how fresh the APY and share price are. Omitted
        // until the accountant's last share-price update is known.
        lastSharePriceUpdateAt === null ? null : (
          <Badge tone="neutral">
            as of {formatDateTime(lastSharePriceUpdateAt)}
          </Badge>
        )
      }
    >
      <ApyHero history={history} metrics={metrics} windows={windows} />

      <div className="stat-grid">
        <Stat
          label="Total value locked"
          value={tvl === null ? "…" : formatUsd(tvl, 0)}
          hint={`Denominated in ${baseSymbol}`}
        />
        <Stat
          label="Share price"
          value={
            shareValue === null ? "…" : `${formatAmount(shareValue, 4)} ${baseSymbol}`
          }
          hint={`NAV of 1 ${symbol}`}
        />
      </div>

      <dl className="kv">
        <div>
          <dt>Vault ({symbol})</dt>
          <dd>
            <a
              href={explorerAddress(vault.addresses.vault)}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(vault.addresses.vault)}
            </a>
          </dd>
        </div>
        <div>
          <dt>Base asset</dt>
          <dd>
            <a
              href={explorerAddress(BASE_ASSET.address)}
              target="_blank"
              rel="noreferrer"
            >
              {baseSymbol}
            </a>
          </dd>
        </div>
      </dl>

      <InlineError>{error}</InlineError>
      <InlineError>
        {history.status === "error"
          ? `Couldn't load share-price history: ${history.error}`
          : null}
      </InlineError>
    </Card>
  );
}
