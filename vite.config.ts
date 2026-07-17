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
});
