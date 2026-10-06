import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SyncErrorNotice } from '../SyncErrorNotice';

describe('SyncErrorNotice', () => {
  it('shows the reason the last sync failed', () => {
    render(<SyncErrorNotice message="Failed to save 1 transaction(s). The sync cursor was not advanced." />);

    // role=status for the same reason as ReconnectNotice: on screen at page load, once per card.
    const notice = screen.getByRole('status');
    expect(notice.textContent).toContain('last sync failed');
    expect(notice.textContent).toContain('Failed to save 1 transaction(s)');
  });

  it('says when it happened, if known', () => {
    render(<SyncErrorNotice message="boom" failedAt="2020-01-01T00:00:00Z" />);

    expect(screen.getByRole('status').textContent).toMatch(/years? ago|days? ago|today/);
  });

  it('renders the message as plain text, never as markup', () => {
    render(<SyncErrorNotice message="<img src=x onerror=alert(1)>" />);

    expect(screen.getByRole('status').querySelector('img')).toBeNull();
  });
});
