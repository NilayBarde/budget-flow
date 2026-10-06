import type { BudgetGoal } from '../types';

// The month's overall budget: the amount the user set by hand in Settings when there is one,
// otherwise the sum of the category limits. Zero means no budget at all. One definition so the
// hero card and the spending pace card cannot disagree about what "on budget" means.
export const resolveBudgetTarget = (
  manualLimitSetting: string | null | undefined,
  goals: Pick<BudgetGoal, 'limit_amount'>[] | undefined,
): number => {
  const manual = manualLimitSetting ? parseFloat(manualLimitSetting) : 0;
  if (manual > 0) return manual;
  return goals?.reduce((sum, goal) => sum + goal.limit_amount, 0) || 0;
};
