import { useEffect, useRef } from "react";
import { erc20Abi } from "viem";
import { useReadContract } from "wagmi";
import { WITHDRAW_TOKEN } from "../config/tokens";
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
// `onFilled` fires when a poll observes THIS product's request transition from
// open to zeroed. Only a solver fill zeroes the struct (a replace re-populates it, Stop
// leaves it in place, expiry leaves it in place, and the solver can't fill past
// the deadline), so a fillable→zero transition means the user got their USDT.
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

  // Fill detection: remember the last observed request per address AND product,
  // and fire onFilled on an open→zero transition (see the function comment).
  // The callback lives in a ref so a new identity each render doesn't re-run
  // the effect.
  //
  // The product belongs in that memory as much as the address does. This hook
  // follows the selected product, so switching hands it a different queue —
  // and a depositor with an open 24h request who looks at the 30d product would
  // otherwise be shown an open→zero transition that is nothing of the kind, and
  // congratulated on a fill that never happened. A remembered request answers
  // for the queue it was read from, or for nothing.
  const onFilledRef = useRef(onFilled);
  useEffect(() => {
    onFilledRef.current = onFilled;
  }, [onFilled]);
  const lastSeen = useRef<{
    vaultId: string;
    addr: `0x${string}`;
    offerAmount: bigint;
    deadline: number;
    inSolve: boolean;
  } | null>(null);
  useEffect(() => {
    if (!address || raw === undefined) {
      if (!address) lastSeen.current = null;
      return;
    }
    const prev = lastSeen.current;
    if (
      prev &&
      prev.vaultId === vault.id &&
      prev.addr === address &&
      prev.offerAmount > 0n &&
      raw.offerAmount === 0n &&
      // The solver can only fill within the deadline; an expired struct going to
      // zero would be an admin cleanup, not a payout — stay quiet on those. The
      // grace covers a fill that landed just before a deadline we observe just
      // after (we poll every 30s).
      (prev.inSolve || nowSeconds() <= prev.deadline + 60)
    ) {
      onFilledRef.current?.();
    }
    lastSeen.current = {
      vaultId: vault.id,
      addr: address,
      offerAmount: raw.offerAmount,
      deadline: Number(raw.deadline),
      inSolve: raw.inSolve,
    };
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
