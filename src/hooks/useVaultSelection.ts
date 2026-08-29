import { useCallback, useEffect, useState } from "react";

import type { VaultRoster } from "../lib/vaultRegistry";
import { resolveVaultId, searchWithVaultId } from "../lib/vaultSelection";

// The selected product, held in the page URL.
//
// This is the browser half of src/lib/vaultSelection.ts and holds no rules of
// its own: which id a search string means is decided there, where it is testable
// without a DOM. What is here is the address bar — reading it, following the
// back button, and writing the selection back.
//
// The write is a REPLACE and not a push, deliberately. Switching products is
// changing what one page shows, not navigating to another; pushing would make
// the back button walk the depositor through every chip they tried instead of
// taking them where they came from.
//
// The resolved id is written back even when the visitor named nothing, so the
// URL always names the product on screen and what a depositor copies out of the
// address bar is what they were looking at. That normalisation is safe to run
// on every render because it is a fixed point (see searchWithVaultId): once the
// URL names the resolved product there is nothing left to write.

export interface VaultSelection {
  selectedId: string;
  select: (id: string) => void;
}

export function useVaultSelection(
  roster: VaultRoster,
  fallbackId: string
): VaultSelection {
  const [search, setSearch] = useState(() => window.location.search);

  // The back and forward buttons move the address bar without telling React.
  useEffect(() => {
    const onPopState = () => setSearch(window.location.search);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const selectedId = resolveVaultId(search, roster, fallbackId);

  const select = useCallback((id: string) => {
    // Read the live location rather than the state above: the address bar is
    // the record, and anything else that touched it must not be undone here.
    const { pathname, search: current, hash } = window.location;
    const next = searchWithVaultId(current, id);
    if (next !== current) {
      window.history.replaceState(window.history.state, "", `${pathname}${next}${hash}`);
    }
    setSearch(next);
  }, []);

  // Normalise the URL to the product actually on screen. Runs once per
  // resolution: after it, the parameter resolves to itself and select() finds
  // nothing to change.
  useEffect(() => {
    select(selectedId);
  }, [select, selectedId]);

  return { selectedId, select };
}
