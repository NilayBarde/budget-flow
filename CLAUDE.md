# BudgetFlow

Personal finance tracker with Plaid bank sync, Supabase backend, React frontend.

## Architecture

**Monorepo**: `client/` (React + Vite) + `server/` (Express + TypeScript)

```
budget-flow/
├── client/src/
│   ├── services/api.ts      # All API calls — single fetchApi<T>() wrapper
│   ├── hooks/               # React Query hooks (useTransactions, useAccounts, etc.)
│   ├── components/ui/       # Button, Card, Modal, Input, Select, Badge, Spinner
│   ├── components/{domain}/ # accounts/, budget/, transactions/, etc.
│   ├── pages/               # Full-page components (Dashboard, Transactions, etc.)
│   └── types/index.ts       # Shared TypeScript types
├── server/src/
│   ├── routes/              # One file per resource (transactions.ts, accounts.ts, etc.)
│   ├── services/            # plaid.ts, categorizer.ts, transaction-type.ts
│   ├── db/supabase.ts       # Supabase client + inline Database type definitions
│   └── utils/asyncHandler.ts
└── migrations/              # SQL migration files (NNN_description.sql)
```

## Dev Setup

```bash
npm install          # installs root + client + server (postinstall hook)
npm run dev          # starts server (port 3001) + client (Vite) concurrently
npm test             # runs vitest on both client and server
npm run build        # builds client to client/dist (served by Express in prod)
```

**Env files**: `server/.env` (not `.env` at root). Client uses `client/.env` with `VITE_` prefix.

Required vars (see `server/ENV_SETUP.md`):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (preferred) or `SUPABASE_ANON_KEY`
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` (sandbox/development/production)
- `PORT` (defaults to 3001)
- Client: `VITE_API_URL=http://localhost:3001/api`

## Server Conventions

**Routes**: Every route handler must be wrapped with `asyncHandler` — it catches rejections and passes to Express's global error handler.

```typescript
import { asyncHandler } from '../utils/asyncHandler.js';

router.get('/', asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('table').select('*');
  if (error) throw error;
  res.json(data);
}));
```

**Database**: Use the `supabase` client from `db/supabase.ts`. Service-role key bypasses RLS — no need to pass user context. Single user app (`user_id = 'default-user'`).

**Error responses**: Global handler returns `{ message: 'Internal server error' }` with 500. Return specific errors early with `res.status(4xx).json({ message: '...' })`.

**No validation library** — validate inline in route handlers.

## Client Conventions

**API layer**: All calls go through `services/api.ts` → `fetchApi<T>(endpoint, options?)`. Never call `fetch` directly in components or hooks.

**Hooks pattern**: React Query hooks in `hooks/useXxx.ts`. Mutations must invalidate related query keys.

```typescript
// Query
export function useTransactions(filters: TransactionFilters) {
  return useQuery({ queryKey: ['transactions', filters], queryFn: () => getTransactions(filters) });
}

// Mutation — always cascade-invalidate related queries
export function useUpdateTransaction() {
  return useMutation({
    mutationFn: updateTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
    }
  });
}
```

**Query config** (set globally in App.tsx): `staleTime: 5 minutes`, `refetchOnWindowFocus: false`.

**Modals**: Use `useModalState<T>()` hook — returns `{ isOpen, item, open, edit, close }`. Don't manage modal open/item state manually.

**Conditional classes**: Always use `clsx(...)`, never string concatenation.

**Icons**: `lucide-react` only.

**Tailwind v4**: Config is in `client/src/index.css` via `@theme {}` block — no `tailwind.config.js`. Custom colors: `midnight` (dark bg), `accent` (indigo), `emerald`, `amber`, `rose`, `slate`.

## Database & Migrations

**Migration naming**: `NNN_description_in_snake_case.sql` — next file should increment from the highest existing number.

```
migrations/019_enable_rls_all_tables.sql  ← current latest
migrations/020_your_new_migration.sql     ← next one
```

Run migrations in Supabase SQL editor (no CLI migration runner configured).

**RLS**: Enabled on all tables (migration 019). Server uses service-role key to bypass — no permissive policies needed. Don't add `user_id` filtering to server queries; the key handles isolation.

## Testing

Framework: **Vitest** on both client and server.

```bash
npm run test --prefix server   # server tests only
npm run test --prefix client   # client tests only
```

Tests live in `__tests__/` directories next to the code they test. Use `vi.fn()` for mocks. Flush microtasks with `await new Promise(r => setTimeout(r, 0))` when testing async handlers.

## Key Domain Patterns

**Transaction type detection** (server/src/services/transaction-type.ts): Priority order:
1. Text patterns — transfer keywords (payment, zelle, autopay, wire)
2. Investment patterns — broker names (fidelity, robinhood, vanguard, coinbase)
3. Plaid PFC (Personal Finance Category)
4. Amount sign — negative + no INCOME PFC = return; positive = expense

**Merchant names**: Three fields — `original_description` (raw bank), `merchant_name` (Plaid computed), `merchant_display_name` (user-editable). Display name wins in UI.

**Transaction splits**: `is_my_share` flag — only splits where this is true count toward spending totals. Used for group expenses.

**Plaid Recurring Transactions product is intentionally disabled** (cost savings). Recurring detection is done locally in the DB.

**CSV import**: Two-step — preview endpoint returns what will be imported + duplicate count, then import endpoint commits it.
