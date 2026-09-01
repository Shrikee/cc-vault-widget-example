import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";

import { CHAIN_ID } from "../config/chain";
import { readLedgerFloor } from "../lib/ledgerFloorCheck";
import type { LedgerFloorVerdict } from "../lib/pricedHistory";
import { hasVestingGap, type Vault } from "../lib/vaultRegistry";

// The runtime ledger-floor check (spec §"The runtime ledger-floor check").
//
// The solver asserts at boot that each vault's floor is sound. The widget
// quotes off the same residual-lot logic, so it verifies the same invariant —
// BOTH ARMS, ONCE PER VESTING-GAP PRODUCT PER SESSION:
//
//   1. `getBlock(floor)`: the floor block is at least `vestingSeconds` old.
//   2. only on a young floor: the share `totalSupply` at `floor − 1` is zero.
//      An archive read, and the app's documented requirement already.
//
// Two reads at most, once, for the life of the tab. It is a fact about the
// REGISTRY rather than about a wallet, so it does not belong to the deposit
// scan and is not re-read when the wallet changes; and it is not a poll,
// because `eventsFromBlock` is a build-time constant that cannot move while the
// page is open. What CAN move it is a person pressing Try again, which is the
// one way `recheck` below is ever reached (ADR-0001: no automatic retry).
//
// WHAT A FAILURE DOES, and does not do. It degrades to the history-unreadable
// path with its own reason: nothing is priced from a floor the widget cannot
// establish, on any surface. It does NOT block posting — the widget never gates
// a post on its own reads, and a floor it could not verify is the widget not
// knowing rather than the solver refusing. The 24h product is exempt by
// construction and short-circuits to `sound` without a read: its shares vest
// before they unlock, so nothing there is priced against a residual lot at all.
//
// Neither the reads nor the judgement are here. Which reads to make and what a
// read that did not land means is src/lib/ledgerFloorCheck.ts's, driven against
// a forged chain including a broken one; the two arms themselves are
// src/lib/floorSoundness.ts's, driven against the solver's own vectors. What
// this hook owns is ONCE PER SESSION and the React state around it.

// One verdict per product for the life of the session, as a promise so two
// mounts of the same product share one pair of reads rather than racing them.
// A verdict that FAILED is cached too, deliberately: retrying a broken endpoint
// on every render is the automatic retry ADR-0001 refuses.
const session = new Map<string, Promise<LedgerFloorVerdict>>();

const CHECKING: LedgerFloorVerdict = { status: "checking" };
const SOUND: LedgerFloorVerdict = { status: "sound" };

export interface LedgerFloor {
  verdict: LedgerFloorVerdict;
  // Run both arms again. The manual Try again, and nothing else — there is no
  // timer behind this.
  recheck: () => void;
}

export function useLedgerFloor(vault: Vault): LedgerFloor {
  const client = usePublicClient({ chainId: CHAIN_ID });
  // Bumped by `recheck` to re-run the effect after the session entry is
  // dropped. The verdict itself lives in the module cache, not here, so two
  // mounts of one product cannot disagree about it.
  const [attempt, setAttempt] = useState(0);
  const [verdict, setVerdict] = useState<LedgerFloorVerdict>(CHECKING);

  useEffect(() => {
    // Exempt by construction, with no read at all: a product whose shares vest
    // before they unlock prices nothing against a residual lot, so its floor
    // cannot mislead a quote. The gate is the vesting gap, never the vault id.
    if (!hasVestingGap(vault)) {
      setVerdict(SOUND);
      return;
    }
    if (!client) {
      setVerdict(CHECKING);
      return;
    }

    let live = true;
    const key = vault.id;
    let pending = session.get(key);
    if (!pending) {
      // The wall clock at the moment the check runs. This is a one-shot, not a
      // rendered figure, so there is no `useNow` to take it from and nothing to
      // keep it in step with.
      pending = readLedgerFloor(client, vault, Math.floor(Date.now() / 1000));
      session.set(key, pending);
    }
    // Nothing is priced while this is in flight: `checking` is its own state,
    // not an optimistic "sound".
    setVerdict(CHECKING);
    void pending.then((settled) => {
      if (live) setVerdict(settled);
    });
    // Unmounted, or asked again: the verdict that lands is no longer this
    // effect's to publish.
    return () => {
      live = false;
    };
  }, [client, vault, attempt]);

  const recheck = useCallback(() => {
    session.delete(vault.id);
    setAttempt((n) => n + 1);
  }, [vault.id]);

  return { verdict, recheck };
}
