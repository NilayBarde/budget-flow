import { describe, it, expect } from 'vitest';
import { monthlyEquivalentAmount } from '../recurring-normalize.js';

describe('monthlyEquivalentAmount', () => {
  it('returns monthly amounts unchanged', () => {
    expect(monthlyEquivalentAmount('monthly', 50)).toBe(50);
  });

  it('scales weekly amounts by 52/12', () => {
    expect(monthlyEquivalentAmount('weekly', 12)).toBeCloseTo(52, 5);
  });

  it('divides yearly amounts by 12', () => {
    expect(monthlyEquivalentAmount('yearly', 120)).toBe(10);
  });

  it('handles zero', () => {
    expect(monthlyEquivalentAmount('weekly', 0)).toBe(0);
  });
});
