import { describe, it, expect } from 'vitest';
import { isManualAccount } from '../account-types';

describe('isManualAccount', () => {
  it('is true for an account the user created by hand', () => {
    expect(isManualAccount({ plaid_item_id: 'manual-a5e806fd-1e57-4279-9890-f83e8594dce7' })).toBe(true);
  });

  it('is false for an account linked through Plaid', () => {
    expect(isManualAccount({ plaid_item_id: 'X5mA31jmn8UjkkNoQ7jDt4MrMnBQJwIrXL0wx' })).toBe(false);
  });
});
