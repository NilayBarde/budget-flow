import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Transaction } from '../../../types';

const state = {
  transactions: [] as Partial<Transaction>[],
  mutate: vi.fn(),
  isPending: false,
  isLoading: false,
  isPlaceholderData: false,
  isError: false,
};

vi.mock('../../../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks')>()),
  useTransactions: () => ({
    data: state.transactions,
    isLoading: state.isLoading,
    isPlaceholderData: state.isPlaceholderData,
    isError: state.isError,
  }),
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
    state.isLoading = false;
    state.isPlaceholderData = false;
    state.isError = false;
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
    expect(state.mutate).toHaveBeenCalledWith(
      { id: 'rent', data: { split_dismissed: true } },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('tells the user when the change could not be saved, instead of doing nothing', () => {
    render(<LargeUnsplitTransactions month={10} year={2026} />);

    fireEvent.click(screen.getByRole('button', { name: "Don't split Bilt Housing Payment" }));
    const [, options] = state.mutate.mock.calls[0] as [unknown, { onError: (error: Error) => void }];
    act(() => options.onError(new Error('Failed to update transaction')));

    expect(screen.getByRole('alert').textContent).toContain('Could not save');
  });

  it('clears that message on the next attempt', () => {
    render(<LargeUnsplitTransactions month={10} year={2026} />);

    fireEvent.click(screen.getByRole('button', { name: "Don't split Bilt Housing Payment" }));
    const [, options] = state.mutate.mock.calls[0] as [unknown, { onError: (error: Error) => void }];
    act(() => options.onError(new Error('boom')));
    fireEvent.click(screen.getByRole('button', { name: "Don't split Cos" }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not list a transaction already marked as not to be split', () => {
    state.transactions = [{ ...rent, split_dismissed: true }, cos];
    render(<LargeUnsplitTransactions month={10} year={2026} />);

    expect(screen.queryByText('Bilt Housing Payment')).toBeNull();
    expect(screen.getByText('Cos')).toBeTruthy();
  });

  it('keeps the card and says there is nothing to review once every row is dismissed', () => {
    state.transactions = [{ ...rent, split_dismissed: true }, { ...cos, split_dismissed: true }];
    render(<LargeUnsplitTransactions month={10} year={2026} />);

    expect(screen.getByText('Possible missed splits')).toBeTruthy();
    expect(screen.getByText('No possible splits')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Split' })).toBeNull();
  });

  it('keeps the card for a month with no large expenses at all', () => {
    state.transactions = [{ id: 'coffee', amount: 4.5, date: '2026-10-02', merchant_name: 'Coffee', is_split: false }];
    render(<LargeUnsplitTransactions month={10} year={2026} />);

    expect(screen.getByText('Possible missed splits')).toBeTruthy();
    expect(screen.getByText('No possible splits')).toBeTruthy();
  });

  it('does not say there is nothing to review while the transactions are still loading', () => {
    state.transactions = [];
    state.isLoading = true;
    render(<LargeUnsplitTransactions month={10} year={2026} />);

    expect(screen.getByText('Possible missed splits')).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
    expect(screen.queryByText('No possible splits')).toBeNull();
  });

  it('shows the spinner, not the previous month, while a new month loads behind the old data', () => {
    // The query keeps the last month's rows on screen while the next month fetches. Acting on those rows
    // would split or dismiss a transaction from another month.
    state.transactions = [rent, cos];
    state.isPlaceholderData = true;
    render(<LargeUnsplitTransactions month={11} year={2026} />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
    expect(screen.queryByText('Bilt Housing Payment')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Split' })).toBeNull();
  });

  it('does not claim there is nothing to review while the new month loads behind an empty old one', () => {
    state.transactions = [];
    state.isPlaceholderData = true;
    render(<LargeUnsplitTransactions month={11} year={2026} />);

    expect(screen.queryByText('No possible splits')).toBeNull();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
  });

  it('does not say there is nothing to review when the transactions failed to load', () => {
    state.transactions = [];
    state.isError = true;
    render(<LargeUnsplitTransactions month={10} year={2026} />);

    expect(screen.queryByText('No possible splits')).toBeNull();
    expect(screen.getByText(/Could not load/)).toBeTruthy();
  });

  it('does not show the empty message when there are rows to review', () => {
    render(<LargeUnsplitTransactions month={10} year={2026} />);

    expect(screen.queryByText('No possible splits')).toBeNull();
  });

  it('disables the buttons while a change is being saved so it cannot be sent twice', () => {
    state.isPending = true;
    render(<LargeUnsplitTransactions month={10} year={2026} />);

    const button = screen.getByRole('button', { name: "Don't split Bilt Housing Payment" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
