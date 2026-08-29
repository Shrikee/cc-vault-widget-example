import { useState } from "react";
import { Contract, type JsonRpcSigner } from "ethers";

import { explorerTx } from "../config/chain";
import type { WithdrawRequestState } from "../hooks/useWithdrawRequest";
import type { Vault } from "../lib/vaultRegistry";
import { RequestRow } from "./RequestRow";
import { useToast } from "./Toaster";
import { Card, InlineError } from "./ui";

// Every open redemption request, in both queues, in one side-rail card.
//
// It sits outside the selection on purpose (spec, "Redemptions"). A redemption
// is money that has left the depositor's control and not yet arrived, and the
// two products have SEPARATE AtomicQueues — deliberately, so one product's
// pause cannot halt the other's exits — so a request rendered inside the
// withdraw panel of the product it belongs to is invisible from the other
// product and from the deposit tab. Here it is visible from either product and
// either tab, and a wallet with a request in both queues sees both.
//
// The card renders the row; the withdraw panel still owns everything about
// SUBMITTING a request, and says there is already one open when there is.

const ERC20_APPROVE_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
];

// The part of a product's reads this card uses, declared narrowly so the card
// asks for no more than it shows — as the position card does.
export interface ProductRedemption {
  // The product the request belongs to. Its name labels the row and its queue
  // is what a stop revokes the approval to, so the two can never be confused.
  vault: Vault;
  withdrawRequest: WithdrawRequestState;
}

export function RedemptionsCard({
  connected,
  products,
  selectedId,
  onSelect,
  signer,
  rightChain,
}: {
  connected: boolean;
  products: ProductRedemption[];
  // The selection, and the means to change it — because stopping a request in
  // the product that is not on show switches to it first. See runStop.
  selectedId: string;
  onSelect: (id: string) => void;
  signer: JsonRpcSigner | undefined;
  rightChain: boolean;
}) {
  const { show, dismiss } = useToast();
  // Whether a stop is in flight — and while one is, EVERY stop control is
  // disabled, not only the row it came from. One wallet signs for both
  // products, and two prompts queued against it is a depositor confirming one
  // product's revoke while reading the other's.
  const [stopping, setStopping] = useState(false);

  // The products with something open, in the roster's order — so the rows do
  // not reshuffle under a depositor when one queue's poll resolves before the
  // other's. The selection is deliberately not consulted: the card exists
  // precisely so that what is on screen does not decide what money is visible.
  const rows = products.flatMap(({ vault, withdrawRequest }) =>
    withdrawRequest.request
      ? [{ vault, request: withdrawRequest.request, refetch: withdrawRequest.refetch }]
      : []
  );
  // A queue that could not be read is not a queue with nothing in it. Saying
  // "no open redemption requests" over a failed read would be a claim about
  // money the widget cannot see, so the reason is shown per product instead —
  // beside that product's last known row, when there is one, since the row is
  // then what was true at the last successful read rather than now.
  const unreadable = products.filter((p) => p.withdrawRequest.error !== null);
  const loading = products.some((p) => p.withdrawRequest.loading);
  // Nothing can be sent without a signer on the right chain, and a control with
  // nothing behind it must not look live. The page's own network banner is
  // where the wrong-chain case is explained.
  const stopDisabled = stopping || !signer || !rightChain;

  // Stop a pending request from being filled — the "cancel" this deployment
  // supports. The raw cancel (zeroing the request via `updateAtomicRequest`) is
  // admin-gated on both vaults and reverts for end users, so the depositor's
  // lever is to revoke the share approval to that product's queue: the solver
  // then cannot pull the shares and passes the request over, and the request
  // clears itself at its deadline (integration doc §7.4).
  //
  // SWITCHING FIRST. A request in the product that is not on show is stopped
  // from here, and the selection follows the action before the wallet is asked
  // to sign: the panels, stats, pause banner and hero then name the product the
  // signature is about, and the depositor is not signing an approval on a share
  // token no part of the page mentions. The spec asks for the switch so the
  // cancel goes "through the now-mounted provider"; on this deployment the
  // provider's cancel is the admin-gated one, so what actually goes out is the
  // approval revoke below — which needs no provider at all. The switch is kept
  // regardless, because the reason above holds either way and because a
  // depositor who cancels a redemption expects to land on it.
  //
  // WHICH QUEUE IT LANDS ON is fixed before any of that: every address the
  // transaction names comes from the `vault` this row was rendered from, never
  // from the selection. So a depositor who switches products again while the
  // wallet prompt is open still revokes the approval they asked to revoke, the
  // toast still names the product it happened in, and the refetch is that
  // product's own. The page may be showing the other product by the time it
  // lands; that is the honest outcome of asking for two things at once, and no
  // part of it is wrong.
  async function runStop(vault: Vault, refetchRequest: () => void) {
    if (!signer || stopping) return;
    if (vault.id !== selectedId) onSelect(vault.id);
    setStopping(true);
    const tid = show("Revoking approval…", "loading");
    try {
      const share = new Contract(
        vault.addresses.vault,
        ERC20_APPROVE_ABI,
        signer
      );
      const tx = await share.approve(vault.addresses.queue, 0n);
      const receipt = await tx.wait();
      dismiss(tid);
      show(
        `Approval revoked — your ${vault.ui.name} request can no longer be filled`,
        "success",
        {
          href: receipt?.hash ? explorerTx(receipt.hash) : undefined,
          hrefLabel: "View transaction",
        }
      );
      // The only figure this moved. An approval revoke transfers nothing: the
      // shares, the share price, the position and the deposit history are all
      // exactly where they were, and refetching them would put a spinner over
      // numbers that are still correct.
      refetchRequest();
    } catch (e) {
      dismiss(tid);
      show((e as Error)?.message ?? "Failed to revoke approval", "error");
    } finally {
      setStopping(false);
    }
  }

  if (!connected) {
    return (
      <Card title="Open redemptions">
        <p className="muted">
          Connect your wallet to see your open redemption requests.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Open redemptions">
      {rows.map(({ vault, request, refetch }) => (
        <div className="redemption" key={vault.id}>
          {/* The product's own name above its row: the row itself carries the
              share symbol, and between them a depositor holding requests in
              both queues can tell which redemption is which. */}
          <h3 className="redemption__product">{vault.ui.name}</h3>
          {/* The row's `busy` is what disables its stop control. */}
          <RequestRow
            vault={vault}
            request={request}
            busy={stopDisabled}
            onStop={() => runStop(vault, refetch)}
          />
        </div>
      ))}

      {rows.length === 0 && unreadable.length === 0 && (
        <p className="muted">
          {loading ? "…" : "No open redemption requests."}
        </p>
      )}

      {unreadable.map(({ vault, withdrawRequest }) => (
        <InlineError key={vault.id}>
          Couldn't read the {vault.ui.name} queue: {withdrawRequest.error}
        </InlineError>
      ))}
    </Card>
  );
}
