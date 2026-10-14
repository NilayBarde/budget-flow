import { Router } from 'express';
import type { Db } from '../db/supabase.js';
import { userContext } from '../db/context.js';
import { ACCOUNT_COLUMNS } from '../db/columns.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toPublicAccount } from '../services/account-redaction.js';

const router = Router();

const PAGE_SIZE = 1000;

// Fetch every row of a table, paginating past PostgREST's 1000-row cap.
// Runs as the signed-in user, so RLS limits every table to their rows.
const fetchAllRows = async (db: Db, table: string) => {
  // Signed-in users can't select every accounts column (the Plaid credentials are withheld).
  const columns = table === 'accounts' ? ACCOUNT_COLUMNS : '*';
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data || []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
};

const EXPORT_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'transaction_splits',
  'tags',
  'transaction_tags',
  'budget_goals',
  'recurring_transactions',
  'merchant_mappings',
  'csv_imports',
  'app_settings',
];

// Full-data JSON export for backup and portability.
router.get('/', asyncHandler(async (req, res) => {
  const { db } = userContext(req);
  const data: Record<string, unknown[]> = {};
  for (const table of EXPORT_TABLES) {
    const rows = await fetchAllRows(db, table);
    data[table] = table === 'accounts' ? rows.map(toPublicAccount) : rows;
  }

  res.setHeader('Content-Disposition', 'attachment; filename="budgetflow-export.json"');
  res.json({
    exported_at: new Date().toISOString(),
    version: 1,
    data,
  });
}));

export default router;
