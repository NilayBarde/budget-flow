import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PLAID_LINK_TOKEN_STORAGE_KEY } from '../../utils/constants';

// A fake Supabase auth client
const auth = {
  session: null as { access_token: string; user: { email: string } } | null,
  listener: null as ((event: string, session: unknown) => void) | null,
  getSession: vi.fn(async () => ({ data: { session: auth.session } })),
  onAuthStateChange: vi.fn((listener: (event: string, session: unknown) => void) => {
    auth.listener = listener;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }),
  signOut: vi.fn(async () => ({ error: null })),
  signInWithOAuth: vi.fn(async () => ({ data: {}, error: null as { message: string } | null })),
};
vi.mock('../../services/supabase', () => ({ getSupabase: () => ({ auth }) }));

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
      <button onClick={() => void signInWithGoogle()}>google</button>
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

beforeEach(() => {
  auth.session = { access_token: 'token-1', user: { email: 'me@example.com' } };
  auth.listener = null;
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AuthProvider', () => {
  it('reads the stored session, starting out as loading', async () => {
    renderProvider();

    expect(screen.getByText('loading')).toBeTruthy();
    expect(await screen.findByText('signed in as me@example.com')).toBeTruthy();
  });

  it('follows Supabase as the session changes', async () => {
    renderProvider();
    await screen.findByText('signed in as me@example.com');

    act(() => auth.listener?.('SIGNED_OUT', null));

    expect(screen.getByText('signed out')).toBeTruthy();
  });

  it('gives the API the current access token, set up before any page renders', async () => {
    // Configured when the module loaded, before any render
    expect(api.options).not.toBeNull();
    renderProvider();

    expect(await api.options!.getAccessToken()).toBe('token-1');
  });

  it('signs out with the server\'s reason when the API says the account is not invited', async () => {
    localStorage.setItem(PLAID_LINK_TOKEN_STORAGE_KEY, 'link-token');
    const queryClient = renderProvider();
    await screen.findByText('signed in as me@example.com');

    act(() => api.options!.onAuthFailure(403, "This Google account hasn't been invited."));

    expect(await screen.findByText("notice: This Google account hasn't been invited.")).toBeTruthy();
    expect(screen.getByText('signed out')).toBeTruthy();
    expect(auth.signOut).toHaveBeenCalled();
    // Nothing of this user's stays behind for the next person on the browser
    expect(queryClient.getQueryData(['accounts'])).toBeUndefined();
    expect(localStorage.getItem(PLAID_LINK_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('signs out and asks to sign in again when the API rejects the token', async () => {
    renderProvider();
    await screen.findByText('signed in as me@example.com');

    act(() => api.options!.onAuthFailure(401, 'Not signed in'));

    expect(await screen.findByText('notice: Your session ended. Sign in again.')).toBeTruthy();
  });

  it('signs in with Google and comes back to this site', async () => {
    renderProvider();
    await screen.findByText('signed in as me@example.com');

    act(() => screen.getByText('google').click());

    await waitFor(() =>
      expect(auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      }),
    );
  });

  it('shows why Google sign-in could not start', async () => {
    auth.signInWithOAuth.mockResolvedValueOnce({ data: {}, error: { message: 'Provider is not enabled' } });
    renderProvider();
    await screen.findByText('signed in as me@example.com');

    act(() => screen.getByText('google').click());

    expect(await screen.findByText('notice: Provider is not enabled')).toBeTruthy();
  });
});
