# Environment Variables Setup

Create a `.env` file in the `server/` directory with the following variables:

```env
# Supabase Configuration
# Get these from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
SUPABASE_URL=https://your-project-id.supabase.co
# Both keys are required; the server refuses to start without either.
# Service role: Plaid webhooks, scripts and Plaid credentials (bypasses RLS, server only)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
# Anon key: every signed-in request runs as that user with this key plus their token (RLS applies)
SUPABASE_ANON_KEY=your-anon-key-here

# Plaid Configuration
# Get these from: https://dashboard.plaid.com/team/keys
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SECRET=your-plaid-secret
PLAID_ENV=sandbox

# Optional: public URL Plaid calls with transaction updates
# PLAID_WEBHOOK_URL=https://your-host/api/webhooks/plaid

# Server Configuration
PORT=3001
```

The client needs a `client/.env` (or, when hosted separately, the host's build env) with the same project's public values, used only for Google sign-in:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Locally the client calls `/api` and Vite proxies it to `http://localhost:3001`. `VITE_API_URL` is only needed when the client is hosted separately from the API (for example on Vercel). See the README for `VITE_API_URL` and `VITE_OAUTH_REDIRECT_URI`.

## Getting Your Credentials

### Supabase

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Go to **Settings > API**
4. Copy the **Project URL** → `SUPABASE_URL` and `VITE_SUPABASE_URL`
5. Copy the **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server only, never in the client)
6. Copy the **anon** key → `SUPABASE_ANON_KEY` and `VITE_SUPABASE_ANON_KEY`
7. Create your own user first: **Authentication > Users > Add user**, with your Google account's email, auto-confirmed. Migration 030 makes it the owner of all existing data and stops if it doesn't exist.
8. Go to **SQL Editor** and run the contents of `supabase-schema.sql` (a baseline as of migration 023), then run each file in `migrations/` numbered 024 or higher, in order. For 030 and 031 read their header comments: on an existing install they're run at specific points of the rollout below.

Every data table has row-level security with an `owner_all` policy: a row is visible only to the signed-in user who owns it, and only while their email is on `user_allowlist`. The anon key is public by design; RLS, not the key, keeps each user's data to themselves. The service role key bypasses RLS: never expose it to the client.

### Google sign-in (one time)

1. **Google Cloud console > APIs & Services > Credentials > Create credentials > OAuth client ID**, type **Web application**. Authorized redirect URI: `https://your-project-id.supabase.co/auth/v1/callback`.
2. **Supabase > Authentication > Sign In / Providers > Google**: paste the client ID and secret, and enable it.
3. **Supabase > Authentication > Sign In / Providers > Email**: turn off **Allow new users to sign up** (the app is Google-only; the server also rejects non-Google accounts).
4. **Supabase > Authentication > URL Configuration**: set **Site URL** to the deployed client URL, and add `http://localhost:5173/**` and `https://your-client-host/**` to **Redirect URLs**. The `/**` lets sign-in return to the page you asked for (a Plaid bank-link return included) instead of always the home page.
5. **Supabase > Settings > JWT Keys**: migrate to asymmetric signing keys, so the server verifies tokens locally instead of calling Supabase Auth on every request.

### Inviting someone

Only emails on the allowlist can use the app (the server checks it on every request, and the database policies check it on every query). In the SQL editor:

```sql
INSERT INTO user_allowlist (email) VALUES ('friend@example.com');  -- lowercase
```

They sign in with that Google account and start with the default categories and nothing else. To remove someone, delete their row from `user_allowlist` (they lose access on their next request); deleting their user in **Authentication > Users** also deletes all their data.

Only invite people after migration 031 has run (see below).

### Plaid

1. Go to [dashboard.plaid.com](https://dashboard.plaid.com) and create a developer account
2. Go to **Team Settings > Keys**
3. Copy the **Client ID** → `PLAID_CLIENT_ID`
4. Copy the **Sandbox Secret** → `PLAID_SECRET`
5. Set `PLAID_ENV=sandbox` for testing (use `development` for real bank connections)

### Plaid Environments

- `sandbox`: Use fake test credentials (`user_good` / `pass_good`)
- `development`: Connect to real banks (100 free connections)
- `production`: Requires Plaid approval

### Plaid Webhooks (optional)

Set `PLAID_WEBHOOK_URL` to a publicly reachable `/api/webhooks/plaid` URL to get automatic transaction updates. Localhost URLs will not work unless you tunnel to them. Existing items can be pointed at a new URL with `POST /api/accounts/:id/update-webhook`. The server verifies Plaid's signature on every webhook and rejects anything unsigned, altered or older than five minutes.

## Moving an existing install to multi-user

Linked banks keep working throughout: nothing is re-linked. In order:

1. Do the **Google sign-in (one time)** steps above, and **Add user** with your own Google email (Supabase step 7).
2. Set `SUPABASE_ANON_KEY` on the server and `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` on the client host.
3. Run `migrations/030_multi_user.sql`, then `server/scripts/sql/isolation-check.sql` and `server/scripts/sql/legacy-writes-check.sql` (both roll back and raise on any failure). The app keeps working, except linking a bank or adding a manual account, until the next step.
4. Deploy the new server and client.
5. Sign in with Google and check your data is there. **If you see an error or an empty app**, look in Authentication > Users for two rows with your email: put both ids into `server/scripts/sql/reassign-owner.sql` and run it, then delete the hand-made user.
6. Run `migrations/031_multi_user_cleanup.sql`. Only now invite anyone else.

`npm run test:migrations --prefix server` rehearses steps 3 to 6 against a throwaway local Postgres.
