// The chain both products live on.
//
// Chain id, label and explorer are declared once in the registry rather than
// per vault (spec, "The vault registry"): they are properties of the chain, not
// of a product, and multi-chain support is deliberately out of scope — both
// Coinchange products are on Polygon PoS. This module is where the registry's
// chain block becomes the constants the widget uses, so nothing else has to
// know that ROSTER exists to link to a transaction.
import { ROSTER } from "./vaults";

// The library's `chain` prop and the ethers provider's network, as a key.
export const CHAIN = ROSTER.chain.key;
export const CHAIN_ID = ROSTER.chain.chainId;

// Human-readable chain name — used in UI copy and the wrong-network prompt.
export const CHAIN_LABEL = ROSTER.chain.label;

// Block explorer for tx links / address confirmations.
export const EXPLORER = ROSTER.chain.explorer;
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${EXPLORER}/address/${addr}`;
