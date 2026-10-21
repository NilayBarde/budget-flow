import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Every mutation that adds, removes or changes splits or transactions can change which splits are
// still awaiting a Venmo settlement, so each must refresh the pending-settlements list. Otherwise
// the dashboard card and the "Awaiting $X" badge keep showing what the server no longer says.
const apiMock = {
  updateTransaction: vi.fn(async () => ({})),
  deleteTransaction: vi.fn(async () => undefined),
  createSplit: vi.fn(async () => []),
  deleteSplits: vi.fn(async () => undefined),
  bulkDeleteTransactions: vi.fn(async () => ({})),
  bulkSplitTransactions: vi.fn(async () => ({})),
};
vi.mock('../../services/api', () => apiMock);

const { useUpdateTransaction, useDeleteTransaction, useCreateSplit, useDeleteSplits, useBulkDeleteTransactions } =
  await import('../useTransactions');
const { useBulkSplitTransactions } = await import('../useTags');

const invalidatedKeysAfter = async <V,>(useHook: () => { mutateAsync: (vars: V) => Promise<unknown> }, vars: V) => {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useHook(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync(vars);
  });
  return invalidate.mock.calls.map(([filters]) => (filters as { queryKey: string[] }).queryKey[0]);
};

describe('mutations that can change settlement state refresh the pending Venmo settlements', () => {
  it('creating a split', async () => {
    const keys = await invalidatedKeysAfter(useCreateSplit, {
      transactionId: 't1',
      splits: [{ amount: 25, description: 'Alex', is_my_share: false }],
    });
    expect(keys).toContain('venmo-settlements');
  });

  it('removing all splits', async () => {
    expect(await invalidatedKeysAfter(useDeleteSplits, 't1')).toContain('venmo-settlements');
  });

  it('splitting transactions in bulk', async () => {
    expect(await invalidatedKeysAfter(useBulkSplitTransactions, { transactionIds: ['t1', 't2'], numPeople: 2 })).toContain(
      'venmo-settlements',
    );
  });

  it('deleting a transaction', async () => {
    expect(await invalidatedKeysAfter(useDeleteTransaction, 't1')).toContain('venmo-settlements');
  });

  it('deleting transactions in bulk', async () => {
    expect(await invalidatedKeysAfter(useBulkDeleteTransactions, ['t1', 't2'])).toContain('venmo-settlements');
  });

  it('editing a transaction (its date and name are shown in the pending list)', async () => {
    expect(await invalidatedKeysAfter(useUpdateTransaction, { id: 't1', data: { merchant_display_name: 'Dinner' } })).toContain(
      'venmo-settlements',
    );
  });
});
