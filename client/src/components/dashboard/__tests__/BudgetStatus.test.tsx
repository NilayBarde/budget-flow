import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BudgetGoal } from '../../../types';

const state = {
  goals: undefined as BudgetGoal[] | undefined,
  stats: undefined as { total_spent: number; by_category: unknown[] } | undefined,
  loading: false,
  settings: undefined as { monthly_budget_limit?: string } | undefined,
};

vi.mock('../../../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks')>()),
  useBudgetGoals: () => ({ data: state.goals, isLoading: state.loading }),
  useMonthlyStats: () => ({ data: state.stats }),
  useAppSettings: () => ({ data: state.settings }),
}));

const { BudgetStatus } = await import('../BudgetStatus');

const goal = (id: string, name: string, limit: number, spent: number): BudgetGoal =>
  ({ id: `g-${id}`, category_id: id, limit_amount: limit, spent, category: { id, name } }) as BudgetGoal;

const renderCard = () =>
  render(
    <MemoryRouter>
      <BudgetStatus month={10} year={2026} />
    </MemoryRouter>,
  );

describe('BudgetStatus', () => {
  beforeEach(() => {
    state.goals = undefined;
    state.stats = undefined;
    state.loading = false;
    state.settings = undefined;
  });

  it('shows a category that is over its limit, with how far over', () => {
    state.goals = [goal('dining', 'Dining', 450, 580)];
    state.stats = { total_spent: 580, by_category: [] };
    renderCard();

    expect(screen.getByText('Over budget')).toBeTruthy();
    expect(screen.getByText('Dining')).toBeTruthy();
    expect(screen.getByText('129%')).toBeTruthy();
    expect(screen.getByText(/\+\$130\.00 over/)).toBeTruthy();
  });

  it('shows a category that is close to its limit without calling it over budget', () => {
    state.goals = [goal('groc', 'Groceries', 400, 320)];
    state.stats = { total_spent: 320, by_category: [] };
    renderCard();

    expect(screen.getByText('Close to budget limit')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
    expect(screen.queryByText(/over$/)).toBeNull();
  });

  it('mentions spending outside any budgeted category', () => {
    state.goals = [goal('dining', 'Dining', 100, 150)];
    state.stats = { total_spent: 650, by_category: [{ category: { id: 'travel', name: 'Travel' }, amount: 500, count: 3 }] };
    renderCard();

    expect(screen.getByText('Unbudgeted categories')).toBeTruthy();
    expect(screen.getByText('$500.00')).toBeTruthy();
  });

  it('explains when the total is over budget but no single category is', () => {
    state.goals = [goal('a', 'Dining', 100, 60), goal('b', 'Gym', 100, 60)];
    state.stats = { total_spent: 270, by_category: [{ category: { id: 'x', name: 'Other' }, amount: 150, count: 2 }] };
    renderCard();

    expect(screen.getByText(/No single category is over its limit/)).toBeTruthy();
  });

  it('links to the Plan page to change the limits', () => {
    state.goals = [goal('dining', 'Dining', 100, 150)];
    state.stats = { total_spent: 150, by_category: [] };
    renderCard();

    expect(screen.getByRole('link', { name: /Manage/ }).getAttribute('href')).toBe('/plan');
  });

  it('renders nothing when everything is comfortably inside its limit', () => {
    state.goals = [goal('dining', 'Dining', 100, 20)];
    state.stats = { total_spent: 20, by_category: [] };
    const { container } = renderCard();

    expect(container.textContent).toBe('');
  });

  it('renders nothing while loading, even when data from a previous load is present', () => {
    state.goals = [goal('dining', 'Dining', 100, 150)];
    state.stats = { total_spent: 150, by_category: [] };
    state.loading = true;

    expect(renderCard().container.textContent).toBe('');
  });

  it('renders nothing when there are no goals', () => {
    state.goals = [];
    state.stats = { total_spent: 500, by_category: [] };

    expect(renderCard().container.textContent).toBe('');
  });

  it('calls a category exactly at its limit close, not over', () => {
    state.goals = [goal('groc', 'Groceries', 400, 400)];
    state.stats = { total_spent: 400, by_category: [] };
    renderCard();

    expect(screen.getByText('Close to budget limit')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.queryByText(/over$/)).toBeNull();
  });

  it('labels money spent against a zero limit as having no limit', () => {
    state.goals = [goal('misc', 'Misc', 0, 25)];
    state.stats = { total_spent: 25, by_category: [] };
    renderCard();

    expect(screen.getByText('No limit')).toBeTruthy();
    expect(screen.getByText(/\+\$25\.00 over/)).toBeTruthy();
  });

  it('does not say over budget when the total is under the user\'s own monthly budget', () => {
    // Category limits add up to $200 and $250 is spent, but the monthly budget set in Settings is $5,600.
    state.goals = [goal('a', 'Dining', 100, 60), goal('b', 'Gym', 100, 60)];
    state.stats = { total_spent: 250, by_category: [{ category: { id: 'x', name: 'Other' }, amount: 130, count: 1 }] };
    state.settings = { monthly_budget_limit: '5600' };
    const { container } = renderCard();

    expect(screen.queryByText('Over budget')).toBeNull();
    expect(container.textContent).not.toContain('exceeds the overall budget');
  });
});
