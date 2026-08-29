// Redemption parameters — the widget's own, not a product's.
//
// Both Coinchange products redeem via the audited AtomicQueue (solver-priced):
// the user posts a request and an off-chain solver fills it. The DelayedWithdraw
// contract is deployed but left UNUSED (allowPublicWithdraws=false) on both, so
// the frontend uses the queue flow.
//
// Nothing here is per vault, and that is a decision rather than an omission
// (spec, "Deliberately unchanged"): the defaults below stay the same on both
// products, because raising the spread for the longer-term product would buy
// its fills with vested holders' money, and the thirty days of that product is
// a vesting term rather than a fill delay — both solvers run the same hourly
// batch, so the same deadline is ample for both.

// AtomicQueue redemption "discount" = the haircut vs NAV the user accepts so the
// solver can fill and keep the spread. The contract caps it at MAX_DISCOUNT (1%)
// and only guarantees fills at or below NAV; 0.1% is the standard spread the
// solver is designed around, so it is the sensible default.
export const WITHDRAW_DISCOUNT_PCT_DEFAULT = 0.1;
export const WITHDRAW_DISCOUNT_PCT_MAX = 1; // contract MAX_DISCOUNT = 0.01e6 = 1%

// How long a submitted redemption request stays valid before its deadline lapses.
// The solver runs on an hourly batch loop, so a few days is ample headroom.
export const WITHDRAW_VALID_DAYS_DEFAULT = 7;
