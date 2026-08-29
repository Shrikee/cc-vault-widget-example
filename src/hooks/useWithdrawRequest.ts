import { useEffect, useRef } from "react";
import { erc20Abi } from "viem";
import { useReadContract } from "wagmi";
import { WITHDRAW_TOKEN } from "../config/tokens";
import { isFillTransition, type QueueSnapshot } from "../lib/redemptions";
import { nowSeconds } from "../lib/time";
import type { Vault } from "../lib/vaultRegistry";

// The user's open redemption request, decoded to human units.
export interface WithdrawRequest {
  shares: number; // CCUSD shares offered for redemption
  minPrice: number; // min USDT the user accepts per share (atomicPrice)
  deadline: number; // unix seconds the request stays fillable until
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
// UI can tell whether the request is actually fillable). Returns null when there
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
// that, are in ../lib/redemptions.ts. The caller is told nothing about which
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

  // Fill detection: remember the last read of this queue, tagged with the queue
  // and the wallet it was read for, and announce a fill when the read that
  // follows it is one. The callback lives in a ref so a new identity each
  // render doesn't re-run the effect.
  //
  // The tags are what make the memory mean anything, and polling two queues is
  // what makes them load-bearing rather than defensive. Each product's read
  // carries its own wagmi cache key, so one queue's poll can never land in the
  // other's memory; the tags close the remaining gaps, which are this instance
  // being handed a different vault and the wallet changing under it. Neither is
  // a fill, and both look exactly like one.
  //
  // What USED to be the sharp edge here is gone: this hook no longer follows
  // the selected product, so switching products no longer hands it another
  // product's queue mid-flight. Its memory is now only ever compared against
  // more reads of the queue it was mounted for.
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
      deadline: Number(raw.deadline),
      inSolve: raw.inSolve,
      approved: allowance !== undefined && allowance >= raw.offerAmount,
    };
  }

  return {
    request,
    loading: reqQuery.isLoading || allowanceQuery.isLoading,
    error: reqQuery.error
      ? reqQuery.error.message
      : allowanceQuery.error
      ? allowanceQuery.error.message
      : null,
    refetch: () => {
      reqQuery.refetch();
      allowanceQuery.refetch();
    },
  };
}
