// =============================================================================
// Share-price (and deposit) history — scan parameters.
//
// The yield figures are derived on-chain by the widget itself (ADR-0001): the
// accountant's ExchangeRateUpdated events give the share-price history, the
// Teller's Deposit events a wallet's average deposit cost.
//
// What a scan needs divides in two, and the division is the point of this file:
// the mechanics below — chunk span, trailing windows, event topics, the
// share-price unit, the concurrency limit — belong to the PROTOCOL and are the
// same whichever product is being scanned, so they stay global. Anything that
// differs by product is vault identity and lives in the registry
// (src/config/vaults.json), which is also where the verification date and the
// provenance notes are.
// =============================================================================
import { DEFAULT_VAULT } from "./vaults";

// The default product's deploy blocks and launch instant, re-exported from the
// registry for the hooks that still take their vault at module scope. They go
// when those hooks take a vault argument.
export const DEPLOY_BLOCKS = DEFAULT_VAULT.ui.deployBlocks;

// The accountant's deploy block timestamp. Windows reaching further back are
// measured since launch instead.
export const DEPLOY_TIMESTAMP = DEFAULT_VAULT.ui.deployTimestamp;

// The accountant's constructor sets exchangeRate = 1.000000 base/share on both
// products, so the share price at launch needs no lookup. Protocol-level, not
// per vault — but it is handed to computeWindowApy as a launch anchor, because
// which vault a since-launch figure opens against is the caller's to say.
export const INITIAL_SHARE_PRICE = 1;

// Provider cap on a ranged eth_getLogs: toBlock − fromBlock ≤ 10,000. Measured
// against the Polygon endpoint — it rejects wider ranges with code -32614.
export const LOG_CHUNK_SPAN = 10_000;

// 57,600 blocks/day × 30 — the flat span every share-price scan covers.
// Polygon produces a block roughly every 1.5 s (measured over the trailing
// 100k blocks), so a 30-day window is ~8x the block count it was on Ethereum.
export const BLOCKS_30D = 1_728_000;

// Trailing windows offered for the realised trailing APY; the headline is 7 d.
export const WINDOWS = [3, 7, 30] as const;
export const HEADLINE_WINDOW = 7;

// The accountant publishes the share price as a uint96 in base-asset units
// (USDT, 6 dp): 1_001_004 ⇒ a share price of 1.001004.
export const SHARE_PRICE_UNIT = 1e6;

// Event topics — keccak of the canonical signatures, verified against upstream
// Se7en-Seas/boring-vault@0e23e7f and by clean decodes of the live logs.
// ExchangeRateUpdated(uint96 oldRate, uint96 newRate, uint64 currentTime)
export const TOPIC_EXCHANGE_RATE_UPDATED =
  "0xa95bc6aba40bbc4d95fc35f118c4cd8b53fc5d5b89ed264002af03503a7a9439";
// Deposit(uint256 indexed nonce, address indexed receiver, address indexed
// depositAsset, uint256 depositAmount, uint256 shareAmount, uint256
// depositTimestamp, uint256 shareLockPeriodAtTimeOfDeposit)
export const TOPIC_DEPOSIT =
  "0xe96d7872363f475d18b2f5390caaa5eaa96b2d38e42c62afe4ac08ebd2b13c3a";
// DepositRefunded(uint256 indexed nonce, bytes32 depositHash, address indexed user)
export const TOPIC_DEPOSIT_REFUNDED =
  "0xaf98ea774275cadfa3e477a7b52cba03e01197445a76bd5d0d561608708c3624";

// How many eth_getLogs chunk requests a scan keeps in flight. 4 is measured
// safe against QuickNode's 50 req/s limit; 8 trips it (code -32007). On Polygon
// a full 30-day span is ~173 chunks, so a cold scan takes a few seconds.
export const DEFAULT_CHUNKS_IN_FLIGHT = 4;

// Read inside a function rather than at module scope. That began as a hard
// constraint: src/lib/apy.ts imports the constants above, and the vectors drove
// it under plain Node, where `import.meta.env` does not exist. The vectors run
// under Vitest now, which serves them through Vite's pipeline, so the
// constraint is gone — the function stays because nothing needs the value
// frozen at module load and it keeps the fallback in one place.
export function historyChunksInFlight(): number {
  const parsed = Number(import.meta.env.VITE_HISTORY_CHUNKS_IN_FLIGHT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CHUNKS_IN_FLIGHT;
  return Math.floor(parsed);
}
