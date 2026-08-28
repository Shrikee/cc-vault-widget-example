// =============================================================================
// Share-price (and deposit) history — scan parameters.
//
// The yield figures are derived on-chain by the widget itself (ADR-0001): the
// accountant's ExchangeRateUpdated events give the share-price history, the
// Teller's Deposit events a wallet's average deposit cost. Everything the scans
// need that is fixed at deploy time lives here.
//
// VERIFY these against the live contracts when the vault is redeployed —
// deployment blocks and the deployment timestamp are vault-specific.
// =============================================================================

// Deployment blocks (Polygon PoS, 2026-08-12T18:05:49Z). Found by bisecting
// eth_getCode against the live chain on 2026-08-27.
export const DEPLOY_BLOCKS = {
  vault: 91901943,
  accountant: 91901948,
  teller: 91901950,
} as const;

// Block 91901948 — the accountant's deployment. Windows reaching further back
// are measured since launch instead.
export const DEPLOY_TIMESTAMP = 1786557949; // 2026-08-12T18:05:49Z

// The accountant's constructor sets exchangeRate = 1.000000 base/share, so the
// share price at launch needs no lookup.
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

// Read lazily, not at module scope: src/lib/apy.ts imports the constants above
// and is run outside the bundler by scripts/apy-vectors.mjs, where
// `import.meta.env` does not exist.
export function historyChunksInFlight(): number {
  const parsed = Number(import.meta.env.VITE_HISTORY_CHUNKS_IN_FLIGHT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CHUNKS_IN_FLIGHT;
  return Math.floor(parsed);
}
