// The two reads behind the ledger-floor check, and what they come back as
// (spec §"The runtime ledger-floor check").
//
// The JUDGEMENT is ./floorSoundness.ts's — two arms, no chain, fully vectored.
// What lives here is the round trip: which reads to make, in what order, and
// what a read that did not land means. That is a decision of its own, and the
// one most worth driving against a broken endpoint: the whole point of the
// check is to degrade rather than to quote from a floor it could not verify, so
// "the RPC is down" has to come out as a REASON and never as a silent `sound`.
//
// It takes the client rather than reaching for one, exactly as
// ./walletScan.ts does and for the same reason: ./ledgerFloorCheck.test.ts
// drives the whole of it against a forged chain, including one that answers
// nothing at all.
//
// The archive read is made SECOND and only when it is needed. On a floor older
// than the vesting term there is no residual lot that could be mispriced, so
// the supply arm has nothing to add and an archive call the widget does not
// need is one more way to fail.
import type { PublicClient } from "viem";

import { floorIsOldEnough, floorSoundness } from "./floorSoundness";
import { SHARE_TOKEN_ABI } from "./lens";
import { readFailedReason, reportError } from "./userError";
import type { LedgerFloorVerdict } from "./pricedHistory";
import type { Vault } from "./vaultRegistry";

const SOUND: LedgerFloorVerdict = { status: "sound" };

/**
 * Both arms, once, for one product.
 *
 * Never throws: a check that threw would leave the caller deciding what an
 * exception means about a floor, and the answer is already known — a floor the
 * widget could not establish is one it must not price from, whether the reason
 * was the registry or the endpoint.
 *
 * `now` is passed in rather than read here, so the vectors can place a floor at
 * an age instead of at a date.
 */
export async function readLedgerFloor(
  client: Pick<PublicClient, "getBlock" | "readContract">,
  vault: Vault,
  now: number
): Promise<LedgerFloorVerdict> {
  const floorBlock = BigInt(vault.eventsFromBlock);
  const { vestingSeconds } = vault;
  try {
    // The block's OWN timestamp, which is the only clock a block has.
    const block = await client.getBlock({ blockNumber: floorBlock });
    const floorBlockTime = Number(block.timestamp);

    const supplyBelowFloor = floorIsOldEnough({
      floorBlockTime,
      now,
      vestingSeconds,
    })
      ? null
      : await client.readContract({
          address: vault.addresses.vault,
          abi: SHARE_TOKEN_ABI,
          functionName: "totalSupply",
          // BELOW the floor, not at it: the invariant is that nothing existed
          // before the block the ledger starts from.
          blockNumber: floorBlock - 1n,
        });

    if (
      floorSoundness({ floorBlockTime, now, vestingSeconds, supplyBelowFloor }) ===
      "sound"
    )
      return SOUND;

    return {
      status: "unsound",
      reason: {
        kind: "floor-too-young",
        floorBlock,
        ageSeconds: now - floorBlockTime,
      },
    };
  } catch (e) {
    // A read that did not land leaves the widget exactly as unable to establish
    // the invariant as an unsound floor does, so it degrades to the same place
    // — blaming the endpoint rather than the registry, because a depositor
    // pressing Try again may well fix this one. The reason is classified, not
    // quoted: the raw error names the endpoint, and that is for the console
    // (ADR-0004), never for the card.
    reportError("ledger-floor read failed", e);
    return {
      status: "unsound",
      reason: { kind: "read-failed", detail: readFailedReason(e) },
    };
  }
}
