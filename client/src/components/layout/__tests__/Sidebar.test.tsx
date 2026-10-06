import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';
import { MOBILE_NAV_ITEMS } from '../../../utils/navigation';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar isOpen onClose={() => {}} />
    </MemoryRouter>,
  );

// The sidebar drawer and the mobile bottom bar are both rendered; they are told apart by their landmark.
const drawer = () => screen.getByRole('complementary');
const bottomBar = () => screen.getAllByRole('navigation').find(nav => !drawer().contains(nav))!;

describe('Sidebar', () => {
  it('lists the six main pages and Settings, and none of the pages that became tabs', () => {
    renderAt('/');
    const links = within(drawer()).getAllByRole('link').map(a => a.textContent?.trim());

    expect(links).toEqual(['Dashboard', 'Transactions', 'Plan', 'Net Worth', 'Insights', 'Accounts', 'Settings']);
    expect(links).not.toContain('Investments');
    expect(links).not.toContain('Year Overview');
    expect(links).not.toContain('Tags');
  });

  it.each([
    ['/net-worth/investments', 'Net Worth'],
    ['/insights/year', 'Insights'],
    ['/settings/tags', 'Settings'],
  ])('keeps the section highlighted on %s', (path, label) => {
    renderAt(path);

    expect(within(drawer()).getByRole('link', { name: label }).getAttribute('aria-current')).toBe('page');
    // And only that one.
    const current = within(drawer()).getAllByRole('link').filter(a => a.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
  });

  it('highlights Dashboard only on the dashboard', () => {
    renderAt('/transactions');

    expect(within(drawer()).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBeNull();
    expect(within(drawer()).getByRole('link', { name: 'Transactions' }).getAttribute('aria-current')).toBe('page');
  });

  it('builds the mobile bar from the same list, with Home for the dashboard', () => {
    renderAt('/');
    const labels = within(bottomBar()).getAllByRole('link').map(a => a.textContent?.trim());

    expect(labels).toEqual(MOBILE_NAV_ITEMS.map(item => item.mobileLabel ?? item.label));
    expect(labels[0]).toBe('Home');
    expect(labels).toContain('Net Worth');
    expect(labels).not.toContain('Investments');
  });
});
