import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = { pages: [] as { id: string; email: string }[][], error: null as Error | null, calls: [] as unknown[] };

vi.mock('../../db/supabase.js', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        listUsers: async (params: { page: number; perPage: number }) => {
          auth.calls.push(params);
          if (auth.error) return { data: { users: [] }, error: auth.error };
          return { data: { users: auth.pages[params.page - 1] ?? [] }, error: null };
        },
      },
    },
  },
}));

const { userEmailArg, scriptContext } = await import('../script-user.js');

beforeEach(() => {
  auth.pages = [];
  auth.error = null;
  auth.calls = [];
});

describe('userEmailArg', () => {
  it('reads --user-email <email> and --user-email=<email>', () => {
    expect(userEmailArg(['node', 'x.ts', '--user-email', 'Me@Example.com'])).toBe('me@example.com');
    expect(userEmailArg(['node', 'x.ts', '--apply', '--user-email=me@example.com'])).toBe('me@example.com');
  });

  it('is null when missing or empty', () => {
    expect(userEmailArg(['node', 'x.ts', '--apply'])).toBeNull();
    expect(userEmailArg(['node', 'x.ts', '--user-email'])).toBeNull();
    expect(userEmailArg(['node', 'x.ts', '--user-email', '--apply'])).toBeNull();
  });
});

describe('scriptContext', () => {
  it("runs as the service role for the named user, matching email case-insensitively", async () => {
    auth.pages = [[{ id: 'user-1', email: 'Me@Example.com' }]];

    const ctx = await scriptContext(['node', 'x.ts', '--user-email', 'me@example.com']);

    expect(ctx.userId).toBe('user-1');
  });

  it('looks through every page of users', async () => {
    auth.pages = [
      Array.from({ length: 1000 }, (_, i) => ({ id: `u${i}`, email: `u${i}@example.com` })),
      [{ id: 'user-1', email: 'me@example.com' }],
    ];

    const ctx = await scriptContext(['node', 'x.ts', '--user-email', 'me@example.com']);

    expect(ctx.userId).toBe('user-1');
    expect(auth.calls).toHaveLength(2);
  });

  it('refuses to run without --user-email', async () => {
    await expect(scriptContext(['node', 'x.ts'])).rejects.toThrow('--user-email');
  });

  it('refuses an email with no Supabase Auth user, before touching any data', async () => {
    auth.pages = [[{ id: 'user-1', email: 'someone@example.com' }]];
    await expect(scriptContext(['node', 'x.ts', '--user-email', 'me@example.com'])).rejects.toThrow('No Supabase Auth user');
  });

  it('passes on a failed user lookup', async () => {
    auth.error = new Error('auth down');
    await expect(scriptContext(['node', 'x.ts', '--user-email', 'me@example.com'])).rejects.toThrow('auth down');
  });
});
