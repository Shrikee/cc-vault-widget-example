import { useEffect, useRef, useState } from "react";
import { type JsonRpcSigner } from "ethers";
import { ConnectKitButton } from "connectkit";

import { useBoringVaultV1 } from "../lib/boringVault";
import { useStatusToasts } from "../hooks/useStatusToasts";
import { useConfirmPin } from "../hooks/useConfirmPin";
import { useNow } from "../hooks/useNow";
import type { WithdrawRequest } from "../hooks/useWithdrawRequest";
import { explorerAddress } from "../config/chain";
import {
  WITHDRAW_DISCOUNT_PCT_DEFAULT,
  WITHDRAW_DISCOUNT_PCT_MAX,
  WITHDRAW_VALID_DAYS_DEFAULT,
} from "../config/redemption";
import { WITHDRAW_TOKEN } from "../config/tokens";
import type { HolderEvent } from "../entitlement/entitlement";
import { hasVestingGap, type Vault } from "../lib/vaultRegistry";
import { formatAmount, parseAmount, shortAddress } from "../lib/format";
import {
  amountStringOf,
  formatDiscountPercent,
  offerSharesOf,
  spreadPpmOf,
} from "../lib/postingRule";
import type { RequestRepost } from "../lib/requestRow";
import { buildWithdrawQuote } from "../lib/withdrawQuote";
import { AmountInput } from "./AmountInput";
import { Modal } from "./Modal";
import { PinnedConfirm } from "./PinnedConfirm";
import { QuoteCard } from "./QuoteCard";
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
  sharePriceRaw,
  history,
  unlockAt,
  rightChain,
  paused,
  request,
  refetchRequest,
  repost,
  onRepostHandled,
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
  // The same share price undivided — the glossary's own term, which the float
  // above predates. Stage 1's estimate is a double and stays one; a quote
  // priced against the entitlement ceiling is bigints throughout, because the
  // two are compared to the want unit.
  sharePriceRaw: bigint | null;
  // This wallet's holder history in this product — what the entitlement
  // ceiling is computed from. Only a vesting-gap product has one, and only
  // once its scan has landed.
  history: readonly HolderEvent[] | null;
  unlockAt: number | null;
  rightChain: boolean;
  paused: boolean;
  // This product's open request, if there is one. The panel no longer RENDERS
  // it — that moved to the side rail's redemptions card, where a request is
  // visible from either product and either tab (spec, "Redemptions") — but it
  // still has to say that submitting another one replaces it.
  request: WithdrawRequest | null;
  refetchRequest: () => void;
  // A re-post asked for from the side rail's request row (src/lib/requestRow.ts),
  // for THIS product. Null except in the moment one was asked for.
  repost: RequestRepost | null;
  // Called the instant it is taken up, so the ask is spent once: the panel must
  // not re-fill the box behind a depositor who has since typed something else.
  onRepostHandled: () => void;
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

  // The spread control in the queue's own units, settled ONCE: the quote card
  // prices at it, the pin recomputes at it, and the wire carries whatever the
  // two of them agreed on. A value the control itself rejects is not priced
  // from — the panel's own error says so — so it falls back to the default
  // rather than pricing off junk.
  const holderSpreadPpm = spreadPpmOf(
    discountInvalid ? WITHDRAW_DISCOUNT_PCT_DEFAULT : discountNum
  );

  // The confirm step's own reads (src/hooks/useConfirmPin.ts). Called on every
  // product, as a hook must be; only a product that prices an exit ever opens
  // it, and on any other it holds "closed" and reads nothing.
  const pin = useConfirmPin(vault, address, {
    vestingSeconds: vault.vestingSeconds,
    shareDecimals: vault.ui.decimals,
    shareSymbol,
    wantSymbol,
  });

  // Minimum you accept: NAV per share less the spread, times shares. Stage 1's
  // estimate, and still what a product with no vesting gap shows — there every
  // share prices at the share price, so this IS the number.
  const estMinOut =
    parsed !== null && shareValue
      ? parsed * shareValue * (1 - discountNum / 100)
      : null;

  // Where the shares vest AFTER they unlock, that estimate is wrong for anyone
  // still vesting: it prices unvested shares at the full share price, which is
  // the one price the solver will not pay. So on those products the panel
  // stops estimating and renders the quote model instead — the whole card, both
  // rows and the refusal, recomputed on every keystroke because it is a pure
  // function of what is in the box (src/lib/withdrawQuote.ts).
  //
  // The gate is the VESTING GAP, never the vault id: a product whose shares
  // have vested by the time they unlock has nothing to price against, and its
  // panel is stage 1's, untouched.
  const quote = hasVestingGap(vault)
    ? buildWithdrawQuote({
        history,
        shareBalance: sharesRaw,
        navPerShare: sharePriceRaw,
        now,
        unlockAt,
        paused,
        vestingSeconds: vault.vestingSeconds,
        shareLockSeconds: vault.ui.shareLockPeriod,
        shareDecimals: vault.ui.decimals,
        amount,
        holderSpreadPpm,
        holderSpreadIsDefault: !discount.trim() || discountInvalid,
        shareSymbol,
        wantSymbol,
      })
    : null;

  // What a post would carry, and the whole test for whether there is anything
  // to PIN. It is null on a product that prices no exit, on an amount nothing
  // would post, and in every state where the widget could not price at all —
  // and there posting stays OPEN at the holder's own spread (ADR-0003: the
  // widget never gates a post on its own reads), through stage 1's modal and
  // stage 1's write, disclosed by the notice above.
  const pinnable = quote?.post ?? null;

  // Whether a modal is open is the CONFIRM STEP's own state, never a live
  // figure's: `pinnable` is recomputed from a polled share price, and a tick
  // into the clamp mid-confirm would otherwise close a pinned modal with no
  // wording while its pin was still in flight. Exactly one of the two is ever
  // opened, so `pinning` also says which body to render.
  const pinning = pin.status !== "closed";

  const openConfirm = () => {
    if (pinnable) pin.open(pinnable.offerShares, holderSpreadPpm);
    else setConfirm(true);
  };
  const closeConfirm = () => {
    pin.close();
    setConfirm(false);
  };

  let validationError: string | null = null;
  if (parsed === null && amount.trim()) validationError = "Enter a valid share amount.";
  else if (overShares) validationError = "Amount exceeds your share balance.";
  else if (discountInvalid)
    validationError = `Spread must be between 0 and ${WITHDRAW_DISCOUNT_PCT_MAX}%.`;
  else if (validDaysInvalid)
    validationError = `Validity must be between 1 and ${MAX_VALID_DAYS} days.`;

  // What has to be true before any post can go out, whatever is in the box: the
  // library's provider ready, a signer on the right chain, nothing paused and
  // the share lock ended. Split out from `canSubmit` because the re-post below
  // has to ask it BEFORE an amount exists to ask about.
  const canPost =
    isBoringV1ContextReady && !!signer && rightChain && !paused && !locked;

  const canSubmit =
    canPost &&
    parsed !== null &&
    !overShares &&
    !discountInvalid &&
    !validDaysInvalid &&
    // The 1% clamp, and no override: the widget does not post a request it can
    // establish the solver will skip. The card names the cause and offers the
    // largest amount that does price.
    !quote?.refused &&
    !busy;

  // The side rail's re-post, granted. The row offers it only where a better
  // post exists; nothing it printed is carried into the write. What happens
  // here is that the box takes the request's own shares — the exact string that
  // converts back to them — and the PINNED CONFIRM opens over those shares, so
  // the ceiling, the spread and the ask are all recomputed at a block of its
  // own before anything is signed. Posting then replaces the open request for
  // the pair, which is stage 1's behaviour and the point of the offer.
  //
  // The SPREAD is this panel's, not the row's. The row quoted its button at the
  // widget's default, which is all the side rail can see; a holder who has
  // typed a wider one into the control below meant it, and the pin prices at
  // theirs — so the two can differ, and what the modal pins is what goes to the
  // queue. Never below the entitlement's required spread either way, which is
  // the posting rule's whole point.
  //
  // Deliberately an event rather than a subscription: everything but `repost`
  // is read at the instant the ask arrives, and the ask is spent in the same
  // breath (`onRepostHandled`). The ref is what makes "spent" true rather than
  // merely intended — an effect is invoked twice per mount under StrictMode,
  // and a pin is a chain read, not a render. Where a post could not go out at
  // all the box is still filled and the panel's own button explains itself,
  // over the amount the depositor asked about.
  const asked = useRef<RequestRepost | null>(null);
  useEffect(() => {
    if (!repost || asked.current === repost) return;
    asked.current = repost;
    onRepostHandled();
    setAmount(repost.amount);
    if (canPost && hasVestingGap(vault))
      pin.open(repost.offerShares, holderSpreadPpm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repost]);

  // The one write this panel makes. `discountPercent` is the ONLY argument that
  // differs between the two paths, and it differs only in where the number came
  // from: stage 1 reads the control, the priced path reads what the pin showed.
  async function post(discountPercent: string) {
    if (!signer) return;
    await queueWithdraw(
      signer,
      // The string as it was typed, not a round trip through a double: the
      // library converts it exactly (× 10^decimals, truncated), and MAX's
      // exact balance would lose its last digits through `String(parsed)`.
      amount.trim(),
      WITHDRAW_TOKEN,
      discountPercent,
      String(validDaysNum)
    );
    setAmount("");
    refetchRequest();
    onSuccess();
  }

  // Stage 1's, and still every unpriced product's: the control's own spread,
  // written the way stage 1 writes it.
  async function runRequest() {
    setConfirm(false);
    if (parsed === null) return;
    await post(String(discountNum));
  }

  // The priced product's. Confirm re-reads ONCE before anything is signed: if
  // the share price moved, the accountant paused, or the balance no longer
  // covers, the figures are pinned again and shown — never posted
  // (src/hooks/useConfirmPin.ts).
  async function runPinnedRequest() {
    // The shares this panel believes it is posting go INTO the re-check, so a
    // box that somehow moved re-pins over the new amount and says so rather
    // than being discovered afterwards.
    const posted = await pin.confirm(offerSharesOf(amount, vault.ui.decimals));
    // Re-pinned, or dismissed under the read. Either way the modal says what
    // happened and nothing is signed.
    if (posted === null) return;
    pin.close();
    // `String(d / 1e4)`, which the library's × 10⁴ → toFixed(0) round-trips
    // losslessly for every d in 0..10000 (src/lib/postingRule.ts, and
    // scripts/queue-withdraw-regression.cjs over the real compiled write). A
    // vested holder's required spread is 0, so their own spread wins and this
    // is byte-for-byte stage 1's argument; an unvested holder's is the one
    // their entitlement requires.
    await post(formatDiscountPercent(posted.discountPpm));
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
        // Frozen while a confirm modal is open: the figures in it were pinned
        // over the amount in this box, and a keystroke reaching it behind the
        // overlay would leave the two disagreeing about the one number that
        // matters.
        disabled={busy || !address || locked || pinning || confirm}
      />

      {/* Between the amount and the rows: the answer to the question the
          depositor came with, not another row. The stage-1 vesting notice is
          gone from this panel — the card says it, with this amount's own
          numbers in it (the deposit panel's notice is untouched). */}
      {quote && <QuoteCard card={quote.card} onUseOffer={setAmount} />}

      {/* The disclosure of last resort. The card normally carries it — with
          this amount's own numbers in it — but where nothing could be priced
          (the rate under review, a history or rate not yet read) posting still
          stays OPEN at the holder's own spread, and ADR-0003 allows that only
          disclosed. So stage 1's generic notice stands in for exactly those
          states, until the "when the widget cannot price" ticket lands wordings
          of their own. On a product with no vesting gap it renders nothing, as
          it always did, and the deposit panel's copy is untouched. */}
      {quote?.cannotPrice && <VestingNotice vault={vault} />}

      <div className="rows">
        <div className="row">
          <span>You receive (est., min)</span>
          <span>
            {quote
              ? quote.receive
              : estMinOut === null
              ? "—"
              : `${formatAmount(estMinOut, 2)} ${wantSymbol}`}
          </span>
        </div>
        <div className="row">
          <span>Redemption spread</span>
          <span>
            {!quote ? (
              effectiveSpread
            ) : quote.spreadIsRequired ? (
              <strong>{quote.spread}</strong>
            ) : (
              quote.spread
            )}
          </span>
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

      {/* Stage 1's lock notice, kept for the products whose card does not carry
          one: where an exit is priced, the quote card IS the lock notice, and
          two of them would say the same thing twice. */}
      {locked && !quote && (
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
          onClick={openConfirm}
        >
          Request redemption
        </Button>
      )}

      {/* The confirm step. On a product that prices an exit against the holder's
          entitlement it is a READ before it is a dialog: opening it pins the
          share price, the balance and the clock to one block, recomputes the
          ceiling and the discount over exactly the shares that would be
          offered, and shows them with the block number. Confirm re-reads once
          and re-pins rather than post if anything moved. Everywhere else it is
          stage 1's modal, unchanged. */}
      <Modal
        open={pinning || confirm}
        onClose={closeConfirm}
        title="Confirm redemption request"
        footer={
          // A pin that could not be taken replaces Confirm with Close: there is
          // nothing to confirm, and nothing was pinned to confirm it against.
          pinning && pin.pin?.kind === "cannot-pin" ? (
            <Button variant="ghost" onClick={closeConfirm}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={closeConfirm}>
                Cancel
              </Button>
              <Button
                loading={pinning && pin.status !== "ready"}
                disabled={pinning && pin.pin?.kind !== "pinned"}
                onClick={pinning ? runPinnedRequest : runRequest}
              >
                Confirm request
              </Button>
            </>
          )
        }
      >
        {pinning ? (
          <PinnedConfirm
            status={pin.status}
            pin={pin.pin}
            notice={pin.notice}
            // Stage 1's signing note, minus the six words that promise a
            // fill: "an off-chain solver fills it and sends you USDT" is
            // exactly what the pinned footer below exists to withhold. What it
            // keeps is the mechanics, which are as true here as ever.
            note={
              <p className="muted small">
                You may be asked to sign twice: first to approve {shareSymbol},
                then to submit the request. There is no separate claim step —
                the {wantSymbol} arrives with the fill.
              </p>
            }
          >
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
          </PinnedConfirm>
        ) : (
          <>
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
                  {estMinOut === null
                    ? "—"
                    : `${formatAmount(estMinOut, 2)} ${wantSymbol}`}
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
              You may be asked to sign twice: first to approve {shareSymbol},
              then to submit the request. An off-chain solver fills it and sends
              you {wantSymbol} — there is no separate claim step.
            </p>
          </>
        )}
      </Modal>
    </div>
  );
}
