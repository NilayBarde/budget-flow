import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Every page is replaced by a stub that names itself. The layout, the section tabs, the nesting and the
// redirects are the real ones from App, which is what is under test.
vi.mock('../pages/Dashboard', () => ({ Dashboard: () => <p>dashboard page</p> }));
vi.mock('../pages/Transactions', () => ({ Transactions: () => <p>transactions page</p> }));
vi.mock('../pages/FinancialPlan', () => ({ FinancialPlan: () => <p>plan page</p> }));
vi.mock('../pages/NetWorthPage', () => ({ NetWorthPage: () => <p>net worth page</p> }));
vi.mock('../pages/Investments', () => ({ Investments: () => <p>investments page</p> }));
vi.mock('../pages/Insights', () => ({ Insights: () => <p>insights page</p> }));
vi.mock('../pages/YearOverview', () => ({ YearOverview: () => <p>year overview page</p> }));
vi.mock('../pages/Accounts', () => ({ Accounts: () => <p>accounts page</p> }));
vi.mock('../pages/Settings', () => ({ Settings: () => <p>settings page</p> }));
vi.mock('../pages/Tags', () => ({ Tags: () => <p>tags page</p> }));
vi.mock('../pages/OAuthCallback', () => ({ OAuthCallback: () => <p>oauth page</p> }));
vi.mock('../pages/Login', () => ({ Login: () => <p>login page</p> }));

const { AppRoutes } = await import('../App');
const { AuthContext } = await import('../hooks/AuthContext');
type AuthValue = NonNullable<React.ContextType<typeof AuthContext>>;

const signedIn = { user: { email: 'me@example.com', user_metadata: {} } } as unknown as AuthValue['session'];
const authValue = (session: AuthValue['session'], loading = false): AuthValue => ({
  session,
  loading,
  notice: null,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

const visit = (path: string, session: AuthValue['session'] = signedIn, loading = false) =>
  render(
    <AuthContext.Provider value={authValue(session, loading)}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>,
  );

describe('AppRoutes', () => {
  it.each([
    ['/net-worth', 'net worth page'],
    ['/net-worth/investments', 'investments page'],
    ['/insights', 'insights page'],
    ['/insights/year', 'year overview page'],
    ['/settings', 'settings page'],
    ['/settings/tags', 'tags page'],
    ['/', 'dashboard page'],
    ['/transactions', 'transactions page'],
    ['/plan', 'plan page'],
    ['/accounts', 'accounts page'],
  ])('shows the right page at %s', async (path, text) => {
    visit(path);

    expect(await screen.findByText(text)).toBeTruthy();
  });

  it.each([
    ['/investments', 'investments page'],
    ['/year', 'year overview page'],
    ['/tags', 'tags page'],
  ])('keeps the old address %s working', async (path, text) => {
    visit(path);

    expect(await screen.findByText(text)).toBeTruthy();
  });

  it('puts the section tabs above a section page, inside the app layout', async () => {
    visit('/net-worth/investments');

    await screen.findByText('investments page');
    expect(screen.getByRole('navigation', { name: 'Net worth sections' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Investments', hidden: false })).toBeTruthy();
    // The layout is still around the page: the main navigation is there.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
  });

  it('does not add a tab bar to pages that are not part of a section', async () => {
    visit('/accounts');

    await screen.findByText('accounts page');
    expect(screen.queryByRole('navigation', { name: /sections/ })).toBeNull();
  });

  it('shows the section\'s own page, not a sub page, at the section address', async () => {
    visit('/insights');

    await screen.findByText('insights page');
    expect(screen.queryByText('year overview page')).toBeNull();
  });

  it('renders the OAuth callback outside the app layout', async () => {
    visit('/oauth-callback');

    await screen.findByText('oauth page');
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
  });

  it.each(['/', '/transactions', '/settings/tags', '/oauth-callback'])('sends a signed-out visitor at %s to the login page', async path => {
    visit(path, null);

    expect(await screen.findByText('login page')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
  });

  it('waits for the stored session before deciding, instead of flashing the login page', async () => {
    visit('/', null, true);

    expect(screen.queryByText('login page')).toBeNull();
    expect(screen.queryByText('dashboard page')).toBeNull();
  });

  it('shows the login page itself without signing in', async () => {
    visit('/login', null);

    expect(await screen.findByText('login page')).toBeTruthy();
  });
});
