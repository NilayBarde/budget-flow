import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMonthNavigation } from '../useMonthNavigation';

describe('useMonthNavigation', () => {
  it('defaults to the current month and year', () => {
    const { result } = renderHook(() => useMonthNavigation());
    const now = new Date();
    expect(result.current.currentDate.month).toBe(now.getMonth() + 1);
    expect(result.current.currentDate.year).toBe(now.getFullYear());
  });

  it('accepts a custom initial month/year', () => {
    const { result } = renderHook(() =>
      useMonthNavigation({ month: 3, year: 2024 }),
    );
    expect(result.current.currentDate).toEqual({ month: 3, year: 2024 });
  });

  // ── handlePrevMonth ───────────────────────────────────────────────────

  it('handlePrevMonth decrements the month', () => {
    const { result } = renderHook(() =>
      useMonthNavigation({ month: 6, year: 2025 }),
    );

    act(() => result.current.handlePrevMonth());

    expect(result.current.currentDate).toEqual({ month: 5, year: 2025 });
  });

  it('handlePrevMonth wraps from January to December of the previous year', () => {
    const { result } = renderHook(() =>
      useMonthNavigation({ month: 1, year: 2025 }),
    );

    act(() => result.current.handlePrevMonth());

    expect(result.current.currentDate).toEqual({ month: 12, year: 2024 });
  });

  // ── handleNextMonth ───────────────────────────────────────────────────

  it('handleNextMonth increments the month', () => {
    const { result } = renderHook(() =>
      useMonthNavigation({ month: 6, year: 2025 }),
    );

    act(() => result.current.handleNextMonth());

    expect(result.current.currentDate).toEqual({ month: 7, year: 2025 });
  });

  it('handleNextMonth wraps from December to January of the next year', () => {
    const { result } = renderHook(() =>
      useMonthNavigation({ month: 12, year: 2025 }),
    );

    act(() => result.current.handleNextMonth());

    expect(result.current.currentDate).toEqual({ month: 1, year: 2026 });
  });

  // ── Multiple transitions ──────────────────────────────────────────────

  it('handles multiple prev calls across year boundary', () => {
    const { result } = renderHook(() =>
      useMonthNavigation({ month: 2, year: 2025 }),
    );

    act(() => result.current.handlePrevMonth());
    act(() => result.current.handlePrevMonth());

    expect(result.current.currentDate).toEqual({ month: 12, year: 2024 });
  });

  it('handles multiple next calls across year boundary', () => {
    const { result } = renderHook(() =>
      useMonthNavigation({ month: 11, year: 2025 }),
    );

    act(() => result.current.handleNextMonth());
    act(() => result.current.handleNextMonth());

    expect(result.current.currentDate).toEqual({ month: 1, year: 2026 });
  });

  // ── setCurrentDate ────────────────────────────────────────────────────

  it('setCurrentDate allows jumping to an arbitrary month', () => {
    const { result } = renderHook(() =>
      useMonthNavigation({ month: 1, year: 2025 }),
    );

    act(() => result.current.setCurrentDate({ month: 9, year: 2030 }));

    expect(result.current.currentDate).toEqual({ month: 9, year: 2030 });
  });
});
