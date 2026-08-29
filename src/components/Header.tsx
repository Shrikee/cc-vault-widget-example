import { ConnectKitButton } from "connectkit";

import { CHAIN_LABEL } from "../config/chain";
import { BASE_ASSET } from "../config/tokens";
import type { Vault } from "../lib/vaultRegistry";

// Names the product being looked at, so the page a depositor lands on says
// which of the two it is.
export function Header({ vault }: { vault: Vault }) {
  return (
    <header className="site-header">
      <div className="brand">
        <img
          className="brand__logo"
          src={BASE_ASSET.image}
          alt=""
          width={28}
          height={28}
        />
        <div className="brand__text">
          <span className="brand__name">Coinchange {vault.ui.name}</span>
          <span className="brand__sub">
            {vault.ui.symbol} · {CHAIN_LABEL}
          </span>
        </div>
      </div>
      <ConnectKitButton showBalance={false} />
    </header>
  );
}
