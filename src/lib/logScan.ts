import type { Hex, PublicClient } from "viem";
import { LOG_CHUNK_SPAN, historyChunksInFlight } from "../config/history";
import { createInFlightBudget, mapWithBudget } from "./inFlightBudget";

// Chunked eth_getLogs scan — the one read the yield figures are built on.
//
// Providers cap a ranged eth_getLogs at LOG_CHUNK_SPAN blocks, so a scan is a
// series of chunk requests run a few at a time. Any chunk failing fails the
// whole scan: a partial series would silently understate the share-price
// history (or a wallet's deposits), so there is no retry and no partial data.
//
// "A few at a time" is a budget for the whole app, not for a scan — see
// ./inFlightBudget.ts. With two products a cold load runs up to four scans at
// once, and a per-scan limit would multiply them into a rate-limit failure.

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
}

// The app's one budget, sized once at load. The size is a property of the
// endpoint rather than of any caller, so no caller passes it: a scan asks for
// its chunks and waits its turn like every other scan.
const CHUNK_BUDGET = createInFlightBudget(historyChunksInFlight());

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

// The i-th 32-byte word of a log's `data`, as the uint it encodes. Both event
// decoders read their unindexed fields this way: ABI-encoded scalars are one
// word each, in declaration order.
export function dataWord(data: Hex | string, index: number): bigint {
  return BigInt(`0x${data.slice(2).slice(index * 64, (index + 1) * 64)}`);
}

// Why a chain read failed, in the words most likely to help — a scan's chunk
// here, and a Lens read in the metrics and position hooks. The provider's own
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
}: ScanLogsParams): Promise<RawLog[]> {
  const ranges = chunkRanges(fromBlock, toBlock);

  // Raw eth_getLogs rather than viem's getLogs: the topic filter is passed
  // through verbatim, which is what a filter like "either of these two events,
  // this wallet in topics[2]" needs (spec §5.1).
  const chunks = await mapWithBudget(ranges, CHUNK_BUDGET, ([from, to]) =>
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
