import { Router } from 'express';
import type { Db } from '../db/supabase.js';
import { userContext } from '../db/context.js';
import { ACCOUNT_COLUMNS } from '../db/columns.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { fetchAllRows } from '../utils/paginate.js';
import { toPublicAccount } from '../services/account-redaction.js';

const router = Router();

// Each table with the columns that identify a row, which give paging a stable order (an unordered
// read can skip or repeat rows between pages) and let a row returned twice be kept once.
const EXPORT_TABLES: { table: string; key: string[] }[] = [
  { table: 'accounts', key: ['id'] },
  { table: 'categories', key: ['id'] },
  { table: 'transactions', key: ['id'] },
  { table: 'transaction_splits', key: ['id'] },
  { table: 'tags', key: ['id'] },
  { table: 'transaction_tags', key: ['transaction_id', 'tag_id'] },
  { table: 'budget_goals', key: ['id'] },
  { table: 'recurring_transactions', key: ['id'] },
  { table: 'merchant_mappings', key: ['id'] },
  { table: 'csv_imports', key: ['id'] },
  { table: 'app_settings', key: ['key'] },
];

// Every row of a table. Runs as the signed-in user, so RLS limits it to their rows.
const exportTable = (db: Db, table: string, key: string[]) => {
  // Signed-in users can't select every accounts column (the Plaid credentials are withheld).
  const columns = table === 'accounts' ? ACCOUNT_COLUMNS : '*';
  return fetchAllRows<Record<string, unknown>>(
    (from, to) => {
      let query = db.from(table).select(columns);
      for (const column of key) query = query.order(column);
      return query.range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>;
    },
    { keyOf: row => key.map(column => String(row[column])).join('|') },
  );
};

// Full-data JSON export for backup and portability.
router.get('/', asyncHandler(async (req, res) => {
  const { db } = userContext(req);
  const tables = await Promise.all(EXPORT_TABLES.map(({ table, key }) => exportTable(db, table, key)));

  const data: Record<string, unknown[]> = {};
  EXPORT_TABLES.forEach(({ table }, i) => {
    // The credential columns aren't selected, so this is a second guard, kept on purpose: an export
    // is a file that leaves the app.
    data[table] = table === 'accounts' ? tables[i].map(toPublicAccount) : tables[i];
  });

  res.setHeader('Content-Disposition', 'attachment; filename="budgetflow-export.json"');
  res.json({
    exported_at: new Date().toISOString(),
    version: 1,
    data,
  });
}));

export default router;
