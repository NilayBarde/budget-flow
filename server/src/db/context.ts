import type { Request } from 'express';
import { supabaseAdmin, type Db } from './supabase.js';

// What every service needs: a client, and the one user whose data it may touch. Services filter
// every query by userId and stamp it on every row they write, so they stay inside that user's data
// whether db is the per-user client (RLS also applies) or the service role (it doesn't).
export interface DbContext {
  db: Db;
  userId: string;
}

// The signed-in user's context, for routes behind requireAuth.
export const userContext = (req: Request): DbContext => {
  if (!req.userId || !req.db) {
    throw new Error('No signed-in user on this request: is the route behind requireAuth?');
  }
  return { db: req.db, userId: req.userId };
};

// The service role acting for one user: Plaid webhooks and scripts, which have no signed-in user.
export const adminContext = (userId: string): DbContext => ({ db: supabaseAdmin, userId });
