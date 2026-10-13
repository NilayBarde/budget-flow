import { describe, it, expect } from 'vitest';
import { findIdleConnections, IDLE_DAYS, type IdleCheckAccount } from '../idle-connections.js';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
const dateDaysAgo = (days: number) => daysAgo(days).slice(0, 10);

const account = (overrides: Partial<IdleCheckAccount> = {}): IdleCheckAccount => ({
  id: 'acct-1',
  account_type: 'credit card',
  plaid_item_id: 'item-1',
  is_manual: false,
  created_at: daysAgo(200),
  idle_snoozed_until: null,
  last_transaction_date: dateDaysAgo(5),
  ...overrides,
});

describe('findIdleConnections', () => {
  it('leaves a connection with recent activity alone', () => {
    expect(findIdleConnections([account()], NOW).size).toBe(0);
  });

  it(`flags a connection with no transaction in more than ${IDLE_DAYS} days, with its last activity`, () => {
    const idle = findIdleConnections([account({ last_transaction_date: '2026-02-04' })], NOW);
    expect(idle.get('acct-1')).toEqual({ last_activity: '2026-02-04', updates_balances: false });
  });

  it(`does not flag a connection whose last transaction is exactly ${IDLE_DAYS} days old`, () => {
    expect(findIdleConnections([account({ last_transaction_date: dateDaysAgo(IDLE_DAYS) })], NOW).size).toBe(0);
  });

  it('flags an old connection that never had a transaction', () => {
    expect(findIdleConnections([account({ last_transaction_date: null })], NOW).get('acct-1')).toEqual({ last_activity: null, updates_balances: false });
  });

  it(`gives a connection linked less than ${IDLE_DAYS} days ago time to be used`, () => {
    const fresh = account({ created_at: daysAgo(10), last_transaction_date: null });
    expect(findIdleConnections([fresh], NOW).size).toBe(0);
  });

  it('judges a connection by all of its accounts: one active account keeps it', () => {
    const accounts = [
      account({ id: 'card', last_transaction_date: '2026-03-23' }),
      account({ id: 'brokerage', last_transaction_date: dateDaysAgo(3) }),
    ];
    expect(findIdleConnections(accounts, NOW).size).toBe(0);
  });

  it('flags every account on an idle connection, with the newest activity across them', () => {
    const accounts = [
      account({ id: 'card', last_transaction_date: '2026-03-23' }),
      account({ id: 'brokerage', last_transaction_date: null }),
    ];
    const idle = findIdleConnections(accounts, NOW);
    expect([...idle.keys()].sort()).toEqual(['brokerage', 'card']);
    expect(idle.get('brokerage')).toEqual({ last_activity: '2026-03-23', updates_balances: false });
  });

  it('measures the grace period from the oldest account, so an account added later does not reset it', () => {
    const accounts = [
      account({ id: 'old', created_at: daysAgo(200), last_transaction_date: '2026-03-01' }),
      account({ id: 'new', created_at: daysAgo(1), last_transaction_date: null }),
    ];
    expect(findIdleConnections(accounts, NOW).size).toBe(2);
  });

  it('stays quiet while the connection is snoozed, and asks again once the snooze ends', () => {
    const idle = { last_transaction_date: '2026-02-04' };
    expect(findIdleConnections([account({ ...idle, idle_snoozed_until: daysAgo(-30) })], NOW).size).toBe(0);
    expect(findIdleConnections([account({ ...idle, idle_snoozed_until: daysAgo(1) })], NOW).size).toBe(1);
  });

  it('never flags manual or disconnected accounts, which Plaid does not bill', () => {
    const manual = account({ plaid_item_id: 'manual-acct-1', is_manual: true, last_transaction_date: null });
    expect(findIdleConnections([manual], NOW).size).toBe(0);
  });

  it('leaves a re-linked connection alone while Plaid is still resending its history', () => {
    const relinked = account({ last_transaction_date: '2026-03-01', relinked_at: daysAgo(0) });
    expect(findIdleConnections([relinked], NOW).size).toBe(0);
  });

  it('leaves a broken connection to its reconnect or sync error notice, since its quiet is not disuse', () => {
    const quiet = { last_transaction_date: '2026-03-01' };
    expect(findIdleConnections([account({ ...quiet, needs_reauth: true })], NOW).size).toBe(0);
    expect(findIdleConnections([account({ ...quiet, last_sync_error: 'Failed to save 1 transaction(s).' })], NOW).size).toBe(0);
  });

  it('says when a connection also keeps investment or savings balances up to date', () => {
    const accounts = [
      account({ id: 'card', last_transaction_date: '2026-03-23' }),
      account({ id: 'brokerage', account_type: 'investment', last_transaction_date: null }),
    ];
    expect(findIdleConnections(accounts, NOW).get('card')).toEqual({ last_activity: '2026-03-23', updates_balances: true });
    const savings = account({ account_type: 'savings', last_transaction_date: null });
    expect(findIdleConnections([savings], NOW).get('acct-1')?.updates_balances).toBe(true);
  });

  it('keeps connections apart', () => {
    const accounts = [
      account({ id: 'a', plaid_item_id: 'item-a', last_transaction_date: '2026-02-04' }),
      account({ id: 'b', plaid_item_id: 'item-b', last_transaction_date: dateDaysAgo(1) }),
    ];
    expect([...findIdleConnections(accounts, NOW).keys()]).toEqual(['a']);
  });
});
