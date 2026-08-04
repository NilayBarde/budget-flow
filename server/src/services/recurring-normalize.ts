// Pure helper: convert a recurring charge's average amount to its
// monthly equivalent so weekly and yearly charges contribute correctly
// to expected fixed costs.

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';

const WEEKS_PER_MONTH = 52 / 12;

export function monthlyEquivalentAmount(
  frequency: RecurringFrequency,
  averageAmount: number,
): number {
  switch (frequency) {
    case 'weekly':
      return averageAmount * WEEKS_PER_MONTH;
    case 'yearly':
      return averageAmount / 12;
    case 'monthly':
    default:
      return averageAmount;
  }
}
