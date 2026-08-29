import { useCallback } from "react";
import type { Address } from "viem";

import type { Vault, VaultRoster } from "../lib/vaultRegistry";
import { useDepositHistory, type DepositHistory } from "./useDepositHistory";
import { useShareHistory, type ShareHistory } from "./useShareHistory";
import { useUserPosition, type UserPosition } from "./useUserPosition";
import { useVaultMetrics, type VaultMetrics } from "./useVaultMetrics";
import {
  useWithdrawRequest,
  type WithdrawRequestState,
} from "./useWithdrawRequest";
import { useWindowApys, type WindowApys } from "./useWindowApys";

// Everything the widget reads about ONE product, for the connected wallet.
//
// The widget shows two products at once — both headline APYs on the chips, both
// position values in the side rail — so these reads are no longer "the vault's".
// They are a product's, and there is a set of them per product.
//
// Nothing new is read here: this is the bundle App already assembled for the
// one vault it served, given a name so it can be assembled twice.

export interface ProductReads {
  vault: Vault;
  metrics: VaultMetrics;
  history: ShareHistory;
  // The realised trailing APY for every window, derived once per product: the
  // chip and the hero show the same figure because they are the same figure.
  apys: WindowApys;
  position: UserPosition;
  depositHistory: DepositHistory;
  // This product's open request in ITS OWN AtomicQueue. Every product's queue
  // is polled, not just the selected one's: the side rail lists open requests
  // across both, and a fill is announced whichever product filled.
  withdrawRequest: WithdrawRequestState;
}

export function useProductReads(
  vault: Vault,
  // Whether this is the product on show. Nothing here renders it — it is what
  // the share-price scan windows itself by: the selected product's stats card
  // offers every trailing window, the other one contributes a single headline
  // APY to a chip and scans that window alone (spec, "RPC budget").
  selected: boolean,
  address?: Address,
  // Told when THIS product's redemption request is filled, and given the vault
  // so it can say which product it was. What a fill moves on screen is refetched
  // below without asking; this is for what only the caller can do — telling the
  // depositor, from wherever the toaster lives.
  onFilled?: (vault: Vault) => void
): ProductReads {
  const metrics = useVaultMetrics(vault);
  const history = useShareHistory(vault, selected);
  const position = useUserPosition(vault, address);
  // The position is the deposit scan's precondition AND its plan: a wallet
  // holding none of this product has no earnings to compute, so nothing is
  // scanned; and when the read failed there is no telling that case from a
  // depositor's, so the sub-line says so rather than waiting forever.
  const depositHistory = useDepositHistory(vault, address, position);
  const apys = useWindowApys(vault, history, metrics);

  // A fill has already happened by the time it is observed — the solver zeroes
  // the request and sends the USDT in one transaction, with no claim step — so
  // this refetches the two figures it moved: the shares have left the wallet and
  // the vault has paid out for them. This product's, and no other product's:
  // nothing moved in the one that did not fill.
  const refetchMetrics = metrics.refetch;
  const refetchPosition = position.refetch;
  const onProductFilled = useCallback(() => {
    refetchMetrics();
    refetchPosition();
    onFilled?.(vault);
  }, [refetchMetrics, refetchPosition, onFilled, vault]);
  const withdrawRequest = useWithdrawRequest(vault, address, onProductFilled);

  return {
    vault,
    metrics,
    history,
    apys,
    position,
    depositHistory,
    withdrawRequest,
  };
}

// One bundle per product, in the registry's order.
//
// The loop is hooks called in a loop, which is safe here for the reason the
// Rules of Hooks actually state: the same hooks must run in the same order on
// every render. The roster is parsed once at module load from a JSON file and
// never changes — no entry is added, removed or reordered while the page is
// open — so this array's length is a constant of the build.
//
// What would break it is filtering: mapping over the SELECTED products, or over
// the ones a wallet holds, would change the number of hooks between renders.
// Read every product, always, and let the caller pick.
export function useRosterReads(
  roster: VaultRoster,
  selectedId: string,
  address?: Address,
  onFilled?: (vault: Vault) => void
): ProductReads[] {
  return roster.vaults.map((vault) =>
    // The selection is passed DOWN to each product rather than used to pick
    // which products to read: it changes how much each scan asks for, never how
    // many hooks run.
    useProductReads(vault, vault.id === selectedId, address, onFilled)
  );
}

// The bundle for one product. The id comes from the URL resolver, which only
// ever returns an id the roster declares, so a miss here is a programming error
// and says so rather than rendering an empty page.
export function readsById(reads: ProductReads[], id: string): ProductReads {
  const found = reads.find((r) => r.vault.id === id);
  if (!found) {
    throw new Error(
      `No reads for vault ${JSON.stringify(id)} (read: ${reads
        .map((r) => r.vault.id)
        .join(", ")})`
    );
  }
  return found;
}
