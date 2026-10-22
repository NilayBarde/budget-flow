import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IdleConnectionNotice } from '../IdleConnectionNotice';

const renderNotice = (overrides: Partial<Parameters<typeof IdleConnectionNotice>[0]> = {}) => {
  const props = {
    institutionName: 'Wells Fargo',
    lastActivity: '2026-02-04',
    onDisconnect: vi.fn(),
    onKeep: vi.fn(),
    ...overrides,
  };
  render(<IdleConnectionNotice {...props} />);
  return props;
};

describe('IdleConnectionNotice', () => {
  it('says which connection went quiet, since when, and that Plaid still bills it', () => {
    renderNotice();

    const text = screen.getByRole('status').textContent;
    expect(text).toContain('Wells Fargo');
    expect(text).toContain('Feb 4, 2026');
    expect(text).toMatch(/still bills/i);
  });

  it('says so when the connection never had a transaction', () => {
    renderNotice({ lastActivity: null });

    expect(screen.getByRole('status').textContent).toMatch(/no transactions yet/i);
  });

  it('warns that disconnecting stops balance updates when the connection keeps balances current', () => {
    renderNotice({ updatesBalances: true });

    expect(screen.getByRole('status').textContent).toMatch(/stops those updates/i);
  });

  it('does not mention balances for a connection that only brings in transactions', () => {
    renderNotice();

    expect(screen.getByRole('status').textContent).not.toMatch(/balances/i);
  });

  it('offers Disconnect (keeping history) and Keep', () => {
    const props = renderNotice();

    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    fireEvent.click(screen.getByRole('button', { name: /^keep$/i }));

    expect(props.onDisconnect).toHaveBeenCalledTimes(1);
    expect(props.onKeep).toHaveBeenCalledTimes(1);
  });

  it('disables the buttons while an action is running', () => {
    renderNotice({ busy: true });

    expect((screen.getByRole('button', { name: /disconnect/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /^keep$/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
