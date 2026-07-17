import { useReadContracts } from "wagmi";
import { CONTRACTS } from "../config/vault";

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
}

export function usePauseStatus(): PauseStatus {
  const { data } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.teller as `0x${string}`,
        abi: IS_PAUSED_ABI,
        functionName: "isPaused",
      },
      {
        address: CONTRACTS.accountant as `0x${string}`,
        abi: ACCOUNTANT_STATE_ABI,
        functionName: "accountantState",
      },
      {
        address: CONTRACTS.withdrawQueue as `0x${string}`,
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

  return {
    tellerPaused,
    accountantPaused,
    queuePaused,
    depositsPaused: tellerPaused || accountantPaused,
    withdrawalsPaused: queuePaused || accountantPaused,
    anyPaused: tellerPaused || accountantPaused || queuePaused,
  };
}
