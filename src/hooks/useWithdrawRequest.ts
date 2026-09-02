import { useEffect, useRef } from "react";
import { erc20Abi } from "viem";
import { useReadContract } from "wagmi";
import { WITHDRAW_TOKEN } from "../config/tokens";
import { isFillTransition, type QueueSnapshot } from "../lib/requestFill";
import { nowSeconds } from "../lib/time";
import type { Vault } from "../lib/vaultRegistry";
import { useReportedReadError } from "./useReportedReadError";

// The user's open redemption request, decoded to human units.
export interface WithdrawRequest {
  shares: number; // CCUSD shares offered for redemption
  minPrice: number; // min USDT the user accepts per share (atomicPrice)
  // The same two figures undivided, exactly as the queue holds them. The floats
  // above are what the row PRINTS; these are what it is JUDGED from, because a
  // request is measured against the entitlement ceiling to the want unit and 18
  // decimals do not survive a double (src/lib/requestRow.ts).
  sharesRaw: bigint;
  minPriceRaw: bigint;
  deadline: number; // unix seconds the request stays open until
  inSolve: boolean; // the solver is currently filling it
  // CCUSD allowance to the queue still covers the request. This vault's raw
  // `updateAtomicRequest` (cancel/zero) is admin-gated, so a user "cancels" by
  // revoking this approval — the solver skips requests it can't pull shares for.
  approved: boolean;
}

export interface WithdrawRequestState {
  request: WithdrawRequest | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Minimal AtomicQueue ABI — `getUserAtomicRequest(user, offer, want)` returns the
// caller's single open AtomicRequest struct for that (offer, want) pair. We read
// it directly on-chain rather than via the package's Seven Seas indexer, which
// does not track this Coinchange vault.
const ATOMIC_QUEUE_ABI = [
  {
    type: "function",
    name: "getUserAtomicRequest",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "offer", type: "address" },
      { name: "want", type: "address" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "deadline", type: "uint64" },
          { name: "atomicPrice", type: "uint88" },
          { name: "offerAmount", type: "uint96" },
          { name: "inSolve", type: "bool" },
        ],
      },
    ],
  },
] as const;

// Reads the connected user's open AtomicQueue redemption request for the vault's
// shares → WITHDRAW_TOKEN (USDT), plus their CCUSD allowance to the queue (so the
// UI can tell a stopped request from an open one). Returns null when there
// is no open request (offerAmount == 0). Polls so a filled/expired/stopped
// request reflects promptly.
//
// One instance per product, and every product always: the widget polls BOTH
// AtomicQueues so that a redemption in flight is never hidden by looking at the
// other product, and so that the fill confirmation fires whichever product
// filled (spec, "Redemptions").
//
// `onFilled` fires when a poll observes THIS product's request transition from
// open to zeroed — the decision, and the several ways of vanishing that are not
// that, are in ../lib/requestFill.ts. The caller is told nothing about which
// product filled because it does not need telling: it handed this instance the
// vault, so the callback it passed is already about that one.
export function useWithdrawRequest(
  vault: Vault,
  address?: `0x${string}`,
  onFilled?: () => void
): WithdrawRequestState {
  const reqQuery = useReadContract({
    address: vault.addresses.queue,
    abi: ATOMIC_QUEUE_ABI,
    functionName: "getUserAtomicRequest",
    args: address
      ? [address, vault.addresses.vault, WITHDRAW_TOKEN.address as `0x${string}`]
      : undefined,
    query: { enabled: Boolean(address), refetchInterval: 30_000 },
  });

  const allowanceQuery = useReadContract({
    address: vault.addresses.vault,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, vault.addresses.queue] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 30_000 },
  });

  const raw = reqQuery.data;
  const allowance = allowanceQuery.data;

  // Raw errors to the console, classified phrases to the card (ADR-0004) —
  // the shared shape in ./useReportedReadError.ts, once per query.
  const reqError = useReportedReadError("atomic-queue read failed", reqQuery.error);
  const allowanceError = useReportedReadError(
    "queue-allowance read failed",
    allowanceQuery.error
  );

  // Fill detection: remember the last read of this queue, tagged with the queue
  // and the wallet it was read for, and announce a fill when the read that
  // follows it is one. The callback lives in a ref so a new identity each
  // render doesn't re-run the effect.
  //
  // The tags stay, and the reason is the ref. Elsewhere in this repository a
  // guard like this was deleted once the value it protected became a call
  // argument — a read for another wallet answers under another cache key and
  // cannot land in this one's state (see ../hooks/useUserPosition.ts). That
  // argument does NOT reach a ref: `lastSeen` is written by this instance and
  // survives whatever it is next handed, so a memory of one queue can outlive
  // the vault it was read for, and a memory of one wallet can outlive the
  // wallet. Both then look exactly like an open request vanishing.
  //
  // Widening to two queues did shrink the everyday case — this hook no longer
  // follows the selection, so switching products can no longer hand a mounted
  // instance the other product's queue. It did not remove the ref.
  const onFilledRef = useRef(onFilled);
  useEffect(() => {
    onFilledRef.current = onFilled;
  }, [onFilled]);
  const lastSeen = useRef<QueueSnapshot | null>(null);
  useEffect(() => {
    if (!address || raw === undefined) {
      if (!address) lastSeen.current = null;
      return;
    }
    const seen: QueueSnapshot = {
      vaultId: vault.id,
      owner: address,
      offerAmount: raw.offerAmount,
      deadline: Number(raw.deadline),
      inSolve: raw.inSolve,
    };
    if (isFillTransition(lastSeen.current, seen, nowSeconds())) {
      onFilledRef.current?.();
    }
    lastSeen.current = seen;
  }, [vault.id, address, raw]);
  let request: WithdrawRequest | null = null;
  if (raw && raw.offerAmount > 0n) {
    request = {
      shares: Number(raw.offerAmount) / 10 ** vault.ui.decimals,
      minPrice: Number(raw.atomicPrice) / 10 ** WITHDRAW_TOKEN.decimals,
      sharesRaw: raw.offerAmount,
      minPriceRaw: raw.atomicPrice,
      deadline: Number(raw.deadline),
      inSolve: raw.inSolve,
      approved: allowance !== undefined && allowance >= raw.offerAmount,
    };
  }

  return {
    request,
    loading: reqQuery.isLoading || allowanceQuery.isLoading,
    error: reqError ?? allowanceError,
    refetch: () => {
      reqQuery.refetch();
      allowanceQuery.refetch();
    },
  };
}
