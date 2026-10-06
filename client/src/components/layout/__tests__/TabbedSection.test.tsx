import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TabbedSection } from '../TabbedSection';
import { NET_WORTH_TABS } from '../../../utils/navigation';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="net-worth" element={<TabbedSection label="Net worth sections" tabs={NET_WORTH_TABS} />}>
          <Route index element={<p>net worth page</p>} />
          <Route path="investments" element={<p>investments page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe('TabbedSection', () => {
  it('shows the section\'s tabs above the page', () => {
    renderAt('/net-worth');

    const nav = screen.getByRole('navigation', { name: 'Net worth sections' });
    expect(nav.textContent).toContain('Net Worth');
    expect(nav.textContent).toContain('Investments');
    expect(screen.getByText('net worth page')).toBeTruthy();
  });

  it('marks only the section\'s own tab as current on the section page', () => {
    renderAt('/net-worth');

    expect(screen.getByRole('link', { name: 'Net Worth' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Investments' }).getAttribute('aria-current')).toBeNull();
  });

  it('moves the current marker to the sub page and shows that page', () => {
    renderAt('/net-worth/investments');

    expect(screen.getByRole('link', { name: 'Investments' }).getAttribute('aria-current')).toBe('page');
    // Without exact matching the section's own tab would stay marked on its sub pages too.
    expect(screen.getByRole('link', { name: 'Net Worth' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByText('investments page')).toBeTruthy();
    expect(screen.queryByText('net worth page')).toBeNull();
  });

  it('links each tab to its page', () => {
    renderAt('/net-worth');

    expect(screen.getByRole('link', { name: 'Investments' }).getAttribute('href')).toBe('/net-worth/investments');
    expect(screen.getByRole('link', { name: 'Net Worth' }).getAttribute('href')).toBe('/net-worth');
  });
});
