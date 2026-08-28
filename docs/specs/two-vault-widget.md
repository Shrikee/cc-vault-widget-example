---
status: ready-for-agent
date: 2026-08-28
stage: 1 of 2
---

# Two vaults in one widget — adding Yield Prime 30d (CCUSD30)

## Problem Statement

A Coinchange depositor can today see, enter and exit exactly one vault: **Yield Prime**
(**CCUSD**), the 24h product on Polygon PoS. Coinchange has since launched a second product on
the same chain — **Yield Prime 30d** (**CCUSD30**), live since 2026-08-21, with its own vault,
teller, accountant, AtomicQueue and redemption solver, and its own target return.

That product is invisible. A depositor who wants it cannot reach it from this widget at all, and a
depositor who already holds both has no single page showing both **position value**s. Support has
no link that opens a particular product.

The obstruction is structural rather than cosmetic: every component and hook in the widget names
one vault's addresses, share symbol, deploy blocks and **base asset** at module scope. There is no
vault parameter anywhere, so pointing the widget at the second product means abandoning the first.

There is also a hazard specific to the new product that the current UI is not equipped to state.
The 24h and 30d vaults share an identical **share lock** of one day, but the redemption solver
prices a holder's shares against a **vesting term** that differs by product — one day on the 24h
line, thirty days on the 30d line. A holder who exits the 30d vault before their shares vest is
entitled only to what they paid, not to the **share price** they see; and because the solver can
only refuse a request, never fill it at a lower price, such a request simply sits open until its
deadline lapses. The widget currently renders every open request as "Fillable for N days", which
would be an assertion it cannot support.

## Solution

The widget shows both products and lets the depositor act on one at a time.

A row of vault chips names each product and carries its **headline APY**, so the two returns sit
side by side. Selecting a chip switches the action panel, the vault stats and the pause banner to
that vault. The side rail always shows the depositor's **position value** in *both* vaults, and
always lists every open redemption request in *both* queues, each labelled with the product it
belongs to — so a live redemption is never hidden by looking at the other product.

The selected vault lives in the page URL, so a reload keeps it and support can send a depositor
straight to the right product.

Both products get the same deposit and redemption flows. The widget posts redemption requests and
does not police whether they fill — that is the solver's decision and the operations team's
surface. What changes is what the widget *claims*: an open request is described as open and
expiring, not as fillable, and the 30d panel states plainly that the product vests over thirty
days, that an earlier exit may need a wider redemption spread, and where to ask if a request stays
open.

This is **stage 1 of two**. Stage 2 gives the widget the solver's own entitlement arithmetic so it
can price an early 30d exit correctly and unattended; until then an early exit costs a support
round-trip. Stage 2 is specified separately and is out of scope here.

## User Stories

### Seeing both products

1. As a depositor, I want to see both Coinchange products in one widget, so that I do not need a
   second URL to reach the one I want.
2. As a depositor, I want each product's **headline APY** on its chip, so that I can compare the
   24h and 30d returns without switching back and forth.
3. As a depositor, I want each product named by its own vault name and share symbol, so that I can
   tell CCUSD from CCUSD30 at a glance.
4. As an anonymous visitor with no wallet connected, I want both products' **TVL**, **share
   price** and APY to load, so that I can evaluate them before connecting.
5. As a depositor, I want the selected product's vault stats card to show its own **realised
   trailing APY** across the 3, 7 and 30 day **trailing window**s, so that the depth of figures I
   have today is not lost by adding a second product.
6. As a depositor in the 30d vault, I want a **trailing window** that reaches back before that
   vault's deployment to be measured since launch, so that a 30-day figure on a young vault is not
   silently wrong.
7. As a depositor, I want the pause banner to reflect the product I am looking at, so that a pause
   on the other product does not block a page I can actually use.

### Switching between products

8. As a depositor, I want to switch products with one click, so that moving between them is
   cheaper than navigating.
9. As a depositor, I want the selected product recorded in the page URL, so that a reload,
   a bookmark or a back button returns me to it.
10. As a support agent, I want a link that opens the widget on a specific product, so that I can
    send a depositor exactly where their problem is.
11. As a depositor opening a link with an unrecognised product, I want to land on the 24h vault
    rather than an error page, so that a stale link still works.
12. As a depositor arriving with no product in the URL, I want to land on the 24h vault, so that
    the default is the established product.

### Position and earnings

13. As a depositor holding both products, I want both **position value**s in one card, so that I
    can see everything I hold in one place.
14. As a depositor holding both products, I want each position labelled with its product, so that
    I never confuse which money is where.
15. As a depositor, I want my **earnings** shown per product, so that each product's performance
    is attributable.
16. As a depositor holding only one product, I want the widget to skip scanning the other
    product's deposit history, so that my page loads as fast as it does today.
17. As a depositor whose deposit history cannot be read, I want the affected figure to show "—"
    with an inline error rather than a fabricated number, so that I can tell missing from zero.
18. As a depositor, I want my **average deposit cost** computed per product, so that **earnings**
    are not blended across two share tokens at two different **share price**s.

### Depositing

19. As a depositor, I want to deposit the **base asset** into either product, so that I can choose
    the term that suits me.
20. As a depositor typing an amount, I want **projected earnings** quoted at that product's own
    **headline APY**, so that the projection matches the product I am entering.
21. As a depositor in the 30d vault, I want the panel to state that the product vests over thirty
    days before I deposit, so that I am not surprised later.
22. As a depositor, I want the deposit button to reflect the selected product's share symbol, so
    that the transaction I am approving is unambiguous.
23. As a depositor on the wrong network, I want the same network prompt on both products, so that
    the switch behaves identically wherever I am.
24. As a depositor, I want a successful deposit to refresh that product's **TVL**, **share
    price**, my position and my deposit history, so that the page reflects what just happened.
25. As a depositor, I want a deposit into one product to leave the other product's figures
    untouched, so that nothing appears to change that did not.

### Redeeming

26. As a depositor, I want to request a redemption from either product, so that both are exitable
    on the same terms the widget already offers.
27. As a depositor, I want every open redemption request visible whichever product I am looking
    at, so that switching products never hides money in flight.
28. As a depositor, I want each open request labelled with its product and share symbol, so that I
    know which redemption I am looking at.
29. As a depositor, I want an open request described as open and expiring rather than as fillable,
    so that the widget does not promise an outcome it does not control.
30. As a depositor in the 30d vault, I want to be told that an exit before the product vests may
    need a wider redemption spread, and where to ask, so that a request that sits open is
    explicable rather than mysterious.
31. As a depositor, I want to cancel an open request for the product I am not currently on, so
    that cancelling does not require me to work out where the request lives.
32. As a depositor whose redemption fills, I want a confirmation naming the product it came from,
    so that I know which position changed.
33. As a depositor whose redemption fills while I am looking at the other product, I want the
    confirmation anyway, so that a fill is never missed.
34. As a depositor, I want the redemption spread and validity controls unchanged on both products,
    so that a support agent can talk me through them the same way for either.

### Operating and maintaining

35. As an operator, I want the widget's vault addresses in a JSON registry shaped like the solver
    service's roster, so that checking one against the other is reading two files side by side.
36. As an operator, I want a malformed or incomplete registry to fail loudly at load, so that a
    typo surfaces as an error rather than as undefined addresses and blank figures.
37. As an operator, I want each registry value's source repository and file recorded beside it, so
    that the next person knows where the authority lives.
38. As an operator, I want the **vesting term** carried per product in that registry, so that it
    is in place and reviewable before stage 2 prices anything with it.
39. As an operator, I want adding a third product to be a registry entry plus a chip, so that the
    next product does not need another refactor.
40. As a maintainer, I want the widget's total log-scan load with two products to stay near
    today's, so that the archive RPC requirement in ADR-0001 does not become a rate-limit failure.
41. As a maintainer, I want concurrent scans to share one in-flight budget, so that adding a
    product cannot multiply concurrent requests past what the endpoint tolerates.
42. As a maintainer, I want every vault-scoped component and hook to take its vault explicitly, so
    that the type checker finds every site when a product is added or changed.
43. As a maintainer, I want the domain glossary to describe two products rather than one vault, so
    that the vocabulary the code, docs and issues share stays true.
44. As a maintainer, I want the decision to show two products behind a switcher recorded as an
    ADR, so that the alternatives considered are not relitigated.
45. As an agent picking this up later, I want the deferred entitlement work and its consequence
    written down, so that stage 1's copy is understood as deliberate rather than incomplete.

## Implementation Decisions

### The vault registry

- Vault configuration moves out of TypeScript constant modules into a **JSON vault registry**
  holding both products. It is shaped like a vault entry in the solver service's roster —
  the same key names and nesting — so that checking the widget against the authority is a
  side-by-side read rather than a translation. Fields the widget alone needs sit in a nested `ui`
  block, keeping the shared keys diffable.
- Vault ids are the solver roster's own ids, so the same product has one name across all three
  repositories and a URL is greppable in any of them.
- The registry is parsed once at load through a guard that returns a typed roster or throws. A
  missing address, an unparseable block number or an unknown chain key is a loud failure, never a
  silently `undefined` address.
- Chain-level values — chain id, chain label, explorer base, the shared Lens, the **base asset** —
  are declared once, not per vault. Both products are on Polygon PoS and share the **base asset**.
- Scan mechanics that belong to the protocol rather than to a product — log chunk span, the
  **trailing window** set, the **headline APY** window, the share-price unit, the event topics —
  stay where they are and remain global.
- The registry shape, chosen against a rendered preview:

  ```
  {
    "chain": { "key", "chainId", "label", "explorer" },
    "vaults": [
      {
        "id",                  // solver roster id
        "chain",
        "addresses": { "vault", "teller", "queue", "solver",
                       "want", "accountant", "lens" },
        "eventsFromBlock",     // ledger floor, from the solver roster
        "vestingSeconds",      // product vesting term; unused until stage 2
        "ui": { "name", "symbol", "decimals", "shareLockPeriod",
                "deployBlocks": { "accountant", "teller" },
                "deployTimestamp" }
      }
    ]
  }
  ```

- Four values in that registry cannot be verified against the chain and must carry a provenance
  note naming their source repository and file: the AtomicQueue address, the solver address, the
  ledger floor, and the **vesting term**. The remainder is chain-verifiable and must be verified
  before this ships (see Further Notes).

### Layout and selection

- One action panel with a row of vault chips above it, not two side-by-side sections and not two
  stacked sections. Each chip names a product and shows its **headline APY**.
- The selected product drives the deposit and withdraw panel, the vault stats card, the pause
  banner and the deposit **projected earnings**. The side rail's position card and open-redemptions
  card always cover *both* products.
- Selection is held in a URL query parameter and written back with a history replace, using the
  registry's vault ids. No router dependency is introduced. An absent or unrecognised value
  resolves to the 24h vault without an error.
- Vault selection resolution is a pure function of the search string and the roster, so it is
  testable without a DOM.

### Data layer

- A single vault-context provider from the vault library is mounted, keyed by the selected vault
  id, and is used **only** by the deposit and withdraw panels — the write paths. Keying it means
  switching products remounts it, which resets write state cleanly.
- The two read hooks that currently take their vault from that context — vault metrics (**TVL**,
  **share price**) and user position (shares, share-lock expiry) — move onto direct chain reads
  that take a vault as an argument. This is the pattern the pause-status hook already uses.
- This is safe because all four of the library's read functions go through the **shared Lens**,
  passing the vault's own addresses as call arguments, and both products share that Lens
  deliberately. Reading either product is the same contract call with different arguments, so
  there is no per-vault library state a direct read could fail to reproduce. The 24h vault's
  figures must be confirmed unchanged when this lands.
- Every vault-scoped component takes an explicit vault argument; every vault-scoped hook takes one
  as a parameter. No new React context is introduced. The position card, which renders both
  products, therefore needs no special case.

### RPC budget

Two products roughly double the widget's chunked log-scan load, which ADR-0001 already identifies
as the widget's hard dependency on an archive-capable endpoint. Four measures, applied together,
keep a typical cold load at today's cost:

- **One global in-flight budget.** The concurrency limit becomes a single shared budget across all
  scans rather than a per-scan limit, so overlapping scans queue instead of multiplying concurrent
  requests.
- **Clamp each scan to its vault's deploy block.** Currently a flat 30-day span is scanned
  regardless of a vault's age, on the reasoning that earlier chunks return nothing. With two
  vaults, one of them young, that waste doubles. Clamping changes no displayed figure.
- **Window by selection.** Only the selected product needs the full 30-day span; the unselected
  product contributes one number, its **headline APY**, so it scans only that window. Switching
  products widens the newly selected vault's scan incrementally rather than rescanning.
- **Skip on zero balance.** A product in which the connected wallet holds no shares has no
  **earnings** to compute, so its deposit-history scan is not started. Share balances are already
  read cheaply, so this costs nothing to determine.

Scan planning — which block ranges to scan for which vault, given the selection, the chain head,
the wallet's balances and any existing cursors — is a pure function, separated from the code that
issues the requests.

### Redemptions

- The open-request row moves out of the withdraw panel into its own side-rail card that lists open
  requests across both queues, each labelled with its product. It is visible regardless of the
  selected product or the active tab.
- Both queues are polled. The fill confirmation names the product it came from.
- Cancelling a request belonging to the unselected product first switches the selection to that
  product, then cancels through the now-mounted provider. No cancel control is ever rendered
  without a working action behind it.
- The per-vault scan bookkeeping that governs full and tail deposit scans is keyed per vault as
  well as per wallet, so one product's scan state cannot be mistaken for the other's.

### Copy

- "Fillable for N days" becomes an expiry statement rather than a fillability claim, **on both
  products**. This is not 30d-specific: the solver's pre-filter can decline a request for
  insufficient allowance, for an ask above the **share price** on a falling rate, or for a
  still-locked deposit, and the widget already carries a distinct state for a revoked approval.
  One honest string is better than two divergent ones.
- The 30d deposit and withdraw panels state that the product vests over thirty days, that an exit
  before then may require a wider redemption spread, and where to ask if a request stays open.
- The "how it works" explainer becomes product-aware, since its share-lock and redemption steps
  differ in emphasis between the two products.
- Header, hero and footer name the selected product.

### Deliberately unchanged

- The redemption spread default stays at its current value **on both products**. Raising it for
  the 30d product would buy fills with vested holders' money.
- The request validity default stays as it is. The 30d product's solver runs on the same hourly
  batch cadence as the 24h product's; the thirty days is a **vesting term**, not a fill delay, so
  the current deadline is ample.
- The deposit asset set is unchanged. Both products accept the same **base asset** and the teller's
  support for it must be re-confirmed on the new vault before shipping.
- The unused delayed-withdraw contract stays unused on both products.

### Documentation

- The domain glossary's terms that assume a single vault — the share token, **TVL**, **headline
  APY**, **position value**, **earnings**, **average deposit cost** — become vault-scoped, and
  "product", "vault" and "selected vault" are added. The distinction the solver service's glossary
  draws is adopted: a *product* is the commercial line, a *vault* is its deployed contract set.
- One ADR records three decisions with their rejected alternatives: two products behind a switcher
  rather than side-by-side or stacked sections; a JSON registry mirroring the solver roster rather
  than TypeScript constants or vendored source files; and deferring the entitlement arithmetic to
  stage 2, with the support round-trip recorded as its accepted consequence.
- Terms belonging to stage 2 — the entitlement ceiling, lots, the residual lot — are **not** added
  yet, since nothing in this repository uses them.

### Sequencing

The work lands as a series of small commits in this order, each independently reviewable: registry
and parse guard; read hooks onto direct chain reads with the 24h figures confirmed unchanged; the
vault argument threaded through; the four RPC measures; the switcher, URL parameter and keyed
provider, at which point the second product appears; the redemptions card and both-queue polling;
the copy pass; glossary and ADR.

## Testing Decisions

### What a good test is here

A good test asserts behaviour that a depositor or an operator could observe, and would still pass
if the implementation behind it were rewritten. It pins a decision, not a call sequence. Concretely:
that a malformed registry is rejected; that a 30-day **trailing window** on a vault younger than
thirty days is measured since launch; that a wallet holding one product does not trigger a scan of
the other; that no more than the budgeted number of requests are ever in flight. Not: which
function called which, or how state is stored.

### The runner

**Vitest is introduced in stage 1.** The repository currently has no test runner at all — its two
existing suites are plain Node scripts driving pure modules under type stripping. Vitest reuses
the Vite configuration already present, needs no separate build step, and gives the new decision
logic real assertions, focused runs and watch mode.

- The existing APY vector script is ported to Vitest as part of this work. It is not optional
  housekeeping: the trailing-APY computation gains per-vault launch anchors in this change, which
  alters its signature and the fixtures that anchor to it, so that script is being edited anyway.
- The existing queue-withdraw regression guard stays as it is. It guards a packaged library bug,
  is unrelated to this change, and rewriting it would risk the protection it provides.
- Tests run in a Node environment. No DOM library and no component tests are added — see Out of
  Scope.

### Modules under test

- **Registry parse.** A well-formed registry yields a typed roster naming both products; a missing
  address, a malformed block number, an unknown chain key and an unknown vault id each fail, and
  fail with a message identifying what was wrong.
- **Vault selection.** A known id selects it; an unknown id, an empty parameter and an absent
  parameter all resolve to the 24h vault; the resolved id is always one the roster declares.
- **Scan planning.** Ranges are clamped to each vault's deploy block; the selected product plans
  the full span and the unselected one the **headline APY** window; a switch plans only the
  incremental widening rather than a rescan; a zero share balance plans no deposit scan; a
  non-zero one plans a scan from that vault's ledger floor.
- **Concurrency budget.** Driven with a counting fake, several scans started together never exceed
  the budget, and all of them still complete. The existing no-retry, no-partial-data contract for a
  failed chunk is preserved: one failed chunk fails its whole scan.
- **Trailing APY with per-vault anchors.** The existing vectors, re-anchored per product: a window
  reaching before launch is measured since launch; the launch **share price** is used as the
  opening point; a window with no events in it behaves as it does today.
- **Scan bookkeeping, keyed per vault.** The existing rules — one full scan per wallet, a tail scan
  resuming from the cursor, an overtaken run dropped, a failed full scan leaving nothing scanned,
  at most one queued tail — must hold independently for each product, and one product's scan state
  must never be visible to the other.

### Prior art

The existing APY vector script is the model: pure modules, no chain, no React, no bundler globals,
with fixtures that a reader can recompute by hand. The scan-bookkeeping rules were extracted into
their own pure module for exactly this reason, and that extraction is the pattern the new scan
planner and registry parse follow.

### Not covered by tests

React wiring — which component renders where, what the switcher looks like, whether the provider
remounts — is covered by the type checker and by manual verification against the live contracts.
The vault library's own read and write paths are not re-tested; the 24h vault's figures being
unchanged after the read hooks move is verified by observation against the live vault.

## Out of Scope

- **The entitlement arithmetic (stage 2).** Vendoring the solver's entitlement function byte-exact
  with a drift check, reproducing the holder ledger from chain, and pricing an early 30d exit's
  discount are a separate spec. Until they land, an early 30d exit relies on a support round-trip
  through the solver's operations surface. The **vesting term** is carried in the registry in stage
  1 but is not read by any code path.
- **Component and DOM tests.** Vitest is introduced, but no DOM environment or component testing
  library is added. This spec does not test rendering.
- **Side-by-side or stacked product sections**, and a combined portfolio total across both
  products. Both were considered and rejected in favour of the switcher.
- **A third product.** The registry makes one cheap to add; adding the 90d product is not part of
  this work, and the solver line's own decisions put it out of scope there too.
- **Multi-chain support.** Both products are on Polygon PoS and share the **base asset**; the chain
  block in the registry is singular by design.
- **Changing the deposit asset set, the redemption spread default, the request validity default, or
  the withdraw model.** All stay as they are on both products.
- **An automated drift check against the sibling repositories.** The registry's shape is the
  mechanism for checking it; no script reads the other repositories.
- **Re-testing the vault library.** Its packaging caveats and version floor are unchanged.

## Further Notes

### Verification — run against the live contracts on 2026-08-28, all checks passed

Both vaults were read over the archive endpoint at chain head 92,835,789. Every declared value is
confirmed, and the values below are the ones the registry should carry.

| | 24h (control) | 30d (new) |
| --- | --- | --- |
| name / symbol / decimals | Yield Prime / CCUSD / 18 | **Yield Prime 30d / CCUSD30 / 18** |
| accountant base asset | Polygon USDT | Polygon USDT |
| **share price** now | 1.000000 | 1.000122 |
| accountant paused | no | no |
| teller paused / share lock | no / 86,400 | no / 86,400 |
| teller supports the **base asset** | yes | **yes** |
| AtomicQueue paused | no | no |
| vault / accountant / teller deploy blocks | 91901943 / 91901948 / 91901950 | 92415693 / 92415698 / 92415700 |
| deploy timestamp | 1786557949 | **1787328574** (2026-08-21T16:09:34Z) |
| ledger floor sound | yes | yes — supply at floor−1 is zero |

Each deploy block was confirmed by asserting code exists at that block and does not at the block
before it. The shared Lens and both solvers hold code.

**Reading the deploy timestamp from the chain was necessary, as anticipated.** The contracts
repository's deployment record gives 2026-08-21T16:12:59Z for the 30d stack; the accountant's
deploy block actually timestamps at 16:09:34Z — 3 minutes 25 seconds earlier. The record is the
broadcast run time, as its own notes say. The chain value is the one the registry must carry,
because it anchors the "measured since launch" path.

### What the APY figures will actually show

Two operational facts, both discovered during verification, that the copy and any launch
expectations need to account for. Neither is caused by this change.

- **The 24h vault's share price has never been updated.** A full scan of its accountant from
  deployment — 94 chunks, 16 days — returns **zero** rate-update events, and its rate is still the
  constructor's 1.000000. Every **realised trailing APY** window on the 24h product therefore
  computes to 0.00%, which is what the widget shows in production today. Adding a second product
  puts that 0.00% next to another figure on a chip, where it is considerably more conspicuous than
  it is alone.
- **The 30d vault's schedule started roughly seven days after deployment.** Its accountant carries
  exactly two rate updates, both on 2026-08-28 (00:27 and 12:26 UTC), 12 hours apart — the cadence
  the product line's design calls for. The resulting figures are 0.43% over three days, 0.18% over
  seven, and 0.61% measured since launch. The product's target return is 4.5%; a **realised
  trailing APY** cannot show that until the schedule has run long enough, which is the intended
  behaviour of deriving yield from history rather than publishing a target.

Both vaults also hold seed-sized balances only — 1.05 CCUSD and 0.05 CCUSD30 — so **TVL** renders
near zero on both.

### Why the 24h product is unaffected by the vesting hazard

On the 24h product the share lock and the **vesting term** are the same duration, so any share that
can be redeemed has already vested. The entitlement gate cannot bind there. The hazard is specific
to the 30d product, where the lock stays at one day while the term is thirty.

### The support loop this stage relies on

The solver's operations API publishes, for every judged request, both the holder's ceiling and the
reason a request was skipped. That is the surface support quotes back when a depositor asks why
nothing filled, and the remedy is the depositor re-posting at a wider spread — a control the widget
already exposes and which is comfortably within the contract's maximum for this product's term.
The widget deliberately does not call that API.

### Load

With all four RPC measures in place, a typical single-product holder's cold load is close to what
ships today. A depositor holding both products pays for both deposit scans, which is the honest
cost of showing both **earnings** figures.
