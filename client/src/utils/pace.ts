// A projection up to this far past the benchmark still counts as on pace: a projection made a few
// days into a month is not precise enough to call a 2% overshoot a problem.
export const PACE_GRACE = 1.05;

export interface PaceDescription {
  onPace: boolean;
  /** How far the projection is from the benchmark, always positive; null when there is no benchmark. */
  difference: number | null;
  direction: 'over' | 'under';
  /** What the projection is compared with, for display. */
  against: 'budget' | 'last month';
}

interface PaceInput {
  projectedTotal: number;
  /** The monthly budget, or last month's total when there is no budget. */
  budget: number;
  hasBudget: boolean;
}

export const describePace = ({ projectedTotal, budget, hasBudget }: PaceInput): PaceDescription => {
  const against = hasBudget ? 'budget' : 'last month';
  if (budget <= 0) return { onPace: true, difference: null, direction: 'under', against };

  const gap = projectedTotal - budget;
  return {
    onPace: projectedTotal <= budget * PACE_GRACE,
    difference: Math.abs(gap),
    direction: gap > 0 ? 'over' : 'under',
    against,
  };
};
