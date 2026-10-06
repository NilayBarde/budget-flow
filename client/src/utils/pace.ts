// A projection up to this far past the benchmark still counts as on pace: a projection made a few
// days into a month is not precise enough to call a 2% overshoot a problem.
export const PACE_GRACE = 1.05;

export interface PaceDescription {
  onPace: boolean;
  /** How far the projection is from the benchmark, always positive; null when there is no usable benchmark. */
  difference: number | null;
  direction: 'over' | 'under';
  /** Over the benchmark but inside the grace: on pace, yet not under it. Lets the card say so plainly. */
  withinGrace: boolean;
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
  // Nothing sensible to compare: no benchmark, or a number that is not a finite amount.
  if (!Number.isFinite(projectedTotal) || !Number.isFinite(budget) || budget <= 0) {
    return { onPace: true, difference: null, direction: 'under', withinGrace: false, against };
  }

  const gap = projectedTotal - budget;
  const onPace = projectedTotal <= budget * PACE_GRACE;
  return {
    onPace,
    difference: Math.abs(gap),
    direction: gap > 0 ? 'over' : 'under',
    withinGrace: onPace && gap > 0,
    against,
  };
};
