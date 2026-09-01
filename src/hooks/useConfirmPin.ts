import { useCallback, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";

import { CHAIN_ID } from "../config/chain";
import {
  buildConfirmPin,
  pinReadsOf,
  pinUnread,
  rePinNotice,
  AMOUNT_CHANGED_NOTICE,
  RECHECK_UNREAD_NOTICE,
  UNREAD,
  type ConfirmPin,
  type PinReads,
} from "../lib/confirmPin";
import { recheckBeforePost } from "../lib/confirmRecheck";
import { heldScan } from "../lib/heldScan";
import { isAccountantPaused, lastRateUpdate, pinCalls } from "../lib/lens";
import { errorMessage } from "../lib/logScan";
import { scanKey } from "../lib/scanRuns";
import type { Vault } from "../lib/vaultRegistry";
import { deriveWallet, readWalletScan } from "../lib/walletScan";
import type { PostablePost } from "../lib/postingRule";

// The chain side of the confirm pin (spec §"The confirm pin and re-check").
//
// Opening the modal is not a render — it is a read. This hook is the two reads
// that make it one:
//
//   THE PIN. One head block is chosen, ONE TAIL runs from the wallet scan's
//   cursor to it, and ONE BATCH reads the guarded rate, the share balance and
//   the accountant's state AT THAT BLOCK. The head block's own timestamp is the
//   clock the ceiling is recomputed against, so every figure in the modal was
//   true at one block and the modal says which.
//
//   THE RE-CHECK. On Confirm, ONE multicall re-reads `accountantState` and
//   `balanceOf`. If the rate moved, the accountant paused, or the balance no
//   longer covers — it re-pins and shows, and NEVER posts. That is the whole
//   safety property: between pin and transaction an unvested lot's ask rises
//   with the share price while its ceiling does not, so a rate tick in the gap
//   is a certain skip.
//
// It decides nothing about what any of that MEANS. Which reads to make is
// src/lib/lens.ts's, what the figures come to is src/lib/confirmPin.ts's, and
// whether to post is src/lib/confirmRecheck.ts's — this holds the network and
// the modal's own state, and does what those three say.

export type PinStatus =
  // The modal is closed.
  | "closed"
  // Reading: the tail and the batch are in flight.
  | "pinning"
  // Pinned (or refused) — `pin` says which.
  | "ready"
  // Confirm was pressed and the re-check is in flight.
  | "confirming";

export interface ConfirmPinState {
  status: PinStatus;
  // What the modal renders. Null only while the first pin is in flight.
  pin: ConfirmPin | null;
  // Why the figures below are not the ones the depositor last looked at — set
  // when a re-check refused to post and pinned again. Cleared by the next open.
  notice: string | null;
}

export interface ConfirmPinControls extends ConfirmPinState {
  // Pin the figures for these shares at this spread, and open.
  open: (offerShares: bigint, holderSpreadPpm: bigint) => void;
  close: () => void;
  // Re-read once, for the shares the caller still believes it is posting.
  // Resolves with what to post, or null when it re-pinned instead (or was
  // closed) — in which case nothing may be signed.
  confirm: (offerShares: bigint) => Promise<PostablePost | null>;
}

const CLOSED: ConfirmPinState = { status: "closed", pin: null, notice: null };

// What a pin is asked for. Held across a re-pin so the second pin prices the
// same request as the first.
interface PinRequest {
  offerShares: bigint;
  holderSpreadPpm: bigint;
}

export function useConfirmPin(
  vault: Vault,
  address: Address | undefined,
  // Everything the recompute needs that is a property of the product rather
  // than of the read.
  shape: {
    vestingSeconds: number;
    shareDecimals: number;
    shareSymbol: string;
    wantSymbol: string;
  }
): ConfirmPinControls {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [state, setState] = useState<ConfirmPinState>(CLOSED);
  // What is being pinned, and what the last pin came back with. Refs because
  // `confirm` must read the CURRENT pin without being re-created for every
  // render the modal is open through.
  const request = useRef<PinRequest | null>(null);
  const pinned = useRef<ConfirmPin | null>(null);
  const { vestingSeconds, shareDecimals, shareSymbol, wantSymbol } = shape;

  // One pin: the head, the tail, the batch. Resolves with what was read, or
  // with why it could not be — never throws, because a modal that vanished on
  // a dropped request would be a modal that posted nothing and said nothing.
  const readPin = useCallback(async (): Promise<PinReads> => {
    // Gathering, and nothing else: which of these absences means "paused" and
    // which means "unread" is src/lib/confirmPin.ts's to say, and it says it
    // under test.
    if (!client || !address) return pinUnread(UNREAD.noWallet);
    const held = heldScan(scanKey(vault.id, address));
    if (!held) return pinUnread(UNREAD.noHistory);
    try {
      // The head is taken as a BLOCK, not a number: its timestamp is the clock
      // the ceiling is recomputed against, and asking for the number and the
      // time separately would be asking about two blocks.
      const head = await client.getBlock({ blockTag: "latest" });
      const [scan, batch] = await Promise.all([
        readWalletScan({
          client,
          vault,
          wallet: address,
          resumeFrom: held.cursor + 1n,
          head: head.number,
          held: held.scan,
        }),
        client.multicall({
          contracts: pinCalls.pin(vault, address),
          blockNumber: head.number,
          // The guarded rate's revert is an ANSWER, not a failure — see
          // src/lib/lens.ts — so the batch must survive it.
          allowFailure: true,
        }),
      ]);
      const [rate, balance, accountant] = batch;
      const failed =
        balance.status !== "success"
          ? balance.error
          : accountant.status !== "success"
          ? accountant.error
          : null;
      return pinReadsOf({
        blockNumber: head.number,
        now: Number(head.timestamp),
        navPerShare: rate.status === "success" ? rate.result : null,
        shareBalance: balance.status === "success" ? balance.result : null,
        rateUpdatedAt:
          accountant.status === "success"
            ? lastRateUpdate(accountant.result)
            : null,
        paused:
          accountant.status === "success"
            ? isAccountantPaused(accountant.result)
            : null,
        history: deriveWallet(scan, vault, address).history ?? null,
        detail: failed === null ? null : errorMessage(failed),
      });
    } catch (e) {
      // The tail is ALL-OR-NOTHING like every other scan run: a dropped chunk
      // or an undated transfer would price an unvested lot at the full share
      // price, which is the over-quote the solver skips.
      return pinUnread(errorMessage(e));
    }
  }, [client, vault, address]);

  // Pin, and show whatever came back. `notice` is carried so a re-pin can say
  // why the figures moved.
  const pin = useCallback(
    async (req: PinRequest, notice: string | null): Promise<void> => {
      request.current = req;
      pinned.current = null;
      setState({ status: "pinning", pin: null, notice });
      const reads = await readPin();
      // Dropped: the modal was closed, or another pin was asked for.
      if (request.current !== req) return;
      const built = buildConfirmPin({
        reads,
        offerShares: req.offerShares,
        holderSpreadPpm: req.holderSpreadPpm,
        vestingSeconds,
        shareDecimals,
        shareSymbol,
        wantSymbol,
      });
      pinned.current = built;
      setState({ status: "ready", pin: built, notice });
    },
    [readPin, vestingSeconds, shareDecimals, shareSymbol, wantSymbol]
  );

  const open = useCallback(
    (offerShares: bigint, holderSpreadPpm: bigint) => {
      void pin({ offerShares, holderSpreadPpm }, null);
    },
    [pin]
  );

  const close = useCallback(() => {
    request.current = null;
    pinned.current = null;
    setState(CLOSED);
  }, []);

  const confirm = useCallback(
    async (offerShares: bigint): Promise<PostablePost | null> => {
      const req = request.current;
      const current = pinned.current;
      // Nothing pinned is nothing to post. The button is disabled in that
      // state; this is the guarantee behind the button rather than a message
      // about it.
      if (!client || !address || !req || current?.kind !== "pinned") return null;
      // The caller is confirming a different amount from the one these figures
      // were pinned over. The amount box is disabled while the modal is open so
      // this cannot happen — but a POST is not where an invariant should be
      // discovered to have slipped, so it re-pins over the amount that is
      // actually there and says so.
      if (offerShares !== req.offerShares) {
        await pin({ ...req, offerShares }, AMOUNT_CHANGED_NOTICE);
        return null;
      }

      setState((s) => ({ ...s, status: "confirming" }));
      let fresh;
      try {
        const [accountant, balance] = await client.multicall({
          contracts: pinCalls.recheck(vault, address),
          allowFailure: false,
        });
        fresh = {
          rateUpdatedAt: lastRateUpdate(accountant),
          paused: isAccountantPaused(accountant),
          shareBalance: balance,
        };
      } catch {
        // The re-check itself did not land. Pin again rather than post against
        // figures nothing confirmed — the whole point of reading twice.
        if (request.current !== req) return null;
        await pin(req, RECHECK_UNREAD_NOTICE);
        return null;
      }
      // CLOSED, OR SUPERSEDED, UNDER THE AWAIT. Cancel, Escape and the backdrop
      // all null the request, and a modal the depositor dismissed must not go
      // on to sign — nor may its verdict write state that would reopen it.
      if (request.current !== req) return null;

      const verdict = recheckBeforePost(current.pinned, fresh);
      if (verdict.verdict === "re-pin") {
        await pin(req, rePinNotice(verdict.cause));
        return null;
      }
      setState((s) => ({ ...s, status: "ready" }));
      return current.post;
    },
    [client, vault, address, pin]
  );

  return { ...state, open, close, confirm };
}
