import { describe, it, expect } from 'vitest';
import { getPlaidErrorCode, needsReconnect, redactError } from '../plaid-errors.js';

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

describe('redactError', () => {
  // An axios error carries the whole request, including the Plaid credentials in its headers.
  const axiosPlaidError = () => ({
    isAxiosError: true,
    message: 'Request failed with status code 400',
    config: { headers: { 'PLAID-SECRET': 'super-secret', 'PLAID-CLIENT-ID': 'client-id' } },
    response: {
      data: { error_code: 'ITEM_LOGIN_REQUIRED', error_message: 'the login details of this item have changed' },
    },
  });

  it('keeps the Plaid code and message but drops the request headers', () => {
    const redacted = redactError(axiosPlaidError());
    expect(redacted).toBe('ITEM_LOGIN_REQUIRED: the login details of this item have changed');
    expect(JSON.stringify(redacted)).not.toContain('super-secret');
  });

  it('summarizes an axios error that has no Plaid body, such as a network failure', () => {
    const redacted = redactError({
      isAxiosError: true,
      code: 'ECONNRESET',
      message: 'socket hang up',
      config: { headers: { 'PLAID-SECRET': 'super-secret' } },
    });
    expect(redacted).toBe('ECONNRESET: socket hang up');
  });

  it('returns ordinary errors unchanged so their stack traces survive', () => {
    const error = new Error('boom');
    expect(redactError(error)).toBe(error);
  });

  it('returns non error values unchanged', () => {
    expect(redactError(null)).toBeNull();
    expect(redactError('text')).toBe('text');
    expect(redactError({ message: 'db error' })).toEqual({ message: 'db error' });
  });
});
