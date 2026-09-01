import { HolderEvent, quoteEntitlement } from './entitlement';

/**
 * The entitlement rule, pinned by hand-recomputable numbers.
 *
 * Units throughout: shares are 18-dec (`sh(n)` = n whole shares), want is 6-dec USDC
 * (`usdc(n)`), prices are want-per-whole-share (`price(1.045)` = 1_045_000), time is
 * unix seconds (`day(d)` = d × 86,400 from an epoch of 0).
 *
 * The NAV schedule is deliberately linear — +0.001 USDC per share per day from 1.000000
 * at day 0 — so every expectation below is arithmetic a reviewer can redo on paper.
 */

const DAY = 86_400;
const VESTING_30D = 30 * DAY;

const day = (d: number): number => d * DAY;
const sh = (n: number): bigint => BigInt(n) * 10n ** 18n;
const usdc = (n: number): bigint => BigInt(Math.round(n * 1e6));
/** want units per whole share, the same scale as `navPerShare`. */
const price = (perShare: number): bigint => BigInt(Math.round(perShare * 1e6));
/** NAV on day `d`: 1.000000 + 0.001 per day. */
const nav = (d: number): bigint => price(1 + d / 1000);

/** A deposit of `shares` whole shares on day `d`, priced at that day's NAV. */
const dep = (d: number, shares: number): HolderEvent => ({
  kind: 'deposit',
  t: day(d),
  shares: sh(shares),
  assets: nav(d) * BigInt(shares),
});

/** `shares` whole shares received from another wallet on day `d`, at that day's NAV. */
const received = (d: number, shares: number): HolderEvent => ({
  kind: 'transfer-in',
  t: day(d),
  shares: sh(shares),
  rate: nav(d),
});

/** A fill of `shares` whole shares on day `d`. */
const fill = (d: number, shares: number): HolderEvent => ({
  kind: 'fill',
  t: day(d),
  shares: sh(shares),
});

/** `shares` whole shares sent to another wallet on day `d`. */
const out = (d: number, shares: number): HolderEvent => ({
  kind: 'transfer-out',
  t: day(d),
  shares: sh(shares),
});

describe('quoteEntitlement — a single vested lot pays NAV', () => {
  it('pays full NAV for a deposit held past the vesting cliff', () => {
    // 100 shares deposited on day 0 at 1.000000, sold whole on day 45.
    // 45 days ≥ 30 ⇒ vested ⇒ every share prices at NAV 1.045000.
    const quote = quoteEntitlement({
      history: [dep(0, 100)],
      shareBalance: sh(100),
      navPerShare: nav(45),
      now: day(45),
      vestingSeconds: VESTING_30D,
      offerShares: sh(100),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(price(1.045));
    expect(quote.entitlement).toBe(usdc(104.5));
    expect(quote.vestedShares).toBe(sh(100));
    expect(quote.unvestedShares).toBe(0n);
  });
});

describe('quoteEntitlement — an unvested lot pays min(entry, NAV)', () => {
  it('blends three unvested lots at their own entry prices (day-21 exit)', () => {
    // 100 shares on each of days 0, 15 and 20 — at 1.000000, 1.015000, 1.020000.
    // Sold whole on day 21 (NAV 1.021000): no lot has reached 30 days, so each pays
    // its entry, all three under NAV.
    //   value = 100 × (1.000000 + 1.015000 + 1.020000) = 303.500000 USDC
    //   ceiling = 303.5 / 300 shares = 1.011666… → floored to 1.011666
    const quote = quoteEntitlement({
      history: [dep(0, 100), dep(15, 100), dep(20, 100)],
      shareBalance: sh(300),
      navPerShare: nav(21),
      now: day(21),
      vestingSeconds: VESTING_30D,
      offerShares: sh(300),
      shareDecimals: 18,
    });

    expect(quote.entitlement).toBe(usdc(303.5));
    expect(quote.maxAskPrice).toBe(1_011_666n);
    expect(quote.vestedShares).toBe(0n);
    expect(quote.unvestedShares).toBe(sh(300));
  });

  it('caps an unvested lot at NAV when the book is down (principal is a cap, not a floor)', () => {
    // 100 shares deposited at 1.020000, sold 10 days later after a markdown to
    // 0.990000. min(entry, NAV) = 0.990000 — the holder carries the loss.
    const quote = quoteEntitlement({
      history: [
        { kind: 'deposit', t: day(0), shares: sh(100), assets: usdc(102) },
      ],
      shareBalance: sh(100),
      navPerShare: price(0.99),
      now: day(10),
      vestingSeconds: VESTING_30D,
      offerShares: sh(100),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(price(0.99));
    expect(quote.entitlement).toBe(usdc(99));
    expect(quote.unvestedShares).toBe(sh(100));
  });
});

describe('quoteEntitlement — FIFO spends the oldest shares first', () => {
  it('a partial exit spanning two lots takes the older one', () => {
    // 100 shares on day 0 (1.000000) and 100 on day 10 (1.010000); 100 sold on day 20
    // (NAV 1.020000). FIFO takes the day-0 lot whole: unvested (20 days), entry
    // 1.000000 under NAV, so the whole request prices at 1.000000.
    const quote = quoteEntitlement({
      history: [dep(0, 100), dep(10, 100)],
      shareBalance: sh(200),
      navPerShare: nav(20),
      now: day(20),
      vestingSeconds: VESTING_30D,
      offerShares: sh(100),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(price(1.0));
    expect(quote.entitlement).toBe(usdc(100));
    expect(quote.unvestedShares).toBe(sh(100));
  });

  it('a partial exit whose oldest lot has vested pays NAV on it alone', () => {
    // 100 shares on day 0 and 100 on day 20; 100 sold on day 35 (NAV 1.035000). The
    // day-0 lot is 35 days old ⇒ vested ⇒ NAV; the day-20 lot is untouched.
    const quote = quoteEntitlement({
      history: [dep(0, 100), dep(20, 100)],
      shareBalance: sh(200),
      navPerShare: nav(35),
      now: day(35),
      vestingSeconds: VESTING_30D,
      offerShares: sh(100),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(price(1.035));
    expect(quote.entitlement).toBe(usdc(103.5));
    expect(quote.vestedShares).toBe(sh(100));
  });

  it('replays a past fill, so what is left is the younger lot (spend order decides)', () => {
    // 100 on day 0, 100 on day 20, 100 FILLED on day 25 — FIFO spent the day-0 lot,
    // so the remaining 100 shares are the day-20 lot. Sold on day 35 (NAV 1.035000):
    // 15 days old ⇒ unvested ⇒ min(1.020000, 1.035000) = 1.020000.
    const quote = quoteEntitlement({
      history: [dep(0, 100), dep(20, 100), fill(25, 100)],
      shareBalance: sh(100),
      navPerShare: nav(35),
      now: day(35),
      vestingSeconds: VESTING_30D,
      offerShares: sh(100),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(price(1.02));
    expect(quote.entitlement).toBe(usdc(102));
    expect(quote.vestedShares).toBe(0n);
    expect(quote.unvestedShares).toBe(sh(100));
  });

  it('the same position 20 days later: the surviving lot has vested and pays NAV', () => {
    // 100 on day 0, 100 on day 20, 100 FILLED on day 35; the day-20 lot survives and
    // is 35 days old at the day-55 request (NAV 1.055000) ⇒ vested ⇒ NAV.
    const quote = quoteEntitlement({
      history: [dep(0, 100), dep(20, 100), fill(35, 100)],
      shareBalance: sh(100),
      navPerShare: nav(55),
      now: day(55),
      vestingSeconds: VESTING_30D,
      offerShares: sh(100),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(price(1.055));
    expect(quote.entitlement).toBe(usdc(105.5));
    expect(quote.vestedShares).toBe(sh(100));
  });

  it('shares sent to another wallet are spent oldest-first, like a fill', () => {
    // 100 on day 0, 100 on day 20, 150 transferred away on day 25: the day-0 lot goes
    // whole and 50 shares come off the day-20 lot. The 50 that remain are the day-20
    // lot, unvested at the day-35 request ⇒ 1.020000.
    const quote = quoteEntitlement({
      history: [dep(0, 100), dep(20, 100), out(25, 150)],
      shareBalance: sh(50),
      navPerShare: nav(35),
      now: day(35),
      vestingSeconds: VESTING_30D,
      offerShares: sh(50),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(price(1.02));
    expect(quote.entitlement).toBe(usdc(51));
    expect(quote.unvestedShares).toBe(sh(50));
  });
});

describe('quoteEntitlement — a transfer recipient', () => {
  it('starts a fresh unvested lot at the transfer-block rate', () => {
    // 50 shares received on day 5 (rate 1.005000), sold whole on day 10 (NAV
    // 1.010000). The recipient's clock starts at the transfer: 5 days ⇒ unvested ⇒
    // min(1.005000, 1.010000) = 1.005000, so 50 × 1.005 = 50.250000 USDC.
    const quote = quoteEntitlement({
      history: [received(5, 50)],
      shareBalance: sh(50),
      navPerShare: nav(10),
      now: day(10),
      vestingSeconds: VESTING_30D,
      offerShares: sh(50),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(price(1.005));
    expect(quote.entitlement).toBe(usdc(50.25));
    expect(quote.vestedShares).toBe(0n);
    expect(quote.unvestedShares).toBe(sh(50));
  });
});

describe('quoteEntitlement — the residual lot', () => {
  it('prices a balance no history explains as one vested lot at NAV', () => {
    // The ledger floor hides everything this holder ever did: the whole balance is
    // residual, and the floor-age assertion is what makes calling it vested sound.
    const quote = quoteEntitlement({
      history: [],
      shareBalance: sh(100),
      navPerShare: nav(45),
      now: day(45),
      vestingSeconds: VESTING_30D,
      offerShares: sh(100),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(nav(45));
    expect(quote.entitlement).toBe(usdc(104.5));
    expect(quote.vestedShares).toBe(sh(100));
  });

  it('spends the residual before every replayed lot, oldest of all', () => {
    // 40 shares unexplained plus a day-20 deposit of 100; 60 sold on day 25 (NAV
    // 1.025000). The residual's 40 shares go first at NAV, then 20 shares of the
    // unvested day-20 lot at 1.020000:
    //   value = 40 × 1.025000 + 20 × 1.020000 = 41.000000 + 20.400000 = 61.400000
    //   ceiling = 61.4 / 60 = 1.023333… → 1.023333
    const quote = quoteEntitlement({
      history: [dep(20, 100)],
      shareBalance: sh(140),
      navPerShare: nav(25),
      now: day(25),
      vestingSeconds: VESTING_30D,
      offerShares: sh(60),
      shareDecimals: 18,
    });

    expect(quote.entitlement).toBe(usdc(61.4));
    expect(quote.maxAskPrice).toBe(1_023_333n);
    expect(quote.vestedShares).toBe(sh(40));
    expect(quote.unvestedShares).toBe(sh(20));
  });
});

describe('quoteEntitlement — the request is capped to the balance', () => {
  it('quotes only the shares the holder actually holds', () => {
    // 100 shares held, 250 asked for: the ceiling is the blend over 100, not 250.
    const quote = quoteEntitlement({
      history: [dep(0, 100)],
      shareBalance: sh(100),
      navPerShare: nav(45),
      now: day(45),
      vestingSeconds: VESTING_30D,
      offerShares: sh(250),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(price(1.045));
    expect(quote.entitlement).toBe(usdc(104.5));
    expect(quote.vestedShares).toBe(sh(100));
    expect(quote.unvestedShares).toBe(0n);
  });

  it('quotes nothing for a holder with no shares at all', () => {
    const quote = quoteEntitlement({
      history: [],
      shareBalance: 0n,
      navPerShare: nav(45),
      now: day(45),
      vestingSeconds: VESTING_30D,
      offerShares: sh(10),
      shareDecimals: 18,
    });

    expect(quote).toEqual({
      entitlement: 0n,
      maxAskPrice: 0n,
      vestedShares: 0n,
      unvestedShares: 0n,
    });
  });
});

describe('quoteEntitlement — a blend of vested and unvested lots', () => {
  it('deposits at days 0, 20 and 40, sold whole on day 45', () => {
    // NAV 1.045000. Day-0 lot is 45 days old ⇒ vested ⇒ 1.045000; the day-20 (25 days)
    // and day-40 (5 days) lots are unvested and both entered under NAV ⇒ their entries.
    //   value = 100 × (1.045000 + 1.020000 + 1.040000) = 310.500000 USDC
    //   ceiling = 310.5 / 300 = 1.035000 exactly
    const quote = quoteEntitlement({
      history: [dep(0, 100), dep(20, 100), dep(40, 100)],
      shareBalance: sh(300),
      navPerShare: nav(45),
      now: day(45),
      vestingSeconds: VESTING_30D,
      offerShares: sh(300),
      shareDecimals: 18,
    });

    expect(quote.entitlement).toBe(usdc(310.5));
    expect(quote.maxAskPrice).toBe(price(1.035));
    expect(quote.vestedShares).toBe(sh(100));
    expect(quote.unvestedShares).toBe(sh(200));
  });

  it('a day-60 top-up never re-locks the day-0 money', () => {
    // Sold whole on day 70 (NAV 1.070000): the day-0 lot has long vested ⇒ NAV, the
    // 10-day-old top-up pays its 1.060000 entry.
    //   value = 100 × (1.070000 + 1.060000) = 213.000000 USDC
    //   ceiling = 213 / 200 = 1.065000
    const quote = quoteEntitlement({
      history: [dep(0, 100), dep(60, 100)],
      shareBalance: sh(200),
      navPerShare: nav(70),
      now: day(70),
      vestingSeconds: VESTING_30D,
      offerShares: sh(200),
      shareDecimals: 18,
    });

    expect(quote.entitlement).toBe(usdc(213));
    expect(quote.maxAskPrice).toBe(price(1.065));
    expect(quote.vestedShares).toBe(sh(100));
    expect(quote.unvestedShares).toBe(sh(100));
  });
});

describe('quoteEntitlement — the vesting boundary is >=', () => {
  const atAge = (age: number) =>
    quoteEntitlement({
      history: [dep(0, 100)],
      shareBalance: sh(100),
      navPerShare: nav(45),
      now: age,
      vestingSeconds: VESTING_30D,
      offerShares: sh(100),
      shareDecimals: 18,
    });

  it('a lot exactly the vesting period old is vested', () => {
    expect(atAge(VESTING_30D).maxAskPrice).toBe(nav(45));
    expect(atAge(VESTING_30D).vestedShares).toBe(sh(100));
  });

  it('one second short of it is not', () => {
    expect(atAge(VESTING_30D - 1).maxAskPrice).toBe(price(1.0)); // its entry
    expect(atAge(VESTING_30D - 1).vestedShares).toBe(0n);
  });
});

describe('quoteEntitlement — moving the ledger floor changes nothing', () => {
  // The residual rule is only sound while everything under the floor has vested, which
  // is what the boot floor-age assertion enforces (issue #70). Given that, truncating a
  // history at ANY floor at least `vestingSeconds` old must leave the quote untouched:
  // the shares the dropped events explained come back as one vested residual lot, and
  // they would have priced at NAV anyway.
  const history = [dep(0, 100), dep(10, 100), fill(20, 150), dep(70, 100)];
  const balance = sh(150); // 100 + 100 − 150 + 100
  const now = day(80); // the youngest lot is 10 days old — the answer is not all-NAV
  const query = {
    shareBalance: balance,
    navPerShare: nav(80),
    now,
    vestingSeconds: VESTING_30D,
    offerShares: balance,
    shareDecimals: 18,
  };
  const full = quoteEntitlement({ ...query, history });

  it('prices the un-truncated history as 50 vested shares plus the young top-up', () => {
    // The day-20 fill spent the day-0 lot whole and 50 of the day-10 lot; what is left
    // is 50 shares from day 10 (vested at day 80) and the 100-share day-70 lot (10 days
    // old ⇒ its 1.070000 entry, under the 1.080000 NAV).
    //   value = 50 × 1.080000 + 100 × 1.070000 = 54.000000 + 107.000000 = 161.000000
    expect(full.entitlement).toBe(usdc(161));
    expect(full.vestedShares).toBe(sh(50));
    expect(full.unvestedShares).toBe(sh(100));
  });

  it.each([15, 25, 40, 50])(
    'gives the same quote with the floor at day %i',
    (floorDay) => {
      const truncated = history.filter((e) => e.t >= day(floorDay));
      expect(quoteEntitlement({ ...query, history: truncated })).toEqual(full);
    },
  );
});

describe('quoteEntitlement — on a 24-hour vault', () => {
  const VESTING_24H = DAY;

  it('deposited shares are vested by the time the Teller lock lifts', () => {
    // The Teller locks a depositor's shares for 86,400s and a fill needs
    // `now > shareUnlockTime = deposit + 86,400`, so the earliest fillable moment is
    // already past the vesting cliff — the gate cannot bind on deposited shares.
    const quote = quoteEntitlement({
      history: [dep(0, 100)],
      shareBalance: sh(100),
      navPerShare: price(1.01),
      now: DAY + 1,
      vestingSeconds: VESTING_24H,
      offerShares: sh(100),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(price(1.01));
    expect(quote.unvestedShares).toBe(0n);
  });

  it('transferred-in shares can be fillable while still unvested', () => {
    // A transfer recipient never touches the Teller, so no share lock is set: they can
    // sell the second the shares land. This is the one 24h case where the gate binds —
    // it is what closes the two-wallet laundering route.
    const quote = quoteEntitlement({
      history: [received(0, 100)],
      shareBalance: sh(100),
      navPerShare: price(1.01),
      now: 1,
      vestingSeconds: VESTING_24H,
      offerShares: sh(100),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(price(1.0)); // the transfer-block rate, not NAV
    expect(quote.unvestedShares).toBe(sh(100));
  });
});

describe('quoteEntitlement — the balance is the authority', () => {
  it('reconciles a history that over-explains the balance by dropping the oldest money', () => {
    // The ledger missed a 50-share spend: two 100-share lots explain 200 shares, but the
    // holder holds 150. FIFO says the missing spend took the oldest shares, so 50 come
    // off the day-0 lot and what survives is the younger money. Selling all 150 on day
    // 60 (NAV 1.060000):
    //   value = 50 × 1.060000 (day-0 lot, vested) + 100 × 1.050000 (day-50 lot, 10 days
    //           old, its entry under NAV) = 53.000000 + 105.000000 = 158.000000
    //   ceiling = 158 / 150 = 1.053333… → 1.053333
    // Reconciling the other way — quoting the oldest 150 shares — would have paid
    // 158.500000, i.e. above what the holder is owed. The vault's side of the line wins.
    const quote = quoteEntitlement({
      history: [dep(0, 100), dep(50, 100)],
      shareBalance: sh(150),
      navPerShare: nav(60),
      now: day(60),
      vestingSeconds: VESTING_30D,
      offerShares: sh(150),
      shareDecimals: 18,
    });

    expect(quote.entitlement).toBe(usdc(158));
    expect(quote.maxAskPrice).toBe(1_053_333n);
    expect(quote.vestedShares).toBe(sh(50));
    expect(quote.unvestedShares).toBe(sh(100));
  });

  it.each<[string, HolderEvent]>([
    ['deposit', { kind: 'deposit', t: day(0), shares: 0n, assets: 0n }],
    ['transfer-in', { kind: 'transfer-in', t: day(0), shares: 0n, rate: 0n }],
  ])('opens no lot for a %s that moves no shares', (_label, event) => {
    // Unreachable on-chain (the Teller reverts a zero-share mint), but the rule is a
    // total function: it must not divide by zero to find that out. The balance is then
    // wholly residual, so the quote is NAV.
    const quote = quoteEntitlement({
      history: [event],
      shareBalance: sh(100),
      navPerShare: nav(45),
      now: day(45),
      vestingSeconds: VESTING_30D,
      offerShares: sh(100),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(nav(45));
    expect(quote.vestedShares).toBe(sh(100));
  });
});

describe('quoteEntitlement — the spend order is lot age, not event position', () => {
  it('takes the oldest lot first even when the history arrives youngest-first', () => {
    // The same two deposits as the FIFO cases above, handed over out of chain order:
    // day 20 before day 0. Sold 100 on day 35 (NAV 1.035000). FIFO is a property of
    // the lots' clocks, not of where the ledger put the events — the day-0 lot goes
    // first, and it has vested. Were the events spent in the order given, the day-20
    // lot (15 days old) would price at its 1.020000 entry instead.
    const quote = quoteEntitlement({
      history: [dep(20, 100), dep(0, 100)],
      shareBalance: sh(200),
      navPerShare: nav(35),
      now: day(35),
      vestingSeconds: VESTING_30D,
      offerShares: sh(100),
      shareDecimals: 18,
    });

    expect(quote.maxAskPrice).toBe(price(1.035));
    expect(quote.entitlement).toBe(usdc(103.5));
    expect(quote.vestedShares).toBe(sh(100));
    expect(quote.unvestedShares).toBe(0n);
  });
});

describe('quoteEntitlement — over-explanation comes off the oldest lot at ITS price', () => {
  it('reconciles by removing shares from the oldest lot, not by subtracting NAV', () => {
    // Two 100-share lots (day 0 at 1.000000, day 10 at 1.010000) explain 200 shares;
    // the holder holds 150. Judged on day 20 (NAV 1.020000), when NEITHER lot has
    // vested — so the 50 shares FIFO removes from the day-0 lot would have priced at
    // that lot's 1.000000 entry, not at NAV. Selling all 150:
    //   value = 50 × 1.000000 + 100 × 1.010000 = 50.000000 + 101.000000 = 151.000000
    //   ceiling = 151 / 150 = 1.006666… → 1.006666
    // A reconciliation that netted the 50 shares out at NAV instead would land on
    // 150.000000 — and a negative "vested" share count.
    const quote = quoteEntitlement({
      history: [dep(0, 100), dep(10, 100)],
      shareBalance: sh(150),
      navPerShare: nav(20),
      now: day(20),
      vestingSeconds: VESTING_30D,
      offerShares: sh(150),
      shareDecimals: 18,
    });

    expect(quote.entitlement).toBe(usdc(151));
    expect(quote.maxAskPrice).toBe(1_006_666n);
    expect(quote.vestedShares).toBe(0n);
    expect(quote.unvestedShares).toBe(sh(150));
  });
});
