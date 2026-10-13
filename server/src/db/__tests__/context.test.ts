import { describe, it, expect, vi } from 'vitest';
import type { Request } from 'express';

vi.mock('../supabase.js', () => ({ supabaseAdmin: { client: 'admin' } }));

const { userContext, adminContext } = await import('../context.js');

describe('userContext', () => {
  it('returns the signed-in user and their client', () => {
    const db = { client: 'user' };
    const req = { userId: 'user-1', db } as unknown as Request;
    expect(userContext(req)).toEqual({ db, userId: 'user-1' });
  });

  it('refuses a request requireAuth did not handle', () => {
    expect(() => userContext({} as Request)).toThrow('requireAuth');
    expect(() => userContext({ userId: 'user-1' } as unknown as Request)).toThrow('requireAuth');
  });
});

describe('adminContext', () => {
  it('pairs the service-role client with the given user', () => {
    expect(adminContext('user-2')).toEqual({ db: { client: 'admin' }, userId: 'user-2' });
  });
});
