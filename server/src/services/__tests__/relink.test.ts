import { describe, it, expect } from 'vitest';
import { matchRelinkedAccounts, pickAdoptableTransaction, type StoredPlaidAccount } from '../relink.js';

const stored = (overrides: Partial<StoredPlaidAccount> = {}): StoredPlaidAccount => ({
  id: 'row-1',
  plaid_account_id: 'old-acct',
  plaid_item_id: 'old-item',
  plaid_access_token: 'old-token',
  account_name: 'BillPay Account',
  account_type: 'checking',
  ...overrides,
});

describe('matchRelinkedAccounts', () => {
  it('pairs an account whose Plaid id survived the re-link', () => {
    const matches = matchRelinkedAccounts(
      [{ account_id: 'old-acct', name: 'Renamed', type: 'depository', subtype: 'savings' }],
      [stored()],
    );
    expect(matches.get('old-acct')?.id).toBe('row-1');
  });

  it('falls back to the same name and type when Plaid issued a new id', () => {
    const matches = matchRelinkedAccounts(
      [
        { account_id: 'new-acct', name: 'BillPay Account', type: 'depository', subtype: 'checking' },
        { account_id: 'new-card', name: 'Bilt Blue Card', type: 'credit', subtype: 'credit card' },
      ],
      [stored()],
    );
    expect(matches.get('new-acct')?.id).toBe('row-1');
    expect(matches.has('new-card')).toBe(false);
  });

  it('ignores case and surrounding spaces in the name', () => {
    const matches = matchRelinkedAccounts(
      [{ account_id: 'new-acct', name: ' billpay account ', type: 'depository', subtype: 'Checking' }],
      [stored()],
    );
    expect(matches.get('new-acct')?.id).toBe('row-1');
  });

  it('does not guess between two look-alike accounts', () => {
    const matches = matchRelinkedAccounts(
      [{ account_id: 'new-acct', name: 'BillPay Account', type: 'depository', subtype: 'checking' }],
      [stored(), stored({ id: 'row-2', plaid_account_id: 'old-acct-2' })],
    );
    expect(matches.size).toBe(0);
  });

  it('does not reuse a stored account that already matched by id', () => {
    const matches = matchRelinkedAccounts(
      [
        { account_id: 'old-acct', name: 'BillPay Account', type: 'depository', subtype: 'checking' },
        { account_id: 'new-acct', name: 'BillPay Account', type: 'depository', subtype: 'checking' },
      ],
      [stored()],
    );
    expect(matches.get('old-acct')?.id).toBe('row-1');
    expect(matches.has('new-acct')).toBe(false);
  });
});

describe('pickAdoptableTransaction', () => {
  const candidate = (id: string, description: string | null, plaidId: string | null = `old-${id}`) => ({
    id,
    plaid_transaction_id: plaidId,
    original_description: description,
  });

  it('prefers the candidate with the same description', () => {
    const picked = pickAdoptableTransaction('UBER TRIP', [candidate('a', 'LYFT RIDE'), candidate('b', 'UBER TRIP')], new Set());
    expect(picked?.id).toBe('b');
  });

  it('takes a lone candidate even when the description changed', () => {
    expect(pickAdoptableTransaction('UBER *TRIP', [candidate('a', 'UBER TRIP')], new Set())?.id).toBe('a');
  });

  it('does not guess between several candidates with other descriptions', () => {
    expect(pickAdoptableTransaction('NEW', [candidate('a', 'X'), candidate('b', 'Y')], new Set())).toBeUndefined();
  });

  it('never picks a row twice, so two identical charges keep their own rows', () => {
    const rows = [candidate('a', 'COFFEE'), candidate('b', 'COFFEE')];
    expect(pickAdoptableTransaction('COFFEE', rows, new Set(['a']))?.id).toBe('b');
    expect(pickAdoptableTransaction('COFFEE', rows, new Set(['a', 'b']))).toBeUndefined();
  });

  it('leaves CSV imported rows alone', () => {
    expect(pickAdoptableTransaction('COFFEE', [candidate('a', 'COFFEE', null)], new Set())).toBeUndefined();
  });
});
