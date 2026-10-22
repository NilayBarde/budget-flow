import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Transaction } from '../../../types';
import { TransactionRow } from '../TransactionRow';

const baseTransaction: Transaction = {
  id: 'txn-1',
  account_id: 'acc-1',
  plaid_transaction_id: null,
  amount: 50,
  date: '2026-10-05',
  merchant_name: 'Test Merchant',
  original_description: null,
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
  created_at: '2026-10-05T00:00:00Z',
};

describe('TransactionRow', () => {
  it('shows an "Awaiting $X" badge when pendingSettlementAmount is set', () => {
    render(
      <TransactionRow
        transaction={{ ...baseTransaction, is_split: true }}
        onEdit={vi.fn()}
        onSplit={vi.fn()}
        onDelete={vi.fn()}
        pendingSettlementAmount={25}
      />,
    );
    expect(screen.getAllByText('Awaiting $25.00').length).toBeGreaterThan(0);
  });

  it('shows no settlement badge when pendingSettlementAmount is absent', () => {
    render(
      <TransactionRow
        transaction={{ ...baseTransaction, is_split: true }}
        onEdit={vi.fn()}
        onSplit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Awaiting/)).toBeNull();
  });
});
