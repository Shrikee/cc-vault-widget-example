import {
  explorerAddress,
  CONTRACTS,
  BASE_ASSET,
  SHARE_SYMBOL,
} from "../config/vault";
import { formatAmount, formatUsd, shortAddress } from "../lib/format";
import { formatDateTime } from "../lib/time";
import type { VaultMetrics } from "../hooks/useVaultMetrics";
import type { ShareHistory } from "../hooks/useShareHistory";
import type { WindowApy } from "../lib/apy";
import { ApyHero } from "./ApyHero";
import { Badge, Card, InlineError, Stat } from "./ui";

export function VaultStats({
  metrics,
  history,
  windows,
  lastSharePriceUpdateAt,
}: {
  metrics: VaultMetrics;
  history: ShareHistory;
  // The realised trailing APY for each offered window, derived in App.
  windows: WindowApy[] | null;
  lastSharePriceUpdateAt: number | null;
}) {
  const { tvl, shareValue, error } = metrics;
  const baseSymbol = BASE_ASSET.displayName ?? "USDT";

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
          hint={`NAV of 1 ${SHARE_SYMBOL}`}
        />
      </div>

      <dl className="kv">
        <div>
          <dt>Vault ({SHARE_SYMBOL})</dt>
          <dd>
            <a
              href={explorerAddress(CONTRACTS.vault)}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(CONTRACTS.vault)}
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
