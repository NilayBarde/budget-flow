import { describe, it, expect } from 'vitest';
import { isDisconnectedAccount, isManualAccount } from '../account-types';

describe('isManualAccount', () => {
  it('is true for an account the user created by hand', () => {
    expect(isManualAccount({ plaid_item_id: 'manual-a5e806fd-1e57-4279-9890-f83e8594dce7' })).toBe(true);
  });

  it('is false for an account linked through Plaid', () => {
    expect(isManualAccount({ plaid_item_id: 'X5mA31jmn8UjkkNoQ7jDt4MrMnBQJwIrXL0wx' })).toBe(false);
  });
});

describe('isDisconnectedAccount', () => {
  it('is true for a Plaid account that was disconnected and kept its history', () => {
    expect(isDisconnectedAccount({ plaid_item_id: 'manual-9a1b', plaid_account_id: 'Wd8kLp3' })).toBe(true);
  });

  it('is false for an account the user created by hand', () => {
    expect(isDisconnectedAccount({ plaid_item_id: 'manual-9a1b', plaid_account_id: null })).toBe(false);
    expect(isDisconnectedAccount({ plaid_item_id: 'manual-9a1b' })).toBe(false);
  });

  it('is false for an account still linked through Plaid', () => {
    expect(isDisconnectedAccount({ plaid_item_id: 'X5mA31jmn8', plaid_account_id: 'Wd8kLp3' })).toBe(false);
  });
});
