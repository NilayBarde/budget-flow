import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Transaction } from '../../../types';

const state = {
  createMutate: vi.fn(),
  deleteMutate: vi.fn(),
  addPersonMutate: vi.fn(),
  renameMutate: vi.fn(),
  createPending: false,
  addPersonPending: false,
  renamePending: false,
};

vi.mock('../../../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks')>()),
  useCreateSplit: () => ({ mutateAsync: state.createMutate, isPending: state.createPending }),
  useDeleteSplits: () => ({ mutateAsync: state.deleteMutate, isPending: false }),
  useAddSplitPerson: () => ({ mutateAsync: state.addPersonMutate, isPending: state.addPersonPending }),
  useRenameSplit: () => ({ mutateAsync: state.renameMutate, isPending: state.renamePending }),
}));

const { SplitTransactionModal } = await import('../SplitTransactionModal');

const unsplitTransaction: Transaction = {
  id: 'txn-1',
  account_id: 'acct-1',
  plaid_transaction_id: null,
  amount: 45.71,
  date: '2026-10-13',
  merchant_name: 'Amazon',
  original_description: 'Amazon',
  merchant_display_name: null,
  category_id: null,
  transaction_type: 'expense',
  is_split: false,
  parent_transaction_id: null,
  is_recurring: false,
  needs_review: false,
  pending: false,
  plaid_category: null,
  notes: null,
  created_at: '2026-10-13T00:00:00Z',
};

const splitTransaction: Transaction = {
  ...unsplitTransaction,
  id: 'txn-2',
  is_split: true,
  splits: [
    { id: 's1', parent_transaction_id: 'txn-2', amount: 9.71, description: 'Your portion', is_my_share: true, created_at: '' },
    { id: 's2', parent_transaction_id: 'txn-2', amount: 18, description: 'Matt', is_my_share: false, created_at: '' },
    { id: 's3', parent_transaction_id: 'txn-2', amount: 18, description: 'Griffin', is_my_share: false, created_at: '' },
  ],
};

describe('SplitTransactionModal — new split with multiple named people', () => {
  beforeEach(() => {
    state.createMutate = vi.fn().mockResolvedValue(undefined);
    state.deleteMutate = vi.fn().mockResolvedValue(undefined);
    state.addPersonMutate = vi.fn().mockResolvedValue(undefined);
    state.createPending = false;
    state.addPersonPending = false;
  });

  it('saves one split per named person plus your own portion', async () => {
    render(<SplitTransactionModal isOpen onClose={vi.fn()} transaction={unsplitTransaction} />);

    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '9.71' } });
    fireEvent.click(screen.getByText('Add another person'));

    const nameInputs = screen.getAllByPlaceholderText('Name (optional)');
    const amountInputs = screen.getAllByPlaceholderText('0.00');
    // amountInputs[0] is "Your portion" (already set); the rest belong to the two person rows.
    fireEvent.change(nameInputs[0], { target: { value: 'Matt' } });
    fireEvent.change(amountInputs[1], { target: { value: '18' } });
    fireEvent.change(nameInputs[1], { target: { value: 'Griffin' } });
    fireEvent.change(amountInputs[2], { target: { value: '18' } });

    fireEvent.click(screen.getByText('Save Split'));

    await waitFor(() => {
      expect(state.createMutate).toHaveBeenCalledWith({
        transactionId: 'txn-1',
        splits: [
          { amount: 9.71, description: 'Your portion', is_my_share: true },
          { amount: 18, description: 'Matt', is_my_share: false },
          { amount: 18, description: 'Griffin', is_my_share: false },
        ],
      });
    });
  });

  it('disables Save and shows a mismatch message when portions do not add up', () => {
    render(<SplitTransactionModal isOpen onClose={vi.fn()} transaction={unsplitTransaction} />);

    const amountInputs = screen.getAllByPlaceholderText('0.00');
    fireEvent.change(amountInputs[0], { target: { value: '9.71' } });
    fireEvent.change(amountInputs[1], { target: { value: '10' } });

    expect(screen.getByText(/Portions add up to/i)).toBeTruthy();
    expect(screen.getByText('Save Split').closest('button')).toHaveProperty('disabled', true);
    expect(state.createMutate).not.toHaveBeenCalled();
  });

  it('splitting evenly between N fills your portion and N-1 person rows', () => {
    render(<SplitTransactionModal isOpen onClose={vi.fn()} transaction={unsplitTransaction} />);

    fireEvent.change(screen.getByPlaceholderText('2'), { target: { value: '3' } });

    // 45.71 / 3 = 15.236..., rounds to 15.24 per person; drift goes to "your portion".
    const amountInputs = screen.getAllByPlaceholderText('0.00');
    expect(amountInputs).toHaveLength(3); // your portion + 2 other people
    expect((amountInputs[1] as HTMLInputElement).value).toBe('15.24');
    expect((amountInputs[2] as HTMLInputElement).value).toBe('15.24');
    const myPortion = parseFloat((amountInputs[0] as HTMLInputElement).value);
    const total = myPortion + 15.24 + 15.24;
    expect(Math.abs(total - 45.71)).toBeLessThanOrEqual(0.01);
  });
});

describe('SplitTransactionModal — adding a person to an already-split transaction', () => {
  beforeEach(() => {
    state.createMutate = vi.fn().mockResolvedValue(undefined);
    state.deleteMutate = vi.fn().mockResolvedValue(undefined);
    state.addPersonMutate = vi.fn().mockResolvedValue(undefined);
    state.createPending = false;
    state.addPersonPending = false;
  });

  it('calls addSplitPerson with the entered name and amount', async () => {
    render(<SplitTransactionModal isOpen onClose={vi.fn()} transaction={splitTransaction} />);

    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Eli' } });
    const amountInput = screen.getAllByPlaceholderText('0.00').find(el => el.closest('.space-y-2'))!;
    fireEvent.change(amountInput, { target: { value: '5' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => {
      expect(state.addPersonMutate).toHaveBeenCalledWith({ transactionId: 'txn-2', name: 'Eli', amount: 5 });
    });
  });

  it('shows the server error message when adding a person fails', async () => {
    state.addPersonMutate = vi.fn().mockRejectedValue(new Error("Amount exceeds what's left of your portion"));
    render(<SplitTransactionModal isOpen onClose={vi.fn()} transaction={splitTransaction} />);

    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Eli' } });
    const amountInput = screen.getAllByPlaceholderText('0.00').find(el => el.closest('.space-y-2'))!;
    fireEvent.change(amountInput, { target: { value: '50' } });
    fireEvent.click(screen.getByText('Add'));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', "Amount exceeds what's left of your portion");
  });
});

describe('SplitTransactionModal — renaming an existing split', () => {
  beforeEach(() => {
    state.createMutate = vi.fn().mockResolvedValue(undefined);
    state.deleteMutate = vi.fn().mockResolvedValue(undefined);
    state.addPersonMutate = vi.fn().mockResolvedValue(undefined);
    state.renameMutate = vi.fn().mockResolvedValue(undefined);
    state.createPending = false;
    state.addPersonPending = false;
    state.renamePending = false;
  });

  it('saves a new name for a split when the checkmark is clicked', async () => {
    render(<SplitTransactionModal isOpen onClose={vi.fn()} transaction={splitTransaction} />);

    fireEvent.click(screen.getByLabelText('Rename Matt'));
    const nameInput = screen.getByDisplayValue('Matt');
    fireEvent.change(nameInput, { target: { value: 'Matthew' } });
    fireEvent.click(screen.getByLabelText('Save name'));

    await waitFor(() => {
      expect(state.renameMutate).toHaveBeenCalledWith({ transactionId: 'txn-2', splitId: 's2', description: 'Matthew' });
    });
  });

  it('discards the edit when cancelled, without calling renameSplit', () => {
    render(<SplitTransactionModal isOpen onClose={vi.fn()} transaction={splitTransaction} />);

    fireEvent.click(screen.getByLabelText('Rename Griffin'));
    fireEvent.change(screen.getByDisplayValue('Griffin'), { target: { value: 'Someone else entirely' } });
    fireEvent.click(screen.getByLabelText('Cancel renaming'));

    expect(screen.getByText('Griffin')).toBeTruthy();
    expect(state.renameMutate).not.toHaveBeenCalled();
  });

  it('shows the server error message when renaming fails', async () => {
    state.renameMutate = vi.fn().mockRejectedValue(new Error('Split not found'));
    render(<SplitTransactionModal isOpen onClose={vi.fn()} transaction={splitTransaction} />);

    fireEvent.click(screen.getByLabelText('Rename Matt'));
    fireEvent.click(screen.getByLabelText('Save name'));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Split not found');
  });

  it('does not offer renaming for your own share', () => {
    render(<SplitTransactionModal isOpen onClose={vi.fn()} transaction={splitTransaction} />);

    expect(screen.queryByLabelText('Rename Your portion')).toBeNull();
  });
});
