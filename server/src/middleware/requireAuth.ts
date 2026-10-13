import type { RequestHandler } from 'express';
import { supabaseAdmin, createUserClient } from '../db/supabase.js';
import { ensureUserSetup } from '../services/user-setup.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// How long a user who passed the allowlist check is remembered before it runs again. The database
// enforces the allowlist on every query too, so this only delays the friendlier 403 below.
export const ACCESS_CACHE_MS = 5 * 60 * 1000;

const NOT_SIGNED_IN = { message: 'Not signed in' };
const NOT_INVITED = { message: "This Google account hasn't been invited." };

const admittedUntil = new Map<string, number>();

// For tests.
export const clearAccessCache = () => admittedUntil.clear();

// Paths under /api that work without signing in: the health check and Plaid's webhooks.
const isPublicPath = (path: string) => path === '/health' || path === '/webhooks' || path.startsWith('/webhooks/');

const bearerToken = (header: string | undefined) => header?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;

const verifiedClaims = async (token: string) => {
  try {
    const { data, error } = await supabaseAdmin.auth.getClaims(token);
    return error || !data ? null : data.claims;
  } catch {
    // A malformed token or an unreachable key set is a failed sign-in, not a server error.
    return null;
  }
};

// Mounted on /api: lets a request through only with a valid Supabase token for an invited account,
// then sets req.userId and req.db (a client that runs as that user, so RLS applies).
export const requireAuth: RequestHandler = asyncHandler(async (req, res, next) => {
  if (isPublicPath(req.path)) return next();

  const token = bearerToken(req.headers.authorization);
  if (!token) return res.status(401).json(NOT_SIGNED_IN);

  const claims = await verifiedClaims(token);
  if (!claims?.sub) return res.status(401).json(NOT_SIGNED_IN);

  const userId = claims.sub;
  if ((admittedUntil.get(userId) ?? 0) <= Date.now()) {
    const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
    if (!email) return res.status(403).json(NOT_INVITED);

    const { data: invited, error } = await supabaseAdmin
      .from('user_allowlist')
      .select('email')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    if (!invited) return res.status(403).json(NOT_INVITED);

    await ensureUserSetup(userId);
    admittedUntil.set(userId, Date.now() + ACCESS_CACHE_MS);
  }

  req.userId = userId;
  req.db = createUserClient(token);
  next();
});
