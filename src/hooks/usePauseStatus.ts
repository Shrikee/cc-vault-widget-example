import { useReadContracts } from "wagmi";

import type { Vault } from "../lib/vaultRegistry";

// The system has three independent pause flags (integration guide §10):
//   • teller.isPaused()          — blocks deposits
//   • accountantState().isPaused — blocks all pricing (getRate*Safe reverts), so
//                                  both deposits and redemption requests fail
//   • queue.isPaused()           — blocks posting/replacing requests and fills
// Poll them and surface a banner instead of letting transactions revert.

const IS_PAUSED_ABI = [
  {
    type: "function",
    name: "isPaused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;

// Auto-generated getter for the public AccountantState struct returns the
// fields flattened, in declaration order; isPaused is the 9th (index 8).
const ACCOUNTANT_STATE_ABI = [
  {
    type: "function",
    name: "accountantState",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "payoutAddress", type: "address" },
      { name: "highwaterMark", type: "uint96" },
      { name: "feesOwedInBase", type: "uint128" },
      { name: "totalSharesLastUpdate", type: "uint128" },
      { name: "exchangeRate", type: "uint96" },
      { name: "allowedExchangeRateChangeUpper", type: "uint16" },
      { name: "allowedExchangeRateChangeLower", type: "uint16" },
      { name: "lastUpdateTimestamp", type: "uint64" },
      { name: "isPaused", type: "bool" },
      { name: "minimumUpdateDelayInSeconds", type: "uint24" },
      { name: "managementFee", type: "uint16" },
      { name: "performanceFee", type: "uint16" },
    ],
  },
] as const;

export interface PauseStatus {
  tellerPaused: boolean;
  accountantPaused: boolean;
  queuePaused: boolean;
  // Derived gates for the two user flows.
  depositsPaused: boolean;
  withdrawalsPaused: boolean;
  anyPaused: boolean;
  // The accountant's flag as a surface that PRICES must read it: true while the
  // share price is under review, false while it is not, and null until this
  // poll has answered at all. The booleans above default to "not paused" until
  // then (see below), which is the right stance for gating a transaction and
  // the wrong one for quoting a number — the auto-pause stores the
  // out-of-bounds rate BEFORE pausing, so the unguarded rate the Lens serves
  // while paused is the number under review, and a flag nobody has read yet is
  // not permission to price against it (spec §"When the widget cannot price").
  // Only the accountant: a paused queue blocks posting, not pricing.
  pricingPaused: boolean | null;
  // When the accountant last posted a share price, in unix seconds; null until
  // the first poll resolves (or if it never has). Read off the accountantState()
  // poll above, so it costs no extra request and is at most 30 s stale.
  lastSharePriceUpdateAt: number | null;
}

// The three flags belong to one product's contracts, so the vault being looked
// at is the argument: a pause on the other product must not block a page the
// visitor can actually use.
export function usePauseStatus(vault: Vault): PauseStatus {
  const { data } = useReadContracts({
    contracts: [
      {
        address: vault.addresses.teller,
        abi: IS_PAUSED_ABI,
        functionName: "isPaused",
      },
      {
        address: vault.addresses.accountant,
        abi: ACCOUNTANT_STATE_ABI,
        functionName: "accountantState",
      },
      {
        address: vault.addresses.queue,
        abi: IS_PAUSED_ABI,
        functionName: "isPaused",
      },
    ],
    query: { refetchInterval: 30_000 },
  });

  // On read failure, err on the side of "not paused" — the flow still surfaces
  // the real revert, and we avoid falsely locking the UI on an RPC hiccup.
  const tellerPaused = data?.[0]?.result === true;
  const accountantPaused = data?.[1]?.result?.[8] === true;
  const queuePaused = data?.[2]?.result === true;

  // Field index 7 of the struct is lastUpdateTimestamp — the moment the
  // accountant last posted a share price. The uint64 arrives as a bigint; 0
  // means none has ever been posted, which is no more knowable than an
  // unresolved poll, so both collapse to null and the caller omits the badge.
  const lastUpdate = data?.[1]?.result?.[7];
  const lastSharePriceUpdateAt =
    lastUpdate === undefined || lastUpdate === 0n ? null : Number(lastUpdate);

  return {
    tellerPaused,
    accountantPaused,
    queuePaused,
    depositsPaused: tellerPaused || accountantPaused,
    withdrawalsPaused: queuePaused || accountantPaused,
    anyPaused: tellerPaused || accountantPaused || queuePaused,
    pricingPaused: data === undefined ? null : accountantPaused,
    lastSharePriceUpdateAt,
  };
}
