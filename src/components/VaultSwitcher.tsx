import type { Vault } from "../lib/vaultRegistry";
import type { WindowApys } from "../hooks/useWindowApys";
import { fmtPct } from "../lib/format";

// The vault switcher: one chip per Coinchange product, above the action panel.
//
// A row of chips rather than two side-by-side or two stacked sections (spec,
// "Layout and selection"): a depositor acts on one product at a time, and the
// widget's whole action surface — deposit, withdraw, stats, pause banner — is
// worth more undivided than duplicated.
//
// Each chip carries its product's headline APY, so the reason to switch is
// visible before switching. That figure is the realised trailing APY over the
// 7-day window — what the product actually returned, never a target — and the
// label under it says so, including when a window that reaches back before a
// young product's launch is measured since launch instead.

export interface SwitcherProduct {
  vault: Vault;
  apys: WindowApys;
}

export function VaultSwitcher({
  products,
  selectedId,
  onSelect,
}: {
  products: SwitcherProduct[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="vault-switcher" role="tablist" aria-label="Product">
      {products.map(({ vault, apys }) => {
        const selected = vault.id === selectedId;
        const headline = apys.headline;
        // "…" while the scan or the first share-price poll is outstanding, "—"
        // once one of them has failed — the same distinction the hero draws,
        // from the same derivation.
        const figure = apys.loading ? "…" : fmtPct(headline?.apyPct ?? null);
        const negative = headline?.apyPct != null && headline.apyPct < 0;

        return (
          <button
            key={vault.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`vault-chip${selected ? " vault-chip--active" : ""}`}
            onClick={() => onSelect(vault.id)}
          >
            <span className="vault-chip__name">{vault.ui.name}</span>
            <span className="vault-chip__symbol">{vault.ui.symbol}</span>
            <span
              className={`vault-chip__apy${
                negative ? " vault-chip__apy--negative" : ""
              }`}
            >
              {figure}
            </span>
            <span className="vault-chip__label">
              {headline?.label ?? "7d APY"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
