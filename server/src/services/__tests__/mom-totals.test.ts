import { describe, it, expect } from 'vitest';
import { percentChange } from '../mom-totals.js';

describe('percentChange', () => {
  it('returns the relative change as a percentage', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(100, 100)).toBe(0);
  });

  it('returns 0 when the previous value is 0 (no comparison possible)', () => {
    // Note: 0 here means "no comparison possible," not "no change."
    // The UI should distinguish between these cases if it cares.
    expect(percentChange(500, 0)).toBe(0);
    expect(percentChange(0, 0)).toBe(0);
  });

  it('returns 0 when the previous value is negative (defensive)', () => {
    // Spending/income totals should never be negative in practice, but
    // the guard prevents confusing output if it ever happens.
    expect(percentChange(100, -50)).toBe(0);
  });
});
