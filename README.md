# BudgetFlow: Personal Finance Tracker

A personal budget tracking app that connects to your bank accounts via Plaid, auto-categorizes transactions, and helps you manage spending with budget guardrails, a net worth goal, and yearly insights. Each person signs in with Google and sees only their own data; it's invite-only, run against your own Supabase project.

## Features

- **Bank Connection**: Connect American Express, Discover, Capital One, Robinhood, Bilt, Venmo and other Plaid-supported institutions, including OAuth banks. Manual accounts are supported too.
- **Sync**: Cursor-based Plaid transaction sync, Plaid webhooks for automatic updates, sync health reporting on the Dashboard, and automatic re-sync after a relink.
- **CSV Import**: Import transactions from a CSV with a preview step that reports duplicates before anything is committed. Imports can be listed and undone.
- **Auto-Categorization**: Transactions are categorized from merchant names, and your category and transaction type corrections are learned for next time.
- **Transaction Types**: Expenses, income, transfers, investments and returns are detected automatically so transfers and card payments do not inflate spending.
- **Transaction Splitting**: Split transactions (for example group dinners) with custom amounts. Only your share counts toward spending.
- **Budget Guardrails**: Monthly spending limits per category on the **Plan** page, with progress and variance widgets on the Dashboard.
- **Net Worth Goal**: Track net worth against a target.
- **Investments**: Portfolio summary and allocation for investment accounts, with the option to exclude accounts.
- **Insights**: Yearly top categories and merchants, spending trends, and a subscription overview with net cost and card fee callouts.
- **Subscriptions**: Recurring charges are detected locally from your transaction history (the paid Plaid Recurring Transactions product is intentionally not used).
- **Year Overview**: Annual spending charts and category breakdowns.
- **Merchant Cleanup**: Replace ugly bank merchant names with saved display names.
- **Tags**: Custom tags for flexible organization, with bulk tagging.
- **Export**: Download a JSON backup of all your data from Settings.

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS v4, React Query
- **Backend**: Node.js, Express, TypeScript
- **Database**: Supabase (PostgreSQL)
- **Bank Connection**: Plaid API
- **Charts**: Recharts
- **Tests**: Vitest (client and server)

## Prerequisites

1. **Node.js** (v18 or higher)
2. **Supabase account** (free tier): https://supabase.com
3. **Plaid account** (sandbox or development): https://plaid.com

## Setup

### 1. Install Dependencies

From the repo root, a single install covers the root, `client/` and `server/` (via a `postinstall` hook):

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new project at https://supabase.com
2. Set up Google sign-in and create your own user first, then apply the schema and migrations in the order given in `server/ENV_SETUP.md` (migrations 030 and 031 have to run at specific points, and 030 needs your user to exist)
3. Go to **Settings > API** and copy the Project URL, the `service_role` key (server only) and the `anon` key (server and client): both keys are required

There is no CLI migration runner. New migrations are named `NNN_description.sql` and are applied by hand in the SQL editor.

### 3. Set Up Plaid

1. Create an account at https://dashboard.plaid.com
2. Go to **Team Settings > Keys** and copy your Client ID and secret
3. Use `sandbox` for fake banks and `development` for real bank connections

The app requests the Transactions product, and Investments when the institution supports it. Do not enable Plaid Recurring Transactions.

### 4. Configure Environment Variables

Create `server/.env` (see also `server/ENV_SETUP.md`):

```env
# Supabase
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # server only: webhooks, scripts, Plaid credentials
SUPABASE_ANON_KEY=your_anon_key                   # signed-in requests run as the user with this

# Plaid
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox                   # sandbox | development | production

# Optional: public URL Plaid calls with transaction updates
# PLAID_WEBHOOK_URL=https://your-host/api/webhooks/plaid

# Server
PORT=3001
```

Create `client/.env` for Google sign-in (the same project's public values):

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

API calls go to `/api`, which the Vite dev server proxies to `http://localhost:3001`. Add these only when needed:

```env
# Client hosted separately from the API (for example on Vercel)
VITE_API_URL=https://your-api-host/api
# Required for OAuth banks (must be registered in the Plaid dashboard)
VITE_OAUTH_REDIRECT_URI=https://your-host/oauth-callback
```

### 5. Run the Application

```bash
npm run dev
```

This starts the API (port 3001) and the Vite dev server together. The app will be available at http://localhost:5173.

To run them separately, use `npm run dev --prefix server` and `npm run dev --prefix client`.

## Usage

### Connecting Bank Accounts

1. Go to **Accounts**
2. Click **Connect Account** and complete Plaid Link
   - In sandbox mode, use `user_good` / `pass_good`
3. Click **Sync** to fetch transactions. Accounts with CSV history can also import a file from the same page.

### Managing Transactions

- View everything on **Transactions**, filtered by month, category, account, type or tags
- Open the **⋮** menu on a transaction to edit the merchant name and category, split it, or add tags
- Use bulk actions to tag, split or delete several transactions at once

### Setting Budget Guardrails

1. Go to **Plan**
2. Add a category and a monthly limit under **Budget Guardrails**
3. Track progress on the Plan page and the Dashboard

### Insights and Subscriptions

- **Insights** shows yearly spending trends, top categories and merchants, and the subscription overview
- **Year Overview** shows annual charts and a category breakdown

### Settings

- Create, edit and delete categories
- Export all of your data as JSON
- See the app version

## Development

### Commands

```bash
npm run dev      # API + client, with reload
npm test         # server tests, then client tests
npm run build    # build the client to client/dist
npm start        # run the compiled server
npm run bump     # bump the patch version
```

Server tests: `npm test --prefix server`. Client tests: `npm test --prefix client`.

### Versioning

The app version is the `version` field in the root `package.json`, and the Settings page displays it. Every PR has to raise it: the `Version bump` GitHub check fails if a PR's version isn't higher than main's.

- Fixes and small changes: `npm run bump` (1.1.0 → 1.1.1)
- New features: `npm version minor --no-git-tag-version` (1.1.0 → 1.2.0)

Commit both `package.json` and `package-lock.json`. If main gets a new version while your PR is open, bump again.

### Production

Build the client (`npm run build`), build the server (`npm run build --prefix server`), then run `npm start`. If `client/dist` exists the Express server serves it, otherwise it runs in API-only mode so the client can be hosted separately (for example on Vercel). Plaid webhooks require the API to be reachable at a public URL.

### Project Structure

```
budget-flow/
├── client/                 # React frontend
│   └── src/
│       ├── components/     # UI components, grouped by domain
│       ├── pages/          # Dashboard, Transactions, Plan, Net Worth, ...
│       ├── hooks/          # React Query hooks
│       ├── services/       # API client
│       ├── types/          # TypeScript types
│       └── utils/          # Utilities
├── server/                 # Node.js backend
│   └── src/
│       ├── routes/         # One file per API resource
│       ├── services/       # Plaid, categorizer, recurring detection, etc.
│       ├── db/             # Supabase client
│       └── utils/          # Shared helpers
├── migrations/             # SQL migrations (NNN_description.sql)
├── docs/                   # Plans and specs
├── supabase-schema.sql     # Baseline schema (through migration 023)
└── README.md
```

### API Endpoints

All routes are prefixed with `/api`. `GET /api/health` is a health check.

| Resource | Endpoints |
|----------|-----------|
| `/accounts` | `GET /`, `GET /sync-health`, `POST /manual`, `POST /:id/sync`, `PATCH /:id`, `DELETE /:id`, `POST /:id/refresh-accounts`, `POST /:id/reset-cursor`, `POST /:id/update-webhook` |
| `/plaid` | `POST /create-link-token`, `/create-update-link-token`, `/exchange-token`, `/log-link-event` |
| `/webhooks` | `POST /plaid` |
| `/transactions` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`, `GET /duplicates`, `GET /similar/:merchantName` (and `/count`), `POST /:id/splits`, `DELETE /:id/splits`, `POST` and `DELETE /:id/tags/:tagId`, bulk actions under `/bulk/delete`, `/bulk/splits`, `/bulk/tags` |
| `/csv-import` | `POST /:accountId/preview`, `POST /:accountId/import`, `GET /:accountId/imports`, `DELETE /imports/:importId`, `POST /:accountId/backfill-references` |
| `/categories` | `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| `/budget-goals` | `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| `/tags` | `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| `/merchant-mappings` | `GET /`, `POST /`, `DELETE /:id` |
| `/recurring-transactions` | `GET /`, `GET /overview`, `PATCH /:id` |
| `/stats` | `GET /monthly`, `GET /yearly`, `GET /insights`, `GET /estimated-income` |
| `/investments` | `GET /summary`, `PATCH /accounts/:accountId/exclude` |
| `/settings` | `GET /`, `GET /:key`, `PUT /:key` |
| `/export` | `GET /` |

## License

MIT
