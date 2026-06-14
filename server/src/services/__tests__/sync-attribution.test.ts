import { describe, it, expect } from 'vitest';
import { buildAccountResolver } from '../sync-attribution.js';

describe('buildAccountResolver', () => {
  const goldLocalId = 'local-gold';
  const platLocalId = 'local-plat';
  const itemAccounts = [
    { id: goldLocalId, plaid_account_id: 'plaid-gold' },
    { id: platLocalId, plaid_account_id: 'plaid-plat' },
  ];

  it('routes a transaction to the local account matching its Plaid account_id', () => {
    const resolve = buildAccountResolver(itemAccounts, goldLocalId);
    expect(resolve('plaid-gold')).toBe(goldLocalId);
    expect(resolve('plaid-plat')).toBe(platLocalId);
  });

  it('does not dump both cards onto the triggering account (regression)', () => {
    // Sync triggered by the Gold row must still file Platinum charges under Platinum.
    const resolve = buildAccountResolver(itemAccounts, goldLocalId);
    expect(resolve('plaid-plat')).toBe(platLocalId);
    expect(resolve('plaid-plat')).not.toBe(goldLocalId);
  });

  it('falls back to the triggering account for an unknown Plaid account_id', () => {
    const resolve = buildAccountResolver(itemAccounts, platLocalId);
    expect(resolve('plaid-unknown')).toBe(platLocalId);
  });

  it('falls back to the triggering account when account_id is missing', () => {
    const resolve = buildAccountResolver(itemAccounts, goldLocalId);
    expect(resolve(undefined)).toBe(goldLocalId);
    expect(resolve(null)).toBe(goldLocalId);
  });

  it('ignores local accounts that have no plaid_account_id', () => {
    const resolve = buildAccountResolver(
      [{ id: 'manual-row', plaid_account_id: null }, ...itemAccounts],
      goldLocalId
    );
    expect(resolve('plaid-plat')).toBe(platLocalId);
  });
});
