import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const getPendingMock = vi.fn();
const linkMock = vi.fn();
const unlinkMock = vi.fn();
vi.mock('../../services/api', () => ({
  getPendingVenmoSettlements: () => getPendingMock(),
  linkVenmoSettlement: (venmoTransactionId: string, splitIds: string[]) => linkMock(venmoTransactionId, splitIds),
  unlinkVenmoSettlement: (venmoTransactionId: string) => unlinkMock(venmoTransactionId),
}));

const { usePendingVenmoSettlements, useLinkVenmoSettlement, useUnlinkVenmoSettlement } = await import('../useVenmoSettlements');

const setup = <T,>(useHook: () => T) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useHook(), { wrapper });
  const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => (filters as { queryKey: string[] }).queryKey[0]);
  return { result, invalidatedKeys };
};

describe('usePendingVenmoSettlements', () => {
  beforeEach(() => {
    // Braces matter: a function returned from beforeEach is run as a cleanup after each test.
    getPendingMock.mockReset();
  });

  it('loads the pending settlements list', async () => {
    const payload = [{ splitId: 's1', transactionId: 't1', description: 'Dinner', date: '2026-08-01', remainingAmount: 25 }];
    getPendingMock.mockResolvedValue(payload);
    const { result } = setup(() => usePendingVenmoSettlements());

    await waitFor(() => expect(result.current.data).toEqual(payload));
  });
});

describe('useLinkVenmoSettlement', () => {
  beforeEach(() => {
    linkMock.mockReset();
  });

  it('calls the link API and invalidates pending settlements, transactions and every type-based total', async () => {
    linkMock.mockResolvedValue(undefined);
    const { result, invalidatedKeys } = setup(() => useLinkVenmoSettlement());

    await act(async () => {
      await result.current.mutateAsync({ venmoTransactionId: 'v1', splitIds: ['s1'] });
    });

    expect(linkMock).toHaveBeenCalledWith('v1', ['s1']);
    expect(invalidatedKeys()).toEqual(
      expect.arrayContaining(['venmo-settlements', 'transactions', 'stats', 'insights', 'budget-goals']),
    );
  });
});

describe('useUnlinkVenmoSettlement', () => {
  beforeEach(() => {
    unlinkMock.mockReset();
  });

  it('calls the unlink API and invalidates pending settlements, transactions and every type-based total', async () => {
    unlinkMock.mockResolvedValue(undefined);
    const { result, invalidatedKeys } = setup(() => useUnlinkVenmoSettlement());

    await act(async () => {
      await result.current.mutateAsync('v1');
    });

    expect(unlinkMock).toHaveBeenCalledWith('v1');
    expect(invalidatedKeys()).toEqual(
      expect.arrayContaining(['venmo-settlements', 'transactions', 'stats', 'insights', 'budget-goals']),
    );
  });
});
