import { describe, it, expect } from 'vitest';
import { REDACTED_ACCOUNT_FIELDS, toPublicAccount } from '../account-redaction.js';

const row = {
  id: 'a1',
  account_name: 'Checking',
  plaid_item_id: 'item-1',
  plaid_access_token: 'access-production-secret',
  plaid_cursor: 'cursor-secret',
  current_balance: 12.5,
};

describe('toPublicAccount', () => {
  it('removes the Plaid credentials and the sync cursor', () => {
    const publicAccount = toPublicAccount(row);
    expect(publicAccount).not.toHaveProperty('plaid_access_token');
    expect(publicAccount).not.toHaveProperty('plaid_cursor');
    expect(JSON.stringify(publicAccount)).not.toContain('secret');
  });

  it('keeps every other field, including the item id the client uses to spot manual accounts', () => {
    expect(toPublicAccount(row)).toEqual({
      id: 'a1',
      account_name: 'Checking',
      plaid_item_id: 'item-1',
      current_balance: 12.5,
    });
  });

  it('does not mutate the row it was given', () => {
    const copy = { ...row };
    toPublicAccount(row);
    expect(row).toEqual(copy);
  });

  it('works on a row that has none of the redacted fields', () => {
    expect(toPublicAccount({ id: 'a2' })).toEqual({ id: 'a2' });
  });
});

describe('REDACTED_ACCOUNT_FIELDS', () => {
  it('lists the credential and cursor columns', () => {
    expect([...REDACTED_ACCOUNT_FIELDS]).toEqual(['plaid_access_token', 'plaid_cursor']);
  });
});
