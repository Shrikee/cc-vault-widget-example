---
status: ready-for-agent
date: 2026-09-01
stage: 2 of 2
---

# Pricing an early 30d exit — the entitlement ceiling in the widget

## Problem Statement

Stage 1 ([`two-vault-widget.md`](./two-vault-widget.md), [ADR-0002](../adr/0002-two-products-switcher-registry-deferred-entitlement.md))
put both Coinchange products in the widget and met the 30d product's vesting hazard with
disclosure: the panels state the **vesting term**, the request row says an open request can be
passed over, and an early exit costs a support round-trip. That deferral was recorded as ADR-0002's
accepted consequence, and it is a real cost.

The hazard: **Yield Prime 30d** (CCUSD30) keeps a 1-day **share lock** against a 30-day **vesting
term** — a **vesting gap** — so a holder can redeem weeks before their shares vest. The redemption
solver prices such an exit against the holder's **entitlement ceiling**: unvested shares are capped
at what was paid, a cap and not a floor. The solver can only *refuse* a request above that ceiling;
it can never fill one at less than its ask. So an unvested holder who posts at the stage-1 default
**redemption spread** posts, once the **share price** has grown past that spread, a request that is
skipped `ask-above-entitlement` every cycle until its deadline lapses — and the widget can neither
say so nor offer the price that would fill.

The solver line has since built the entitlement engine (solver
[ADR-0006](https://gitlab.com/coinchange-defi/code/vault-solver-service/-/blob/main/docs/adr/0006-entitlement-engine-vesting-term-ledger-floor-vendored-copy.md))
and handed this UI its half: solver `docs/RUNBOOK.md` §5.1 ("Depositor-UI hand-off — the
entitlement ceiling"), hand-off issue
[vault-solver-service#75](https://gitlab.com/coinchange-defi/code/vault-solver-service/-/issues/75),
and this repo's ticket
[widget-demo#1](https://gitlab.com/coinchange-defi/code/widget/widget-demo/-/issues/1), whose
acceptance criteria are this spec's floor. There is deliberately no solver route to call and no
shared package: the UI **vendors the entitlement function byte-for-byte** and computes the ceiling
itself, before the request is ever posted.

## Solution

The widget prices a Yield Prime 30d redemption request before it is posted, from the holder's own
on-chain history, using a **byte-exact vendored copy** of the solver's `quoteEntitlement` — the
same rule, the same flooring, the same bigints — so the two sides compute *the same number*
(proven holder-for-holder and unit-for-unit against the solver's own code; see Further Notes).

On the withdraw panel a **quote card** shows, live as the amount changes, what the typed shares pay
if filled today versus at the full share price, the vested/unvested split, the ceiling, and each
unvested **lot**'s vest date. The posted discount is the wider of the holder's **redemption
spread** and the **required spread**, so every request the widget posts is fillable on the next
cycle — a vested holder's post stays byte-identical to stage 1's. The request row compares a live
request against the ceiling and the current share price, names which of five cases holds, and
offers the re-post price rather than just complaining. The position card quotes the whole balance;
the explainer states the cap with a worked example.

When the widget cannot price, it follows one rule, kept whole from the decision record: **it never
posts a request it can establish the solver will skip — and it may post what it cannot establish,
disclosed.** A failed history read allows posting at the holder's own spread with a warning; a
paused accountant prices nothing; the 1% clamp refuses with the cause and the largest postable
amount; posting is never gated on the widget's own reads.

Everything is gated on the **vesting gap** (`vestingSeconds > shareLockPeriod`), not on a vault id,
so a third product with a gap is priced with no code change and the 24h product is untouched by
construction. The stance is trust-minimised: the widget never calls the solver's ops API and takes
no shared package — the vendored copy, protected by a two-half drift check, is the only feed
([ADR-0003](../adr/0003-client-side-entitlement-pricing-vendored-copy.md)).

This is **stage 2 of two** — the stage ADR-0002 deferred. It ends the support round-trip for early
30d exits.

## User Stories

### Seeing the price

1. As a 30d depositor typing an exit amount, I want to see what it pays if filled today versus at
   the full share price, so that leaving early is a number rather than a surprise.
2. As a 30d depositor, I want the widget to know the exact maximum price I may post, so that my
   request is fillable on the next cycle instead of sitting unfilled. *(hand-off story 7)*
3. As a 30d depositor holding vested and unvested shares, I want the split shown for the amount I
   typed, so that I can see which part is capped and which is not.
4. As a 30d depositor with unvested lots, I want each lot's vest date, so that I know when the cap
   lifts and what waiting is worth.
5. As a 30d depositor editing the amount, I want the quote recomputed over exactly the shares the
   post would carry, so that the ceiling I see is the ceiling I post against.
6. As a 30d depositor pressing MAX, I want my whole raw balance quoted and posted to the wei, so
   that no dust is left behind.
7. As a 30d depositor, I want every ceiling labelled as computed from my on-chain history by this
   widget, so that I know where the number comes from — and that the fill is still the solver's.
8. As a transfer recipient who never deposited, I want my exit priced from my transfer-in lot at
   that block's rate, so that the quote does not treat me as vested money.
9. As a depositor whose shares are still share-locked, I want nothing quoted for a post I cannot
   make, so that the panel prices only what it can post.
10. As a depositor in the 24h product, I want my flow untouched, so that stage 1's "deliberately
    unchanged" stays literally true.

### Posting a fillable request

11. As an unvested holder, I want my request posted at the wider of my redemption spread and the
    required spread, so that it fills without me knowing the arithmetic.
12. As a vested holder, I want my post byte-identical to stage 1's, so that pricing costs me
    nothing.
13. As a holder whose required spread exceeds the contract's 1% maximum, I want the post refused
    with the cause named and the largest amount that *can* be priced today offered, so that I am
    never left holding a request that can never fill.
14. As a holder confirming a request, I want the figures pinned to one block and shown, so that
    what the modal shows is what is posted.
15. As a holder confirming while the share price ticks, I want the widget to re-pin and show the
    new figures instead of posting, so that a request never goes out against numbers that no longer
    hold.
16. As a holder, I want the advanced spread control kept with its stage-1 meaning, so that widening
    my ask stays my decision — it is my floor on the haircut, no longer able to post below what my
    entitlement requires.

### The live request

17. As a holder whose live request asks above my entitlement ceiling, I want that fact visible with
    the price I should re-post at, so that I can fix it rather than wait out the deadline.
    *(hand-off story 8)*
18. As a holder whose request expired inside the ceiling, I want to be told the price was never the
    problem, so that I re-post rather than widen a spread that was already right.
19. As a holder whose request under-asks — the share price has risen past the posted spread since
    posting — I want to be told a fresh post pays more, so that money is not left on the table.
20. As a holder whose request asks above the share price because the rate was marked down, I want
    that case distinguished from above-entitlement, so that the remedy shown is the right one.
21. As a holder with a healthy request, I want to be told it is within my entitlement — and that
    whether it fills is the solver's decision, so that the widget claims only what it can
    establish.
22. As a holder, I want the deadline beside every comparison, because the price comparison cannot
    see it.

### When the widget cannot price

23. As a holder whose history cannot be read, I want to still be allowed to post at my own spread,
    disclosed, with a manual Try again, so that a fault on the widget's RPC never gates my exit.
24. As a holder while the accountant is paused, I want nothing priced and the reason stated, so
    that no figure is derived from a rate under review.
25. As a holder whose balance no longer covers the amount at Confirm, I want nothing posted and to
    be told, so that the post does not revert on chain.
26. As a holder on a product whose ledger floor is too young, I want nothing priced from an unsound
    floor and the configuration blamed, so that a wrong-looking-right number never reaches the
    queue — while posting stays open.

### Operating and maintaining

27. As a maintainer, I want the entitlement rule vendored byte-exact with a provenance note (source
    repo, commit, the four SHA-1s), so that the copy's identity is checkable from this repo alone.
    *(hand-off story 28)*
28. As a maintainer, I want the two-half drift check as an npm script — the bytes and the fixtures —
    so that a divergence is caught before it produces skipped requests. *(hand-off story 30)*
29. As a maintainer, I want the discount rounding rule written down and tested — the discount
    rounds **up** — so that a posted price is never above the ceiling by a rounding unit.
    *(hand-off story 29)*
30. As a maintainer, I want a documented re-vendoring procedure, so that a change to the solver's
    rule or its `HolderEvent` shapes has a recipe rather than a rediscovery.
31. As an operator, I want the ledger-floor invariant stated in the registry and checked at
    runtime, so that a floor bump past `now − vestingSeconds` cannot silently turn unvested money
    into a vested quote.
32. As an integrator reading the guide, I want a section on pricing 30d exits — the vendored rule,
    the inputs, the event table, the rounding — and a §8.2 row for the entitlement skip, so that a
    Path B integration can reach the same number.

## Implementation Decisions

### The vendored rule

- Four files from `vault-solver-service`, pinned at **`main` HEAD `813aede`**, land byte-exact in
  **`src/entitlement/`**, filenames unchanged. No reformatting, no prettier pass, no
  trailing-newline changes. `entitlement.ts` imports **nothing at all**, so the set is
  self-contained; the two spec files import `./entitlement` and the regression spec reads the JSON
  from its own directory, which is why the filenames and the single directory matter.

  | File | What it is | SHA-1 |
  | --- | --- | --- |
  | `entitlement.ts` | `quoteEntitlement` — the rule, and the `HolderEvent` shapes | `95d0d03fc68cd1aafafab2402feffb9396437273` |
  | `entitlement.spec.ts` | the golden fixtures, every number recomputable by hand | `415bfd2c63b02628f7bda337a5de62f0c87fdb4f` |
  | `entitlement.regression.spec.ts` | the regression + invariant suite over the 300 cases | `959a1c28388bd9a83f5640c311c8fe94767fbfd8` |
  | `entitlement.cases.json` | those 300 seeded, independently verified histories | `9851ea26709dcb5604bcba5f921065966f550d52` |

  The pin is **`813aede`, not the runbook's `d75ad60`**: three files are byte-identical between the
  two; `entitlement.spec.ts` gained 51 lines (two more golden tests) on its way to `main`, so the
  suites are 2 files / **36** tests, not 34. The SHA-1s are the durable identity; the commit hash
  is the convenience.
- **`src/entitlement/PROVENANCE.md`** records the source repository, the commit, the four SHA-1s,
  the with-a-solver-checkout diff recipe (`git show 813aede:src/core/<file> | diff - src/entitlement/<file>`),
  and points at the re-vendoring procedure (Appendix A). This is the same note
  `deploy-registries/PROVENANCE.md` keeps in the solver repo, and the pattern ADR-0002 already uses
  for the registry's four unverifiable values.
- Every ceiling anywhere in the widget is `quoteEntitlement(...).maxAskPrice`. No surface, hook or
  helper computes a ceiling of its own; the lot listing below is derived *beside* the rule and
  cross-checked against it, never a second implementation of it.

### The drift check, as this repo runs it

The check has two halves — the bytes prove identity, the fixtures prove behaviour — and this repo
has no CI, so both run as npm scripts with a documented cadence rather than as a pipeline stage.

- **Half one — bytes.** `scripts/entitlement-drift.cjs` recomputes the SHA-1 of each of the four
  files and compares against the values in `PROVENANCE.md`. Any mismatch exits non-zero naming the
  file. This works with no solver checkout; the `git show … | diff` recipe in the provenance note
  is the equivalent check when one is available.
- **Half two — fixtures.** The two vendored suites run **under Vitest on their own config** —
  `vitest.entitlement.config.ts` with `{ test: { globals: true, environment: "node", include: ["src/entitlement/**/*.spec.ts"] } }`.
  Verified byte-exact under the repo's Vitest 3.2.7: 2 files / 36 tests in ~269 ms; neither spec
  uses a Jest-only API, and `tsconfig.json` already targets ES2021, so the bigint literals compile
  as they stand. (The runbook's recipe is Jest because it predates this repo's runner; Vitest with
  globals is this repo's equivalent, verified, and needs no new dependency.)
- **The root test run must not swallow the vendored suites.** The repo's own tests are `*.test.ts`;
  the vendored files are `*.spec.ts` and need globals. The root Vitest config therefore restricts
  `include` to `src/**/*.test.ts`, and the vendored suites run only under their own config.
- **Scripts**: `"test:entitlement": "vitest run -c vitest.entitlement.config.ts"` and
  `"drift:entitlement": "node scripts/entitlement-drift.cjs && npm run test:entitlement"`.
- **Cadence**: on vendoring, after any TypeScript/Vitest/tooling bump, and whenever the solver's
  rule changes (the re-vendoring procedure, Appendix A). `npm run drift:entitlement` is cheap
  enough to run with `npm test` locally; wiring it into CI is out of scope because there is no CI.

### The holder-history read

The widget reads a holder's history exactly as the solver's ledger does — same events, same order,
same exclusions — because a history that differs by one event is a ceiling that differs by real
money. The reference is the solver's `holder-ledger.ts` via RUNBOOK §5.1; the read was proven
equivalent on every real holder and on the fork scenario (Further Notes).

- **One scan, not two.** The history read is a *widening* of the stage-1 deposit scan: one scan per
  wallet per product from the **ledger floor** (`eventsFromBlock`), one cursor, the `scanRuns.ts`
  reducer unchanged. The hook holds the **raw logs** once; two pure derivations read them —
  `reconstructDeposits` (refund-*excluding*, as today) for the average deposit cost, and the
  history replay (refund-*ignoring*, mirroring the ledger) for the entitlement. The refund
  divergence lives in the derivations, never as a flag on a shared decoded list.
- **Three ranges per chunk on the 30d product**, one on the 24h:

  | Contract | Event | Filter | Becomes |
  | --- | --- | --- | --- |
  | Teller | `Deposit` | `receiver = wallet` (topics[2]) | `deposit { t = depositTimestamp (data word 2), shares = word 1, assets = word 0 }` |
  | Share token | `Transfer` | **unfiltered** (one range; `eth_getLogs` cannot OR across topic positions) | `transfer-in { t = block time, shares, rate = accountant.getRateInQuote(want) at that block }` / `transfer-out { t, shares }` — client keeps only the wallet's two legs |
  | AtomicQueue | `AtomicRequestFulfilled` | `user = wallet` (topics[1]) | `fill { t = word 2, shares = offerAmountSpent (word 0) }` |

  Exclusions, applied client-side: mints (`from == 0`), burns (`to == 0`), and **fill share-legs**
  keyed `(transactionHash, wallet)` against the fills — a batch fill moves several holders' shares
  in one transaction, so the key is the pair, never the solver's address. Order:
  `(blockNumber, logIndex)`.
- **No refund exclusion in this reading.** The solver's ledger never reads `DepositRefunded`:
  `Teller.refundDeposit` → `vault.exit` → `_burn`, so a refund is a burn `Transfer` the replay
  already excludes — and the `Deposit` lot deliberately stays (verified in the Teller source).
  Stage 1's refund exclusion remains correct for the *earnings* derivation and must **not** be
  applied to the history. The 24h product keeps stage 1's `Deposit`-only scan and gate.
- **The precondition on a vesting-gap product is `shares > 0`, nothing else.** Stage 1's
  `shareUnlockTime ≠ 0` gate is right for earnings and wrong for the history: a transfer recipient
  never deposited, holds one unvested lot, and unread would quote as a vested **residual lot** at
  full share price — the over-quote the solver skips. Such a wallet derives `avgCost: null`
  (earnings "—", as today) and a real history.
- **When it runs**: on connect, fused with the deposit scan, so the history is in hand before the
  withdraw tab opens and the request row can judge a live request on any tab. Stage 1's tail after
  the wallet's own deposit stays. **One tail from the cursor to head at the confirm step**, with
  the other inputs pinned to that head. No timer, no polling, no mid-session re-scan otherwise —
  the entitlement rule's own reconciliation covers unseen spends conservatively (FIFO deducts the
  oldest lots), and unseen arrivals are exactly what the confirm-step tail closes.
- **Transfer reads are a second phase of the same scan**, through the shared in-flight budget,
  all-or-nothing: one `eth_getBlockByNumber` per distinct transfer block, one archive `eth_call` to
  the **unguarded** `getRateInQuote(want)` per transfer-in — unguarded so a transfer during a past
  pause stays readable, exactly as the ledger reads it. Any one failing fails the scan: a history
  missing a transfer-in is the over-quoting kind of wrong. In memory only.
- **Two small plumbing facts** the implementation needs: the widget's `RawLog` type must carry
  `transactionHash` (the log objects already have it; the fill-leg exclusion keys on it), and
  `decodeDepositLog` must read data word 2 (`depositTimestamp` — the lot's clock), which stage 1
  discards.

### The seven inputs

`quoteEntitlement` takes seven inputs. Two sourcing rows: the **screen** (the quote while typing,
the request row) reads what stage 1 already polls; the **post** (the confirm pin) re-reads at one
head so the figures describe one block.

| Input | Screen | Post (pinned at the confirm-step head) |
| --- | --- | --- |
| `history` | the held scan | the same scan + the confirm-step tail |
| `shareBalance` | the held position (raw bigint) | `vault.balanceOf` at head |
| `navPerShare` | the Lens rate + paused flag already polled | `getRateInQuoteSafe(want)` at head — its **revert is the pause signal** |
| `now` | `useNow` (as the lock countdown already does) | the head block's timestamp |
| `vestingSeconds` | the registry | the registry |
| `offerShares` | the typed string converted the library's way (× 10^decimals, truncated) | the same shares, re-checked against the pinned balance |
| `shareDecimals` | the registry's `ui.decimals` | the registry's `ui.decimals` |

`useUserPosition` keeps the **raw balance bigint** beside the float it holds today; MAX fills the
input with its exact 18-dp decimal string, so "all" quotes and posts the same shares to the wei.

### The posting rule

- `required = ceil((NAV − ceiling) × 1e6 / NAV)` in bigint — the discount rounds **up**, never
  down: the solver's gate is `ask ≤ maxAskPrice` and a floored discount can post one want unit
  above the ceiling — a skip, for want of a unit. Zero when the ceiling is at or above the share
  price. `required > 10,000` is **unfillable** (the contract's 1% `MAX_DISCOUNT`), never clamped
  *to* 10,000.
- **The posted discount is `max(redemption spread, required spread)`.** The spread control keeps
  its stage-1 meaning, default and range: the holder's floor on the haircut, no longer able to post
  below what the entitlement requires. A vested holder's post is **byte-identical to stage 1's**;
  an unvested holder's changes only once the required spread exceeds what they would have posted
  anyway (~14.6 days into a lot at 2.5% APY).
- The queue stamps `ask = floor(NAV × (1e6 − posted) / 1e6)`; "You receive (est., min)" is
  `ask × offerShares / 1e18`.
- **Posted through the library's `queueWithdraw`** (Path A stays the one write the library is kept
  for), with `d` formatted as a 4-dp percent string — `String(d / 1e4)` — which round-trips the
  library's `× 10⁴ → toFixed(0)` **losslessly for every d in 0..10000** (brute-forced against the
  installed `bignumber.js`). The direct `safeUpdateAtomicRequest` stays the guide's Path B.
  `scripts/queue-withdraw-regression.cjs` is **extended** to assert the on-wire discount equals `d`
  for the vector `1, 274, 999, 1000, 1026, 9999, 10000`.
- **The quote recomputes live** on every edit, paste and MAX — no debounce, no blur: it is a pure
  function over the held history and the screen inputs, so recomputing costs nothing and the
  ceiling shown is always the ceiling for the shares that would post (a neighbour's can differ by a
  floored unit, and a unit is a skip).
- **No quote while locked.** While `now < unlockAt` the panel stays stage 1's (input and button
  disabled, the lock notice in the card's slot). The quote appears with the first amount typed once
  the lock ends.
- **The governing rule**: the widget never posts a request it can establish the solver will skip —
  the clamp refusal and the `max()` rule together close every way to post a certain skip.

### The confirm pin and re-check

- **Opening the confirm modal** runs the pre-post tail and pins `now`, `getRateInQuoteSafe(want)`
  and `balanceOf` to that head, recomputes the ceiling and `d` over the exact `offerShares`, and
  shows them with the pinned block number. What the modal shows is what is posted.
- **On Confirm**, one multicall re-reads `accountantState` and `balanceOf`: if
  `lastUpdateTimestamp` moved, `isPaused` is set, or the balance no longer covers the amount —
  **re-pin and show, never post** ("The share price changed while you were confirming — here are
  the new figures."). No spread margin is added to insure the gap: a tick is up to 1,000 ppm and
  at-most-hourly; insuring it would cost every request the standard spread. Time alone in the gap
  is safe — lots only vest, and the solver judges later still. The rationale this protects: between
  pin and transaction an unvested lot's ask rises with the share price while its ceiling does not,
  so a rate tick in the gap is a certain skip.
- The library's stage-1 residuals (the `Date.now()` deadline, the float allowance compare, ethers
  error strings) stay as they are.

### The runtime ledger-floor check

The solver asserts at boot that each vault's floor is sound; the widget quotes off the same
**residual lot** logic, so it verifies the same invariant — **both arms, once per vesting-gap
product per session**:

1. `getBlock(floor)`: the floor block's timestamp is at least `vestingSeconds` old, or
2. only on a young floor: the share `totalSupply` at `floor − 1` is zero (archive read — already
   the app's documented requirement).

A failure degrades to the **history-unreadable path with its own reason** (wording below): nothing
is priced from an unsound floor, and posting is never blocked. The 24h product is exempt by
construction. The invariant is stated where a reviewer will meet it: the registry's `_note` gains
"**`eventsFromBlock` may only be raised to a block at least `vestingSeconds` old, or one below
which the vault held no shares**", and the guide's stage-2 section states it too (Appendix A).
Rationale: a floor bumped past `now − vestingSeconds` on this side alone turns yesterday's deposits
into a "vested" residual and quotes **above** the solver's ceiling — a certain skip from a number
that looks right.

### The surfaces — Variant B, copy verbatim

The chosen surfaces are ticket 04's Variant B ("Quote card"); `docs/wayfinder/entitlement/assets/04-surfaces-prototype/`
holds the screenshots, `VariantB.tsx.txt` and `stub.ts.txt` as the reference (the `Model` shape in
`stub.ts` is the recommended derived-figures shape). The copy below is decided and lands verbatim
(figures are the worked example's — render live values):

| Surface | What lands |
| --- | --- |
| **Withdraw panel — quote card** | A `.notice--accent` callout between the amount input and the rows, recomputed live. Headline: "**Redeeming 10,000 CCUSD30 — ≈ 9,999.99 USDT if filled today.**" A vested/unvested proportion bar, legend "● 6,000 CCUSD30 vested · ● 4,000 CCUSD30 unvested". Two tiles: "NOW — 9,999.99 USDT — at 0.999999 USDT/share" and "AT FULL SHARE PRICE — 10,010.00 USDT — at 1.001000 USDT/share". Cap sentence, unvested: "4,000 CCUSD30 of this has not finished the 30-day vesting term, so it is capped at what you paid — a cap, not a floor. Over the whole amount that ceiling is 1.000600 USDT a share, computed from your on-chain history by this widget. Leaving now gives up 10.01 USDT." All vested: "Every share in this amount has finished the 30-day vesting term, so your ceiling is the share price itself — 1.002001 USDT a share, computed from your on-chain history by this widget. What you give up is the 0.10% redemption spread and nothing else." Per-lot line: "● 4,000 CCUSD30 vest on 21 Sept (in 20 days) — until then priced at 1.000000 USDT". The stage-1 vesting notice **leaves the withdraw panel** (the card says it; the deposit panel's notice is untouched). Rows: "You receive (est., min) 9,999.99 USDT"; "Redemption spread 0.10%", or "**0.1369% (required)**" when the required spread posts. |
| **Withdraw panel — clamp** | The card becomes the refusal (danger tone), button disabled, no override: "**This amount can't be posted.** For 10,000 CCUSD30 your entitlement ceiling is 1.000000 USDT a share — 1.4779% below the share price of 1.015000 USDT — computed from your on-chain history by this widget. No redemption request can ask more than 1% below the share price (the contract's maximum redemption spread), so a request for this amount would be passed over. **Up to 6,000 CCUSD30 can be priced today** [Use 6,000] · your next lot vests on 26 Sept (in 25 days), which raises the ceiling." The "Up to…" clause is computed (`largestPostableShares`) and omitted when no smaller amount prices. Rows: "You receive (est., min) —", "Redemption spread 1.4779% required — over the 1% maximum". |
| **Withdraw panel — locked** | The card is the lock notice, nothing priced: "CCUSD30 shares locked for another 18 hours. The 1-day share lock has not ended, so there is nothing to post yet and nothing to quote. The quote appears with the first amount you type once the lock ends." Input and button disabled; "You receive (est., min) —"; "Redemption spread 0.10% (default)". |
| **Confirm modal** | A pinned tile — "10,000 CCUSD30 → 9,999.99 USDT — Pinned at block 93,051,200. These are the figures that go to the queue." — then rows Share price (pinned) · Your ceiling (pinned) · Posted spread 0.1369% (required) [or "(yours)"] · Asking price · Receive (min), and the footer "An off-chain solver decides whether to fill this request. The ceiling above is computed from your on-chain history by this widget; the fill is not this widget's to promise." |
| **Request row** (side rail, outside the selection) | A badge naming the case — "Above your entitlement" (warning) / "Above the share price" (warning) / "Expired" (danger) / "Open" (info) — a two-line strip ("Your ask 1.001000 USDT/share → 1,001.00 USDT" / "Your ceiling 1.000000 USDT/share — asking above it" or "asking within it"), then a **computed five-way note** replacing stage 1's "may sit open" (wordings below), "Expires in 5 days · Deadline 6 Sept 2026, 15:14", and a primary "**Re-post at 0.999999**" button on every priced case that has a better post. |
| **Position card** | A sub-line under the stat grid, quoted over the **whole balance** at `max(default spread, required)` — never over the panel's amount, so the two never disagree: "Redeemable today ≈ 9,999.99 USDT for your whole balance, at 0.10% — computed from your on-chain history by this widget. 10.01 USDT below the share price, because 4,000 CCUSD30 has not vested." All vested: "… Everything has vested." Clamp: "Redeemable today — not at any postable price for your whole balance; up to 6,000 CCUSD30 can be." Locked: "Redeemable once the lock ends (in 18 h) — ≈ 4,997.00 USDT at today's share price and entitlement." Earnings stays as it is; a never-deposited transfer recipient keeps "—" for earnings and still gets the line. |
| **Explainer** | The vesting step: "30-day vesting term — Yield Prime 30d shares vest over 30 days — separately from the 1-day share lock, and only on this product, whose vesting term outlives its lock. Redeem before they vest and you are entitled to no more than what you paid: a cap, not a floor." Set-off static example: "For example: 10,000 USDT deposited at 1.000000 a share, redeemed on day 20 when the share price is 1.001370, is capped at 1.000000 a share — it pays 9,999.99 USDT, not 10,013.70. The withdraw panel shows you that number before you post." Step 4 becomes "… at the share price minus the posted redemption spread — the wider of your own spread and the one your entitlement requires."; step 5 "An off-chain solver decides whether to fill your request …". |

**The request row's five-way notes** (computed, one shown):

- *above-share-price* (ask > share price — the rate fell since posting; the solver's
  `ask-above-nav`): names the markdown, offers the re-post.
- *above-entitlement*: "The solver passes over a request asking more than your entitlement ceiling,
  so this one sits open until its deadline. The ceiling is computed from your on-chain history by
  this widget; it moves up as your lots vest."
- *expired*: "The price was never the problem: this asks inside your ceiling. Its deadline lapsed,
  and an expired request cannot be filled at any price — the comparison above cannot see that,
  which is why the deadline is beside it. A request posted now would ask 1.000998 USDT/share and
  pay 1,001.00 USDT."
- *under-asking*: "Fillable as it stands, but it was priced against an older share price: a request
  posted now would ask X and pay Y USDT more."
- *within*: "Within your entitlement. A request posted now would ask X USDT/share — the same price
  / no more than this one. Whether it is filled is the solver's decision."

**Copy discipline** (every surface): the ceiling is always "computed from your on-chain history by
this widget"; nothing promises a fill; "a cap, not a floor" throughout; the vesting copy names the
product; never "unavailable" where a cause can be named.

### When the widget cannot price — wordings and behaviour

The rule, kept whole: **never post what the widget can establish will be skipped; allow, disclosed,
what it cannot establish.** Posting is never gated on the widget's own reads.

1. **History unreadable** (a chunk fails; a transfer date or rate read fails; the floor check
   fails): posting stays open at the holder's own spread. Quote card slot: "Couldn't read your
   history from the chain — {reason}. Nothing is priced. A request posts at your redemption spread
   and, on this product, may be passed over if your shares haven't finished vesting." + **Try
   again** (a full re-scan — the manual control stage 1 lacks; no *automatic* retry, the ADR-0001
   stance stands). Position card: "Redeemable today — couldn't read your history." Request row:
   stage 1's note and the deadline; no strip, no re-post offer. The 24h product untouched. The
   floor-check failure uses its own reason: "Couldn't price from your history — the vault
   registry's ledger floor (block 92,416,354, 15 days old) is too young for a 30-day term. The
   widget's configuration needs updating."
2. **Accountant paused**: nothing priced while paused — the auto-pause **stores the out-of-bounds
   rate before pausing** (verified in `AccountantWithRateProviders.sol`), so the unguarded rate the
   Lens serves is the number under review. Quote card: "Redemptions are paused. The share price is
   under review by the operator, so nothing is priced and no request can be posted until it
   resumes." Rows "—" / "0.10% (default)", button disabled (stage 1's gate). Position card:
   "Redeemable today — not while the share price is under review." Request row: badge and deadline
   only. Pin-failure tile (the flag poll is up to 30 s stale; the pin's `getRateInQuoteSafe` revert
   is the signal): "Couldn't pin the figures — the share price is under review (the accountant is
   paused). Nothing was posted."
3. **Failed tail at the pin**: "Couldn't re-read your history — {reason}. Nothing was posted." +
   Try again. **Balance short at Confirm**: "Your balance is now N CCUSD30, less than the M you
   entered. Nothing was posted." In every pin-failure case Confirm is replaced by Close, the cause
   is named, and the modal never shows figures it didn't pin.
4. **The 1% clamp**: the refusal wording above; disabled, no override. "No request … could ask low
   enough to be filled" is sound because the unclamped `updateAtomicRequest` is admin-gated on both
   deployments.

### Derived figures as pure functions

All derivation is pure — no chain call, no React — in the sense `scanPlan.ts` established; the
hooks fetch, the functions decide. The prototype's `stub.ts` `Model` is the reference shape: every
surface renders from one model, and no surface computes a figure of its own.

- **The read**: `planWalletScan({ vault, shares, unlockAt })` → `scan | unresolved | never-deposited | no-shares`
  (the vesting-gap gate is `shares > 0`); `walletScanRanges(vault, wallet)` → the `(address, topics)`
  ranges per chunk (1 on 24h, 3 on 30d); `transferReads(logs, wallet)` → the blocks to date and the
  transfer-ins to rate, after the three exclusions; `holderHistory(logs, wallet, dated)` → the
  replay in `(blockNumber, logIndex)` order, refund-ignoring.
- **The price**: `requiredSpread(nav, ceiling)`; `postedDiscount(spreadPpm, required)`;
  `offerSharesOf(amount, decimals)` mirroring the library's conversion;
  `formatDiscountPercent(d)`.
- **The lot listing**: `quoteEntitlement` returns totals only; the per-lot vest line and the bar
  need each lot's `{t, shares, entry, vestsAt, vested, pricedAt, spent}` with the FIFO spend for
  the typed amount. Derived beside the rule and **cross-checked**: the blend over the spent lots
  must reproduce `maxAskPrice`, and the counts must equal `vestedShares` / `unvestedShares`.
- **The judgement**: `compareRequest(ask, ceiling, nav, freshAsk, deadline, now)` →
  `above-share-price | above-entitlement | expired | under-asking | within` (under-asking holds
  only when the share price has risen by more than the posted spread since the post);
  `largestPostableShares(history, balance, nav, now, vestingSeconds)` → the largest `offerShares`
  whose required spread ≤ 1% (FIFO makes anything inside the vested shares free), or `null`;
  `floorSoundness(floorAgeSeconds, vestingSeconds, supplyBelowFloor)` → `sound | too-young`; the
  Confirm re-check predicate `(pinned, fresh) → post | re-pin`.

### Deliberately unchanged

- The redemption spread default and range, and the request validity default — stage 1's
  "deliberately unchanged" stands, and a vested holder's post is byte-identical.
- The 24h product's whole flow: `Deposit`-only scan, stage-1 gate, stage-1 copy. Its transfer
  recipient can still post an unfillable request; that case stays as stage 1 leaves it (accepted in
  charting — the gate is the vesting gap, and the 24h product has none).
- The library floor (`boring-vault-ui@1.6.3`, never below), Path A as the write path, and the
  stage-1 residuals around it.
- ADR-0001's stance: archive-capable, rate-tolerant `VITE_RPC_URL` as a documented, unenforced
  requirement; no automatic retry; no partial data; the new scans live inside the same shared
  in-flight budget.

### Documentation

Landed **with this spec** (by the map's assemble ticket): the five glossary terms — *entitlement
ceiling*, *lot*, *residual lot*, *ledger floor*, *holder history* — in `CONTEXT.md`, the vesting
term's "stage 2 will…" clause retired,
[ADR-0003](../adr/0003-client-side-entitlement-pricing-vendored-copy.md), and ADR-0002's
support-round-trip consequence marked superseded.

Land **with the implementation**:

- **Integration Guide**: the section drafted in Appendix A (suggested placement: new §6.7 "Pricing
  an early 30d exit — the entitlement ceiling", after §6.6; a TOC entry; and the new §8.2 row given
  there).
- **README**, "What it does", the 30d sentence of the Redeem bullet becomes: "On the 30d product
  the widget prices the exit itself: a quote card shows what the typed amount pays if filled today
  against the holder's **entitlement ceiling** — computed from their on-chain history by a
  byte-exact vendored copy of the solver's own rule (`src/entitlement/`, drift-checked) — the
  request posts at the wider of the holder's spread and the **required spread**, and a live request
  asking above the ceiling says so on the row, with the price to re-post at offered as a button."
  The Architecture list gains `src/entitlement/` and the new pure modules; the line "pricing an
  early exit is stage 2 (ADR-0002)" becomes a pointer at ADR-0003 and this spec.

### Sequencing

Small commits, each independently reviewable, in this order:

1. **Vendor + drift check**: `src/entitlement/` (four files, byte-exact), `PROVENANCE.md`,
   `vitest.entitlement.config.ts`, `scripts/entitlement-drift.cjs`, the two npm scripts, the root
   Vitest `include` narrowed to `*.test.ts`. `npm run drift:entitlement` passes.
2. **The read, pure**: `holderHistory` replay, `walletScanRanges`, `planWalletScan` widened,
   `transferReads`, with ticket 03's JSON outputs as fixtures. No hook changes yet.
3. **The hook widening**: raw logs held once, the two derivations, `transactionHash` on `RawLog`,
   data word 2 decoded, the transfer second phase through the shared budget, the confirm-step tail;
   the runtime floor check. The 24h product provably unchanged.
4. **The price, pure**: `requiredSpread`, `postedDiscount`, `offerSharesOf`,
   `formatDiscountPercent`, the lot listing with its cross-check, `largestPostableShares`,
   `compareRequest`, the re-check predicate; the raw balance kept in `useUserPosition`; the
   queue-withdraw regression script extended.
5. **The quote card and the write path**: the card (normal / clamp / locked), the spread row, MAX
   as the raw balance, the confirm pin and re-check, posting through `queueWithdraw`.
6. **The request row and the rest**: the five-way row with the re-post button, the position card
   sub-line, the explainer step.
7. **The degraded pass**: the unreadable / paused / pin-failure wordings, Try again, the registry
   `_note`.
8. **The docs pass**: the guide section (Appendix A), the README changes.

## Testing Decisions

### What a good test is here

A good test asserts a number a depositor could lose or an operator could misread, and would still
pass if the implementation were rewritten. The entitlement arithmetic itself is **never re-tested**
— the vendored fixtures are its tests, and writing new assertions against `quoteEntitlement` here
would only create a second opinion for the drift check to disagree with. What this repo tests is
everything *around* the rule: that the history handed to it is the ledger's, that the discount
posted from it is the fillable one, and that every judgement shown is the computed one.

### The vendored fixtures

`npm run test:entitlement` — 2 suites / 36 tests, byte-exact, on their own config. They are half
two of the drift check and the only tests that touch `src/entitlement/`.

### Modules under test

- **The replay** (`holderHistory`): fixtures are ticket 03's three settings
  (`docs/wayfinder/entitlement/assets/03-the-same-number/out/`) — the live 30d holders, the live
  24h holders (both burns and both fill share-legs excluded; the two-fill holder replays to its
  0.05 vested residue), and the fork scenario (the transfer-in lot at the day-1 rate; A's
  post-fill history `deposit, fill` with the leg not counted).
- **The refund non-exclusion**: a synthetic vector — a `Deposit`, its `DepositRefunded`, and the
  refund's burn `Transfer` — asserting the earnings derivation drops the deposit while the history
  keeps the lot and excludes the burn. This case has **no runtime coverage anywhere** (no refund on
  either product, none in the solver's fork scenario); it rests on the source reading, so the
  vector is not optional.
- **Scan planning**: the vesting-gap gate (`shares > 0`; holder D plans `scan` on 30d,
  `never-deposited` on 24h); ranges per chunk (1 on 24h, 3 on 30d — the test is a cost);
  `transferReads` on the 24h production logs (two legs, two burns → nothing to date) and the fork
  (one transfer-in).
- **The price**: `requiredSpread` vectors — the runbook's pairs (`1.001000/1.000000 → 1000`,
  `2.000000/1.999999 → 1`), the live pair (`1.000396/1.000121 → 274`), a pair past the clamp →
  `unfillable`, never 10,000. `postedDiscount` — `0.1%/274 → 1000`, `0.1%/1026 → 1026`,
  `0.5%/1026 → 5000`. `offerSharesOf` — "1000"; a 19-dp string truncates; MAX's 18-dp string
  round-trips.
- **The wire**: the extended `npm run test:withdraw` asserts the on-wire discount equals `d` for
  `1, 274, 999, 1000, 1026, 9999, 10000` through the real compiled `queueWithdraw`.
- **The lot listing**: the blend over the spent lots reproduces `maxAskPrice` and the counts equal
  `vestedShares`/`unvestedShares` on every prototype scenario (`mixed`, `unvested-late`,
  `transfer-in`, `clamp`).
- **The judgements**: `compareRequest` — the prototype's `request-above`, `request-below-stale`
  (expired; under-asking requires the share price to have risen past the posted spread),
  `request-fresh`, plus a marked-down-NAV vector → `above-share-price`. `largestPostableShares` —
  the clamp scenario's 6,000; one young lot → `null`; all vested → the balance. `floorSoundness` —
  the solver's two arms; the live 30d floor (young, supply-zero → sound). The re-check predicate —
  rate moved / paused / balance short → `re-pin`; unchanged → `post`.

### Not covered by tests

React wiring and rendering — no DOM library, no component tests (stage 1's stance). The live
verification surface is manual: against the keyed RPC, the widget's ceiling for each real 30d
holder must equal the solver's (the ticket 03 scripts re-run, or the solver's pending view when
support has it open); the fork e2e (`test/entitlement-30d-vesting.e2e-spec.ts`, 3/3 locally with
anvil + forge) is the AFK surface for what the live chain lacks — the transfer-in lot, the
fill-leg exclusion, and the round-up at the gate.

## Out of Scope

- **Pricing the 24h product.** Gating is on the vesting gap; the 24h transfer recipient's
  unfillable post stays as stage 1 leaves it — an accepted charting consequence.
- **Calling the solver's ops API** from the widget, or a **shared package** — rejected by solver
  ADR-0006 §4 and this repo's ADR-0003.
- **The 90d product** — the 1% clamp binds there; the solver line's spec puts it out too.
- **A support link** — the repo holds none (ADR-0002).
- **Changing the redemption spread or validity defaults** — stage 1's "deliberately unchanged"
  stands.
- **Automatic re-posting.** The widget offers the re-post price; the holder acts.
- **DOM/component tests** and **CI wiring** — none exist here; the drift check is an npm script.
- **Persisting history across sessions** — in-memory only, as all stage-1 scans are.
- **The solver's fill mechanics** — batch cadence, liquidity, ordering are the solver's.

## Further Notes

### The same number — verified 2026-09-01

A reproduction of the ledger's event table in the widget's terms produced the solver's own
histories event-for-event and its ceilings unit-for-unit, with **no divergence**, in all three
settings, pinned to Polygon block 93,047,000 against solver `813aede` (working tree clean, SHA-1s
equal to the pins above): the live 30d vault (2 holders), the live 24h vault (2 holders — five
deposits to two receivers; the map's earlier "3 holders" was wrong — including both production
fill share-legs and both burns), and the solver's fork e2e at its three judgement moments,
including `fillOnce`'s own `plan.ceilings` and the spec's asserted numbers (A's computed discount
1000 → ask 999,999 = the queue-stamped price, filled). Scripts, JSON outputs and the re-run recipe:
[`docs/wayfinder/entitlement/assets/03-the-same-number/`](../wayfinder/entitlement/assets/03-the-same-number/README.md).
Both read shapes (product-wide 3 ranges, per-wallet 4) gave identical histories; the per-product
shape specified here is the 3-range one.

### Live facts the copy and tests anchor to (2026-09-01, re-verify before relying)

- 30d vault: floor 92,416,354 (15 days old — passes the floor check on the supply arm), 2 holders,
  both unvested at entry 1.000122 against NAV 1.000396 → **required discount 274 (0.0274%), below
  the 0.1% default** — today both holders post exactly what stage 1 posts.
- Scan cost: 64 chunks per event kind on 30d (~3 × 64 requests ≈ 8.9 s under the shared budget),
  115 on 24h (unchanged — `Deposit` only); cost is range-bound, ~57,600 blocks/day ⇒ +173 chunks
  per kind per month until the roster's floor bump.
- Both accountants: `minimumUpdateDelayInSeconds = 3600`, per-update bounds +0.10% / −0.50%; the
  auto-pause stores the out-of-bounds rate before pausing.
- `AtomicQueue.solve` moves shares by `safeTransferFrom(user, solver, …)` in the fill transaction —
  the share leg the `(transactionHash, holder)` exclusion exists for; present in the 24h production
  data.
- Thresholds: at 2.5% APY the required spread passes the 0.1% default ~14.6 days into a lot; the 1%
  clamp needs ~12.2% APY over thirty days (at 2.5% the worst case is 0.205%).
- `String(d / 1e4)` through the library's `× 10⁴ → toFixed(0)` returns exactly `d` for every d in
  0..10000 against the installed `bignumber.js`.

### Why the pin is `813aede`

The runbook table pins `d75ad60`; `main` has since gained two golden tests in `entitlement.spec.ts`
(51 lines; 36 tests, not 34) with the other three files byte-identical. Vendoring from `main` HEAD
takes the strictly larger fixture set at no behavioural difference. The SHA-1s recorded above are
the durable identity either way.

---

## Appendix A — Integration Guide section (draft; land with the implementation)

Suggested placement: new **§6.7**, after §6.6 "Track fills (direct)"; add a TOC entry. Also add the
§8.2 row below.

### 6.7 Pricing an early 30d exit — the entitlement ceiling

On **Yield Prime 30d** the vesting term (30 days) outlives the share lock (1 day), so shares can be
redeemable before they vest. The solver prices every request against the holder's **entitlement
ceiling** — unvested shares are capped at what was paid (`min(entry, NAV)` per lot, FIFO oldest
first); vested shares price at NAV — and it can only **refuse** a request above the ceiling, never
fill it lower. A request asking above the ceiling is skipped `ask-above-entitlement` every batch
until its deadline lapses. Pricing the request is therefore the UI's job, and it must reach the
solver's number exactly.

**Vendor the rule; do not reimplement it.** The function is one dependency-free module in the
solver's repository, built to be copied byte-for-byte:
`vault-solver-service/src/core/entitlement.ts` (`quoteEntitlement`, plus the `HolderEvent` types),
with its golden spec, 300-case regression suite and fixture JSON beside it. This repo carries the
copy in `src/entitlement/` with `PROVENANCE.md` (source repo, commit `813aede`, four SHA-1s) and a
two-half drift check: `npm run drift:entitlement` re-hashes the bytes and runs the vendored suites.
The solver repo's `docs/RUNBOOK.md` §5.1 is the authoritative hand-off.

**The seven inputs**, all from the contracts:

| Input | Read |
| --- | --- |
| `history` | the event table below, from the vault's `eventsFromBlock` |
| `shareBalance` | `vault.balanceOf(holder)` |
| `navPerShare` | `accountant.getRateInQuoteSafe(want)` — its revert means the accountant is paused: price nothing |
| `now` | the latest block's timestamp — **not** the browser clock |
| `vestingSeconds` | the product's declared vesting term (this repo: the vault registry) |
| `offerShares` | the shares being sold, in raw 18-dp units |
| `shareDecimals` | the share token's decimals (18) |

**The event table.** Read three logs from the ledger floor, sort by `(blockNumber, logIndex)`:

| Contract | Event | Becomes |
| --- | --- | --- |
| Teller | `Deposit` (filter `receiver`) | `deposit { t = depositTimestamp (data word 2), shares, assets }` |
| Share token | `Transfer` (unfiltered; keep the holder's legs) | `transfer-in { t = block time, shares, rate = accountant.getRateInQuote(want) at that block }` / `transfer-out { t, shares }` |
| AtomicQueue | `AtomicRequestFulfilled` (filter `user`) | `fill { t = event timestamp, shares = offerAmountSpent }` |

Exclude mints (`from == 0`), burns (`to == 0`), and the **fill share-leg**: the `Transfer` whose
`(transactionHash, holder)` matches an `AtomicRequestFulfilled` in the same transaction —
`AtomicQueue.solve` moves the shares by `safeTransferFrom`, so counting that transfer *and* the
fill would spend the holder's lots twice. **Do not exclude refunded deposits in this reading**: a
refund (`Teller.refundDeposit`) burns the shares — a burn `Transfer` you already exclude — and the
solver's ledger keeps the `Deposit` lot. (For an *earnings* figure the refund exclusion of §6.3
remains correct; the two readings differ deliberately.)

**The floor invariant.** `eventsFromBlock` may only ever be raised to a block at least
`vestingSeconds` old, or one below which the vault held no shares. The ledger calls whatever the
post-floor events do not explain a **vested residual**; a floor bumped past `now − vestingSeconds`
turns still-vesting money into a vested quote — above the solver's ceiling, a certain skip that
looks right. This widget verifies both arms at runtime once per session; verify it whenever you
change the value.

**Price and post.** The queue takes a discount, not a price, on its public path:

```
ceiling  := quoteEntitlement(query).maxAskPrice          // want units per whole share, floored
required := ceil((NAV - ceiling) * 1_000_000n / NAV)     // ROUND UP — a floored discount can post
                                                         // one want unit above the ceiling: a skip
if required > 10_000n: refuse — no fillable price exists through the public path; say so
posted   := max(holderSpreadPpm, required)
queue.safeUpdateAtomicRequest(vault, want, { deadline, atomicPrice: 0, offerAmount, inSolve: false },
                              accountant, discount = posted)
// the queue stamps atomicPrice = floor(NAV * (1e6 - posted) / 1e6) at the posting block
```

Read the same `getRateInQuoteSafe(want)` for the formula that the queue reads for the stamp, at the
block you post from, or a rate tick between read and post leaves the discount one tick short.

**A request already too high.** Compare `queue.getUserAtomicRequest(holder, vault, want).atomicPrice`
against the ceiling you computed and against a fresh post's ask; show which of five cases holds —
above the share price (the rate fell), above the entitlement, expired, under-asking, within — and
offer the re-post price, not just the complaint. The deadline sits beside the comparison, because
the price alone cannot see it.

**Re-vendoring — when the solver's rule or its `HolderEvent` shapes change.** More than re-running
the drift check:

1. Pin the new solver commit; copy the four files byte-exact again (no reformatting); record the
   new commit and SHA-1s in `src/entitlement/PROVENANCE.md`.
2. Run both halves: `npm run drift:entitlement` — the hashes must match the new note, and the
   vendored suites (whatever their new count) must pass unmodified on the vendored config.
3. **Diff the `HolderEvent` shapes and the query type.** A change there is not absorbed by the
   copy: the widget's history read produces those shapes, so a new field or event kind means the
   read (`holderHistory`, `transferReads`, the event table above) must change with it — re-verify
   against the solver's ledger the way the hand-off did (the same-number comparison in
   `docs/wayfinder/entitlement/assets/03-the-same-number/`).
4. Re-run the widget's own vectors (`npm test`): the lot-listing cross-check and the posting-rule
   vectors catch a rule change the shapes hide.
5. If the rule's *economics* changed (the cap, the FIFO order, the boundary), treat it as a product
   change, not a refresh: the copy, the guide's numbers and the explainer's example all state the
   old rule.

**New row for §8.2 "Why a request may not fill":**

| Condition | What your UI should do |
|---|---|
| Ask above the holder's **entitlement ceiling** (30d: unvested shares are capped at what was paid) | Show the ceiling, say the request will be passed over until it lapses, and offer the re-post at `floor(NAV × (1e6 − max(spread, required)) / 1e6)`. This widget computes the ceiling client-side from the vendored rule (§6.7); never post a new request above it. |
