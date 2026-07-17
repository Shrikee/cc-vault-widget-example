import { useAccount, useSwitchChain } from "wagmi";
import { CHAIN_ID } from "../config/vault";
import { Button } from "./ui";

// Vault writes only work on the vault's chain. Prompt a switch if the connected
// wallet is elsewhere (doc §13: "ensure the connected wallet chain matches").
export function NetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === CHAIN_ID) return null;

  return (
    <div className="banner banner--warning" role="alert">
      <span>
        Wrong network. Switch to <strong>Ethereum mainnet</strong> to deposit or
        withdraw.
      </span>
      <Button
        variant="secondary"
        loading={isPending}
        onClick={() => switchChain({ chainId: CHAIN_ID })}
      >
        Switch network
      </Button>
    </div>
  );
}
