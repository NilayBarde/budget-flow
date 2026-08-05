import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from '../ErrorState';

describe('ErrorState', () => {
  it('renders the default title', () => {
    render(<ErrorState />);
    expect(screen.getByText("Couldn't load data")).toBeTruthy();
  });

  it('renders a custom title and description', () => {
    render(<ErrorState title="Transactions unavailable" description="Totals may be incomplete." />);
    expect(screen.getByText('Transactions unavailable')).toBeTruthy();
    expect(screen.getByText('Totals may be incomplete.')).toBeTruthy();
  });

  it('shows the retry button only when onRetry is provided', () => {
    const { rerender } = render(<ErrorState />);
    expect(screen.queryByText('Try again')).toBeNull();

    rerender(<ErrorState onRetry={() => {}} />);
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('fires onRetry when the button is clicked', () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
