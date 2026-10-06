import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import type { MerchantRule } from '../../../types';

const state = {
  rules: [] as MerchantRule[],
  isLoading: false,
  isError: false,
  categories: [
    { id: 'cat-transport', name: 'Transportation' },
    { id: 'cat-dining', name: 'Dining' },
  ],
  mutate: vi.fn(),
  isPending: false,
};

vi.mock('../../../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks')>()),
  useMerchantRules: () => ({ data: state.rules, isLoading: state.isLoading, isError: state.isError }),
  useCategories: () => ({ data: state.categories }),
  useDeleteMerchantRule: () => ({ mutate: state.mutate, isPending: state.isPending }),
}));

const { MerchantRules } = await import('../MerchantRules');

const rule = (overrides: Partial<MerchantRule> = {}): MerchantRule => ({
  id: 'r1',
  original_name: 'Uber',
  display_name: 'Uber',
  default_category_id: 'cat-transport',
  default_transaction_type: null,
  ...overrides,
});

describe('MerchantRules', () => {
  beforeEach(() => {
    state.rules = [
      rule({ id: 'a', original_name: 'Uber', default_category_id: 'cat-transport' }),
      rule({ id: 'b', original_name: 'Uber Eats', display_name: 'Uber Eats', default_category_id: 'cat-dining', default_transaction_type: 'expense' }),
      rule({ id: 'c', original_name: 'AMZN Mktp US', display_name: 'Amazon', default_category_id: null }),
    ];
    state.isLoading = false;
    state.isError = false;
    state.mutate = vi.fn();
    state.isPending = false;
  });

  it('lists each rule with what it decides', () => {
    render(<MerchantRules />);

    const uberEats = screen.getByRole('listitem', { name: 'Uber Eats' });
    expect(within(uberEats).getByText('Dining')).toBeTruthy();
    expect(within(uberEats).getByText('Expense')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('shows the name a rule gives a merchant, and says when a rule only renames it', () => {
    render(<MerchantRules />);

    const amazon = screen.getByRole('listitem', { name: 'AMZN Mktp US' });
    expect(within(amazon).getByText(/Amazon/)).toBeTruthy();
    expect(within(amazon).getByText('Only renames')).toBeTruthy();
  });

  it('filters as you type, by merchant, shown name or category', () => {
    render(<MerchantRules />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search rules' }), { target: { value: 'dining' } });

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('listitem', { name: 'Uber Eats' })).toBeTruthy();
  });

  it('says when nothing matches the search', () => {
    render(<MerchantRules />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search rules' }), { target: { value: 'zzz' } });

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText(/No rules match/)).toBeTruthy();
  });

  it('explains an empty list instead of showing nothing', () => {
    state.rules = [];
    render(<MerchantRules />);

    expect(screen.getByText(/No rules yet/)).toBeTruthy();
  });

  it('asks before deleting, and only deletes once confirmed', () => {
    render(<MerchantRules />);
    const row = screen.getByRole('listitem', { name: 'Uber Eats' });

    fireEvent.click(within(row).getByRole('button', { name: 'Delete rule for Uber Eats' }));
    expect(state.mutate).not.toHaveBeenCalled();

    fireEvent.click(within(row).getByRole('button', { name: 'Confirm delete' }));
    expect(state.mutate).toHaveBeenCalledTimes(1);
    expect(state.mutate.mock.calls[0][0]).toBe('b');
  });

  it('lets you back out of a delete', () => {
    render(<MerchantRules />);
    const row = screen.getByRole('listitem', { name: 'Uber' });

    fireEvent.click(within(row).getByRole('button', { name: 'Delete rule for Uber' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Cancel' }));

    expect(within(row).getByRole('button', { name: 'Delete rule for Uber' })).toBeTruthy();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('says a rule was not deleted when the request fails', () => {
    render(<MerchantRules />);
    const row = screen.getByRole('listitem', { name: 'Uber' });

    fireEvent.click(within(row).getByRole('button', { name: 'Delete rule for Uber' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Confirm delete' }));
    const [, options] = state.mutate.mock.calls[0] as [string, { onError: () => void }];
    act(() => options.onError());

    expect(screen.getByRole('alert').textContent).toContain('Could not delete');
  });

  it('drops a pending confirmation when the search changes', () => {
    render(<MerchantRules />);
    const search = screen.getByRole('searchbox', { name: 'Search rules' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete rule for Uber' }));
    fireEvent.change(search, { target: { value: 'dining' } });
    fireEvent.change(search, { target: { value: '' } });

    const row = screen.getByRole('listitem', { name: 'Uber' });
    expect(within(row).queryByRole('button', { name: 'Confirm delete' })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Delete rule for Uber' })).toBeTruthy();
  });

  it('keeps another row\'s confirmation open when an earlier delete settles', () => {
    render(<MerchantRules />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete rule for Uber' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    const [, options] = state.mutate.mock.calls[0] as [string, { onSettled: () => void }];

    fireEvent.click(screen.getByRole('button', { name: 'Delete rule for Uber Eats' }));
    act(() => options.onSettled());

    const eats = screen.getByRole('listitem', { name: 'Uber Eats' });
    expect(within(eats).getByRole('button', { name: 'Confirm delete' })).toBeTruthy();
  });

  it('explains what deleting does not do', () => {
    render(<MerchantRules />);

    expect(screen.getByText(/transactions already saved keep/i)).toBeTruthy();
  });

  it('shows 50 rules at first and the rest on request', () => {
    state.rules = Array.from({ length: 120 }, (_, i) => rule({ id: `r${i}`, original_name: `Merchant ${String(i).padStart(3, '0')}`, display_name: `Merchant ${i}` }));
    render(<MerchantRules />);

    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    fireEvent.click(screen.getByRole('button', { name: /Show 50 more/ }));
    expect(screen.getAllByRole('listitem')).toHaveLength(100);
    fireEvent.click(screen.getByRole('button', { name: /Show 20 more/ }));
    expect(screen.getAllByRole('listitem')).toHaveLength(120);
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull();
  });

  it('shows a spinner while loading and an error when it fails, never "No rules yet"', () => {
    state.rules = [];
    state.isLoading = true;
    const { unmount } = render(<MerchantRules />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
    expect(screen.queryByText(/No rules yet/)).toBeNull();
    unmount();

    state.isLoading = false;
    state.isError = true;
    render(<MerchantRules />);
    expect(screen.getByText(/Could not load/)).toBeTruthy();
    expect(screen.queryByText(/No rules yet/)).toBeNull();
  });
});
