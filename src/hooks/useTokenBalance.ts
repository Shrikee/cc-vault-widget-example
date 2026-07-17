import { erc20Abi } from "viem";
import { useReadContract } from "wagmi";
import type { Token } from "../lib/boringVault";

// Wallet ERC-20 balance for `token`, decimal-adjusted to a human number.
export function useTokenBalance(token: Token, address?: `0x${string}`) {
  const query = useReadContract({
    address: token.address as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 30_000,
    },
  });

  const balance =
    query.data !== undefined
      ? Number(query.data) / 10 ** token.decimals
      : null;

  return { balance, ...query };
}
