import { useState } from "react";
import type { JsonRpcSigner } from "ethers";
import { ConnectKitButton } from "connectkit";

import { useBoringVaultV1, type Token } from "../lib/boringVault";
import { useTokenBalance } from "../hooks/useTokenBalance";
import { useStatusToasts } from "../hooks/useStatusToasts";
import {
  CONTRACTS,
  DEPOSIT_TOKENS,
  SHARE_SYMBOL,
  SHARE_LOCK_PERIOD,
  explorerAddress,
} from "../config/vault";
import { formatAmount, parseAmount, shortAddress } from "../lib/format";
import { formatDuration } from "../lib/time";
import { AmountInput } from "./AmountInput";
import { Modal } from "./Modal";
import { Button, InlineError } from "./ui";

export function DepositPanel({
  signer,
  address,
  shareValue,
  rightChain,
  onSuccess,
}: {
  signer: JsonRpcSigner | undefined;
  address?: `0x${string}`;
  shareValue: number | null;
  rightChain: boolean;
  onSuccess: () => void;
}) {
  const { isBoringV1ContextReady, deposit, depositStatus } = useBoringVaultV1();

  const [token, setToken] = useState<Token>(DEPOSIT_TOKENS[0]);
  const { balance } = useTokenBalance(token, address);

  const [amount, setAmount] = useState("");
  const [confirm, setConfirm] = useState(false);

  const busy = depositStatus.loading;
  useStatusToasts(depositStatus, true, {
    loading: "Processing deposit…",
    success: "Deposit confirmed",
  });

  const symbol = token.displayName ?? "token";
  const parsed = parseAmount(amount);
  const overBalance = parsed !== null && balance !== null && parsed > balance;
  // shareValue is the NAV of one share in base-asset (USDT ≈ $1) units, and the
  // deposit tokens are pegged 1:1, so shares ≈ amount / shareValue.
  const estShares = parsed !== null && shareValue ? parsed / shareValue : null;

  let validationError: string | null = null;
  if (parsed === null && amount.trim()) validationError = "Enter a valid amount.";
  else if (overBalance) validationError = `Amount exceeds your ${symbol} balance.`;

  const canSubmit =
    isBoringV1ContextReady &&
    !!signer &&
    rightChain &&
    parsed !== null &&
    !overBalance &&
    !busy;

  async function runDeposit() {
    setConfirm(false);
    if (!signer || parsed === null) return;
    await deposit(signer, String(parsed), token);
    // depositStatus drives toasts; refresh balances/position regardless of branch.
    setAmount("");
    onSuccess();
  }

  return (
    <div className="panel">
      <div className="token-select" role="tablist" aria-label="Deposit asset">
        {DEPOSIT_TOKENS.map((t) => (
          <button
            key={t.address}
            type="button"
            role="tab"
            aria-selected={t.address === token.address}
            className={`token-chip ${
              t.address === token.address ? "token-chip--active" : ""
            }`}
            disabled={busy}
            onClick={() => {
              setToken(t);
              setAmount("");
            }}
          >
            {t.image && <img src={t.image} alt="" width={18} height={18} />}
            {t.displayName}
          </button>
        ))}
      </div>

      <AmountInput
        value={amount}
        onChange={setAmount}
        max={balance}
        unit={symbol}
        disabled={busy || !address}
      />

      <div className="rows">
        <div className="row">
          <span>You receive (est.)</span>
          <span>
            {estShares === null
              ? "—"
              : `${formatAmount(estShares, 4)} ${SHARE_SYMBOL}`}
          </span>
        </div>
        <div className="row">
          <span>Share price</span>
          <span>
            {shareValue === null ? "—" : `${formatAmount(shareValue, 4)} USDT`}
          </span>
        </div>
      </div>

      <div className="notice notice--info">
        After depositing, your {SHARE_SYMBOL} shares are locked for{" "}
        <strong>{formatDuration(SHARE_LOCK_PERIOD)}</strong> before they can be
        redeemed.
      </div>

      <InlineError>{validationError}</InlineError>

      {!address ? (
        <ConnectKitButton.Custom>
          {({ show }) => (
            <Button block onClick={show}>
              Connect wallet
            </Button>
          )}
        </ConnectKitButton.Custom>
      ) : (
        <Button block loading={busy} disabled={!canSubmit} onClick={() => setConfirm(true)}>
          {busy ? "Depositing…" : `Deposit ${symbol}`}
        </Button>
      )}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Confirm deposit"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={runDeposit}>Confirm</Button>
          </>
        }
      >
        <div className="rows">
          <div className="row">
            <span>Deposit</span>
            <span>
              {formatAmount(parsed)} {symbol}
            </span>
          </div>
          <div className="row">
            <span>Est. shares</span>
            <span>
              {estShares === null
                ? "—"
                : `${formatAmount(estShares, 4)} ${SHARE_SYMBOL}`}
            </span>
          </div>
          <div className="row">
            <span>Approve + deposit to</span>
            <a href={explorerAddress(CONTRACTS.vault)} target="_blank" rel="noreferrer">
              {shortAddress(CONTRACTS.vault)}
            </a>
          </div>
          <div className="row">
            <span>Via teller</span>
            <a href={explorerAddress(CONTRACTS.teller)} target="_blank" rel="noreferrer">
              {shortAddress(CONTRACTS.teller)}
            </a>
          </div>
        </div>
        <p className="muted small">
          You may be asked to sign twice: first to approve {symbol}, then to
          deposit. Shares lock for {formatDuration(SHARE_LOCK_PERIOD)} after
          deposit.
        </p>
      </Modal>
    </div>
  );
}
