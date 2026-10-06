import { describe, it, expect } from 'vitest';
import { classifySyncHealth, staleDaysFor } from '../sync-health.js';

const NOW = new Date('2026-10-06T12:00:00Z').getTime();
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

interface TestAccount {
  id: string;
  account_type: string;
  needs_reauth: boolean;
  last_synced_at: string | null;
}

const account = (overrides: Partial<TestAccount> = {}): TestAccount => ({
  id: 'a1',
  account_type: 'credit card',
  needs_reauth: false,
  last_synced_at: daysAgo(1),
  ...overrides,
});

describe('staleDaysFor', () => {
  it('gives cards and bank accounts the short window', () => {
    expect(staleDaysFor('credit card')).toBe(5);
    expect(staleDaysFor('checking')).toBe(5);
    expect(staleDaysFor('savings')).toBe(5);
  });

  it('gives investment and retirement accounts the long window', () => {
    for (const type of ['investment', 'brokerage', 'ira', 'roth', '401k', 'hsa']) {
      expect(staleDaysFor(type)).toBe(14);
    }
  });

  it('falls back to the short window for an unknown or missing type', () => {
    expect(staleDaysFor('')).toBe(5);
    expect(staleDaysFor(undefined)).toBe(5);
  });

  it('lets an explicit override win for every type', () => {
    expect(staleDaysFor('credit card', 2)).toBe(2);
    expect(staleDaysFor('brokerage', 2)).toBe(2);
  });
});

describe('classifySyncHealth', () => {
  it('flags a card that has not synced past its window', () => {
    const { stale } = classifySyncHealth([account({ last_synced_at: daysAgo(6) })], NOW);
    expect(stale).toHaveLength(1);
  });

  it('does not flag an investment account after the same 6 days', () => {
    const { stale } = classifySyncHealth(
      [account({ account_type: 'investment', last_synced_at: daysAgo(6) })],
      NOW,
    );
    expect(stale).toHaveLength(0);
  });

  it('flags an investment account past 14 days', () => {
    const { stale } = classifySyncHealth(
      [account({ account_type: 'brokerage', last_synced_at: daysAgo(15) })],
      NOW,
    );
    expect(stale).toHaveLength(1);
  });

  it('flags an account that has never synced, whatever its type', () => {
    const { stale } = classifySyncHealth(
      [account({ id: 'card', last_synced_at: null }), account({ id: 'ira', account_type: 'ira', last_synced_at: null })],
      NOW,
    );
    expect(stale.map(a => a.id)).toEqual(['card', 'ira']);
  });

  it('lists a needs reauth account only under needs_reauth, even when it is also old', () => {
    const { needsReauth, stale } = classifySyncHealth(
      [account({ needs_reauth: true, last_synced_at: daysAgo(30) })],
      NOW,
    );
    expect(needsReauth).toHaveLength(1);
    expect(stale).toHaveLength(0);
  });

  it('applies an explicit override to every type', () => {
    const { stale } = classifySyncHealth(
      [account({ id: 'card', last_synced_at: daysAgo(3) }), account({ id: 'ira', account_type: 'ira', last_synced_at: daysAgo(3) })],
      NOW,
      2,
    );
    expect(stale.map(a => a.id)).toEqual(['card', 'ira']);
  });

  it('returns nothing for healthy accounts', () => {
    const result = classifySyncHealth([account()], NOW);
    expect(result).toEqual({ needsReauth: [], stale: [] });
  });
});
