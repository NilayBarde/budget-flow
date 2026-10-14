import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PLAID_LINK_TOKEN_STORAGE_KEY } from '../../utils/constants';

type FakeSession = { access_token: string; user: { id: string; email: string } };
const sessionFor = (id: string, token = `token-${id}`): FakeSession => ({
  access_token: token,
  user: { id, email: `${id}@example.com` },
});

// A fake Supabase auth client
const auth = {
  session: null as FakeSession | null,
  listener: null as ((event: string, session: FakeSession | null) => void) | null,
  getSession: vi.fn(async () => ({ data: { session: auth.session } })),
  onAuthStateChange: vi.fn((listener: (event: string, session: FakeSession | null) => void) => {
    auth.listener = listener;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }),
  signOut: vi.fn<(options?: unknown) => Promise<{ error: null }>>(async () => ({ error: null })),
  signInWithOAuth: vi.fn<(options?: unknown) => Promise<{ data: object; error: { message: string } | null }>>(
    async () => ({ data: {}, error: null }),
  ),
};
const supabaseModule = { configured: true };
vi.mock('../../services/supabase', () => ({
  getSupabase: () => {
    if (!supabaseModule.configured) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set');
    return { auth };
  },
}));

// What AuthProvider hands the API layer
const api = {
  options: null as null | {
    getAccessToken: () => Promise<string | null>;
    onAuthFailure: (status: 401 | 403, message: string) => void;
  },
};
vi.mock('../../services/api', () => ({
  configureApiAuth: (options: NonNullable<typeof api.options>) => {
    api.options = options;
  },
}));

const { AuthProvider } = await import('../AuthProvider');
const { useAuth } = await import('../useAuth');

const Probe = () => {
  const { session, loading, notice, signInWithGoogle } = useAuth();
  return (
    <div>
      <p>{loading ? 'loading' : session ? `signed in as ${session.user.email}` : 'signed out'}</p>
      {notice && <p>notice: {notice}</p>}
      <button onClick={() => void signInWithGoogle('/transactions?month=3')}>google</button>
    </div>
  );
};

const renderProvider = () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['accounts'], [{ id: 'theirs' }]);
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return queryClient;
};

const signedInAs = async (id: string) => screen.findByText(`signed in as ${id}@example.com`);

beforeEach(() => {
  auth.session = sessionFor('me');
  auth.listener = null;
  supabaseModule.configured = true;
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AuthProvider', () => {
  it('reads the stored session, starting out as loading', async () => {
    renderProvider();

    expect(screen.getByText('loading')).toBeTruthy();
    expect(await signedInAs('me')).toBeTruthy();
  });

  it('configures the API before any page renders, with the current session\'s token', async () => {
    // Configured when the module loaded
    expect(api.options).not.toBeNull();
    renderProvider();
    await signedInAs('me');

    expect(await api.options!.getAccessToken()).toBe('token-me');

    act(() => auth.listener?.('TOKEN_REFRESHED', sessionFor('me', 'token-me-2')));
    expect(await api.options!.getAccessToken()).toBe('token-me-2');
  });

  it('signs out with the server\'s reason when the API says the account is not invited', async () => {
    localStorage.setItem(PLAID_LINK_TOKEN_STORAGE_KEY, 'link-token');
    const queryClient = renderProvider();
    await signedInAs('me');

    act(() => api.options!.onAuthFailure(403, "This Google account hasn't been invited."));

    expect(await screen.findByText("notice: This Google account hasn't been invited.")).toBeTruthy();
    expect(screen.getByText('signed out')).toBeTruthy();
    // Only this browser's session: nothing to fail over the network
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    // Nothing of this user's stays behind for the next person on the browser
    expect(queryClient.getQueryData(['accounts'])).toBeUndefined();
    expect(localStorage.getItem(PLAID_LINK_TOKEN_STORAGE_KEY)).toBeNull();
    expect(await api.options!.getAccessToken()).toBeNull();
  });

  it('signs out once, with the first reason, when many requests fail together', async () => {
    renderProvider();
    await signedInAs('me');

    act(() => {
      api.options!.onAuthFailure(401, 'Not signed in');
      api.options!.onAuthFailure(401, 'Not signed in');
      api.options!.onAuthFailure(403, "This Google account hasn't been invited.");
    });

    expect(await screen.findByText('notice: Your session ended. Sign in again.')).toBeTruthy();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("drops the previous user's data when they sign out in another tab", async () => {
    localStorage.setItem(PLAID_LINK_TOKEN_STORAGE_KEY, 'link-token');
    const queryClient = renderProvider();
    await signedInAs('me');

    act(() => auth.listener?.('SIGNED_OUT', null));

    expect(screen.getByText('signed out')).toBeTruthy();
    expect(queryClient.getQueryData(['accounts'])).toBeUndefined();
    expect(localStorage.getItem(PLAID_LINK_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('drops the previous user\'s data when someone else signs in from another tab', async () => {
    const queryClient = renderProvider();
    await signedInAs('me');

    act(() => auth.listener?.('SIGNED_IN', sessionFor('someone')));

    expect(await signedInAs('someone')).toBeTruthy();
    expect(queryClient.getQueryData(['accounts'])).toBeUndefined();
  });

  it('keeps the data through a token refresh for the same user', async () => {
    const queryClient = renderProvider();
    await signedInAs('me');

    act(() => auth.listener?.('TOKEN_REFRESHED', sessionFor('me', 'token-me-2')));

    expect(queryClient.getQueryData(['accounts'])).toEqual([{ id: 'theirs' }]);
  });

  it('signs in with Google and comes back to the page that was asked for', async () => {
    renderProvider();
    await signedInAs('me');

    act(() => screen.getByText('google').click());

    await waitFor(() =>
      expect(auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/transactions?month=3` },
      }),
    );
  });

  it('shows why Google sign-in could not start', async () => {
    auth.signInWithOAuth.mockResolvedValueOnce({ data: {}, error: { message: 'Provider is not enabled' } });
    renderProvider();
    await signedInAs('me');

    act(() => screen.getByText('google').click());

    expect(await screen.findByText('notice: Provider is not enabled')).toBeTruthy();
  });

  it('explains a missing Supabase configuration instead of showing a blank page', async () => {
    supabaseModule.configured = false;
    renderProvider();

    expect(await screen.findByText(/notice: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set/)).toBeTruthy();
    expect(screen.getByText('signed out')).toBeTruthy();
  });
});
