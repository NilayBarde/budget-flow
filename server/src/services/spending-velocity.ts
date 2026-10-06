import { monthlyEquivalentAmount, type RecurringFrequency } from './recurring-normalize.js';

export interface FixedCostSeries {
  /** Average monthly amount this series is expected to charge. */
  expectedAmount: number;
  /** How much of it has already posted in the current month. */
  paidThisMonth: number;
}

export interface SpendingVelocityInput {
  daysElapsed: number;
  daysInMonth: number;
  spentSoFar: number;
  /**
   * One entry per live recurring charge (rent, gym, subscriptions).
   * Unpaid remainders are computed per series so one series posting above
   * its average cannot mask another series that is still due this month.
   */
  fixedCostSeries: FixedCostSeries[];
  lastMonthTotal: number;
  /**
   * Per-day variable (non-recurring) spending for the current month.
   * Length MUST equal `daysElapsed`; index `i` corresponds to day `i + 1`.
   */
  dailyVariableSpending: number[];
}

export interface SpendingVelocity {
  daysElapsed: number;
  daysInMonth: number;
  spentSoFar: number;
  projectedTotal: number;
  lastMonthTotal: number;
  dailyAverage: number;
  expectedFixedCosts: number;
  recurringSpent: number;
  variableSpent: number;
  /** Fixed costs still due this month, summed per series (a series that overpaid does not cancel another). */
  remainingFixed: number;
  /** Variable spending so far plus the remaining days at the daily rate. */
  projectedVariable: number;
  /**
   * Amount of a single day excluded from the daily-rate extrapolation
   * because it was a statistical outlier (e.g. a one-time large
   * purchase). 0 when no day was excluded. Surfaced so the UI can
   * disclose "1 outlier day excluded from projection" if desired.
   */
  excludedOutlierAmount: number;
}

// Need at least this many elapsed days before a trimmed mean is meaningful;
// with fewer samples the "outlier" might just be normal day-to-day variance.
const OUTLIER_TRIM_MIN_DAYS = 7;

// A day is treated as an outlier only when it is BOTH:
//   - more than 3x the median of the other days, AND
//   - more than 2x the mean of the other days
// Both guards together prevent false positives when all days are similar
// (median≈mean) but the max is only modestly above the rest.
const OUTLIER_MEDIAN_MULTIPLE = 3;
const OUTLIER_MEAN_MULTIPLE = 2;

const median = (sortedAsc: number[]): number => {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sortedAsc[mid - 1] + sortedAsc[mid]) / 2 : sortedAsc[mid];
};

interface ProjectedVariable {
  amount: number;
  excludedOutlier: number;
}

const computeProjectedVariable = (
  dailyVariableSpending: number[],
  daysElapsed: number,
  daysInMonth: number,
): ProjectedVariable => {
  if (daysElapsed <= 0) return { amount: 0, excludedOutlier: 0 };

  const variableSpent = dailyVariableSpending.reduce((sum, v) => sum + v, 0);
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

  if (daysRemaining === 0 || daysElapsed < OUTLIER_TRIM_MIN_DAYS) {
    const rate = variableSpent / daysElapsed;
    return { amount: variableSpent + rate * daysRemaining, excludedOutlier: 0 };
  }

  const sortedAsc = [...dailyVariableSpending].sort((a, b) => a - b);
  const maxDay = sortedAsc[sortedAsc.length - 1];
  const otherDays = sortedAsc.slice(0, -1);
  const otherSum = variableSpent - maxDay;
  const otherMean = otherSum / otherDays.length;
  const otherMedian = median(otherDays);

  // Guard against the all-other-days-are-zero case: if there's no
  // baseline activity to compare against, the "outlier" is actually our
  // only data point. Trimming it would silently project ~0 spending,
  // which is the worse failure mode for a budget tracker (under-projects
  // confidently). Fall back to the naive rate instead — it'll over-
  // project, but obviously so.
  const hasBaseline = otherMean > 0;

  const isOutlier =
    hasBaseline &&
    maxDay > OUTLIER_MEDIAN_MULTIPLE * otherMedian &&
    maxDay > OUTLIER_MEAN_MULTIPLE * otherMean;

  if (!isOutlier) {
    const rate = variableSpent / daysElapsed;
    return { amount: variableSpent + rate * daysRemaining, excludedOutlier: 0 };
  }

  // Trim: extrapolate the remaining days at the rate of the non-outlier
  // days, but keep the actual variable spent (including the outlier) in
  // the total — we're not pretending the outlier didn't happen, just
  // refusing to assume it repeats every 1/N days for the rest of the month.
  return {
    amount: variableSpent + otherMean * daysRemaining,
    excludedOutlier: maxDay,
  };
};

/**
 * Filter user-marked recurring series down to the ones that are actually
 * still charging, based on each merchant's most recent expense date.
 * `is_active`/`last_seen` on recurring_transactions are refreshed by
 * detection for detected rows, but manual rows still only reflect when the
 * user marked the series, so a payee that stopped charging months ago
 * (e.g. a previous landlord) stays "active" forever and would otherwise be
 * projected as an unpaid fixed cost every month.
 */
export const LIVE_SERIES_MAX_AGE_DAYS = 45;

// Yearly series are exempt from the liveness check: their last charge can
// legitimately be up to a year old, while the insights endpoint only
// fetches 6 months of transactions, so a missing recent charge is not
// evidence the series is dead.
const livenessWindowDays: Record<RecurringFrequency, number | null> = {
  weekly: LIVE_SERIES_MAX_AGE_DAYS,
  monthly: LIVE_SERIES_MAX_AGE_DAYS,
  yearly: null,
};

export interface RecurringChargeRow {
  merchantDisplayName: string;
  averageAmount: number;
  frequency: RecurringFrequency;
}

export const filterLiveCharges = (
  charges: RecurringChargeRow[],
  lastExpenseDateByMerchant: ReadonlyMap<string, string>,
  today: string,
): RecurringChargeRow[] => {
  const cutoffDate = new Date(today);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - LIVE_SERIES_MAX_AGE_DAYS);
  const cutoff = cutoffDate.toISOString().split('T')[0];

  return charges.filter(c => {
    if (livenessWindowDays[c.frequency] === null) return true;
    const lastSeen = lastExpenseDateByMerchant.get(c.merchantDisplayName);
    return !!lastSeen && lastSeen >= cutoff;
  });
};

// A recurring bill can post under a different merchant name than the one the
// series was detected with (a payment processor rename, "Bilt Housing Payment"
// vs "Bilt Card - Housing Withdrawal Withdrawal"). Name matching then misses
// it, so the charge is projected as variable spend while the series stays
// unpaid. As a fallback an unmatched charge is attributed to a live monthly
// series that has not paid yet when BOTH hold:
//   - the amount is within FUZZY_MATCH_TOLERANCE of the series average, and
//   - it posted within FUZZY_MATCH_DAY_WINDOW days of the series' usual day, AND
//   - the merchant names share a meaningful token ("bilt", "housing").
// The text signal keeps a similarly sized one-off (a $2,300 flight on the 4th)
// from absorbing the rent slot, which would push the real rent into variable
// spend. Small series are excluded because similar amounts are common
// coincidences (a $75 gym vs any $75 dinner).
export const FUZZY_MATCH_TOLERANCE = 0.1;
export const FUZZY_MATCH_DAY_WINDOW = 7;
export const FUZZY_MATCH_MIN_AMOUNT = 100;

// Day of month distance that wraps around the month boundary, so rent that
// last posted on the 31st and now posts on the 1st is 1 day apart, not 30.
export const circularDayDistance = (a: number, b: number, daysInMonth: number): number => {
  const diff = Math.abs(a - b);
  return Math.min(diff, Math.max(0, daysInMonth - diff));
};

export interface UnmatchedExpense {
  day: number;
  amount: number;
  /** Display name of the charge's merchant, '' when unknown. */
  merchantName: string;
}

export interface RenamedPaymentMatch {
  merchantDisplayName: string;
  day: number;
  amount: number;
}

// Words that appear in most bill payment descriptors and say nothing about
// who is being paid.
const GENERIC_NAME_TOKENS = new Set([
  'payment', 'pay', 'withdrawal', 'card', 'bill', 'autopay', 'online', 'debit',
  'ach', 'transfer', 'the', 'and', 'inc', 'llc',
]);

const nameTokens = (name: string): Set<string> =>
  new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 3 && !GENERIC_NAME_TOKENS.has(t)),
  );

const sharesNameToken = (a: string, b: string): boolean => {
  const tokensA = nameTokens(a);
  for (const token of nameTokens(b)) {
    if (tokensA.has(token)) return true;
  }
  return false;
};

export const matchRenamedRecurringPayments = (
  liveCharges: RecurringChargeRow[],
  paidThisMonthByMerchant: ReadonlyMap<string, number>,
  lastExpenseDateByMerchant: ReadonlyMap<string, string>,
  unmatchedExpenses: UnmatchedExpense[],
  daysInMonth: number,
): RenamedPaymentMatch[] => {
  const candidates = liveCharges
    .filter(
      c =>
        c.frequency === 'monthly' &&
        c.averageAmount >= FUZZY_MATCH_MIN_AMOUNT &&
        !(paidThisMonthByMerchant.get(c.merchantDisplayName) || 0),
    )
    // Largest first so the biggest bill (rent) claims its charge before a
    // smaller series with an overlapping tolerance band can.
    .sort((a, b) => b.averageAmount - a.averageAmount);

  const used = new Set<number>();
  const matches: RenamedPaymentMatch[] = [];

  for (const charge of candidates) {
    const lastSeen = lastExpenseDateByMerchant.get(charge.merchantDisplayName);
    if (!lastSeen) continue;
    const usualDay = parseInt(lastSeen.split('-')[2], 10);

    let bestIndex = -1;
    let bestDiff = Infinity;
    unmatchedExpenses.forEach((expense, i) => {
      if (used.has(i)) return;
      const relativeDiff = Math.abs(expense.amount - charge.averageAmount) / charge.averageAmount;
      if (relativeDiff > FUZZY_MATCH_TOLERANCE) return;
      if (circularDayDistance(expense.day, usualDay, daysInMonth) > FUZZY_MATCH_DAY_WINDOW) return;
      if (!sharesNameToken(expense.merchantName, charge.merchantDisplayName)) return;
      if (relativeDiff < bestDiff) {
        bestDiff = relativeDiff;
        bestIndex = i;
      }
    });

    if (bestIndex >= 0) {
      used.add(bestIndex);
      const { day, amount } = unmatchedExpenses[bestIndex];
      matches.push({ merchantDisplayName: charge.merchantDisplayName, day, amount });
    }
  }

  return matches;
};

// Once detection catches up, the same bill can exist as two live series (the
// old merchant name and the new one). The new name pays, the old one stays
// unpaid, and the bill would be projected twice. An unpaid monthly series is
// a superseded alias when a sibling monthly series already paid this month
// with a similar average and a similar billing day (same thresholds as the
// renamed payment match) AND the history shows a rename: the old series' last
// charging month is before the sibling's first one. Two bills that merely look
// alike (internet $120 on the 2nd, phone $125 on the 5th) charge in the same
// months, so they are never merged. Returns the merchant names to drop from
// the fixed-cost projection.
export const findSupersededSeries = (
  liveCharges: RecurringChargeRow[],
  paidThisMonthByMerchant: ReadonlyMap<string, number>,
  lastExpenseDateByMerchant: ReadonlyMap<string, string>,
  chargeMonthsByMerchant: ReadonlyMap<string, ReadonlySet<string>>,
  daysInMonth: number,
): Set<string> => {
  const billingDay = (charge: RecurringChargeRow): number | null => {
    const lastSeen = lastExpenseDateByMerchant.get(charge.merchantDisplayName);
    return lastSeen ? parseInt(lastSeen.split('-')[2], 10) : null;
  };
  // Months are YYYY-MM strings, so lexicographic order is chronological.
  const lastChargeMonth = (charge: RecurringChargeRow): string | null => {
    const months = chargeMonthsByMerchant.get(charge.merchantDisplayName);
    return months && months.size > 0 ? [...months].sort().at(-1)! : null;
  };
  const firstChargeMonth = (charge: RecurringChargeRow): string | null => {
    const months = chargeMonthsByMerchant.get(charge.merchantDisplayName);
    return months && months.size > 0 ? [...months].sort()[0] : null;
  };
  const isPaid = (charge: RecurringChargeRow) =>
    (paidThisMonthByMerchant.get(charge.merchantDisplayName) || 0) > 0;

  const monthly = liveCharges.filter(
    c => c.frequency === 'monthly' && c.averageAmount >= FUZZY_MATCH_MIN_AMOUNT,
  );
  const paidSiblings = monthly.filter(isPaid);
  const superseded = new Set<string>();

  for (const charge of monthly) {
    if (isPaid(charge)) continue;
    const day = billingDay(charge);
    if (day === null) continue;
    const oldLastMonth = lastChargeMonth(charge);
    if (oldLastMonth === null) continue;

    const hasPaidTwin = paidSiblings.some(sibling => {
      const siblingDay = billingDay(sibling);
      if (siblingDay === null) return false;
      const siblingFirstMonth = firstChargeMonth(sibling);
      if (siblingFirstMonth === null || oldLastMonth >= siblingFirstMonth) return false;
      const relativeDiff =
        Math.abs(sibling.averageAmount - charge.averageAmount) / charge.averageAmount;
      return (
        relativeDiff <= FUZZY_MATCH_TOLERANCE &&
        circularDayDistance(siblingDay, day, daysInMonth) <= FUZZY_MATCH_DAY_WINDOW
      );
    });
    if (hasPaidTwin) superseded.add(charge.merchantDisplayName);
  }

  return superseded;
};

export interface ReconcileRecurringInput {
  /** All recurring series rows, live or not. */
  charges: RecurringChargeRow[];
  /** Current-month spend already attributed to a series by merchant name. */
  paidThisMonthByMerchant: ReadonlyMap<string, number>;
  lastExpenseDateByMerchant: ReadonlyMap<string, string>;
  chargeMonthsByMerchant: ReadonlyMap<string, ReadonlySet<string>>;
  /** Current-month expenses not matched to a series by name. */
  unmatchedExpenses: UnmatchedExpense[];
  /** Current-month variable spend by day of month (1 based). */
  dailyVariable: ReadonlyMap<number, number>;
  /** YYYY-MM-DD */
  today: string;
  daysInMonth: number;
}

export interface ReconcileRecurringResult {
  /** Series to project as fixed costs, with superseded aliases removed. */
  charges: RecurringChargeRow[];
  paidThisMonthByMerchant: Map<string, number>;
  /** Index i is day i + 1, length equal to the day of month of `today`. */
  dailyVariableSpending: number[];
}

// Moves renamed recurring payments out of variable spend and onto their
// series, then drops series that are unpaid aliases of a renamed one. Pure:
// inputs are not mutated.
export const reconcileRecurringSeries = (
  input: ReconcileRecurringInput,
): ReconcileRecurringResult => {
  const { charges, lastExpenseDateByMerchant, chargeMonthsByMerchant, daysInMonth, today } = input;
  const paid = new Map(input.paidThisMonthByMerchant);
  const dailyVariable = new Map(input.dailyVariable);

  const liveCharges = filterLiveCharges(charges, lastExpenseDateByMerchant, today);
  const renamedPayments = matchRenamedRecurringPayments(
    liveCharges,
    paid,
    lastExpenseDateByMerchant,
    input.unmatchedExpenses,
    daysInMonth,
  );
  for (const payment of renamedPayments) {
    paid.set(
      payment.merchantDisplayName,
      (paid.get(payment.merchantDisplayName) || 0) + payment.amount,
    );
    dailyVariable.set(
      payment.day,
      Math.max(0, (dailyVariable.get(payment.day) || 0) - payment.amount),
    );
  }

  const superseded = findSupersededSeries(
    liveCharges,
    paid,
    lastExpenseDateByMerchant,
    chargeMonthsByMerchant,
    daysInMonth,
  );

  const dayOfMonth = parseInt(today.split('-')[2], 10);
  const dailyVariableSpending: number[] = [];
  for (let d = 1; d <= dayOfMonth; d++) {
    dailyVariableSpending.push(dailyVariable.get(d) || 0);
  }

  return {
    charges: charges.filter(c => !superseded.has(c.merchantDisplayName)),
    paidThisMonthByMerchant: paid,
    dailyVariableSpending,
  };
};

export const buildFixedCostSeries = (
  charges: RecurringChargeRow[],
  lastExpenseDateByMerchant: ReadonlyMap<string, string>,
  paidThisMonthByMerchant: ReadonlyMap<string, number>,
  today: string,
): FixedCostSeries[] => {
  return filterLiveCharges(charges, lastExpenseDateByMerchant, today)
    .map(c => ({
      // Weekly and yearly charges are normalized to a monthly equivalent.
      // A yearly charge contributes 1/12 here but its full amount to paid
      // in its billing month; the per-series max(0, expected - paid) clamp
      // below absorbs that without double counting.
      expectedAmount: monthlyEquivalentAmount(c.frequency, c.averageAmount),
      paidThisMonth: paidThisMonthByMerchant.get(c.merchantDisplayName) || 0,
    }));
};

export const computeSpendingVelocity = (
  input: SpendingVelocityInput,
): SpendingVelocity => {
  const {
    daysElapsed,
    daysInMonth,
    spentSoFar,
    fixedCostSeries,
    lastMonthTotal,
    dailyVariableSpending,
  } = input;

  if (dailyVariableSpending.length !== daysElapsed) {
    throw new Error(
      `dailyVariableSpending.length (${dailyVariableSpending.length}) must equal daysElapsed (${daysElapsed})`,
    );
  }

  // Derive variableSpent from the per-day array so it cannot drift from
  // the daily values used for projection.
  const variableSpent = dailyVariableSpending.reduce((sum, v) => sum + v, 0);
  const dailyAverage = daysElapsed > 0 ? variableSpent / daysElapsed : 0;

  const { amount: projectedVariable, excludedOutlier } = computeProjectedVariable(
    dailyVariableSpending,
    daysElapsed,
    daysInMonth,
  );

  // Avoid double-counting expected fixed costs that have already posted:
  // only each series' unpaid remainder is added to the projection. The
  // remainder is per series; rent posting above its average must not
  // absorb a subscription that hasn't charged yet this month.
  const expectedFixedCosts = fixedCostSeries.reduce((sum, s) => sum + s.expectedAmount, 0);
  const recurringSpent = fixedCostSeries.reduce((sum, s) => sum + s.paidThisMonth, 0);
  const remainingFixed = fixedCostSeries.reduce(
    (sum, s) => sum + Math.max(0, s.expectedAmount - s.paidThisMonth),
    0,
  );
  const projectedTotal = recurringSpent + remainingFixed + projectedVariable;

  return {
    daysElapsed,
    daysInMonth,
    spentSoFar,
    projectedTotal,
    lastMonthTotal,
    dailyAverage,
    expectedFixedCosts,
    recurringSpent,
    variableSpent,
    remainingFixed,
    projectedVariable,
    excludedOutlierAmount: excludedOutlier,
  };
};
