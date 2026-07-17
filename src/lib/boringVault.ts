// Single place that re-exports the bits of boring-vault-ui we use.
//
// IMPORTANT packaging note (verified against boring-vault-ui@1.6.3):
// the package.json `exports` map only exposes "." and "./types". So:
//   • Provider + hook must be imported from the package ROOT ("boring-vault-ui").
//     (Importing the root also pulls in DepositButton -> @chakra-ui/react, which
//      is a declared dependency and bundles fine even though we build custom UI.)
//   • Types must be imported from "boring-vault-ui/types".
//   • The deep paths the integration doc suggests — "boring-vault-ui/dist/hooks/
//     ethers" (§5) and "boring-vault-ui/dist/components/v1/..." (§12) — DO NOT
//     resolve under bundlers that honor `exports`. `useEthersSigner` is also not
//     re-exported from the root, so we provide it locally (see ./useEthersSigner).
//
// VERSION FLOOR — never install below 1.6.3: queueWithdraw in <= 1.6.2
// converted the share amount to base units with BigNumber.toNumber(); on this
// 18-decimal vault anything above ~0.009 shares exceeds Number.MAX_SAFE_INTEGER
// and ethers v6 throws `overflow ... INVALID_ARGUMENT` while encoding
// approve/safeUpdateAtomicRequest, so every real redemption request failed
// client-side. 1.6.3 (upstream commit 523c8ab) passes amounts as decimal
// strings (toFixed(0)) on both the withdraw and deposit paths.
// Guarded by `npm run test:withdraw` (scripts/queue-withdraw-regression.cjs).
// Residual: the pre-approve allowance check still compares as floats — can't
// throw, worst case skips the approve and the request reverts on-chain.
export { BoringVaultV1Provider, useBoringVaultV1 } from "boring-vault-ui";

export { useEthersSigner } from "./useEthersSigner";

export type {
  Token,
  DepositStatus,
  WithdrawStatus,
} from "boring-vault-ui/types";
