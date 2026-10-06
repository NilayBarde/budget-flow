import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const syncAccountMock = vi.fn();
vi.mock('../../services/api', () => ({ syncAccount: (id: string) => syncAccountMock(id) }));

const { useSyncAccount } = await import('../useAccounts');

const setup = () => {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useSyncAccount(), { wrapper });
  const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => (filters as { queryKey: string[] }).queryKey[0]);
  return { result, invalidatedKeys };
};

describe('useSyncAccount', () => {
  beforeEach(() => {
    // Braces matter: a function returned from beforeEach is run as a cleanup after each test.
    syncAccountMock.mockReset();
  });

  it('refreshes transactions, stats, accounts and the sync banner after a successful sync', async () => {
    syncAccountMock.mockResolvedValue({ added: 1 });
    const { result, invalidatedKeys } = setup();

    await act(async () => {
      await result.current.mutateAsync('acct-1');
    });

    expect(invalidatedKeys()).toEqual(expect.arrayContaining(['accounts', 'transactions', 'stats', 'sync-health']));
  });

  it('still refreshes the sync banner and the accounts when the sync fails, because the server flags the account', async () => {
    // A 409 means the login expired and the server has just set needs_reauth on the account.
    syncAccountMock.mockImplementation(() => Promise.reject(new Error('This connection needs to be reconnected')));
    const { result, invalidatedKeys } = setup();

    act(() => result.current.mutate('acct-1'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidatedKeys()).toEqual(expect.arrayContaining(['sync-health', 'accounts']));
  });

  it('does not refresh transactions or stats after a failed sync, since nothing changed', async () => {
    syncAccountMock.mockImplementation(() => Promise.reject(new Error('Failed to sync account')));
    const { result, invalidatedKeys } = setup();

    act(() => result.current.mutate('acct-1'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidatedKeys()).not.toContain('transactions');
    expect(invalidatedKeys()).not.toContain('stats');
  });
});
