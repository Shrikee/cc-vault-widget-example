import type { ReactNode } from "react";

import { SHARE_SYMBOL } from "../config/vault";
import { formatAmount, formatUsd, fmtSignedUsd } from "../lib/format";
import { computeEarnings } from "../lib/apy";
import type { DepositHistory } from "../hooks/useDepositHistory";
import { formatDateTime, formatDuration } from "../lib/time";
import { useNow } from "../hooks/useNow";
import { Badge, Card, InlineError, Stat } from "./ui";

export function PositionCard({
  connected,
  shares,
  shareValue,
  unlockAt,
  depositHistory,
}: {
  connected: boolean;
  shares: number | null;
  shareValue: number | null;
  unlockAt: number | null;
  // Earnings is derived here rather than passed in: the average deposit cost
  // comes from the scan, the shares and share price the card already has.
  depositHistory: DepositHistory;
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

  // Earnings: position value minus what the wallet paid for these shares, at
  // its average deposit cost. Signed — a share price below that cost is a real
  // loss — and toned off the rounded figure so a tenth of a cent reads flat.
  const earningsUsd = computeEarnings(shares, shareValue, depositHistory.avgCost);
  const rounded = earningsUsd === null ? 0 : Number(earningsUsd.toFixed(2));
  const tone = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";

  // The sub-line under Position value. A wallet that never deposited says so
  // (its scan is skipped outright); a wallet that has since exited its whole
  // position gets no sub-line, because the figure would be $0.00 regardless of
  // what it once earned.
  const earningsHint = (): ReactNode => {
    if (depositHistory.status === "none")
      return "Earnings — No deposits found for this wallet.";
    if (depositHistory.status === "error")
      return "Earnings — Couldn't load deposit history.";
    if (depositHistory.status !== "ready" || earningsUsd === null) return "…";
    if (shares === 0) return undefined;
    return (
      <>
        <strong className={`earnings earnings--${tone}`}>
          {fmtSignedUsd(earningsUsd)}
        </strong>{" "}
        earned since your deposits
      </>
    );
  };

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
          hint={earningsHint()}
        />
      </div>

      {depositHistory.status === "error" && (
        <InlineError>
          Couldn't load deposit history: {depositHistory.error}
        </InlineError>
      )}

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
