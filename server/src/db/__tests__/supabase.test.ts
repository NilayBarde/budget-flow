import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn((url: string, key: string) => ({ url, key })),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

const loadModule = () => import('../supabase.js');

beforeEach(() => {
  vi.resetModules();
  createClient.mockClear();
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
});

describe('supabaseAdmin', () => {
  it('uses the service-role key', async () => {
    const { supabaseAdmin } = await loadModule();
    expect(createClient).toHaveBeenCalledWith('https://project.supabase.co', 'service-key');
    expect(supabaseAdmin).toEqual({ url: 'https://project.supabase.co', key: 'service-key' });
  });

  it('never falls back to the anon key', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await loadModule();
    expect(createClient).toHaveBeenCalledWith('https://project.supabase.co', '');
    expect(createClient).not.toHaveBeenCalledWith('https://project.supabase.co', 'anon-key');
  });

  it('is what the deprecated supabase export points at', async () => {
    const { supabase, supabaseAdmin } = await loadModule();
    expect(supabase).toBe(supabaseAdmin);
  });
});

describe('createUserClient', () => {
  it('uses the anon key and forwards the user token so RLS applies', async () => {
    const { createUserClient } = await loadModule();
    createUserClient('user-jwt');
    expect(createClient).toHaveBeenLastCalledWith('https://project.supabase.co', 'anon-key', {
      global: { headers: { Authorization: 'Bearer user-jwt' } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it('returns a new client per call', async () => {
    const { createUserClient } = await loadModule();
    expect(createUserClient('a')).not.toBe(createUserClient('b'));
  });

  it('refuses to build a client without the anon key', async () => {
    delete process.env.SUPABASE_ANON_KEY;
    const { createUserClient } = await loadModule();
    expect(() => createUserClient('user-jwt')).toThrow('SUPABASE_ANON_KEY');
  });
});
