// Single place that re-exports the bits of boring-vault-ui we use.
//
// IMPORTANT packaging note (verified against boring-vault-ui@1.6.1):
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
// PATCHED (patches/boring-vault-ui+1.6.1.patch, applied by postinstall):
// queueWithdraw converted the share amount to base units with
// BigNumber.toNumber(); on this 18-decimal vault anything above ~0.009 shares
// exceeds Number.MAX_SAFE_INTEGER and ethers v6 throws
// `overflow ... INVALID_ARGUMENT` while encoding approve/safeUpdateAtomicRequest,
// so every real redemption request failed client-side. The patch passes the
// amount as a decimal string (toFixed(0)) and compares the allowance as BigInt.
// Guarded by `npm run test:withdraw` (scripts/queue-withdraw-regression.cjs).
// The package's deposit path has the same latent .toNumber() bug — harmless
// today because our deposit tokens (USDT/USDC) are 6-decimal, but revisit
// before ever adding an 18-decimal deposit token.
export { BoringVaultV1Provider, useBoringVaultV1 } from "boring-vault-ui";

export { useEthersSigner } from "./useEthersSigner";

export type {
  Token,
  DepositStatus,
  WithdrawStatus,
} from "boring-vault-ui/types";
