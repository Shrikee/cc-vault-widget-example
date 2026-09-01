import { useState } from "react";
import { type JsonRpcSigner } from "ethers";
import { ConnectKitButton } from "connectkit";

import { useBoringVaultV1 } from "../lib/boringVault";
import { useStatusToasts } from "../hooks/useStatusToasts";
import { useNow } from "../hooks/useNow";
import type { WithdrawRequest } from "../hooks/useWithdrawRequest";
import { explorerAddress } from "../config/chain";
import {
  WITHDRAW_DISCOUNT_PCT_DEFAULT,
  WITHDRAW_DISCOUNT_PCT_MAX,
  WITHDRAW_VALID_DAYS_DEFAULT,
} from "../config/redemption";
import { WITHDRAW_TOKEN } from "../config/tokens";
import type { Vault } from "../lib/vaultRegistry";
import { formatAmount, parseAmount, shortAddress } from "../lib/format";
import { amountStringOf } from "../lib/postingRule";
import { AmountInput } from "./AmountInput";
import { Modal } from "./Modal";
import { VestingNotice } from "./VestingNotice";
import { Button, InlineError } from "./ui";

const MAX_VALID_DAYS = 90;
const wantSymbol = WITHDRAW_TOKEN.displayName ?? "USDT";

export function WithdrawPanel({
  vault,
  signer,
  address,
  shares,
  sharesRaw,
  shareValue,
  unlockAt,
  rightChain,
  paused,
  request,
  refetchRequest,
  onSuccess,
}: {
  // The product being redeemed from: its shares are offered, and the request
  // is posted to its own AtomicQueue.
  vault: Vault;
  signer: JsonRpcSigner | undefined;
  address?: `0x${string}`;
  shares: number | null;
  // The same balance undivided. MAX types this, not the float beside it.
  sharesRaw: bigint | null;
  shareValue: number | null;
  unlockAt: number | null;
  rightChain: boolean;
  paused: boolean;
  // This product's open request, if there is one. The panel no longer RENDERS
  // it — that moved to the side rail's redemptions card, where a request is
  // visible from either product and either tab (spec, "Redemptions") — but it
  // still has to say that submitting another one replaces it.
  request: WithdrawRequest | null;
  refetchRequest: () => void;
  onSuccess: () => void;
}) {
  const { isBoringV1ContextReady, queueWithdraw, withdrawStatus } =
    useBoringVaultV1();
  const now = useNow();

  const shareSymbol = vault.ui.symbol;

  const [amount, setAmount] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [discount, setDiscount] = useState(""); // "" => default spread
  const [validDays, setValidDays] = useState(""); // "" => default validity
  const [confirm, setConfirm] = useState(false);

  const busy = withdrawStatus.loading;
  // queueWithdraw is now the only action this panel takes at all — stopping a
  // request went to the redemptions card with the row it belongs to — so it is
  // the only thing driving withdrawStatus and a constant active=true is safe.
  useStatusToasts(withdrawStatus, true, {
    loading: "Submitting redemption request…",
    success: "Redemption request submitted",
  });

  const locked = unlockAt !== null && now < unlockAt;
  const parsed = parseAmount(amount);
  // What MAX types: the whole balance to the wei. An 18-dp balance has more
  // significant digits than a double holds, so "all" taken from `shares` would
  // quote and post slightly less than the wallet holds.
  const maxExact =
    sharesRaw !== null ? amountStringOf(sharesRaw, vault.ui.decimals) : null;
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
      // The string as it was typed, not a round trip through a double: the
      // library converts it exactly (× 10^decimals, truncated), and MAX's
      // exact balance would lose its last digits through `String(parsed)`.
      amount.trim(),
      WITHDRAW_TOKEN,
      String(discountNum),
      String(validDaysNum)
    );
    setAmount("");
    refetchRequest();
    onSuccess();
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
        maxExact={maxExact}
        unit={shareSymbol}
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

      {/* Above the spread control, because the spread is the remedy it names:
          on a product that vests, an exit before it does may need a wider one. */}
      <VestingNotice vault={vault} where="withdraw" />

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
              Valid for (days) — how long the request stays open before its
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
          You already have an open request, shown under{" "}
          <strong>Open redemptions</strong>. Submitting a new request{" "}
          <strong>replaces</strong> it. A posted request can't be cancelled
          on-chain — use <strong>Stop request</strong> (revokes the share
          approval) to prevent it being filled, or let it expire.
        </div>
      )}

      <InlineError>{validationError}</InlineError>

      {/* The one thing canSubmit gates on that nothing else on the panel can
          explain: until the library's provider has its contracts in hand, the
          button below is dead for a reason the user cannot see. This is where
          the message the whole page used to be replaced by belongs — beside the
          control it is about. */}
      {!isBoringV1ContextReady && (
        <p className="muted small">Connecting to vault contracts…</p>
      )}

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
              {formatAmount(parsed, 4)} {shareSymbol}
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
              href={explorerAddress(vault.addresses.queue)}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(vault.addresses.queue)}
            </a>
          </div>
        </div>
        <p className="muted small">
          You may be asked to sign twice: first to approve {shareSymbol}, then to
          submit the request. An off-chain solver fills it and sends you{" "}
          {wantSymbol} — there is no separate claim step.
        </p>
      </Modal>
    </div>
  );
}
