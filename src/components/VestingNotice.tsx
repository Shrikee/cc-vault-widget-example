import { hasVestingGap, vestingDays, type Vault } from "../lib/vaultRegistry";

// The 30d product's vesting notice — a disclosure, not a decoration.
//
// The two products share an identical share lock of one day, but the redemption
// solver prices a holder's shares against a VESTING TERM that differs by
// product: one day on the 24h line, thirty on the 30d line. So on the 30d
// product a depositor can redeem long before they have vested, and an unvested
// holder is entitled to no more than what they paid — a CAP, and not a floor.
// The solver prices unvested shares at the lower of what their holder paid and
// the share price, so a fallen share price is what they get; what they paid is
// never a refund. Saying "priced at what you paid" would be true only while the
// share price is up, which it is today and need not stay.
//
// The solver can only refuse a request, never fill it at a lower price, so a
// request asking for more than the holder's entitlement is not rejected with an
// error — it simply sits open until its deadline lapses, which is mystifying
// unless the widget has said this in advance.
//
// The remedy the depositor has, and the one this widget can offer today, is the
// redemption spread it already exposes: a wider spread asks for less and can be
// filled where the default cannot. Stage 2 gives the widget the solver's own
// entitlement arithmetic so it can price an early exit unattended; until then
// an early exit costs a support round-trip.
//
// WHAT THIS NOTICE DOES NOT SAY, and why. Where to ask when a request stays
// open moved to the request itself (src/lib/requestStatus.ts, rendered by
// RequestRow). This notice is on the two panels because that is where the two
// decisions it informs are taken — whether to enter, and what spread to leave
// with — and both are taken before there is a request to ask about. Once there
// is one, it is listed in the side rail's redemptions card, which is outside the
// selection and outside the tabs: a 30d request that is not filling is normally
// read from the deposit tab or from the other product, where neither of these
// panels is on screen. So the forward-looking half is here, beside the spread
// control that is the remedy, and the after-the-fact half is beside the request.
// Neither half is on three surfaces. The "how it works" explainer states the
// cap a third time, which is not the same duplication: retelling the whole
// deposit → lock → vest → redeem timeline is what that card is for, and it
// restates the share lock and the redemption step alongside it.
//
// Nothing here prices anything. `vestingSeconds` is read for one purpose — to
// say "30 days" in the depositor's own terms rather than hard-coding it beside
// a registry that already knows — and for which products the notice applies to
// at all. The arithmetic that uses it is stage 2's.

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
  // Nothing to disclose on a product whose shares have vested by the time they
  // unlock — see hasVestingGap.
  if (!hasVestingGap(vault)) return null;

  const term = vestingDays(vault);
  const lock = Math.round(vault.ui.shareLockPeriod / 86_400);

  return (
    <div className="notice notice--warning">
      <strong>
        {vault.ui.name} vests over {term} days.
      </strong>
      <span>
        {where === "deposit"
          ? `Your ${vault.ui.symbol} shares unlock after ${lock} day and can be redeemed then, but they do not finish vesting for ${term} days.`
          : `Your ${vault.ui.symbol} shares unlock after ${lock} day, but they do not finish vesting for ${term} days.`}{" "}
        Redeem before they vest and you are entitled to no more than what you
        paid — a cap, not a floor: if the share price has fallen below what you
        paid, you get the share price, not your money back. So a request may
        need a <strong>wider redemption spread</strong> than the default to be
        filled. The solver cannot fill a request for less than it asks — it
        passes over it instead, and the request stays open until its deadline
        lapses.
      </span>
    </div>
  );
}
