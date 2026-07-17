import type { PauseStatus } from "../hooks/usePauseStatus";

// Suspension banner (integration guide §10): when any of the three pause flags
// is set, explain what is suspended instead of letting transactions revert.
export function PauseBanner({ status }: { status: PauseStatus }) {
  if (!status.anyPaused) return null;

  const scope =
    status.depositsPaused && status.withdrawalsPaused
      ? "Deposits and redemptions are"
      : status.depositsPaused
      ? "Deposits are"
      : "Redemptions are";

  return (
    <div className="banner banner--warning" role="alert">
      <span>
        <strong>Vault temporarily suspended.</strong> {scope} paused by the
        operator — usually a short maintenance or safety measure. Your funds are
        safe; open redemption requests won't fill while paused (their deadlines
        keep running). Please check back soon.
      </span>
    </div>
  );
}
