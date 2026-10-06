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

  it('redacts an error that carries a request config even without the axios flag', () => {
    // A re-wrapped error or one from a second axios copy can lose isAxiosError but keep the headers.
    const redacted = redactError({
      message: 'Request failed',
      config: { headers: { 'PLAID-SECRET': 'super-secret' }, data: '{"secret":"super-secret"}' },
    });
    expect(typeof redacted).toBe('string');
    expect(JSON.stringify(redacted)).not.toContain('super-secret');
  });

  it('redacts an axios error hidden behind an Error cause', () => {
    const wrapped = new Error('sync failed', { cause: axiosPlaidError() });
    const redacted = redactError(wrapped);
    expect(String(redacted)).toContain('sync failed');
    expect(String(redacted)).toContain('ITEM_LOGIN_REQUIRED');
    expect(JSON.stringify(redacted)).not.toContain('super-secret');
  });

  it('does not recurse forever on a circular cause chain', () => {
    const error = new Error('loop') as Error & { cause?: unknown };
    error.cause = error;
    expect(() => redactError(error)).not.toThrow();
  });

  it('redacts axios errors inside an AggregateError', () => {
    const aggregate = new AggregateError([axiosPlaidError(), new Error('other')], 'all failed');
    const redacted = redactError(aggregate);
    expect(typeof redacted).toBe('string');
    expect(String(redacted)).toContain('all failed');
    expect(String(redacted)).toContain('ITEM_LOGIN_REQUIRED');
    expect(JSON.stringify(redacted)).not.toContain('super-secret');
  });

  it('drops the row dump from a database error, which can include credential columns', () => {
    // PostgREST puts "Failing row contains (...)" in details on a constraint violation.
    const redacted = redactError({
      code: '23502',
      message: 'null value in column "plaid_item_id" violates not-null constraint',
      details: 'Failing row contains (a1, access-production-super-secret, cursor-secret).',
      hint: null,
    });
    expect(String(redacted)).toContain('23502');
    expect(String(redacted)).toContain('violates not-null constraint');
    expect(JSON.stringify(redacted)).not.toContain('super-secret');
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
