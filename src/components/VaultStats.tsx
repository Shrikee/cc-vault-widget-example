import {
  explorerAddress,
  CONTRACTS,
  BASE_ASSET,
  SHARE_SYMBOL,
} from "../config/vault";
import { formatAmount, formatUsd, shortAddress } from "../lib/format";
import type { VaultMetrics } from "../hooks/useVaultMetrics";
import { Card, InlineError, Stat } from "./ui";

export function VaultStats({ metrics }: { metrics: VaultMetrics }) {
  const { tvl, shareValue, error } = metrics;
  const baseSymbol = BASE_ASSET.displayName ?? "USDT";

  return (
    <Card title="Vault overview" subtitle="Live on-chain metrics">
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
    </Card>
  );
}
