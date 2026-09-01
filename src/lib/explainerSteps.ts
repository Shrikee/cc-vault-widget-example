// The "How it works" timeline, as copy rather than as JSX.
//
// The steps used to be assembled inside the component. They are assembled here
// for the reason src/lib/withdrawQuote.ts and src/lib/positionExit.ts are: from
// stage 2 on, the explainer carries the spec's verbatim copy (§"The surfaces —
// Variant B", the explainer row), this repo has no component tests by policy
// (spec, "Not covered by tests"), and a sentence assembled in a component is a
// sentence nothing can assert. What the component still owns is the ordered
// list, the step numbers and where the example sits.
//
// Pure — the vault in, the words out.
import { hasVestingGap, vestingDays, type Vault } from "./vaultRegistry";

export interface ExplainerStep {
  title: string;
  body: string;
  // A worked example, set off from the body. Only the vesting step has one:
  // the cap is the single thing in this timeline that a depositor is likely to
  // read, believe they understood, and still be surprised by — so it is shown
  // happening to a number. Static on purpose (the spec's own figures): it
  // explains the rule, it does not quote this holder, and the surface that
  // quotes this holder is named in its last sentence.
  example?: string;
}

const DAY = 86_400;

// Whole days, which is how both of this widget's clocks are said to a
// depositor. Deliberately not called a term: CONTEXT.md keeps that word for the
// VESTING term, and the share lock is the other, shorter clock.
const inDays = (seconds: number): number => Math.round(seconds / DAY);

// The timeline for one product, in order.
//
// The vesting step exists only where the product has a vesting gap — where the
// shares keep vesting after the lock has ended, so a holder can be unlocked and
// capped at once. On a product whose shares have vested by the time they
// unlock there is nothing to cap and nothing to explain, and the step's absence
// is the honest thing.
export function explainerSteps(vault: Vault): ExplainerStep[] {
  const symbol = vault.ui.symbol;
  const vests = hasVestingGap(vault);
  const vestingTerm = vestingDays(vault);
  const lockDays = inDays(vault.ui.shareLockPeriod);
  const lockLabel = `${lockDays}-day`;

  // How a redemption is priced, and who decides it — the two steps stage 2
  // rewrote, chosen once so the rule behind them is in one place rather than
  // spread over two ternaries.
  //
  // They are rewritten ONLY where exits are priced against an entitlement. The
  // spec's §"Deliberately unchanged" keeps the 24h product on stage-1 copy, and
  // an entitlement it never has is not worth naming to a depositor who cannot
  // meet one. That is why the stage-1 pair below still says "NAV minus a small
  // spread" where CONTEXT.md would otherwise ask for "the share price": it is
  // the sentence that shipped, kept on purpose, not drift.
  const closing: ExplainerStep[] = vests
    ? [
        {
          title: "Request a redemption",
          body:
            "Choose how many shares to redeem. This posts a request to the " +
            "AtomicQueue at the share price minus the posted redemption " +
            "spread — the wider of your own spread and the one your " +
            "entitlement requires.",
        },
        {
          // The title is stage 1's, and stays: the spec amends this step's
          // BODY, where the promise actually was ("fills your request" →
          // "decides whether to fill your request"), and copy nobody decided
          // to change is not this ticket's to rewrite.
          title: "Solver fills to USDT",
          body:
            "An off-chain solver decides whether to fill your request. When " +
            "it does, USDT arrives in your wallet — no separate claim step. " +
            "You can stop an open request before it fills.",
        },
      ]
    : [
        {
          title: "Request a redemption",
          body: "Choose how many shares to redeem. This posts a request to the AtomicQueue at NAV minus a small spread.",
        },
        {
          title: "Solver fills to USDT",
          body: "An off-chain solver fills your request and sends USDT to your wallet — no separate claim step. You can stop an open request before it fills.",
        },
      ];

  return [
    {
      title: "Deposit USDT",
      body: `Approve and deposit a stablecoin. You receive ${symbol} vault shares.`,
    },
    {
      title: `${lockLabel} share lock`,
      body:
        `${symbol} shares can't be transferred or redeemed for ${lockDays} ` +
        `day${lockDays === 1 ? "" : "s"} after a deposit. Each new deposit ` +
        `restarts the lock for your entire balance.`,
    },
    {
      title: "Earn yield",
      body: "Your share price accrues as the strategy earns. Hold for as long as you like.",
    },
    ...(vests
      ? [
          {
            title: `${vestingTerm}-day vesting term`,
            body:
              `${vault.ui.name} shares vest over ${vestingTerm} days — ` +
              `separately from the ${lockLabel} share lock, and only on this ` +
              `product, whose vesting term outlives its lock. Redeem before ` +
              `they vest and you are entitled to no more than what you paid: ` +
              `a cap, not a floor.`,
            example:
              "For example: 10,000 USDT deposited at 1.000000 a share, " +
              "redeemed on day 20 when the share price is 1.001370, is " +
              "capped at 1.000000 a share — it pays 9,999.99 USDT, not " +
              "10,013.70. The withdraw panel shows you that number before " +
              "you post.",
          },
        ]
      : []),
    ...closing,
  ];
}
