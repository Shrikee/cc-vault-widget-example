import type { Hex, PublicClient } from "viem";
// The explicit `.ts` extension keeps this module loadable by plain Node (which
// resolves no extensions), because src/lib/apy.ts imports the decode helpers
// below and scripts/apy-vectors.mjs drives that module directly.
import { LOG_CHUNK_SPAN } from "../config/history.ts";

// Chunked eth_getLogs scan — the one read the yield figures are built on.
//
// Providers cap a ranged eth_getLogs at LOG_CHUNK_SPAN blocks, so a scan is a
// series of chunk requests run a few at a time. Any chunk failing fails the
// whole scan: a partial series would silently understate the share-price
// history (or a wallet's deposits), so there is no retry and no partial data.

export interface RawLog {
  address: Hex;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  logIndex: Hex;
}

// eth_getLogs topic filter: a topic, any of a list of topics, or a wildcard.
export type LogTopic = Hex | Hex[] | null;

export interface ScanLogsParams {
  client: PublicClient;
  address: Hex;
  topics: LogTopic[];
  fromBlock: bigint;
  toBlock: bigint;
  chunksInFlight: number;
}

const toHex = (n: bigint): Hex => `0x${n.toString(16)}`;

// [fromBlock, toBlock] split into ranges the provider will accept.
function chunkRanges(fromBlock: bigint, toBlock: bigint): [bigint, bigint][] {
  const span = BigInt(LOG_CHUNK_SPAN);
  const ranges: [bigint, bigint][] = [];
  for (let start = fromBlock; start <= toBlock; start += span + 1n) {
    const end = start + span;
    ranges.push([start, end > toBlock ? toBlock : end]);
  }
  return ranges;
}

// Run `fn` over `items` with at most `limit` promises in flight, preserving
// order. The first rejection rejects the whole run (no retry, no backoff).
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i]);
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

// The i-th 32-byte word of a log's `data`, as the uint it encodes. Both event
// decoders read their unindexed fields this way: ABI-encoded scalars are one
// word each, in declaration order.
export function dataWord(data: Hex | string, index: number): bigint {
  return BigInt(`0x${data.slice(2).slice(index * 64, (index + 1) * 64)}`);
}

// Why a scan failed, in the words most likely to help. The provider's own
// message (viem keeps it in `details`) beats viem's generic classification —
// "Archive requests require a personal token" tells the operator what to fix,
// "Invalid parameters" does not.
export function errorMessage(e: unknown): string {
  if (typeof e === "object" && e !== null) {
    const err = e as { details?: string; shortMessage?: string; message?: string };
    return err.details || err.shortMessage || err.message || String(e);
  }
  return String(e);
}

export async function scanLogs({
  client,
  address,
  topics,
  fromBlock,
  toBlock,
  chunksInFlight,
}: ScanLogsParams): Promise<RawLog[]> {
  const ranges = chunkRanges(fromBlock, toBlock);

  // Raw eth_getLogs rather than viem's getLogs: the topic filter is passed
  // through verbatim, which is what a filter like "either of these two events,
  // this wallet in topics[2]" needs (spec §5.1).
  const chunks = await mapWithLimit(ranges, chunksInFlight, ([from, to]) =>
    client.request({
      method: "eth_getLogs",
      params: [{ address, topics, fromBlock: toHex(from), toBlock: toHex(to) }],
    })
  );

  return (chunks.flat() as RawLog[]).sort((a, b) => {
    const byBlock = BigInt(a.blockNumber) - BigInt(b.blockNumber);
    if (byBlock !== 0n) return byBlock < 0n ? -1 : 1;
    return Number(BigInt(a.logIndex) - BigInt(b.logIndex));
  });
}
