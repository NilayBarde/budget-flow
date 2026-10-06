import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toPublicAccount } from '../services/account-redaction.js';

const router = Router();

const PAGE_SIZE = 1000;

// Fetch every row of a table, paginating past PostgREST's 1000-row cap.
const fetchAllRows = async (table: string) => {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
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
router.get('/', asyncHandler(async (_req, res) => {
  const data: Record<string, unknown[]> = {};
  for (const table of EXPORT_TABLES) {
    const rows = await fetchAllRows(table);
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
