import { hasVestingGap, vestingDays, type Vault } from "../lib/vaultRegistry";
import { Card } from "./ui";

// Explains the deposit -> lock -> request -> solver-fill timeline so the
// redemption model (no on-chain claim step) is never a surprise. Told in terms
// of the product being looked at, down to its share symbol.
//
// The timeline is not the same on both products, which is why it is told per
// product rather than once. The share lock is one day on each, but the 30d
// product's shares keep vesting for thirty days after that, and a holder
// redeeming in between is entitled to no more than what they paid — a cap and
// not a floor, so a share price that has fallen below their cost is what they
// get. A step of its own on that product, and absent on the 24h one where the
// lock and the vesting term are the same day.
export function HowItWorks({ vault }: { vault: Vault }) {
  const symbol = vault.ui.symbol;
  const vests = hasVestingGap(vault);
  const term = vestingDays(vault);

  const steps = [
    {
      title: "Deposit USDT",
      body: `Approve and deposit a stablecoin. You receive ${symbol} vault shares.`,
    },
    {
      title: "1-day share lock",
      body: `${symbol} shares can't be transferred or redeemed for 1 day after a deposit. Each new deposit restarts the lock for your entire balance.`,
    },
    {
      title: "Earn yield",
      body: "Your share price accrues as the strategy earns. Hold for as long as you like.",
    },
    ...(vests
      ? [
          {
            title: `${term}-day vesting`,
            body: `This product's shares vest over ${term} days — separately from the 1-day lock. Redeem before they vest and you are entitled to no more than what you paid — a cap, not a floor, so a share price below what you paid is what you get — and the request may need a wider redemption spread to be filled.`,
          },
        ]
      : []),
    {
      title: "Request a redemption",
      body: "Choose how many shares to redeem. This posts a request to the AtomicQueue at NAV minus a small spread.",
    },
    {
      title: "Solver fills to USDT",
      body: "An off-chain solver fills your request and sends USDT to your wallet — no separate claim step. You can stop an open request before it fills.",
    },
  ];

  return (
    <Card title="How it works" subtitle="Deposit, earn, redeem">
      <ol className="timeline">
        {steps.map((s, i) => (
          <li key={s.title} className="timeline__step">
            <span className="timeline__num">{i + 1}</span>
            <div>
              <p className="timeline__title">{s.title}</p>
              <p className="timeline__body">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
