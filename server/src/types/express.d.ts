import type { Db } from '../db/supabase.js';

declare global {
  namespace Express {
    interface Request {
      /** The signed-in user's id, set by the requireAuth middleware. */
      userId: string;
      /** Supabase client acting as the signed-in user (RLS applies), set by requireAuth. */
      db: Db;
    }
  }
}

export {};
