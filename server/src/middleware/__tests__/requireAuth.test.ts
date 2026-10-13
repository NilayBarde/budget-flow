import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const { requireAuth, clearAccessCache, ACCESS_CACHE_MS } = await import('../requireAuth.js');

const signedIn = (sub = 'user-1', email = 'owner@example.com') => {
  auth.getClaims.mockResolvedValue({ data: { claims: { sub, email } }, error: null });
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

beforeEach(() => {
  clearAccessCache();
  auth.getClaims.mockReset();
  ensureUserSetup.mockClear();
  allowlist.emails = new Set(['owner@example.com']);
  allowlist.error = null;
  allowlist.queries = [];
});

afterEach(() => {
  vi.useRealTimers();
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

  it('rejects a token with no email without querying the allowlist', async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null });
    const { res, next } = await call('/accounts', 'Bearer tok');
    expectRejected(res, next, 403, "This Google account hasn't been invited.");
    expect(allowlist.queries).toEqual([]);
  });

  it('rejects an account that is not on the allowlist and does not set it up', async () => {
    signedIn('user-2', 'stranger@example.com');
    const { res, next } = await call('/accounts', 'Bearer tok');
    expectRejected(res, next, 403, "This Google account hasn't been invited.");
    expect(ensureUserSetup).not.toHaveBeenCalled();
  });

  it('admits an invited account, matching its email case-insensitively', async () => {
    signedIn('user-1', 'Owner@Example.com');
    const { req, res, next } = await call('/accounts', 'Bearer tok');

    expect(allowlist.queries).toEqual(['owner@example.com']);
    expect(ensureUserSetup).toHaveBeenCalledWith('user-1');
    expect(req.userId).toBe('user-1');
    expect(req.db).toEqual({ client: 'user', token: 'tok' });
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('remembers an admitted user for five minutes, then checks again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    signedIn();

    await call('/accounts', 'Bearer tok');
    await call('/transactions', 'Bearer tok');
    expect(allowlist.queries).toHaveLength(1);
    expect(ensureUserSetup).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + ACCESS_CACHE_MS + 1);
    await call('/accounts', 'Bearer tok');
    expect(allowlist.queries).toHaveLength(2);
  });

  it('verifies the token on every request, even when the user is remembered', async () => {
    signedIn();
    await call('/accounts', 'Bearer tok');
    auth.getClaims.mockResolvedValue({ data: null, error: new Error('expired') });
    const { res, next } = await call('/accounts', 'Bearer tok');
    expectRejected(res, next, 401, 'Not signed in');
  });

  it('passes an allowlist lookup failure to the error handler and does not remember the user', async () => {
    signedIn();
    allowlist.error = new Error('db down');
    const { next } = await call('/accounts', 'Bearer tok');
    expect(next).toHaveBeenCalledWith(allowlist.error);

    allowlist.error = null;
    await call('/accounts', 'Bearer tok');
    expect(allowlist.queries).toHaveLength(2);
  });
});
