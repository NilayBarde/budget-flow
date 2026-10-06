import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Transaction } from '../../../types';

const state = {
  transactions: [] as Partial<Transaction>[],
  mutate: vi.fn(),
  isPending: false,
};

vi.mock('../../../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks')>()),
  useTransactions: () => ({ data: state.transactions }),
  useUpdateTransaction: () => ({ mutate: state.mutate, isPending: state.isPending }),
}));
// The modal pulls in its own data hooks; it is closed here and not under test.
vi.mock('../../transactions/SplitTransactionModal', () => ({ SplitTransactionModal: () => null }));

const { LargeUnsplitTransactions } = await import('../LargeUnsplitTransactions');

const rent = { id: 'rent', amount: 2497.49, date: '2026-10-05', merchant_name: 'Bilt Housing Payment', is_split: false };
const cos = { id: 'cos', amount: 186.5, date: '2026-10-03', merchant_name: 'Cos', is_split: false };

describe('LargeUnsplitTransactions', () => {
  beforeEach(() => {
    state.transactions = [rent, cos];
    state.mutate = vi.fn();
    state.isPending = false;
  });

  it('lists the large unsplit expenses with a way to split or keep each whole', () => {
    render(<LargeUnsplitTransactions month={10} year={2026} />);

    expect(screen.getByText('Bilt Housing Payment')).toBeTruthy();
    expect(screen.getByText('Cos')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Split' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: "Don't split Bilt Housing Payment" })).toBeTruthy();
  });

  it('marks only the chosen transaction as not to be split', () => {
    render(<LargeUnsplitTransactions month={10} year={2026} />);

    fireEvent.click(screen.getByRole('button', { name: "Don't split Bilt Housing Payment" }));

    expect(state.mutate).toHaveBeenCalledTimes(1);
    expect(state.mutate).toHaveBeenCalledWith({ id: 'rent', data: { split_dismissed: true } });
  });

  it('does not list a transaction already marked as not to be split', () => {
    state.transactions = [{ ...rent, split_dismissed: true }, cos];
    render(<LargeUnsplitTransactions month={10} year={2026} />);

    expect(screen.queryByText('Bilt Housing Payment')).toBeNull();
    expect(screen.getByText('Cos')).toBeTruthy();
  });

  it('hides the whole card once every row is dismissed', () => {
    state.transactions = [{ ...rent, split_dismissed: true }, { ...cos, split_dismissed: true }];
    const { container } = render(<LargeUnsplitTransactions month={10} year={2026} />);

    expect(container.textContent).toBe('');
  });

  it('disables the buttons while a change is being saved so it cannot be sent twice', () => {
    state.isPending = true;
    render(<LargeUnsplitTransactions month={10} year={2026} />);

    const button = screen.getByRole('button', { name: "Don't split Bilt Housing Payment" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
