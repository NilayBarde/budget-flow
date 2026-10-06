import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { useMonthNavigation, type MonthYear } from '../useMonthNavigation';
import { MonthProvider } from '../MonthProvider';

const withMonth = (initial?: MonthYear) => ({ children }: { children: ReactNode }) => (
  <MonthProvider initial={initial}>{children}</MonthProvider>
);

const renderNav = (initial?: MonthYear) =>
  renderHook(() => useMonthNavigation(), { wrapper: withMonth(initial) });

describe('useMonthNavigation', () => {
  it('defaults to the current month and year', () => {
    const { result } = renderNav();
    const now = new Date();
    expect(result.current.currentDate.month).toBe(now.getMonth() + 1);
    expect(result.current.currentDate.year).toBe(now.getFullYear());
  });

  it('accepts a custom initial month/year', () => {
    const { result } = renderNav({ month: 3, year: 2024 });
    expect(result.current.currentDate).toEqual({ month: 3, year: 2024 });
  });

  it('throws when used outside a MonthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useMonthNavigation())).toThrow(/MonthProvider/);
    spy.mockRestore();
  });

  // ── shared selection ──────────────────────────────────────────────────

  it('shares the selected month between consumers of the same provider', () => {
    const { result } = renderHook(
      () => ({ a: useMonthNavigation(), b: useMonthNavigation() }),
      { wrapper: withMonth({ month: 6, year: 2025 }) },
    );

    act(() => result.current.a.handlePrevMonth());

    expect(result.current.a.currentDate).toEqual({ month: 5, year: 2025 });
    expect(result.current.b.currentDate).toEqual({ month: 5, year: 2025 });
  });

  it('keeps the selected month when navigating between pages', () => {
    const PageA = () => {
      const { currentDate, handlePrevMonth } = useMonthNavigation();
      return (
        <div>
          <p>a {currentDate.month}/{currentDate.year}</p>
          <button onClick={handlePrevMonth}>prev</button>
          <Link to="/b">go b</Link>
        </div>
      );
    };
    const PageB = () => {
      const { currentDate } = useMonthNavigation();
      return <p>b {currentDate.month}/{currentDate.year}</p>;
    };

    render(
      <MonthProvider initial={{ month: 6, year: 2025 }}>
        <MemoryRouter initialEntries={['/a']}>
          <Routes>
            <Route path="/a" element={<PageA />} />
            <Route path="/b" element={<PageB />} />
          </Routes>
        </MemoryRouter>
      </MonthProvider>,
    );

    fireEvent.click(screen.getByText('prev'));
    expect(screen.getByText('a 5/2025')).toBeTruthy();

    fireEvent.click(screen.getByText('go b'));
    expect(screen.getByText('b 5/2025')).toBeTruthy();
  });

  // ── handlePrevMonth ───────────────────────────────────────────────────

  it('handlePrevMonth decrements the month', () => {
    const { result } = renderNav({ month: 6, year: 2025 });

    act(() => result.current.handlePrevMonth());

    expect(result.current.currentDate).toEqual({ month: 5, year: 2025 });
  });

  it('handlePrevMonth wraps from January to December of the previous year', () => {
    const { result } = renderNav({ month: 1, year: 2025 });

    act(() => result.current.handlePrevMonth());

    expect(result.current.currentDate).toEqual({ month: 12, year: 2024 });
  });

  // ── handleNextMonth ───────────────────────────────────────────────────

  it('handleNextMonth increments the month', () => {
    const { result } = renderNav({ month: 6, year: 2025 });

    act(() => result.current.handleNextMonth());

    expect(result.current.currentDate).toEqual({ month: 7, year: 2025 });
  });

  it('handleNextMonth wraps from December to January of the next year', () => {
    const { result } = renderNav({ month: 12, year: 2025 });

    act(() => result.current.handleNextMonth());

    expect(result.current.currentDate).toEqual({ month: 1, year: 2026 });
  });

  // ── Multiple transitions ──────────────────────────────────────────────

  it('handles multiple prev calls across year boundary', () => {
    const { result } = renderNav({ month: 2, year: 2025 });

    act(() => result.current.handlePrevMonth());
    act(() => result.current.handlePrevMonth());

    expect(result.current.currentDate).toEqual({ month: 12, year: 2024 });
  });

  it('handles multiple next calls across year boundary', () => {
    const { result } = renderNav({ month: 11, year: 2025 });

    act(() => result.current.handleNextMonth());
    act(() => result.current.handleNextMonth());

    expect(result.current.currentDate).toEqual({ month: 1, year: 2026 });
  });

  // ── setCurrentDate ────────────────────────────────────────────────────

  it('setCurrentDate allows jumping to an arbitrary month', () => {
    const { result } = renderNav({ month: 1, year: 2025 });

    act(() => result.current.setCurrentDate({ month: 9, year: 2030 }));

    expect(result.current.currentDate).toEqual({ month: 9, year: 2030 });
  });
});
