import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = {
  insights: undefined as unknown,
  settings: undefined as { monthly_budget_limit?: string } | undefined,
  goals: [] as { limit_amount: number }[],
};

vi.mock('../../../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks')>()),
  useInsights: () => ({ data: state.insights, isLoading: false }),
  useAppSettings: () => ({ data: state.settings }),
  useBudgetGoals: () => ({ data: state.goals }),
}));

const { SpendingPace } = await import('../SpendingPace');

// The reported October 2026 numbers: $2,624.70 fixed ($2,510.78 already paid), $133.61 a day of variable
// spending over 6 of 31 days, a $5,500 budget.
const velocity = {
  daysElapsed: 6,
  daysInMonth: 31,
  spentSoFar: 3312.46,
  projectedTotal: 6766.71,
  lastMonthTotal: 2774.24,
  dailyAverage: 133.61,
  expectedFixedCosts: 2624.7,
  recurringSpent: 2510.78,
  variableSpent: 801.68,
  remainingFixed: 113.92,
  projectedVariable: 4142.01,
  excludedOutlierAmount: 0,
};

const insightsWith = (overrides: Partial<typeof velocity> = {}) => ({
  spendingVelocity: { ...velocity, ...overrides },
  monthOverMonth: { currentMonth: { month: 10, year: 2026 } },
});

describe('SpendingPace', () => {
  beforeEach(() => {
    state.insights = insightsWith();
    state.settings = { monthly_budget_limit: '5500' };
    state.goals = [];
  });

  it('says how far over the budget the projection is', () => {
    render(<SpendingPace />);

    expect(screen.getByText('Over pace')).toBeTruthy();
    expect(screen.getByText('$1,266.71 over budget')).toBeTruthy();
  });

  it('shows where the projected total comes from', () => {
    render(<SpendingPace />);

    // Fixed is what has been paid plus what is still due; variable is the daily rate carried to month end.
    expect(screen.getByText('$2,624.70 fixed + $4,142.01 variable')).toBeTruthy();
  });

  it('says how far under the budget when the projection is comfortably inside it', () => {
    state.insights = insightsWith({ projectedTotal: 4800 });
    render(<SpendingPace />);

    expect(screen.getByText('On pace')).toBeTruthy();
    expect(screen.getByText('$700.00 under budget')).toBeTruthy();
  });

  it('compares with last month when there is no budget', () => {
    state.settings = undefined;
    state.insights = insightsWith({ projectedTotal: 3500 });
    render(<SpendingPace />);

    expect(screen.getByText('Over pace')).toBeTruthy();
    expect(screen.getByText('$725.76 over last month')).toBeTruthy();
  });
});
