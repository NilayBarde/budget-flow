import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * The browser's Supabase client, used only for signing in (Google) and keeping the session fresh.
 * All data still comes from our API. Created on first use, so code and tests that never sign in
 * don't need the Supabase env vars. The anon key is public by design: row-level security, not the
 * key, keeps each user's data to themselves.
 */
export const getSupabase = (): SupabaseClient => {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see server/ENV_SETUP.md)');
    }
    client = createClient(url, anonKey);
  }
  return client;
};
