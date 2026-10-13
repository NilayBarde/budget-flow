# Multi-User PR 2: Auth Middleware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `/api` request except health and webhooks must carry a valid Supabase token for an invited Google account; the server then knows `req.userId` and has `req.db`, a client that runs as that user.

**Architecture:** One Express middleware mounted on `/api` before the routers verifies the JWT with `getClaims`, checks the email against `user_allowlist`, seeds default categories on first sign-in, and attaches `req.userId` / `req.db`. Routes don't use `req.db` yet (PRs 4–5), so this PR changes only who may call the API.

**Tech Stack:** Express 5, `@supabase/supabase-js` 2.89 (`auth.getClaims`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-multi-user-google-sign-in-design.md` §1 (Server, One-time setup). Parent plan: `docs/superpowers/plans/2026-10-11-multi-user-google-sign-in.md` (roadmap row PR 2).

## Global Constraints

- 401 body `{ message: 'Not signed in' }`; 403 body `{ message: "This Google account hasn't been invited." }`.
- Bypass exactly `/api/health` and `/api/webhooks/*`.
- Allowlist + setup result cached per user for 5 minutes (`ACCESS_CACHE_MS = 5 * 60 * 1000`); token verified on every request.
- Emails compared lowercase (`user_allowlist.email` is constrained lowercase).
- Default categories: the 13 from `supabase-schema.sql`, `is_default: true`.
- Server startup fails (exit 1) unless `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are all set; no anon-key fallback for the admin client.

## Review Focus

1. **`getClaims` returns `{ data: null, error: null }`** (its third documented outcome) → 401, not a crash on `data.claims`.
2. **`getClaims` throws** (JWKS fetch failure, malformed token) → 401, not a 500.
3. **Token for a valid user whose JWT has no `email` claim** → 403, and no allowlist query with an empty string.
4. **Mixed-case email in the token** (`Nilay@Gmail.com`) → matched against the lowercase allowlist.
5. **Allowlist lookup fails (DB error)** → error reaches Express's handler (500), and the user is not cached as allowed.

---

### Task 1: `ensureUserSetup` and `DEFAULT_CATEGORIES`

**Files:**
- Create: `server/src/services/user-setup.ts`, `server/src/services/__tests__/user-setup.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` from `db/supabase.ts`.
- Produces: `DEFAULT_CATEGORIES: readonly { name: string; icon: string; color: string }[]`, `ensureUserSetup(userId: string): Promise<void>`.

Tests (mock `../../db/supabase.js` with a recording `supabaseAdmin.from`):
- user with no categories → one upsert of 13 rows, each `{ ...category, is_default: true, user_id }`, options `{ onConflict: 'user_id,name', ignoreDuplicates: true }`; the count query filtered `user_id = userId`.
- user with categories → no upsert.
- count query error → rejects with it; upsert error → rejects with it.

Implementation: count with `select('id', { count: 'exact', head: true }).eq('user_id', userId)`; if zero, upsert as above. Uses `supabaseAdmin` because a brand-new user's first request must succeed before anything else exists, and stamps `user_id` explicitly per the service rule.

### Task 2: `requireAuth` middleware

**Files:**
- Create: `server/src/middleware/requireAuth.ts`, `server/src/middleware/__tests__/requireAuth.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin.auth.getClaims`, `supabaseAdmin.from('user_allowlist')`, `createUserClient`, `ensureUserSetup`.
- Produces: `requireAuth: RequestHandler`, `ACCESS_CACHE_MS`, `clearAccessCache(): void` (tests only).

Tests (mock `../../db/supabase.js` and `../../services/user-setup.js`; `res` with chained `status`/`json` spies):
- `/health`, `/webhooks/plaid` → `next()` without touching auth.
- no `Authorization` → 401; `Basic abc` → 401.
- `getClaims` → `{ data: null, error }` → 401; → `{ data: null, error: null }` → 401; throws → 401.
- claims without `email` → 403, allowlist not queried.
- email not on allowlist → 403, `ensureUserSetup` not called.
- invited, mixed-case email → allowlist queried with lowercase; `ensureUserSetup(sub)`; `req.userId = sub`; `req.db` is `createUserClient(token)`'s result; `next()` called with no args.
- second request within 5 minutes → no allowlist query or setup; after 5 minutes (fake timers) → queried again.
- allowlist query error → `next(error)`; a following request queries again (not cached).

### Task 3: Mount it and require both Supabase keys

**Files:**
- Modify: `server/src/index.ts` (env check + logging; `app.use('/api', requireAuth)` after `express.json()`, before the routers), `server/src/db/supabase.ts` (drop anon fallback), `server/src/db/__tests__/supabase.test.ts` (fallback gone)

Verify: `npm test --prefix server`, `npm run build --prefix server`, then start the server with dummy env and check `curl /api/health` → 200, `curl /api/accounts` → 401, `curl -H 'Authorization: Bearer x' /api/accounts` → 401.

### Task 4: PR

Push `multi-user/02-auth-middleware`, open the PR against `multi-user/01-db-foundation` (retarget to `feature/multi-user` once PR 1 merges), run `/code-review`.
