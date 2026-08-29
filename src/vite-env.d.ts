/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly RPC_URL?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_HISTORY_CHUNKS_IN_FLIGHT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
