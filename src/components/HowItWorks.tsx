import { SHARE_SYMBOL } from "../config/vault";
import { Card } from "./ui";

// Explains the deposit -> lock -> request -> solver-fill timeline so the
// redemption model (no on-chain claim step) is never a surprise.
export function HowItWorks() {
  const steps = [
    {
      title: "Deposit USDC or USDT",
      body: `Approve and deposit a stablecoin. You receive ${SHARE_SYMBOL} vault shares.`,
    },
    {
      title: "1-day share lock",
      body: `${SHARE_SYMBOL} shares can't be transferred or redeemed for 1 day after a deposit. Each new deposit restarts the lock for your entire balance.`,
    },
    {
      title: "Earn yield",
      body: "Your share price accrues as the strategy earns. Hold for as long as you like.",
    },
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
