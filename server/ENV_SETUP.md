# Environment Variables Setup

Create a `.env` file in the `server/` directory with the following variables:

```env
# Supabase Configuration
# Get these from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# Plaid Configuration
# Get these from: https://dashboard.plaid.com/team/keys
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SECRET=your-plaid-secret
PLAID_ENV=sandbox

# Server Configuration
PORT=3001

# API access key (required). Every /api route except /api/health and the Plaid
# webhook rejects requests without it. Generate one with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# You enter it once in the browser lock screen; it is never baked into the client.
API_ACCESS_KEY=generate-a-long-random-string

# Browser origins allowed to call the API (comma separated).
# Defaults to the Vite dev server when unset.
CORS_ORIGINS=http://localhost:5173

# Set to 1 when running behind a reverse proxy (Render, etc.) so rate limiting
# sees the real client IP. Leave unset when the server is exposed directly.
# TRUST_PROXY=1

```

## Security Notes

- The server uses a **service role** key (`SUPABASE_SERVICE_ROLE_KEY`) when set, which
  bypasses row level security. Treat it like a password and never commit it.
- Plaid webhooks are verified against Plaid's signed JWT. Point your Plaid webhook URL at
  `/api/webhooks/plaid` on your deployed server.
- If you fork this project, create your **own** Supabase project, Plaid keys, and
  `API_ACCESS_KEY`. Do not reuse anyone else's.

## Getting Your Credentials

### Supabase

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Go to **Settings > API**
4. Copy the **Project URL** → `SUPABASE_URL`
5. Copy the **anon/public** key → `SUPABASE_ANON_KEY`
6. Go to **SQL Editor** and run the contents of `supabase-schema.sql`

### Plaid

1. Go to [dashboard.plaid.com](https://dashboard.plaid.com) and create a developer account
2. Go to **Team Settings > Keys**
3. Copy the **Client ID** → `PLAID_CLIENT_ID`
4. Copy the **Sandbox Secret** → `PLAID_SECRET`
5. Set `PLAID_ENV=sandbox` for testing (use `development` for real bank connections)

### Plaid Environments

- `sandbox` - Use fake test credentials (`user_good` / `pass_good`)
- `development` - Connect to real banks (100 free connections)
- `production` - Requires Plaid approval


