import { describe, it, expect } from 'vitest';
import {
  buildFixedCostSeries,
  circularDayDistance,
  computeSpendingVelocity,
  findSupersededSeries,
  matchRenamedRecurringPayments,
} from '../spending-velocity.js';

/** Shorthand: a single fixed-cost series fully described by two numbers. */
const series = (expectedAmount: number, paidThisMonth: number) => ({
  expectedAmount,
  paidThisMonth,
});

describe('computeSpendingVelocity', () => {
  describe('contract', () => {
    it('throws if dailyVariableSpending length does not match daysElapsed', () => {
      expect(() =>
        computeSpendingVelocity({
          daysElapsed: 5,
          daysInMonth: 30,
          spentSoFar: 0,
          fixedCostSeries: [],
          lastMonthTotal: 0,
          dailyVariableSpending: [10, 20, 30],
        }),
      ).toThrow(/dailyVariableSpending/);
    });
  });

  describe('empty / boundary cases', () => {
    it('returns zeros early in the month with no spending', () => {
      const result = computeSpendingVelocity({
        daysElapsed: 0,
        daysInMonth: 30,
        spentSoFar: 0,
        fixedCostSeries: [],
        lastMonthTotal: 0,
        dailyVariableSpending: [],
      });

      expect(result.projectedTotal).toBe(0);
      expect(result.dailyAverage).toBe(0);
      expect(result.variableSpent).toBe(0);
      expect(result.excludedOutlierAmount).toBe(0);
    });

    it('end of month: no remaining days, projection equals what was spent', () => {
      const dailyVariableSpending = Array(30).fill(100);

      const result = computeSpendingVelocity({
        daysElapsed: 30,
        daysInMonth: 30,
        spentSoFar: 3500,
        fixedCostSeries: [series(500, 500)],
        lastMonthTotal: 3400,
        dailyVariableSpending,
      });

      expect(result.projectedTotal).toBeCloseTo(3500, 5);
      expect(result.excludedOutlierAmount).toBe(0);
    });
  });

  describe('on-pace projection', () => {
    it('extrapolates variable spending across remaining days', () => {
      const result = computeSpendingVelocity({
        daysElapsed: 10,
        daysInMonth: 30,
        spentSoFar: 1000,
        fixedCostSeries: [],
        lastMonthTotal: 3000,
        dailyVariableSpending: Array(10).fill(100),
      });

      expect(result.dailyAverage).toBe(100);
      expect(result.variableSpent).toBe(1000);
      expect(result.projectedTotal).toBeCloseTo(3000, 5);
      expect(result.excludedOutlierAmount).toBe(0);
    });
  });

  describe('no-double-count of expected fixed costs', () => {
    it('does not double-count when full expected fixed has already posted', () => {
      const result = computeSpendingVelocity({
        daysElapsed: 5,
        daysInMonth: 30,
        spentSoFar: 500,
        fixedCostSeries: [series(500, 500)],
        lastMonthTotal: 500,
        dailyVariableSpending: [0, 0, 0, 0, 0],
      });

      expect(result.projectedTotal).toBeCloseTo(500, 5);
    });

    it('projects only the unpaid portion of expected fixed costs', () => {
      // More recurring posted ($1500) than expected ($1000): the paid
      // amount wins; nothing extra is projected on top.
      const result = computeSpendingVelocity({
        daysElapsed: 5,
        daysInMonth: 30,
        spentSoFar: 1500,
        fixedCostSeries: [series(1000, 1500)],
        lastMonthTotal: 1500,
        dailyVariableSpending: [0, 0, 0, 0, 0],
      });

      expect(result.projectedTotal).toBeCloseTo(1500, 5);
    });

    it('mid-month with partial fixed paid: counts paid + unpaid + variable, no overlap', () => {
      // $300 of $1000 fixed posted; on-pace $50/day variable for 10 days.
      const result = computeSpendingVelocity({
        daysElapsed: 10,
        daysInMonth: 30,
        spentSoFar: 800, // 300 recurring + 500 variable
        fixedCostSeries: [series(1000, 300)],
        lastMonthTotal: 2400,
        dailyVariableSpending: Array(10).fill(50),
      });

      // 300 + (1000-300) + (500 + 50*20) = 300 + 700 + 1500 = 2500
      expect(result.projectedTotal).toBeCloseTo(2500, 5);
    });

    it('computes unpaid fixed per series: one series overpaying does not hide another still due', () => {
      // Rent posted $1100 against a $1000 average; the $75 gym charge has
      // not posted yet. An aggregate guard (max(0, 1075 - 1100) = 0) would
      // swallow the gym's upcoming charge; per-series it must survive.
      const result = computeSpendingVelocity({
        daysElapsed: 5,
        daysInMonth: 30,
        spentSoFar: 1100,
        fixedCostSeries: [series(1000, 1100), series(75, 0)],
        lastMonthTotal: 1500,
        dailyVariableSpending: [0, 0, 0, 0, 0],
      });

      // 1100 paid + 75 still due + 0 variable
      expect(result.projectedTotal).toBeCloseTo(1175, 5);
      expect(result.recurringSpent).toBeCloseTo(1100, 5);
      expect(result.expectedFixedCosts).toBeCloseTo(1075, 5);
    });
  });

  describe('outlier handling', () => {
    it('trims a clear outlier when daysElapsed >= 7', () => {
      // One $2500 day and nine $50 days. Max ($2500) is > 3x median ($50)
      // and > 2x mean of others ($50), so it qualifies as an outlier.
      const dailyVariableSpending = [2500, 50, 50, 50, 50, 50, 50, 50, 50, 50];

      const result = computeSpendingVelocity({
        daysElapsed: 10,
        daysInMonth: 30,
        spentSoFar: 2950,
        fixedCostSeries: [],
        lastMonthTotal: 1500,
        dailyVariableSpending,
      });

      // Behavioral assertions (won't break if exact policy is tweaked):
      const naiveProjection = (2950 / 10) * 30; // $8850
      expect(result.projectedTotal).toBeLessThan(naiveProjection);
      expect(result.projectedTotal).toBeGreaterThanOrEqual(result.spentSoFar);
      expect(result.excludedOutlierAmount).toBe(2500);
    });

    it('does NOT trim when the max day is not a true outlier', () => {
      // $200 max alongside $100 average — within 2x mean and 3x median,
      // so should be kept in the rate.
      const dailyVariableSpending = [200, 80, 90, 110, 100, 95, 105, 100, 90, 110];

      const result = computeSpendingVelocity({
        daysElapsed: 10,
        daysInMonth: 30,
        spentSoFar: 1080,
        fixedCostSeries: [],
        lastMonthTotal: 3000,
        dailyVariableSpending,
      });

      // Naive rate is used: 1080/10 * 30 = 3240
      expect(result.projectedTotal).toBeCloseTo(3240, 5);
      expect(result.excludedOutlierAmount).toBe(0);
    });

    it('does NOT trim a single non-zero day on an otherwise empty month', () => {
      // [200, 0, 0, 0, 0, 0, 0, 0, 0, 0]: median and mean of "others" are
      // both 0, so the multiplicative outlier test would technically pass
      // (200 > 0). Trimming would silently produce projectedTotal ≈ 200,
      // which feels semantically wrong — the day wasn't an outlier, it
      // was the only data. Fall back to the naive rate instead.
      const dailyVariableSpending = [200, 0, 0, 0, 0, 0, 0, 0, 0, 0];

      const result = computeSpendingVelocity({
        daysElapsed: 10,
        daysInMonth: 30,
        spentSoFar: 200,
        fixedCostSeries: [],
        lastMonthTotal: 500,
        dailyVariableSpending,
      });

      // Naive rate: 200/10 * 30 = 600
      expect(result.projectedTotal).toBeCloseTo(600, 5);
      expect(result.excludedOutlierAmount).toBe(0);
    });

    it('does NOT trim before the min-days threshold', () => {
      // Day 3 of 30, big spike day-1 — not enough samples to tell signal
      // from noise yet, so we extrapolate naively.
      const result = computeSpendingVelocity({
        daysElapsed: 3,
        daysInMonth: 30,
        spentSoFar: 600,
        fixedCostSeries: [],
        lastMonthTotal: 2000,
        dailyVariableSpending: [500, 50, 50],
      });

      // 600/3 * 30 = 6000
      expect(result.projectedTotal).toBeCloseTo(6000, 5);
      expect(result.excludedOutlierAmount).toBe(0);
    });
  });

  describe('regression: dashboard projection', () => {
    it('produces a believable projection for the reported scenario', () => {
      // Day 27 of 30, $4237.71 spent, $10.89 of $2596.31 expected fixed
      // posted, $4226.82 variable concentrated in a day-1 outlier (~$2500)
      // plus normal daily activity. The old formula produced ~$7,293.
      // Fix is dominated by the outlier trim (with so little recurring
      // posted, the no-double-count fix is a no-op for THIS scenario —
      // it matters more once recurring posts mid-month).
      const dailyVariableSpending = [
        2500, 50, 30, 40, 80, 60, 70, 100, 50, 60,
        40, 90, 80, 70, 60, 110, 50, 40, 30, 80,
        90, 70, 60, 50, 120, 56.82, 50,
      ];

      const result = computeSpendingVelocity({
        daysElapsed: 27,
        daysInMonth: 30,
        spentSoFar: 4237.71,
        fixedCostSeries: [series(2585.42, 0), series(10.89, 10.89)],
        lastMonthTotal: 4080,
        dailyVariableSpending,
      });

      expect(result.projectedTotal).toBeLessThan(7000);
      expect(result.projectedTotal).toBeGreaterThanOrEqual(result.spentSoFar);
      expect(result.excludedOutlierAmount).toBe(2500);
    });
  });

  describe('output shape', () => {
    it('passes through metadata fields and derives fixed-cost totals from the series', () => {
      const result = computeSpendingVelocity({
        daysElapsed: 15,
        daysInMonth: 31,
        spentSoFar: 1200,
        fixedCostSeries: [series(300, 200)],
        lastMonthTotal: 2500,
        dailyVariableSpending: Array(15).fill(66.67),
      });

      expect(result.daysElapsed).toBe(15);
      expect(result.daysInMonth).toBe(31);
      expect(result.spentSoFar).toBe(1200);
      expect(result.recurringSpent).toBe(200);
      expect(result.expectedFixedCosts).toBe(300);
      expect(result.lastMonthTotal).toBe(2500);
      expect(result.variableSpent).toBeCloseTo(15 * 66.67, 5);
      expect(result).toHaveProperty('excludedOutlierAmount');
    });
  });
});

describe('buildFixedCostSeries', () => {
  const charge = (
    merchantDisplayName: string,
    averageAmount: number,
    frequency: 'weekly' | 'monthly' | 'yearly' = 'monthly',
  ) => ({
    merchantDisplayName,
    averageAmount,
    frequency,
  });

  it('excludes a series whose merchant has not charged within the liveness window', () => {
    // "Bp" was the rent payee until February; the series was never
    // deactivated but must not be projected in August.
    const result = buildFixedCostSeries(
      [charge('Bp', 2405)],
      new Map([['Bp', '2026-02-02']]),
      new Map(),
      '2026-08-04',
    );

    expect(result).toEqual([]);
  });

  it('excludes a series whose merchant has no transactions at all', () => {
    const result = buildFixedCostSeries(
      [charge('Ghost Gym', 50)],
      new Map(),
      new Map(),
      '2026-08-04',
    );

    expect(result).toEqual([]);
  });

  it('includes a recently-seen series that has not posted this month yet', () => {
    const result = buildFixedCostSeries(
      [charge('Active N Fit Direct', 75)],
      new Map([['Active N Fit Direct', '2026-07-30']]),
      new Map(),
      '2026-08-04',
    );

    expect(result).toEqual([{ expectedAmount: 75, paidThisMonth: 0 }]);
  });

  it('includes a series paid this month with its paid amount attached', () => {
    const result = buildFixedCostSeries(
      [charge('Bilt Card - Housing Withdrawal Withdrawal', 2404.99)],
      new Map([['Bilt Card - Housing Withdrawal Withdrawal', '2026-08-03']]),
      new Map([['Bilt Card - Housing Withdrawal Withdrawal', 2497.49]]),
      '2026-08-04',
    );

    expect(result).toEqual([{ expectedAmount: 2404.99, paidThisMonth: 2497.49 }]);
  });

  it('keeps a series exactly at the liveness boundary', () => {
    // 45 days before 2026-08-04 is 2026-06-20.
    const result = buildFixedCostSeries(
      [charge('Edge Case Co', 20)],
      new Map([['Edge Case Co', '2026-06-20']]),
      new Map(),
      '2026-08-04',
    );

    expect(result).toHaveLength(1);
  });

  it('normalizes a live weekly series to its monthly equivalent', () => {
    const result = buildFixedCostSeries(
      [charge('Weekly Cleaner', 60, 'weekly')],
      new Map([['Weekly Cleaner', '2026-08-01']]),
      new Map([['Weekly Cleaner', 60]]),
      '2026-08-04',
    );

    // 60 * 52 / 12 = 260
    expect(result).toEqual([{ expectedAmount: 260, paidThisMonth: 60 }]);
  });

  it('excludes a stale weekly series like a stale monthly one', () => {
    const result = buildFixedCostSeries(
      [charge('Cancelled Cleaner', 60, 'weekly')],
      new Map([['Cancelled Cleaner', '2026-05-01']]),
      new Map(),
      '2026-08-04',
    );

    expect(result).toEqual([]);
  });

  it('keeps a yearly series regardless of when it last charged', () => {
    // The insights endpoint fetches 6 months of transactions, so a yearly
    // charge from 8 months ago is invisible; absence of a recent charge
    // must not drop the series.
    const result = buildFixedCostSeries(
      [charge('Annual Insurance', 1200, 'yearly'), charge('Unseen Annual', 600, 'yearly')],
      new Map([['Annual Insurance', '2026-03-15']]),
      new Map(),
      '2026-08-04',
    );

    // 1200 / 12 = 100 and 600 / 12 = 50 per month
    expect(result).toEqual([
      { expectedAmount: 100, paidThisMonth: 0 },
      { expectedAmount: 50, paidThisMonth: 0 },
    ]);
  });

  it('clamps a yearly series to zero remaining in its billing month', () => {
    // The full $1200 posts in August; expected is the $100 monthly
    // equivalent. Per-series max(0, expected - paid) must not project
    // anything extra on top of the paid amount.
    const fixedCostSeries = buildFixedCostSeries(
      [charge('Annual Insurance', 1200, 'yearly')],
      new Map([['Annual Insurance', '2026-08-02']]),
      new Map([['Annual Insurance', 1200]]),
      '2026-08-04',
    );

    const result = computeSpendingVelocity({
      daysElapsed: 4,
      daysInMonth: 31,
      spentSoFar: 1200,
      fixedCostSeries,
      lastMonthTotal: 0,
      dailyVariableSpending: [0, 0, 0, 0],
    });

    expect(result.projectedTotal).toBeCloseTo(1200, 5);
  });

  describe('regression: August 2026 dashboard projection', () => {
    it('drops stale rent + subscription series so the projection reflects reality', () => {
      // Live data behind the reported $10,285.46 projection on day 4 of 31
      // against a $4,500 budget: two of the four "active monthly" series
      // had not charged in months (old rent payee "Bp", a lapsed
      // subscription), inflating expected fixed costs to $4,895.88.
      const fixedCostSeries = buildFixedCostSeries(
        [
          charge('Bp', 2405),
          charge('Bilt Card - Housing Withdrawal Withdrawal', 2404.99),
          charge('Active N Fit Direct', 75),
          charge('Claude.ai', 10.89),
        ],
        new Map([
          ['Bp', '2026-02-02'],
          ['Bilt Card - Housing Withdrawal Withdrawal', '2026-08-03'],
          ['Active N Fit Direct', '2026-07-30'],
          ['Claude.ai', '2026-05-23'],
        ]),
        new Map([['Bilt Card - Housing Withdrawal Withdrawal', 2497.49]]),
        '2026-08-04',
      );

      expect(fixedCostSeries).toEqual([
        { expectedAmount: 2404.99, paidThisMonth: 2497.49 },
        { expectedAmount: 75, paidThisMonth: 0 },
      ]);

      const result = computeSpendingVelocity({
        daysElapsed: 4,
        daysInMonth: 31,
        spentSoFar: 3192.92,
        fixedCostSeries,
        lastMonthTotal: 0,
        dailyVariableSpending: [157.43, 407.56, 108.75, 21.69],
      });

      // Old behavior: 2497.49 + (4895.88 - 2497.49) + 695.43/4*31 ≈ 10285.46.
      // New: 2497.49 paid + 75 gym still due + 5389.58 variable ≈ 7962.07,
      // so the ~$2,416 of dead series no longer haunts the projection.
      expect(result.expectedFixedCosts).toBeCloseTo(2479.99, 2);
      expect(result.projectedTotal).toBeCloseTo(7962.07, 1);
      expect(result.projectedTotal).toBeLessThan(8000);
    });
  });
});

describe('matchRenamedRecurringPayments', () => {
  const rent = { merchantDisplayName: 'Landlord Co', averageAmount: 2400, frequency: 'monthly' as const };
  // Rent usually posts on the 3rd.
  const lastSeen = new Map([['Landlord Co', '2026-09-03']]);

  it('attributes a renamed rent payment near the usual day and amount', () => {
    const matches = matchRenamedRecurringPayments(
      [rent],
      new Map(),
      lastSeen,
      [{ day: 5, amount: 2497.49 }],
      31,
    );

    expect(matches).toEqual([
      { merchantDisplayName: 'Landlord Co', day: 5, amount: 2497.49 },
    ]);
  });

  it('skips a series that has already been paid by name this month', () => {
    const matches = matchRenamedRecurringPayments(
      [rent],
      new Map([['Landlord Co', 2400]]),
      lastSeen,
      [{ day: 5, amount: 2400 }],
      31,
    );

    expect(matches).toEqual([]);
  });

  it('ignores a charge outside the amount tolerance', () => {
    const matches = matchRenamedRecurringPayments(
      [rent],
      new Map(),
      lastSeen,
      [{ day: 4, amount: 1800 }],
      31,
    );

    expect(matches).toEqual([]);
  });

  it('ignores a charge far from the usual billing day (a one-off purchase)', () => {
    const matches = matchRenamedRecurringPayments(
      [rent],
      new Map(),
      lastSeen,
      [{ day: 20, amount: 2350 }],
      31,
    );

    expect(matches).toEqual([]);
  });

  it('never matches small series, where amount coincidences are common', () => {
    const gym = { merchantDisplayName: 'Gym', averageAmount: 75, frequency: 'monthly' as const };

    const matches = matchRenamedRecurringPayments(
      [gym],
      new Map(),
      new Map([['Gym', '2026-09-03']]),
      [{ day: 4, amount: 74 }],
      31,
    );

    expect(matches).toEqual([]);
  });

  it('only matches monthly series', () => {
    const matches = matchRenamedRecurringPayments(
      [{ ...rent, frequency: 'weekly' as const }, { ...rent, merchantDisplayName: 'Annual', frequency: 'yearly' as const }],
      new Map(),
      new Map([['Landlord Co', '2026-09-03'], ['Annual', '2026-09-03']]),
      [{ day: 5, amount: 2400 }],
      31,
    );

    expect(matches).toEqual([]);
  });

  it('uses each charge for at most one series, preferring the closest amount', () => {
    const other = { merchantDisplayName: 'Other Bill', averageAmount: 2300, frequency: 'monthly' as const };

    const matches = matchRenamedRecurringPayments(
      [rent, other],
      new Map(),
      new Map([['Landlord Co', '2026-09-03'], ['Other Bill', '2026-09-03']]),
      [{ day: 4, amount: 2410 }],
      31,
    );

    expect(matches).toEqual([
      { merchantDisplayName: 'Landlord Co', day: 4, amount: 2410 },
    ]);
  });

  it('skips a series with no known billing day', () => {
    const matches = matchRenamedRecurringPayments(
      [rent],
      new Map(),
      new Map(),
      [{ day: 5, amount: 2400 }],
      31,
    );

    expect(matches).toEqual([]);
  });

  describe('month boundary wraparound', () => {
    const matchOn = (lastDate: string, day: number, daysInMonth: number) =>
      matchRenamedRecurringPayments(
        [rent],
        new Map(),
        new Map([['Landlord Co', lastDate]]),
        [{ day, amount: 2400 }],
        daysInMonth,
      );

    it('matches rent that last posted on the 31st and now posts on the 1st', () => {
      expect(matchOn('2026-08-31', 1, 31)).toHaveLength(1);
    });

    it('matches rent that last posted on the 1st and now posts on the 31st', () => {
      expect(matchOn('2026-09-01', 31, 31)).toHaveLength(1);
    });

    it.each([28, 29, 30, 31])('wraps correctly in a %i day month', daysInMonth => {
      expect(matchOn(`2026-01-${daysInMonth}`, 2, daysInMonth)).toHaveLength(1);
      expect(matchOn('2026-01-02', daysInMonth, daysInMonth)).toHaveLength(1);
    });

    it('still rejects days that are far apart even with wraparound', () => {
      expect(matchOn('2026-09-10', 25, 30)).toHaveLength(0);
    });
  });

  describe('regression: October 2026 rent posted under a new merchant name', () => {
    it('stops double counting rent as both variable spend and an unpaid fixed cost', () => {
      // Day 6 of 31. Rent ($2,497.49) posted on day 5 as "Bilt Housing
      // Payment" while the series is "Bilt Card - Housing Withdrawal
      // Withdrawal" ($2,404.99). It landed in the variable bucket AND stayed
      // unpaid as a fixed cost, projecting ~$21k against a $5,500 budget.
      const variableByDay = [38, 53, 791, 142, 2556, 0];
      const unmatched = [{ day: 5, amount: 2497.49 }];
      const biltRent = {
        merchantDisplayName: 'Bilt Card - Housing Withdrawal Withdrawal',
        averageAmount: 2404.99,
        frequency: 'monthly' as const,
      };

      const [match] = matchRenamedRecurringPayments(
        [biltRent],
        new Map(),
        new Map([[biltRent.merchantDisplayName, '2026-09-03']]),
        unmatched,
      31,
    );
      expect(match).toBeDefined();

      const dailyVariableSpending = [...variableByDay];
      dailyVariableSpending[match.day - 1] -= match.amount;

      const result = computeSpendingVelocity({
        daysElapsed: 6,
        daysInMonth: 31,
        spentSoFar: 3579.83,
        fixedCostSeries: [{ expectedAmount: 2404.99, paidThisMonth: match.amount }],
        lastMonthTotal: 0,
        dailyVariableSpending,
      });

      expect(result.recurringSpent).toBeCloseTo(2497.49, 2);
      expect(result.variableSpent).toBeCloseTo(1082.51, 2);
      // 2497.49 rent + (1082.51 / 6) * 31 projected variable, nowhere near $21k.
      expect(result.projectedTotal).toBeLessThan(9000);
    });
  });
});

describe('findSupersededSeries', () => {
  const monthly = (merchantDisplayName: string, averageAmount: number) => ({
    merchantDisplayName,
    averageAmount,
    frequency: 'monthly' as const,
  });
  const oldRent = monthly('Old Rent Name', 2404.99);
  const newRent = monthly('New Rent Name', 2497.49);
  const lastSeen = new Map([
    ['Old Rent Name', '2026-09-03'],
    ['New Rent Name', '2026-10-05'],
  ]);

  it('drops an unpaid series when a same-sized sibling already paid near its billing day', () => {
    const superseded = findSupersededSeries(
      [oldRent, newRent],
      new Map([['New Rent Name', 2497.49]]),
      lastSeen,
      31,
    );

    expect([...superseded]).toEqual(['Old Rent Name']);
  });

  it('keeps an unpaid series when no sibling has paid', () => {
    expect(findSupersededSeries([oldRent, newRent], new Map(), lastSeen,
      31,
    ).size).toBe(0);
  });

  it('keeps a series that has itself paid this month', () => {
    const superseded = findSupersededSeries(
      [oldRent, newRent],
      new Map([['Old Rent Name', 2404.99], ['New Rent Name', 2497.49]]),
      lastSeen,
      31,
    );

    expect(superseded.size).toBe(0);
  });

  it('keeps an unpaid series whose amount differs from the paid sibling', () => {
    const superseded = findSupersededSeries(
      [monthly('Old Rent Name', 1500), newRent],
      new Map([['New Rent Name', 2497.49]]),
      lastSeen,
      31,
    );

    expect(superseded.size).toBe(0);
  });

  it('keeps an unpaid series with a different billing day', () => {
    const superseded = findSupersededSeries(
      [oldRent, newRent],
      new Map([['New Rent Name', 2497.49]]),
      new Map([['Old Rent Name', '2026-09-22'], ['New Rent Name', '2026-10-05']]),
      31,
    );

    expect(superseded.size).toBe(0);
  });

  it('never drops small series', () => {
    const superseded = findSupersededSeries(
      [monthly('Gym A', 75), monthly('Gym B', 76)],
      new Map([['Gym B', 76]]),
      new Map([['Gym A', '2026-09-03'], ['Gym B', '2026-10-03']]),
      31,
    );

    expect(superseded.size).toBe(0);
  });

  it('ignores non-monthly series', () => {
    const superseded = findSupersededSeries(
      [{ ...oldRent, frequency: 'yearly' as const }, newRent],
      new Map([['New Rent Name', 2497.49]]),
      lastSeen,
      31,
    );

    expect(superseded.size).toBe(0);
  });

  describe('regression: October 2026 rent tracked under two merchant names', () => {
    it('counts rent once in fixed costs once the new name has paid', () => {
      const charges = [oldRent, newRent];
      const paid = new Map([['New Rent Name', 2497.49]]);
      const superseded = findSupersededSeries(charges, paid, lastSeen,
      31,
    );

      const fixedCostSeries = buildFixedCostSeries(
        charges.filter(c => !superseded.has(c.merchantDisplayName)),
        lastSeen,
        paid,
        '2026-10-06',
      );

      expect(fixedCostSeries).toEqual([{ expectedAmount: 2497.49, paidThisMonth: 2497.49 }]);
    });
  });
});

describe('circularDayDistance', () => {
  it('is the plain difference inside the month', () => {
    expect(circularDayDistance(3, 6, 31)).toBe(3);
  });

  it.each([28, 29, 30, 31])('treats the last and first day as 1 apart in a %i day month', n => {
    expect(circularDayDistance(n, 1, n)).toBe(1);
    expect(circularDayDistance(1, n, n)).toBe(1);
  });

  it('is 0 for the same day', () => {
    expect(circularDayDistance(15, 15, 30)).toBe(0);
  });
});
