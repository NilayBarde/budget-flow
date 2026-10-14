import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from '../../../hooks/AuthContext';
import { UserMenu } from '../UserMenu';

const withAuth = (session: AuthContextValue['session']) => {
  const value: AuthContextValue = {
    session,
    loading: false,
    notice: null,
    signInWithGoogle: vi.fn(async () => true),
    signOut: vi.fn(async () => {}),
  };
  render(
    <AuthContext.Provider value={value}>
      <UserMenu />
    </AuthContext.Provider>,
  );
  return value;
};

const session = (metadata: Record<string, unknown> = {}) =>
  ({ user: { email: 'me@example.com', user_metadata: metadata } }) as unknown as AuthContextValue['session'];

describe('UserMenu', () => {
  it('shows who is signed in and signs them out', () => {
    const auth = withAuth(session({ full_name: 'Me Example' }));

    expect(screen.getByText('Me Example')).toBeTruthy();
    expect(screen.getByText('me@example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('renders nothing when signed out or outside the provider', () => {
    const { container } = render(<UserMenu />);
    expect(container.textContent).toBe('');

    withAuth(null);
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });
});
