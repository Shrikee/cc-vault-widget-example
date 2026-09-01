# Provenance — the vendored entitlement rule

The four files in this directory are a **byte-exact copy** of the solver's entitlement rule and its
test suites. They are vendored, not authored here: nothing in them may be edited, reformatted,
prettier-passed, or re-newlined. Every entitlement ceiling in this widget is
`quoteEntitlement(...).maxAskPrice` from `entitlement.ts` — no surface, hook or helper computes a
ceiling of its own.

| Field | Value |
| --- | --- |
| Source repository | `vault-solver-service` |
| Source path | `src/core/` |
| Commit | `813aede` (`main` HEAD at vendoring) |
| Vendored on | 2026-09-01 |

## The four files and their SHA-1s

These SHA-1s are the durable identity of the copy; the commit hash is the convenience. They are the
values `scripts/entitlement-drift.cjs` re-hashes against — this table is that script's input, so
edit it only when re-vendoring.

| File | What it is | SHA-1 |
| --- | --- | --- |
| `entitlement.ts` | `quoteEntitlement` — the rule, and the `HolderEvent` shapes | `95d0d03fc68cd1aafafab2402feffb9396437273` |
| `entitlement.spec.ts` | the golden fixtures, every number recomputable by hand | `415bfd2c63b02628f7bda337a5de62f0c87fdb4f` |
| `entitlement.regression.spec.ts` | the regression + invariant suite over the 300 cases | `959a1c28388bd9a83f5640c311c8fe94767fbfd8` |
| `entitlement.cases.json` | those 300 seeded, independently verified histories | `9851ea26709dcb5604bcba5f921065966f550d52` |

The tooling is bent around the copy, never the other way: the suites run on their own
`vitest.entitlement.config.ts` (`globals: true`, node environment) because they call
`describe`/`it`/`expect` as ambient globals, and `tsconfig.json` sets `"types": ["vitest/globals"]`
so `tsc --noEmit` typechecks them as they stand rather than skipping them.

`entitlement.ts` imports nothing at all, so the set is self-contained. The two spec files import
`./entitlement` and the regression spec reads the JSON from its own directory — which is why the
filenames and the single directory must not change.

The pin is `813aede`, **not** the runbook's `d75ad60`: three of the four files are byte-identical
between the two, but `entitlement.spec.ts` gained 51 lines (two more golden tests) on its way to
`main`. The suites are therefore 2 files / **36** tests, not 34.

## Checking the copy is still faithful

**Without a solver checkout** — re-hash the files against the table above:

```
npm run drift:entitlement
```

That runs both halves: `scripts/entitlement-drift.cjs` (the bytes) and then `npm run
test:entitlement` (the behaviour — the two vendored suites on `vitest.entitlement.config.ts`). The
hash half exits non-zero naming any file whose bytes have moved.

**With a solver checkout** — the equivalent check, and the one that also shows you *what* moved:

```
git show 813aede:src/core/entitlement.ts                 | diff - src/entitlement/entitlement.ts
git show 813aede:src/core/entitlement.spec.ts            | diff - src/entitlement/entitlement.spec.ts
git show 813aede:src/core/entitlement.regression.spec.ts | diff - src/entitlement/entitlement.regression.spec.ts
git show 813aede:src/core/entitlement.cases.json         | diff - src/entitlement/entitlement.cases.json
```

**Cadence:** on vendoring, after any TypeScript/Vitest/tooling bump, and whenever the solver's rule
changes.

## Re-vendoring

When the solver's rule or its `HolderEvent` shapes change, re-vendoring is more than re-running the
drift check — the `HolderEvent` shapes and the query type have to be diffed against this repo's
history read as well. Follow the numbered procedure under **"Re-vendoring — when the solver's
rule or its `HolderEvent` shapes change"**, in Appendix A of
[`docs/specs/priced-30d-exits.md`](../../docs/specs/priced-30d-exits.md). Updating the commit and
all four SHA-1s in the table above is step 1 of it.

This is the same note `deploy-registries/PROVENANCE.md` keeps in the solver repo, and the pattern
ADR-0002 already uses for the registry's four unverifiable values.
