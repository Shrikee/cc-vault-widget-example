// Which product a URL asks for (spec, "Layout and selection") —
// src/lib/vaultSelection.ts.
//
// Resolution is a pure function of the search string and the roster, so these
// vectors need no DOM, no router and no browser: the strings below are the ones
// a support link, a bookmark or a stale URL actually arrives as.
import { describe, expect, it } from "vitest";

import { DEFAULT_VAULT_ID, ROSTER } from "../config/vaults";
import { resolveVaultId, searchWithVaultId, VAULT_PARAM } from "./vaultSelection";

const resolve = (search: string) => resolveVaultId(search, ROSTER, DEFAULT_VAULT_ID);

describe("a URL naming a product", () => {
  it("selects it", () => {
    expect(resolve("?vault=coinchange-30d-polygon")).toBe("coinchange-30d-polygon");
    expect(resolve("?vault=coinchange-24h-polygon")).toBe("coinchange-24h-polygon");
  });

  it("is read the same with or without the leading ?", () => {
    expect(resolve("vault=coinchange-30d-polygon")).toBe("coinchange-30d-polygon");
  });

  it("is read alongside whatever else the URL carries", () => {
    expect(resolve("?ref=support&vault=coinchange-30d-polygon&utm=x")).toBe(
      "coinchange-30d-polygon"
    );
  });

  it("names it by the registry's own id", () => {
    // The same id the solver roster uses, so a support link is greppable in
    // every repository that knows the product.
    expect(ROSTER.vaults.map((v) => v.id)).toContain("coinchange-30d-polygon");
    expect(VAULT_PARAM).toBe("vault");
  });
});

describe("a URL that names no product this widget has", () => {
  // Never an error and never a redirect: a stale link still opens the widget,
  // on the established product.
  it("lands on the 24h product", () => {
    expect(DEFAULT_VAULT_ID).toBe("coinchange-24h-polygon");
    expect(resolve("")).toBe(DEFAULT_VAULT_ID); // no parameter at all
    expect(resolve("?ref=support")).toBe(DEFAULT_VAULT_ID); // other parameters only
    expect(resolve("?vault=")).toBe(DEFAULT_VAULT_ID); // present but empty
    expect(resolve("?vault=coinchange-90d-polygon")).toBe(DEFAULT_VAULT_ID); // not launched
    expect(resolve("?vault=COINCHANGE-24H-POLYGON")).toBe(DEFAULT_VAULT_ID); // ids are exact
    expect(resolve("?vault=%20")).toBe(DEFAULT_VAULT_ID);
    expect(resolve("?vault=../../etc/passwd")).toBe(DEFAULT_VAULT_ID);
  });

  it("resolves to an id the roster declares, whatever it was given", () => {
    const declared = ROSTER.vaults.map((v) => v.id);
    for (const search of ["", "?", "?vault", "?vault=&vault=x", "?VAULT=coinchange-30d-polygon"]) {
      expect(declared).toContain(resolve(search));
    }
  });
});

describe("writing the selection back", () => {
  it("names the product, keeping everything else the URL carried", () => {
    expect(searchWithVaultId("?ref=support", "coinchange-30d-polygon")).toBe(
      "?ref=support&vault=coinchange-30d-polygon"
    );
  });

  it("replaces a product already named rather than adding a second", () => {
    expect(
      searchWithVaultId("?vault=coinchange-24h-polygon&ref=support", "coinchange-30d-polygon")
    ).toBe("?vault=coinchange-30d-polygon&ref=support");
  });

  it("is what the next resolution reads back", () => {
    // The property that keeps the history replace from looping: writing the
    // resolved id produces a search string that resolves to the same id, so
    // the second pass has nothing left to write.
    for (const search of ["", "?vault=nonsense", "?ref=support"]) {
      const written = searchWithVaultId(search, resolve(search));
      expect(resolve(written)).toBe(resolve(search));
      expect(searchWithVaultId(written, resolve(written))).toBe(written);
    }
  });
});
