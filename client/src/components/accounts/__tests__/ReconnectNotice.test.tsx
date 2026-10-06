import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReconnectNotice } from '../ReconnectNotice';

describe('ReconnectNotice', () => {
  it('tells the user the bank login expired and offers a Reconnect button', () => {
    render(<ReconnectNotice onReconnect={() => {}} />);

    expect(screen.getByRole('alert').textContent).toContain('login expired');
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy();
  });

  it('starts the reconnect flow when the button is clicked', () => {
    const onReconnect = vi.fn();
    render(<ReconnectNotice onReconnect={onReconnect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('disables the button while the reconnect link is being prepared so it cannot be started twice', () => {
    const onReconnect = vi.fn();
    render(<ReconnectNotice onReconnect={onReconnect} isLoading />);

    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onReconnect).not.toHaveBeenCalled();
  });
});
