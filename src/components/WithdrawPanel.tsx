import { useState } from "react";
import { Contract, type JsonRpcSigner } from "ethers";
import { ConnectKitButton } from "connectkit";

import { useBoringVaultV1 } from "../lib/boringVault";
import { useStatusToasts } from "../hooks/useStatusToasts";
import { useToast } from "./Toaster";
import { useNow } from "../hooks/useNow";
import type { WithdrawRequest } from "../hooks/useWithdrawRequest";
import {
  CONTRACTS,
  SHARE_SYMBOL,
  WITHDRAW_TOKEN,
  WITHDRAW_DISCOUNT_PCT_DEFAULT,
  WITHDRAW_DISCOUNT_PCT_MAX,
  WITHDRAW_VALID_DAYS_DEFAULT,
  explorerAddress,
  explorerTx,
} from "../config/vault";
import { formatAmount, parseAmount, shortAddress } from "../lib/format";
import { AmountInput } from "./AmountInput";
import { Modal } from "./Modal";
import { RequestRow } from "./RequestRow";
import { Button, InlineError } from "./ui";

const MAX_VALID_DAYS = 90;
const wantSymbol = WITHDRAW_TOKEN.displayName ?? "USDT";
const ERC20_APPROVE_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];

export function WithdrawPanel({
  signer,
  address,
  shares,
  shareValue,
  unlockAt,
  rightChain,
  paused,
  request,
  refetchRequest,
  onSuccess,
}: {
  signer: JsonRpcSigner | undefined;
  address?: `0x${string}`;
  shares: number | null;
  shareValue: number | null;
  unlockAt: number | null;
  rightChain: boolean;
  paused: boolean;
  request: WithdrawRequest | null;
  refetchRequest: () => void;
  onSuccess: () => void;
}) {
  const { isBoringV1ContextReady, queueWithdraw, withdrawStatus } =
    useBoringVaultV1();
  const { show, dismiss } = useToast();
  const now = useNow();

  const [amount, setAmount] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [discount, setDiscount] = useState(""); // "" => default spread
  const [validDays, setValidDays] = useState(""); // "" => default validity
  const [confirm, setConfirm] = useState(false);
  const [stopping, setStopping] = useState(false);

  const busy = withdrawStatus.loading || stopping;
  // queueWithdraw is the only action that drives withdrawStatus (the Stop action
  // manages its own toasts), so a constant active=true is safe here.
  useStatusToasts(withdrawStatus, true, {
    loading: "Submitting redemption request…",
    success: "Redemption request submitted",
  });

  const locked = unlockAt !== null && now < unlockAt;
  const parsed = parseAmount(amount);
  const overShares = parsed !== null && shares !== null && parsed > shares;

  const discountNum = discount.trim() ? Number(discount) : WITHDRAW_DISCOUNT_PCT_DEFAULT;
  const discountInvalid =
    discount.trim() !== "" &&
    (!Number.isFinite(discountNum) ||
      discountNum < 0 ||
      discountNum > WITHDRAW_DISCOUNT_PCT_MAX);

  const validDaysNum = validDays.trim()
    ? Number(validDays)
    : WITHDRAW_VALID_DAYS_DEFAULT;
  const validDaysInvalid =
    validDays.trim() !== "" &&
    (!Number.isFinite(validDaysNum) ||
      validDaysNum <= 0 ||
      validDaysNum > MAX_VALID_DAYS);

  // Minimum you accept: NAV per share less the spread, times shares.
  const estMinOut =
    parsed !== null && shareValue
      ? parsed * shareValue * (1 - discountNum / 100)
      : null;

  let validationError: string | null = null;
  if (parsed === null && amount.trim()) validationError = "Enter a valid share amount.";
  else if (overShares) validationError = "Amount exceeds your share balance.";
  else if (discountInvalid)
    validationError = `Spread must be between 0 and ${WITHDRAW_DISCOUNT_PCT_MAX}%.`;
  else if (validDaysInvalid)
    validationError = `Validity must be between 1 and ${MAX_VALID_DAYS} days.`;

  const canSubmit =
    isBoringV1ContextReady &&
    !!signer &&
    rightChain &&
    !paused &&
    !locked &&
    parsed !== null &&
    !overShares &&
    !discountInvalid &&
    !validDaysInvalid &&
    !busy;

  async function runRequest() {
    setConfirm(false);
    if (!signer || parsed === null) return;
    await queueWithdraw(
      signer,
      String(parsed),
      WITHDRAW_TOKEN,
      String(discountNum),
      String(validDaysNum)
    );
    setAmount("");
    refetchRequest();
    onSuccess();
  }

  // Stop a pending request from being filled. The raw cancel (zeroing the
  // request) is admin-gated on this vault, so we revoke the share approval to the
  // queue — the solver then can't pull the shares and skips the request, which
  // clears on its own at its deadline.
  async function runStop() {
    if (!signer) return;
    setStopping(true);
    const tid = show("Revoking approval…", "loading");
    try {
      const share = new Contract(CONTRACTS.vault, ERC20_APPROVE_ABI, signer);
      const tx = await share.approve(CONTRACTS.withdrawQueue, 0n);
      const receipt = await tx.wait();
      dismiss(tid);
      show("Approval revoked — your request can no longer be filled", "success", {
        href: receipt?.hash ? explorerTx(receipt.hash) : undefined,
        hrefLabel: "View transaction",
      });
      refetchRequest();
      onSuccess();
    } catch (e) {
      dismiss(tid);
      show((e as Error)?.message ?? "Failed to revoke approval", "error");
    } finally {
      setStopping(false);
    }
  }

  const effectiveSpread = discount.trim()
    ? `${discount}%`
    : `${WITHDRAW_DISCOUNT_PCT_DEFAULT}% (default)`;
  const effectiveValidity = validDays.trim()
    ? `${validDays} days`
    : `${WITHDRAW_VALID_DAYS_DEFAULT} days (default)`;

  return (
    <div className="panel">
      {/* ---- request form ---- */}
      <AmountInput
        value={amount}
        onChange={setAmount}
        max={shares}
        unit={SHARE_SYMBOL}
        maxLabel="Your shares"
        disabled={busy || !address || locked}
      />

      <div className="rows">
        <div className="row">
          <span>You receive (est., min)</span>
          <span>
            {estMinOut === null ? "—" : `${formatAmount(estMinOut, 2)} ${wantSymbol}`}
          </span>
        </div>
        <div className="row">
          <span>Redemption spread</span>
          <span>{effectiveSpread}</span>
        </div>
      </div>

      <button
        type="button"
        className="linklike advanced-toggle"
        onClick={() => setAdvanced((a) => !a)}
      >
        {advanced ? "Hide" : "Show"} advanced options
      </button>

      {advanced && (
        <div className="advanced">
          <label className="field">
            <span>
              Redemption spread (%) — the solver fills your request at NAV minus
              this. Leave blank for the {WITHDRAW_DISCOUNT_PCT_DEFAULT}% default.
              Below it your request may never be filled; max{" "}
              {WITHDRAW_DISCOUNT_PCT_MAX}%.
            </span>
            <input
              className="text-input"
              inputMode="decimal"
              placeholder={`${WITHDRAW_DISCOUNT_PCT_DEFAULT} (default)`}
              value={discount}
              disabled={busy}
              onChange={(e) => setDiscount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </label>
          <label className="field">
            <span>
              Valid for (days) — how long the request stays fillable before its
              deadline lapses. Leave blank for {WITHDRAW_VALID_DAYS_DEFAULT} days.
            </span>
            <input
              className="text-input"
              inputMode="numeric"
              placeholder={`${WITHDRAW_VALID_DAYS_DEFAULT} (default)`}
              value={validDays}
              disabled={busy}
              onChange={(e) => setValidDays(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </label>
        </div>
      )}

      {locked && (
        <div className="notice notice--warning">
          Your shares are still locked. You can request a redemption once the
          1-day deposit lock ends.
        </div>
      )}

      {!!request && !locked && (
        <div className="notice notice--info">
          You already have an open request below. Submitting a new request{" "}
          <strong>replaces</strong> it. A posted request can't be cancelled
          on-chain — use <strong>Stop request</strong> (revokes the share
          approval) to prevent it being filled, or let it expire.
        </div>
      )}

      <InlineError>{validationError}</InlineError>

      {!address ? (
        <ConnectKitButton.Custom>
          {({ show: showConnect }) => (
            <Button block onClick={showConnect}>
              Connect wallet
            </Button>
          )}
        </ConnectKitButton.Custom>
      ) : (
        <Button
          block
          loading={withdrawStatus.loading}
          disabled={!canSubmit}
          onClick={() => setConfirm(true)}
        >
          Request redemption
        </Button>
      )}

      {/* ---- open request ---- */}
      <div className="requests">
        <h3 className="requests__title">Your request</h3>
        {!request ? (
          <p className="muted small">No open redemption request.</p>
        ) : (
          <RequestRow request={request} busy={busy} onStop={runStop} />
        )}
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Confirm redemption request"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={runRequest}>Confirm request</Button>
          </>
        }
      >
        <div className="rows">
          <div className="row">
            <span>Redeem</span>
            <span>
              {formatAmount(parsed, 4)} {SHARE_SYMBOL}
            </span>
          </div>
          <div className="row">
            <span>Receive (min)</span>
            <span>
              {estMinOut === null ? "—" : `${formatAmount(estMinOut, 2)} ${wantSymbol}`}
            </span>
          </div>
          <div className="row">
            <span>Spread</span>
            <span>{effectiveSpread}</span>
          </div>
          <div className="row">
            <span>Valid for</span>
            <span>{effectiveValidity}</span>
          </div>
          <div className="row">
            <span>Approve shares to</span>
            <a
              href={explorerAddress(CONTRACTS.withdrawQueue)}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(CONTRACTS.withdrawQueue)}
            </a>
          </div>
        </div>
        <p className="muted small">
          You may be asked to sign twice: first to approve {SHARE_SYMBOL}, then to
          submit the request. An off-chain solver fills it and sends you{" "}
          {wantSymbol} — there is no separate claim step.
        </p>
      </Modal>
    </div>
  );
}
