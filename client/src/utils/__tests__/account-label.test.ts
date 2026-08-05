import { describe, it, expect } from 'vitest';
import { formatAccountLabel } from '../formatters';

describe('formatAccountLabel', () => {
  it('combines institution and account name', () => {
    expect(formatAccountLabel({ institution_name: 'Robinhood', account_name: 'Roth IRA' }))
      .toBe('Robinhood Roth IRA');
  });

  it('returns only the account name when it already contains the institution', () => {
    expect(formatAccountLabel({ institution_name: 'Bilt', account_name: 'Bilt Mastercard' }))
      .toBe('Bilt Mastercard');
    expect(formatAccountLabel({ institution_name: 'chase', account_name: 'Chase Sapphire Preferred' }))
      .toBe('Chase Sapphire Preferred');
  });

  it('falls back to institution when account name is missing or blank', () => {
    expect(formatAccountLabel({ institution_name: 'Robinhood', account_name: null }))
      .toBe('Robinhood');
    expect(formatAccountLabel({ institution_name: 'Robinhood', account_name: '  ' }))
      .toBe('Robinhood');
  });

  it('falls back to account name when institution is missing', () => {
    expect(formatAccountLabel({ institution_name: undefined, account_name: 'Checking' }))
      .toBe('Checking');
  });

  it('returns an empty string when both are missing', () => {
    expect(formatAccountLabel({})).toBe('');
  });
});
