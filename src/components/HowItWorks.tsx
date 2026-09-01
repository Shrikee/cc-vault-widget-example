import { explainerSteps } from "../lib/explainerSteps";
import type { Vault } from "../lib/vaultRegistry";
import { Card } from "./ui";

// Explains the deposit -> lock -> request -> solver-fill timeline so the
// redemption model (no on-chain claim step) is never a surprise. Told in terms
// of the product being looked at, down to its share symbol.
//
// The timeline is not the same on both products, which is why it is told per
// product rather than once. The share lock is one day on each, but the 30d
// product's shares keep vesting for thirty days after that, and a holder
// redeeming in between is entitled to no more than what they paid — a cap and
// not a floor, shown happening to a number in the step's own example.
//
// The words are src/lib/explainerSteps.ts's, and the ordered list is this
// component's: from stage 2 the copy here is the spec's verbatim, and a
// sentence assembled in JSX is a sentence no test can hold to it.
export function HowItWorks({ vault }: { vault: Vault }) {
  return (
    <Card title="How it works" subtitle="Deposit, earn, redeem">
      <ol className="timeline">
        {explainerSteps(vault).map((s, i) => (
          <li key={s.title} className="timeline__step">
            <span className="timeline__num">{i + 1}</span>
            <div>
              <p className="timeline__title">{s.title}</p>
              <p className="timeline__body">{s.body}</p>
              {/* Set off from the body rather than run into it: the example is
                  the same rule a second time, on numbers, and a depositor who
                  followed the sentence above should be able to see at a glance
                  that they may skip it. */}
              {s.example !== undefined && (
                <p className="timeline__example">{s.example}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
