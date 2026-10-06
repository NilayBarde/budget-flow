/**
 * Dry run: re-run transaction type detection over stored transactions and list the rows
 * whose type would change. Read-only, never writes to the database.
 *
 * Usage (from server/):
 *   npx tsx --env-file=.env src/scripts/preview-type-changes.ts
 */
import { supabase } from '../db/supabase.js';
import { loadMerchantMappings, resolveTransactionType } from '../services/merchant-mappings.js';
import { detectTransactionType, SPENDING_PFC_PRIMARY } from '../services/transaction-type.js';
import type { PlaidPFC } from '../services/categorizer.js';

const PAGE_SIZE = 1000;

interface Row {
  id: string;
  date: string;
  amount: number;
  merchant_name: string | null;
  original_description: string | null;
  transaction_type: string;
  type_manually_set: boolean | null;
  plaid_category: PlaidPFC | null;
}

const loadAllTransactions = async (): Promise<Row[]> => {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, date, amount, merchant_name, original_description, transaction_type, type_manually_set, plaid_category')
      .order('date', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data as Row[]));
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
};

const main = async () => {
  const [rows, mappings] = await Promise.all([loadAllTransactions(), loadMerchantMappings()]);

  let skippedManual = 0;
  // Rows the detector change itself flips (new logic vs. the previous patterns-first logic).
  const caused: { row: Row; next: string }[] = [];
  // Rows whose stored type already differs from what the current logic produces, unrelated
  // to this change (older syncs, earlier detection rules). Informational only.
  const drift: { row: Row; next: string }[] = [];

  for (const row of rows) {
    // User-set types always win, so they can never change.
    if (row.type_manually_set) {
      skippedManual++;
      continue;
    }
    const texts = [row.merchant_name || '', row.original_description || ''];
    const mapping = mappings.find(row.merchant_name);

    const next = resolveTransactionType(
      detectTransactionType(row.amount, texts, row.plaid_category),
      mapping,
    );
    // Previous behavior: a spending primary never short-circuited, so blank it out.
    const spendingPrimary = row.plaid_category?.primary &&
      SPENDING_PFC_PRIMARY.includes(row.plaid_category.primary);
    const previous = resolveTransactionType(
      detectTransactionType(
        row.amount,
        texts,
        spendingPrimary ? { ...row.plaid_category, primary: undefined } : row.plaid_category,
      ),
      mapping,
    );

    if (next !== previous) caused.push({ row, next });
    else if (next !== row.transaction_type) drift.push({ row, next });
  }

  console.log(`Scanned ${rows.length} transactions (${skippedManual} manually typed, skipped).`);
  console.log(`${caused.length} flipped by this change, ${drift.length} already drifted (unrelated).\n`);

  const print = (label: string, list: { row: Row; next: string }[]) => {
    const byTransition = new Map<string, number>();
    for (const { row, next } of list) {
      const key = `${row.transaction_type} -> ${next}`;
      byTransition.set(key, (byTransition.get(key) || 0) + 1);
    }
    console.log(`== ${label} ==`);
    for (const [key, count] of [...byTransition].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)}  ${key}`);
    }
    for (const { row, next } of list) {
      const plaid = row.plaid_category?.detailed || row.plaid_category?.primary || 'none';
      console.log(
        `${row.date}  ${row.transaction_type} -> ${next}  ${row.amount.toFixed(2).padStart(9)}  ` +
          `${row.merchant_name || '(no name)'} | ${row.original_description || ''}  [${plaid}]`,
      );
    }
    console.log('');
  };

  print('Flipped by this change', caused);
  if (process.argv.includes('--drift')) print('Already drifted (unrelated)', drift);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
