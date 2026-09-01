import { defineConfig } from "vitest/config";

// The vendored solver suites run here, NOT under the root config.
//
// src/entitlement/ is a byte-exact copy of vault-solver-service@813aede (see
// src/entitlement/PROVENANCE.md). The files are never edited to suit this repo,
// so the runner is configured around them instead:
//
//   - `globals: true` — the vendored specs call describe/it/expect without
//     importing them (they were written for the solver's Jest-style globals).
//   - `environment: "node"` — entitlement.regression.spec.ts reads its 300-case
//     fixture off disk with fs/path.
//   - `include` — only the vendored `.spec.ts` files. The repo's own tests are
//     `*.test.ts` and stay on the root config (vite.config.ts), which is
//     narrowed to `src/**/*.test.ts` so it never picks these up.
//
// Run: `npm run test:entitlement` (or `npm run drift:entitlement` for the
// bytes-then-behaviour pair).
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/entitlement/**/*.spec.ts"],
  },
});
