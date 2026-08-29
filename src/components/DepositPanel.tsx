import { useState } from "react";
import type { JsonRpcSigner } from "ethers";
import { ConnectKitButton } from "connectkit";

import { useBoringVaultV1, type Token } from "../lib/boringVault";
import { useTokenBalance } from "../hooks/useTokenBalance";
import { useStatusToasts } from "../hooks/useStatusToasts";
import { explorerAddress } from "../config/chain";
import { DEPOSIT_TOKENS } from "../config/tokens";
import type { Vault } from "../lib/vaultRegistry";
import {
  fmtPct,
  formatAmount,
  formatUsd,
  parseAmount,
  shortAddress,
} from "../lib/format";
import { projectEarnings, type WindowApy } from "../lib/apy";
import { formatDuration } from "../lib/time";
import { AmountInput } from "./AmountInput";
import { Modal } from "./Modal";
import { VestingNotice } from "./VestingNotice";
import { Button, InlineError } from "./ui";

export function DepositPanel({
  vault,
  signer,
  address,
  sharesHeld,
  shareValue,
  rightChain,
  paused,
  projection,
  onSuccess,
}: {
  // The product being deposited into: its contracts take the deposit, its
  // share token is what comes back, and its teller sets the lock.
  vault: Vault;
  signer: JsonRpcSigner | undefined;
  address?: `0x${string}`;
  sharesHeld: number | null;
  shareValue: number | null;
  rightChain: boolean;
  paused: boolean;
  // The headline (7 d) realised trailing APY, derived in App. null while the
  // share-price history is loading or failed — the projection follows the APY
  // and simply vanishes, as it does when the vault is too young for a figure
  // (apyPct null).
  projection: WindowApy | null;
  onSuccess: () => void;
}) {
  const { isBoringV1ContextReady, deposit, depositStatus } = useBoringVaultV1();

  const shareSymbol = vault.ui.symbol;
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
  // Projected earnings: what the typed amount would earn at the headline APY.
  // null — and so no callout — while nothing has been typed or no APY exists.
  const projected = projectEarnings(parsed, projection?.apyPct ?? null);

  let validationError: string | null = null;
  if (parsed === null && amount.trim()) validationError = "Enter a valid amount.";
  else if (overBalance) validationError = `Amount exceeds your ${symbol} balance.`;

  const canSubmit =
    isBoringV1ContextReady &&
    !!signer &&
    rightChain &&
    !paused &&
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

      {projected !== null && projection !== null && (
        <div className="notice notice--accent">
          <strong>
            You'd earn ≈ {formatUsd(projected.perMonth, 2)} / month ·{" "}
            {formatUsd(projected.perYear, 2)} / year
          </strong>
          {/* The figure's own name — "7d APY", or "APY since launch" while the
              window still reaches back past the vault's deployment — so the
              callout can never label the number as something it is not. */}
          <span className="muted small">
            at {fmtPct(projection.apyPct)} {projection.label} — estimate.
          </span>
        </div>
      )}

      <div className="rows">
        <div className="row">
          <span>You receive (est.)</span>
          <span>
            {estShares === null
              ? "—"
              : `${formatAmount(estShares, 4)} ${shareSymbol}`}
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
        After depositing, your {shareSymbol} shares are locked for{" "}
        <strong>{formatDuration(vault.ui.shareLockPeriod)}</strong> before they
        can be redeemed.
        {sharesHeld !== null && sharesHeld > 0 && (
          <>
            {" "}
            A new deposit re-locks your <strong>entire</strong> {shareSymbol}{" "}
            balance — including the shares you already hold.
          </>
        )}
      </div>

      {/* On a product whose vesting term outlives its share lock, said before
          the deposit rather than after an unfilled redemption. */}
      <VestingNotice vault={vault} where="deposit" />

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
                : `${formatAmount(estShares, 4)} ${shareSymbol}`}
            </span>
          </div>
          <div className="row">
            <span>Approve + deposit to</span>
            <a
              href={explorerAddress(vault.addresses.vault)}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(vault.addresses.vault)}
            </a>
          </div>
          <div className="row">
            <span>Via teller</span>
            <a
              href={explorerAddress(vault.addresses.teller)}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(vault.addresses.teller)}
            </a>
          </div>
        </div>
        <p className="muted small">
          You may be asked to sign twice: first to approve {symbol}, then to
          deposit. Your entire {shareSymbol} balance locks for{" "}
          {formatDuration(vault.ui.shareLockPeriod)} after each deposit.
        </p>
      </Modal>
    </div>
  );
}
