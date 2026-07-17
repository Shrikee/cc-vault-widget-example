import { ConnectKitButton } from "connectkit";
import { BASE_ASSET, SHARE_SYMBOL, VAULT_NAME } from "../config/vault";

export function Header() {
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
          <span className="brand__name">Coinchange {VAULT_NAME}</span>
          <span className="brand__sub">{SHARE_SYMBOL} · Ethereum</span>
        </div>
      </div>
      <ConnectKitButton showBalance={false} />
    </header>
  );
}
