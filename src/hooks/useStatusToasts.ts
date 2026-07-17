import { useEffect, useRef } from "react";
import { useToast } from "../components/Toaster";
import { explorerTx } from "../config/vault";
import type { DepositStatus, WithdrawStatus } from "../lib/boringVault";

type Status = DepositStatus | WithdrawStatus;

// Drives loading / success / error toasts off a live status object from the
// vault hook. `active` lets a panel ignore status changes caused by a sibling
// action (deposit & all withdraw actions share one status object each).
export function useStatusToasts(
  status: Status,
  active: boolean,
  labels: { loading: string; success: string }
) {
  const { show, dismiss } = useToast();
  const loadingId = useRef<number | null>(null);

  const clearLoading = () => {
    if (loadingId.current !== null) {
      dismiss(loadingId.current);
      loadingId.current = null;
    }
  };

  useEffect(() => {
    if (!active) return;

    if (status.loading) {
      if (loadingId.current === null) {
        loadingId.current = show(labels.loading, "loading");
      }
      return;
    }

    clearLoading();

    if (status.success && status.tx_hash) {
      show(labels.success, "success", {
        href: explorerTx(status.tx_hash),
        hrefLabel: "View transaction",
      });
    } else if (status.error) {
      show(status.error, "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.loading, status.success, status.error, status.tx_hash, active]);
}
