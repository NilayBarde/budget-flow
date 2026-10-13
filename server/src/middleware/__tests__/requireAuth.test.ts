import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const auth = {
  getClaims: vi.fn(),
};
const allowlist = {
  emails: new Set<string>(['owner@example.com']),
  error: null as Error | null,
  queries: [] as string[],
};

vi.mock('../../db/supabase.js', () => ({
  supabaseAdmin: {
    auth: { getClaims: (token: string) => auth.getClaims(token) },
    from: (table: string) => {
      if (table !== 'user_allowlist') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_column: string, email: string) => ({
            maybeSingle: () => {
              allowlist.queries.push(email);
              if (allowlist.error) return Promise.resolve({ data: null, error: allowlist.error });
              return Promise.resolve({ data: allowlist.emails.has(email) ? { email } : null, error: null });
            },
          }),
        }),
      };
    },
  },
  createUserClient: (token: string) => ({ client: 'user', token }),
}));

const ensureUserSetup = vi.fn(async (_userId: string) => {});
vi.mock('../../services/user-setup.js', () => ({ ensureUserSetup: (userId: string) => ensureUserSetup(userId) }));

const { requireAuth, clearSetupCache } = await import('../requireAuth.js');

// Claims shaped like a Supabase access token for a Google sign-in.
const googleClaims = (overrides: Record<string, unknown> = {}) => ({
  sub: 'user-1',
  email: 'owner@example.com',
  role: 'authenticated',
  is_anonymous: false,
  app_metadata: { provider: 'google', providers: ['google'] },
  ...overrides,
});

const signedIn = (overrides: Record<string, unknown> = {}) => {
  auth.getClaims.mockResolvedValue({ data: { claims: googleClaims(overrides) }, error: null });
};

const call = async (path: string, authorization?: string) => {
  const req = { path, headers: authorization ? { authorization } : {} } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  const next = vi.fn();
  await requireAuth(req, res, next);
  await new Promise(r => setTimeout(r, 0));
  return { req, res, next };
};

const expectRejected = (res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }, next: ReturnType<typeof vi.fn>, status: number, message: string) => {
  expect(res.status).toHaveBeenCalledWith(status);
  expect(res.json).toHaveBeenCalledWith({ message });
  expect(next).not.toHaveBeenCalled();
};

const NOT_INVITED = "This Google account hasn't been invited.";

beforeEach(() => {
  clearSetupCache();
  auth.getClaims.mockReset();
  ensureUserSetup.mockClear();
  allowlist.emails = new Set(['owner@example.com']);
  allowlist.error = null;
  allowlist.queries = [];
});

describe('requireAuth', () => {
  it.each(['/health', '/webhooks/plaid'])('lets %s through without a token', async path => {
    const { next, res } = await call(path);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it('rejects a request with no token', async () => {
    const { res, next } = await call('/accounts');
    expectRejected(res, next, 401, 'Not signed in');
  });

  it('rejects a non-bearer authorization header', async () => {
    const { res, next } = await call('/accounts', 'Basic abc');
    expectRejected(res, next, 401, 'Not signed in');
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it('rejects a token Supabase says is invalid', async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: new Error('invalid JWT') });
    const { res, next } = await call('/accounts', 'Bearer bad');
    expectRejected(res, next, 401, 'Not signed in');
  });

  it('rejects when getClaims returns neither claims nor an error', async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null });
    const { res, next } = await call('/accounts', 'Bearer odd');
    expectRejected(res, next, 401, 'Not signed in');
  });

  it('rejects when verifying the token throws', async () => {
    auth.getClaims.mockRejectedValue(new Error('JWKS unavailable'));
    const { res, next } = await call('/accounts', 'Bearer tok');
    expectRejected(res, next, 401, 'Not signed in');
  });

  it.each([
    ['the anon key', { role: 'anon', sub: undefined }],
    ['the service-role key', { role: 'service_role', sub: undefined }],
    ['a token with no role', { role: undefined }],
  ])('rejects %s as not signed in', async (_label, overrides) => {
    signedIn(overrides);
    const { res, next } = await call('/accounts', 'Bearer tok');
    expectRejected(res, next, 401, 'Not signed in');
    expect(allowlist.queries).toEqual([]);
  });

  it.each([
    ['an anonymous session', { is_anonymous: true }],
    ['an email/password account', { app_metadata: { provider: 'email', providers: ['email'] } }],
    ['a token with no app_metadata', { app_metadata: undefined }],
    ['a token with no email', { email: undefined }],
  ])('rejects %s without querying the allowlist', async (_label, overrides) => {
    signedIn(overrides);
    const { res, next } = await call('/accounts', 'Bearer tok');
    expectRejected(res, next, 403, NOT_INVITED);
    expect(allowlist.queries).toEqual([]);
  });

  it('accepts an account created by hand and then linked to Google', async () => {
    signedIn({ app_metadata: { provider: 'email', providers: ['email', 'google'] } });
    const { next } = await call('/accounts', 'Bearer tok');
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects an account that is not on the allowlist and does not set it up', async () => {
    signedIn({ sub: 'user-2', email: 'stranger@example.com' });
    const { res, next } = await call('/accounts', 'Bearer tok');
    expectRejected(res, next, 403, NOT_INVITED);
    expect(ensureUserSetup).not.toHaveBeenCalled();
  });

  it('admits an invited account, matching its email case-insensitively', async () => {
    signedIn({ email: 'Owner@Example.com' });
    const { req, res, next } = await call('/accounts', 'Bearer tok');

    expect(allowlist.queries).toEqual(['owner@example.com']);
    expect(ensureUserSetup).toHaveBeenCalledWith('user-1');
    expect(req.userId).toBe('user-1');
    expect(req.db).toEqual({ client: 'user', token: 'tok' });
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('checks the allowlist on every request but sets a user up only once', async () => {
    signedIn();
    await call('/accounts', 'Bearer tok');
    await call('/transactions', 'Bearer tok');
    expect(allowlist.queries).toHaveLength(2);
    expect(ensureUserSetup).toHaveBeenCalledTimes(1);
  });

  it('refuses a user on their next request once they are removed from the allowlist', async () => {
    signedIn();
    await call('/accounts', 'Bearer tok');
    allowlist.emails.delete('owner@example.com');
    const { res, next } = await call('/accounts', 'Bearer tok');
    expectRejected(res, next, 403, NOT_INVITED);
  });

  it('verifies the token on every request', async () => {
    signedIn();
    await call('/accounts', 'Bearer tok');
    auth.getClaims.mockResolvedValue({ data: null, error: new Error('expired') });
    const { res, next } = await call('/accounts', 'Bearer tok');
    expectRejected(res, next, 401, 'Not signed in');
  });

  it('passes an allowlist lookup failure to the error handler', async () => {
    signedIn();
    allowlist.error = new Error('db down');
    const { next } = await call('/accounts', 'Bearer tok');
    expect(next).toHaveBeenCalledWith(allowlist.error);
    expect(ensureUserSetup).not.toHaveBeenCalled();
  });

  it('retries setup on the next request if it failed', async () => {
    signedIn();
    ensureUserSetup.mockRejectedValueOnce(new Error('seed failed'));
    const { next } = await call('/accounts', 'Bearer tok');
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'seed failed' }));

    await call('/accounts', 'Bearer tok');
    expect(ensureUserSetup).toHaveBeenCalledTimes(2);
  });
});
