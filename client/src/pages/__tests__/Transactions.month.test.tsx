import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TransactionFilters } from '../../types';

// The data hooks and the heavy child components are stubbed; what is under test is how the page
// takes its month from the shared selection and writes the month back to it.
vi.mock('../../hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks')>();
  const mutation = () => ({ mutateAsync: vi.fn() });
  return {
    ...actual,
    useTransactions: () => ({ data: [], isLoading: false, isPlaceholderData: false, isError: false, refetch: vi.fn() }),
    useAccounts: () => ({ data: [] }),
    useCategories: () => ({ data: [] }),
    useTags: () => ({ data: [] }),
    useExpectedIncome: () => ({ expectedIncome: 0 }),
    useBulkAddTagToTransactions: mutation,
    useDeleteTransaction: mutation,
    useBulkDeleteTransactions: mutation,
    usePrefetchAdjacentMonths: () => {},
  };
});

vi.mock('../../components/transactions', () => ({
  TransactionFilters: ({ filters, onFilterChange }: { filters: TransactionFilters; onFilterChange: (f: TransactionFilters) => void }) => (
    <div>
      <p>filter month {filters.month}/{filters.year}</p>
      <button onClick={() => onFilterChange({ ...filters, month: 3, year: 2025, date: undefined })}>go to march 2025</button>
    </div>
  ),
  TransactionList: () => null,
  EditTransactionModal: () => null,
  SplitTransactionModal: () => null,
  BulkSplitModal: () => null,
  BulkActionBar: () => null,
  DuplicateReviewModal: () => null,
}));

const { Transactions } = await import('../Transactions');
const { MonthProvider, useMonthNavigation } = await import('../../hooks');

const SharedMonth = () => {
  const { currentDate } = useMonthNavigation();
  return <p>shared month {currentDate.month}/{currentDate.year}</p>;
};

const visit = (path: string, shared = { month: 10, year: 2026 }) =>
  render(
    <MonthProvider initial={shared}>
      <MemoryRouter initialEntries={[path]}>
        <SharedMonth />
        <Transactions />
      </MemoryRouter>
    </MonthProvider>,
  );

describe('Transactions month', () => {
  it('opens on the month selected on the other pages', () => {
    visit('/transactions', { month: 8, year: 2025 });

    expect(screen.getByText('filter month 8/2025')).toBeTruthy();
  });

  it('updates the shared month when the month is changed on the page', async () => {
    visit('/transactions');

    fireEvent.click(screen.getByText('go to march 2025'));

    expect(await screen.findByText('shared month 3/2025')).toBeTruthy();
    expect(screen.getByText('filter month 3/2025')).toBeTruthy();
  });

  it('opens a ?date= link on that date\'s month and makes it the shared month', async () => {
    visit('/transactions?date=2025-02-07');

    expect(screen.getByText('filter month 2/2025')).toBeTruthy();
    expect(await screen.findByText('shared month 2/2025')).toBeTruthy();
  });

  it('opens a ?month=&year= link on that month and makes it the shared month', async () => {
    visit('/transactions?month=6&year=2024');

    expect(screen.getByText('filter month 6/2024')).toBeTruthy();
    expect(await screen.findByText('shared month 6/2024')).toBeTruthy();
  });
});
