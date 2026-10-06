# Environment Variables Setup

Create a `.env` file in the `server/` directory with the following variables:

```env
# Supabase Configuration
# Get these from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
# Fallback if no service role key is set (not recommended, see below)
# SUPABASE_ANON_KEY=your-anon-key-here

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

The client needs no env file for local development: it calls `/api` by default, and Vite proxies that to `http://localhost:3001`. `VITE_API_URL` is only needed when the client is hosted separately from the API (for example on Vercel). See the README for `VITE_API_URL` and `VITE_OAUTH_REDIRECT_URI`.

## Getting Your Credentials

### Supabase

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Go to **Settings > API**
4. Copy the **Project URL** → `SUPABASE_URL`
5. Copy the **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`
6. Go to **SQL Editor** and run the contents of `supabase-schema.sql` (a baseline as of migration 023), then run each file in `migrations/` numbered 024 or higher, in order

Row Level Security is enabled on every table, and the server is the only client. The service role key bypasses RLS, which is why it is preferred. No permissive policies are defined, so with only the anon key, access is denied by default. Never expose the service role key to the client.

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

Set `PLAID_WEBHOOK_URL` to a publicly reachable `/api/webhooks/plaid` URL to get automatic transaction updates. Localhost URLs will not work unless you tunnel to them. Existing items can be pointed at a new URL with `POST /api/accounts/:id/update-webhook`.
