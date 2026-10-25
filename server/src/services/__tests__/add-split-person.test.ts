import { describe, it, expect } from 'vitest';
import { computeAddPersonSplit, AddSplitPersonError } from '../add-split-person.js';

describe('computeAddPersonSplit', () => {
  it('carves the new amount out of the current my-share amount', () => {
    expect(computeAddPersonSplit(45.71, 18)).toBe(27.71);
  });

  it('allows carving out the entire remaining my-share amount, leaving zero', () => {
    expect(computeAddPersonSplit(18, 18)).toBe(0);
  });

  it('rounds to the cent to avoid floating-point drift', () => {
    expect(computeAddPersonSplit(0.3, 0.1)).toBe(0.2);
  });

  it('rejects a zero amount', () => {
    expect(() => computeAddPersonSplit(45.71, 0)).toThrow(AddSplitPersonError);
  });

  it('rejects a negative amount', () => {
    expect(() => computeAddPersonSplit(45.71, -5)).toThrow(AddSplitPersonError);
  });

  it('rejects an amount larger than what remains of my share', () => {
    expect(() => computeAddPersonSplit(18, 18.01)).toThrow(AddSplitPersonError);
  });
});
