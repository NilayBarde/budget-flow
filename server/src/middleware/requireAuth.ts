import type { RequestHandler } from 'express';
import { supabaseAdmin, createUserClient } from '../db/supabase.js';
import { ensureUserSetup } from '../services/user-setup.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const NOT_SIGNED_IN = { message: 'Not signed in' };
const NOT_INVITED = { message: "This Google account hasn't been invited." };

// Users whose default categories exist. Only setup is remembered: the allowlist is checked on every
// request, because some paths (Plaid linking, account inserts) run as the service role, where the
// database's own allowlist check doesn't apply.
const setUpUsers = new Set<string>();

// For tests.
export const clearSetupCache = () => setUpUsers.clear();

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

// Sign-in is Google only. An account created by hand and later linked to Google lists both.
const signedInWithGoogle = (appMetadata: unknown) => {
  const providers = (appMetadata as { providers?: unknown } | undefined)?.providers;
  return Array.isArray(providers) && providers.includes('google');
};

// Mounted on /api: lets a request through only with a valid Supabase token for an invited Google
// account, then sets req.userId and req.db (a client that runs as that user, so RLS applies).
export const requireAuth: RequestHandler = asyncHandler(async (req, res, next) => {
  if (isPublicPath(req.path)) return next();

  const token = bearerToken(req.headers.authorization);
  if (!token) return res.status(401).json(NOT_SIGNED_IN);

  // A user session, not the anon or service-role key (those verify too, but have no user).
  const claims = await verifiedClaims(token);
  if (!claims?.sub || claims.role !== 'authenticated') return res.status(401).json(NOT_SIGNED_IN);

  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
  if (claims.is_anonymous === true || !signedInWithGoogle(claims.app_metadata) || !email) {
    return res.status(403).json(NOT_INVITED);
  }

  const { data: invited, error } = await supabaseAdmin
    .from('user_allowlist')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  if (!invited) return res.status(403).json(NOT_INVITED);

  const userId = claims.sub;
  if (!setUpUsers.has(userId)) {
    await ensureUserSetup(userId);
    setUpUsers.add(userId);
  }

  req.userId = userId;
  req.db = createUserClient(token);
  next();
});
