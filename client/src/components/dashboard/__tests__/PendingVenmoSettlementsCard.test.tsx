import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PendingVenmoSettlement } from '../../../types';

const state = {
  settlements: [] as PendingVenmoSettlement[],
  isLoading: false,
  isError: false,
};

vi.mock('../../../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks')>()),
  usePendingVenmoSettlements: () => ({
    data: state.settlements,
    isLoading: state.isLoading,
    isError: state.isError,
  }),
}));

const { PendingVenmoSettlementsCard } = await import('../PendingVenmoSettlementsCard');

describe('PendingVenmoSettlementsCard', () => {
  beforeEach(() => {
    state.settlements = [];
    state.isLoading = false;
    state.isError = false;
  });

  it('shows "No pending settlements" when the list is empty', () => {
    render(<PendingVenmoSettlementsCard />);

    expect(screen.getByText('No pending settlements')).toBeTruthy();
  });

  it('lists an unsettled split with its description and remaining amount', () => {
    state.settlements = [
      { splitId: 's1', transactionId: 't1', description: 'Dinner at Mia', date: '2026-08-01', remainingAmount: 25 },
    ];

    render(<PendingVenmoSettlementsCard />);

    expect(screen.getByText('Dinner at Mia')).toBeTruthy();
    expect(screen.getByText('$25.00')).toBeTruthy();
  });

  it('shows a loading spinner while fetching', () => {
    state.isLoading = true;

    render(<PendingVenmoSettlementsCard />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
  });

  it('shows an error message when the fetch fails', () => {
    state.isError = true;

    render(<PendingVenmoSettlementsCard />);

    expect(screen.getByText('Could not load pending settlements.')).toBeTruthy();
  });
});
