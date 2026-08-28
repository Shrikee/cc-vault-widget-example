/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// boring-vault-ui is published as CommonJS and references `global`; a few of its
// wallet deps expect Node-ish globals in the browser. Map `global` -> `globalThis`
// and pre-bundle the CJS package so esbuild can interop it cleanly.
export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["boring-vault-ui", "bignumber.js"],
  },
  server: {
    port: 5173,
    allowedHosts: ["832b-2607-fea8-d55c-4600-7952-a0e0-298f-972c.ngrok-free.app"]
  },
  // Vitest runs through this same config on purpose: the modules under test are
  // pure, but they are still bundler modules — src/config/history.ts reads
  // `import.meta.env`, and src/config/vaults.ts imports JSON — and Vite's
  // pipeline gives them both without a second build step.
  //
  // Node environment only, and no component tests: nothing under test touches
  // the DOM, so no DOM library is installed (spec "Testing Decisions").
  // vitest is pinned to a major that peers on Vite 5, so there is exactly one
  // Vite in the tree and the dev server and the tests share it.
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
