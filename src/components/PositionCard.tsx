import { SHARE_SYMBOL } from "../config/vault";
import { formatAmount, formatUsd } from "../lib/format";
import { formatDateTime, formatDuration } from "../lib/time";
import { useNow } from "../hooks/useNow";
import { Badge, Card, Stat } from "./ui";

export function PositionCard({
  connected,
  shares,
  shareValue,
  unlockAt,
}: {
  connected: boolean;
  shares: number | null;
  shareValue: number | null;
  unlockAt: number | null;
}) {
  const now = useNow();

  if (!connected) {
    return (
      <Card title="Your position">
        <p className="muted">Connect your wallet to view your position.</p>
      </Card>
    );
  }

  // shareValue is NAV per share in USDT (≈ USD), so position value ≈ USD.
  const positionValue =
    shares !== null && shareValue !== null ? shares * shareValue : null;
  const locked = unlockAt !== null && now < unlockAt;
  const secsLeft = unlockAt !== null ? unlockAt - now : 0;

  return (
    <Card
      title="Your position"
      right={
        locked ? (
          <Badge tone="warning">Locked</Badge>
        ) : shares && shares > 0 ? (
          <Badge tone="success">Unlocked</Badge>
        ) : null
      }
    >
      <div className="stat-grid">
        <Stat
          label={`Your ${SHARE_SYMBOL}`}
          value={shares === null ? "…" : formatAmount(shares, 4)}
        />
        <Stat
          label="Position value"
          value={positionValue === null ? "…" : formatUsd(positionValue, 2)}
        />
      </div>

      {locked && (
        <div className="notice notice--warning">
          <strong>Shares locked for {formatDuration(secsLeft)}.</strong>
          <span>
            Unlocks {formatDateTime(unlockAt!)} ({" "}
            {Math.max(0, Math.ceil(secsLeft / 86400))}d remaining). You can
            redeem after this.
          </span>
        </div>
      )}
    </Card>
  );
}
