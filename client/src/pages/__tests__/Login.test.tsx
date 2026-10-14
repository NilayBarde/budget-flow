import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '../../hooks/AuthContext';
import { Login } from '../Login';

const renderLogin = (auth: Partial<AuthContextValue>, from?: string) => {
  const value: AuthContextValue = {
    session: null,
    loading: false,
    notice: null,
    signInWithGoogle: vi.fn(async () => true),
    signOut: vi.fn(async () => {}),
    ...auth,
  };
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[{ pathname: '/login', state: from ? { from } : null }]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<p>home</p>} />
          <Route path="/transactions" element={<p>transactions</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return value;
};

const signedIn = { user: { email: 'me@example.com' } } as unknown as AuthContextValue['session'];

describe('Login', () => {
  it('starts Google sign-in, returning to the page that was asked for', () => {
    const auth = renderLogin({}, '/transactions');

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(auth.signInWithGoogle).toHaveBeenCalledWith('/transactions');
  });

  it('lets the button be used again when sign-in could not start', async () => {
    renderLogin({ signInWithGoogle: vi.fn(async () => false) });
    const button = screen.getByRole('button', { name: /continue with google/i }) as HTMLButtonElement;

    fireEvent.click(button);

    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it('says why the last session ended', () => {
    renderLogin({ notice: "This Google account hasn't been invited." });

    expect(screen.getByRole('alert').textContent).toBe("This Google account hasn't been invited.");
  });

  it('sends a signed-in visitor back where they were going', () => {
    renderLogin({ session: signedIn }, '/transactions');

    expect(screen.getByText('transactions')).toBeTruthy();
  });

  it('only returns to paths on this site', () => {
    renderLogin({ session: signedIn }, '//evil.example.com');

    expect(screen.getByText('home')).toBeTruthy();
  });
});
