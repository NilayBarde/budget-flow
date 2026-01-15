# BudgetFlow - Personal Finance Tracker

A comprehensive budget tracking application that connects to your bank accounts via Plaid, auto-categorizes transactions, and helps you manage your spending with budget goals.

## Features

- **Bank Connection**: Connect American Express, Discover, Capital One, Robinhood, Bilt, and Venmo accounts via Plaid
- **Auto-Categorization**: Transactions are automatically categorized based on merchant names
- **Transaction Splitting**: Split transactions (e.g., group dinners) with custom amounts
- **Budget Goals**: Set monthly spending limits per category with visual progress tracking
- **Year Overview**: View annual spending charts and category breakdowns
- **Recurring Detection**: Automatically detect subscriptions and recurring charges
- **Merchant Cleanup**: Clean up ugly bank merchant names with saved mappings
- **Tags System**: Create custom tags for flexible transaction organization

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript + TailwindCSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: Supabase (PostgreSQL)
- **Bank Connection**: Plaid API
- **Charts**: Recharts

## Prerequisites

1. **Node.js** (v18 or higher)
2. **Supabase Account** (free tier): https://supabase.com
3. **Plaid Account** (development mode): https://plaid.com

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

### 2. Set Up Supabase

1. Create a new project at https://supabase.com
2. Go to **SQL Editor** and run the contents of `supabase-schema.sql`
3. Go to **Settings > API** and copy:
   - Project URL
   - Anon/Public key

### 3. Set Up Plaid

1. Create an account at https://dashboard.plaid.com
2. Go to **Team Settings > Keys**
3. Copy your Client ID and Sandbox/Development Secret
4. Note: Use `sandbox` for testing with fake banks, `development` for real bank connections

### 4. Configure Environment Variables

Create a `.env` file in the `server` directory:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Plaid Configuration
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox  # Use 'development' for real banks

# Server Configuration
PORT=3001
```

### 5. Run the Application

```bash
# Terminal 1 - Start the backend
cd server
npm run dev

# Terminal 2 - Start the frontend
cd client
npm run dev
```

The app will be available at http://localhost:5173

## Usage

### Connecting Bank Accounts

1. Go to **Accounts** page
2. Click **Connect Account**
3. Use Plaid Link to connect your bank
   - In sandbox mode, use credentials: `user_good` / `pass_good`
4. Click **Sync** to fetch transactions

### Managing Transactions

- View all transactions on the **Transactions** page
- Use filters to view by month, category, account, or tags
- Click the **⋮** menu on any transaction to:
  - Edit merchant name and category
  - Split the transaction
  - Add tags

### Setting Budget Goals

1. Go to **Budget** page
2. Click **Add Budget**
3. Select a category and set a monthly limit
4. Track progress with visual indicators

### Viewing Year Overview

- Go to **Year Overview** for annual spending charts
- View spending by category pie chart
- Compare month-over-month spending

### Managing Subscriptions

- Go to **Subscriptions** page
- Click **Detect Subscriptions** to find recurring charges
- View monthly recurring costs

## Development

### Project Structure

```
budgeting/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # React Query hooks
│   │   ├── services/       # API client
│   │   ├── types/          # TypeScript types
│   │   └── utils/          # Utilities
│   └── package.json
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Business logic
│   │   └── db/             # Database client
│   └── package.json
├── supabase-schema.sql     # Database schema
└── README.md
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/accounts | List connected accounts |
| POST | /api/accounts/:id/sync | Sync transactions |
| GET | /api/transactions | List transactions with filters |
| PATCH | /api/transactions/:id | Update transaction |
| POST | /api/transactions/:id/splits | Create splits |
| GET | /api/categories | List categories |
| GET | /api/budget-goals | Get budget goals |
| POST | /api/budget-goals | Create budget goal |
| GET | /api/tags | List tags |
| POST | /api/tags | Create tag |
| GET | /api/recurring-transactions | List subscriptions |
| POST | /api/recurring-transactions/detect | Detect subscriptions |
| GET | /api/stats/monthly | Get monthly stats |
| GET | /api/stats/yearly | Get yearly stats |

## License

MIT

