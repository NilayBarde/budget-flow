import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { legacyRedirectRoutes } from '../legacyRedirects';

const Where = () => {
  const { pathname, search } = useLocation();
  return <p>at {pathname + search}</p>;
};

const visit = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {legacyRedirectRoutes}
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe('legacy redirects', () => {
  it.each([
    ['/investments', '/net-worth/investments'],
    ['/year', '/insights/year'],
    ['/tags', '/settings/tags'],
  ])('sends %s to %s', (from, to) => {
    visit(from);

    expect(screen.getByText(`at ${to}`)).toBeTruthy();
  });

  it('keeps a query string on the way', () => {
    visit('/year?y=2025');

    expect(screen.getByText('at /insights/year?y=2025')).toBeTruthy();
  });

  it('leaves every other address alone', () => {
    visit('/transactions');

    expect(screen.getByText('at /transactions')).toBeTruthy();
  });
});
