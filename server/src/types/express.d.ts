import type { Db } from '../db/supabase.js';

declare global {
  namespace Express {
    interface Request {
      // Set by the requireAuth middleware, so absent on routes it skips (health, Plaid webhooks).
      // Optional on purpose: code outside requireAuth that reaches for them fails to compile.
      /** The signed-in user's id. */
      userId?: string;
      /** Supabase client acting as the signed-in user (RLS applies). */
      db?: Db;
    }
  }
}

export {};
