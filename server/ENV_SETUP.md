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

# Pushover Configuration (for balance alerts)
# Get these from: https://pushover.net
PUSHOVER_USER_KEY=your-pushover-user-key
PUSHOVER_APP_TOKEN=your-pushover-app-token
```

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

### Pushover (for Balance Alerts)

1. Go to [pushover.net](https://pushover.net) and create an account
2. Install the Pushover app on your phone (iOS/Android) - $5 one-time purchase
3. Copy your **User Key** from the dashboard → `PUSHOVER_USER_KEY`
4. Create a new **Application/API Token** → `PUSHOVER_APP_TOKEN`

Balance alerts will be sent to your Pushover app when a credit card balance exceeds your configured threshold. Alerts trigger automatically when new transactions are synced via Plaid webhooks.
