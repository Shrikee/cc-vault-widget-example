// Which product the page is showing, as the URL says it.
//
// The selection lives in a query parameter rather than in React state alone,
// because three people need it to survive the page: a depositor who reloads or
// bookmarks, a support agent who wants a link that opens the widget on the
// product a depositor is asking about, and the widget itself, which must land
// somewhere sensible when neither of them says anything.
//
// It is a query parameter and not a route: no router is introduced, and the id
// it carries is the registry's own — the same id the solver roster uses, so one
// product has one name in every repository and a URL naming it is greppable in
// any of them.
//
// Resolution is a pure function of the search string and the roster (spec,
// "Layout and selection"), which is what makes ./vaultSelection.test.ts able to
// drive the URLs that actually arrive — stale, truncated, hand-edited — without
// a DOM. The React side, which reads window.location and writes back with a
// history replace, is src/hooks/useVaultSelection.ts and holds no rules.
import type { VaultRoster } from "./vaultRegistry";
import { vaultById } from "./vaultRegistry";

export const VAULT_PARAM = "vault";

// The product a search string asks for, or the fallback.
//
// An absent, empty or unrecognised value is NOT an error and NOT a redirect: a
// support link that has gone stale, or a product this build does not carry,
// still opens the widget on the established product. Ids are matched exactly —
// a differently-cased id is not this registry's id, and guessing at what a
// visitor meant is how a link silently opens the wrong product.
//
// The fallback, unlike the parameter, is the widget's own and a typo in it is a
// programming error, so it goes through vaultById and throws rather than
// falling back to a fallback.
export function resolveVaultId(
  search: string,
  roster: VaultRoster,
  fallbackId: string
): string {
  const asked = new URLSearchParams(search).get(VAULT_PARAM);
  const found = roster.vaults.find((v) => v.id === asked);
  return found ? found.id : vaultById(roster, fallbackId).id;
}

// The search string that names `id`, with everything else the URL carried left
// where it was — a support link's own tracking parameters are not the widget's
// to drop.
//
// Writing back what resolution just read is deliberately a fixed point: the
// result resolves to the same id and rewriting it changes nothing, so the
// history replace that normalises a stale URL runs once and cannot loop.
export function searchWithVaultId(search: string, id: string): string {
  const params = new URLSearchParams(search);
  params.set(VAULT_PARAM, id);
  return `?${params.toString()}`;
}
