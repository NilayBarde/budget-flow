import { describe, it, expect } from 'vitest';
import { scaleSplits } from '../split-scaling.js';

const sum = (xs: { amount: number }[]) => Math.round(xs.reduce((a, x) => a + x.amount, 0) * 100) / 100;

describe('scaleSplits', () => {
  it('scales a 50/50 split up to the tipped posted total and still sums exactly', () => {
    const pending = [
      { amount: 53.62, description: 'Your portion', is_my_share: true },
      { amount: 53.62, description: 'Others', is_my_share: false },
    ];
    const scaled = scaleSplits(pending, 129.24);
    expect(sum(scaled)).toBe(129.24);
    expect(scaled[0].amount).toBeCloseTo(64.62, 2);
    expect(scaled[1].amount).toBeCloseTo(64.62, 2);
  });

  it('preserves description and is_my_share flags', () => {
    const scaled = scaleSplits(
      [{ amount: 10, description: 'mine', is_my_share: true }, { amount: 30, description: 'roommate', is_my_share: false }],
      80
    );
    expect(scaled.map(s => [s.description, s.is_my_share])).toEqual([['mine', true], ['roommate', false]]);
    // ratio preserved: 1:3 of 80 => 20 / 60
    expect(scaled[0].amount).toBe(20);
    expect(scaled[1].amount).toBe(60);
    expect(sum(scaled)).toBe(80);
  });

  it('applies rounding drift to the largest split so the total reconciles', () => {
    // 1/3 splits of 100 -> 33.33 each = 99.99; drift of 0.01 lands on largest
    const scaled = scaleSplits(
      [{ amount: 1, description: 'a', is_my_share: true }, { amount: 1, description: 'b', is_my_share: false }, { amount: 1, description: 'c', is_my_share: false }],
      100
    );
    expect(sum(scaled)).toBe(100);
  });

  it('scales a single split to the full posted total', () => {
    const scaled = scaleSplits([{ amount: 40, description: 'x', is_my_share: true }], 51.55);
    expect(scaled).toHaveLength(1);
    expect(scaled[0].amount).toBe(51.55);
  });

  it('returns empty for no splits', () => {
    expect(scaleSplits([], 100)).toEqual([]);
  });

  it('uses the absolute value of the posted amount', () => {
    const scaled = scaleSplits([{ amount: 25, description: 'x', is_my_share: true }], -25);
    expect(scaled[0].amount).toBe(25);
  });
});
