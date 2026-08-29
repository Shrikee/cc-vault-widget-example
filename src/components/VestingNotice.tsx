import type { Vault } from "../lib/vaultRegistry";

// The 30d product's vesting notice — a disclosure, not a decoration.
//
// The two products share an identical share lock of one day, but the redemption
// solver prices a holder's shares against a VESTING TERM that differs by
// product: one day on the 24h line, thirty on the 30d line. So on the 30d
// product a depositor can redeem long before they have vested, and a holder
// who exits early is entitled to what they paid rather than to the share price
// on screen. The solver can only refuse a request, never fill it at a lower
// price, so a request asking for more than the holder's entitlement is not
// rejected with an error — it simply sits open until its deadline lapses,
// which is mystifying unless the widget has said this in advance.
//
// The remedy the depositor has, and the one this widget can offer today, is the
// redemption spread it already exposes: a wider spread asks for less and can be
// filled where the default cannot. Stage 2 gives the widget the solver's own
// entitlement arithmetic so it can price an early exit unattended; until then
// an early exit costs a support round-trip, and this copy is what makes that
// round-trip explicable rather than a surprise.
//
// Nothing here prices anything. `vestingSeconds` is read for one purpose — to
// say "30 days" in the depositor's own terms rather than hard-coding it beside
// a registry that already knows — and for which products the notice applies to
// at all. The arithmetic that uses it is stage 2's.
//
// One gap, stated rather than invented: this repository holds no support
// address, so the copy names support without linking to it. Give it a link when
// there is one to give.

// The notice belongs to a product whose vesting term outlives its share lock —
// that is exactly the window in which a depositor can redeem shares that have
// not vested. On the 24h product the two are the same day and the gate cannot
// bind, so there is nothing to disclose and nothing renders.
export function hasVestingGap(vault: Vault): boolean {
  return vault.vestingSeconds > vault.ui.shareLockPeriod;
}

const days = (seconds: number) => Math.round(seconds / 86_400);

export function VestingNotice({
  vault,
  where,
}: {
  vault: Vault;
  // Which panel is asking. The facts are the same on both; what leads differs,
  // because one reader is deciding whether to enter and the other is trying to
  // leave.
  where: "deposit" | "withdraw";
}) {
  if (!hasVestingGap(vault)) return null;

  const term = days(vault.vestingSeconds);
  const lock = days(vault.ui.shareLockPeriod);

  return (
    <div className="notice notice--warning">
      <strong>
        {vault.ui.name} vests over {term} days.
      </strong>
      <span>
        {where === "deposit"
          ? `Your ${vault.ui.symbol} shares unlock after ${lock} day and can be redeemed then, but they do not finish vesting for ${term} days.`
          : `Your ${vault.ui.symbol} shares unlock after ${lock} day, but they do not finish vesting for ${term} days.`}{" "}
        Redeeming before they vest is priced at what you paid rather than at the
        share price shown here, so a request may need a{" "}
        <strong>wider redemption spread</strong> than the default to be filled.
        The solver cannot fill a request for less than it asks — it passes over
        it instead, and the request stays open until its deadline lapses. If
        yours stays open, ask Coinchange support: the solver records a reason
        for every request it passes over.
      </span>
    </div>
  );
}
