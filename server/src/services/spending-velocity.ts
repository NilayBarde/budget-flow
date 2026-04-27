export interface SpendingVelocityInput {
  daysElapsed: number;
  daysInMonth: number;
  spentSoFar: number;
  recurringSpent: number;
  expectedFixedCosts: number;
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

export const computeSpendingVelocity = (
  input: SpendingVelocityInput,
): SpendingVelocity => {
  const {
    daysElapsed,
    daysInMonth,
    spentSoFar,
    recurringSpent,
    expectedFixedCosts,
    lastMonthTotal,
    dailyVariableSpending,
  } = input;

  if (dailyVariableSpending.length !== daysElapsed) {
    throw new Error(
      `dailyVariableSpending.length (${dailyVariableSpending.length}) must equal daysElapsed (${daysElapsed})`,
    );
  }

  // Derive variableSpent from the per-day array so it cannot drift from
  // the daily values used for projection. spentSoFar/recurringSpent stay
  // as inputs because the no-double-count guard for expected fixed costs
  // needs recurringSpent independently of the variable per-day data.
  const variableSpent = dailyVariableSpending.reduce((sum, v) => sum + v, 0);
  const dailyAverage = daysElapsed > 0 ? variableSpent / daysElapsed : 0;

  const { amount: projectedVariable, excludedOutlier } = computeProjectedVariable(
    dailyVariableSpending,
    daysElapsed,
    daysInMonth,
  );

  // Avoid double-counting expected fixed costs that have already posted.
  // recurringSpent is part of spentSoFar; expectedFixedCosts represents
  // the *full* monthly amount. Only the unpaid remainder should be added
  // to the projection.
  const remainingFixed = Math.max(0, expectedFixedCosts - recurringSpent);
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
    excludedOutlierAmount: excludedOutlier,
  };
};
