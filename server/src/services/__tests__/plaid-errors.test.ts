import { describe, it, expect } from 'vitest';
import { getPlaidErrorCode, needsReconnect } from '../plaid-errors.js';

const plaidError = (errorCode: string) => ({
  response: { data: { error_type: 'ITEM_ERROR', error_code: errorCode } },
});

describe('getPlaidErrorCode', () => {
  it('reads the error code from an axios style Plaid error', () => {
    expect(getPlaidErrorCode(plaidError('ITEM_LOGIN_REQUIRED'))).toBe('ITEM_LOGIN_REQUIRED');
  });

  it('returns null for errors that did not come from Plaid', () => {
    expect(getPlaidErrorCode(new Error('boom'))).toBeNull();
    expect(getPlaidErrorCode(null)).toBeNull();
    expect(getPlaidErrorCode(undefined)).toBeNull();
    expect(getPlaidErrorCode('string error')).toBeNull();
  });

  it('returns null when the response has no error code', () => {
    expect(getPlaidErrorCode({ response: { data: {} } })).toBeNull();
    expect(getPlaidErrorCode({ response: {} })).toBeNull();
  });
});

describe('needsReconnect', () => {
  it('is true when the user must re-authenticate in Plaid Link', () => {
    expect(needsReconnect('ITEM_LOGIN_REQUIRED')).toBe(true);
  });

  it('is false for other errors, including a removed item', () => {
    expect(needsReconnect('ITEM_NOT_FOUND')).toBe(false);
    expect(needsReconnect('RATE_LIMIT_EXCEEDED')).toBe(false);
    expect(needsReconnect(null)).toBe(false);
  });
});
