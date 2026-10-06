/**
 * Backfill: give a category to the expenses and returns that have none.
 *
 * New syncs categorize as they save; this covers rows that were saved before a merchant rule existed, before
 * the Plaid category map was corrected, or that came from a CSV import. Each row is filled from, in order,
 * the merchant's rule, the user's own consistent history with that merchant, and Plaid's category. A row
 * nothing can place is left alone and stays flagged for review. Existing categories are never changed.
 *
 * Dry run by default, writes nothing. Pass --apply to save the changes.
 *
 * Usage (from server/):
 *   npx tsx --env-file=.env src/scripts/fill-blank-categories.ts            # preview
 *   npx tsx --env-file=.env src/scripts/fill-blank-categories.ts --apply    # save
 */
import { supabase } from '../db/supabase.js';
import { fetchAllRows } from '../utils/paginate.js';
import { planCategoryBackfill, type BackfillRow } from '../services/category-backfill.js';

const APPLY = process.argv.includes('--apply');
// 50 ids keep the request URL well under the limit gateways in front of PostgREST enforce (200 ids is about 7.5 KB).
const UPDATE_CHUNK_SIZE = 50;

const loadRows = () =>
  fetchAllRows<BackfillRow & { merchant_display_name: string | null }>(
    (from, to) =>
      supabase
        .from('transactions')
        .select('id, merchant_name, merchant_display_name, transaction_type, category_id, plaid_category, original_description')
        .order('date')
        .order('id')
        .range(from, to) as never,
    { keyOf: row => row.id },
  );

const main = async () => {
  const { data: categories, error: categoryError } = await supabase.from('categories').select('id, name');
  if (categoryError) throw categoryError;
  const categoryIdByName = new Map((categories ?? []).map(c => [c.name, c.id]));
  const categoryNameById = new Map((categories ?? []).map(c => [c.id, c.name]));

  const { data: mappings, error: mappingError } = await supabase.from('merchant_mappings').select('original_name, default_category_id');
  if (mappingError) throw mappingError;
  const ruleCategoryByMerchant = new Map(
    (mappings ?? []).filter(m => m.default_category_id).map(m => [m.original_name.trim().toLowerCase(), m.default_category_id as string]),
  );

  const rows = await loadRows();
  const plan = planCategoryBackfill({ rows, ruleCategoryByMerchant, categoryIdByName });

  const blank = rows.filter(r => (r.transaction_type === 'expense' || r.transaction_type === 'return') && !r.category_id);
  console.log(`${blank.length} expenses and returns have no category.`);
  console.log(`${plan.length} can be filled, ${blank.length - plan.length} stay for review.`);

  const bySource: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const item of plan) {
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
    const name = categoryNameById.get(item.categoryId) ?? '?';
    byCategory[name] = (byCategory[name] ?? 0) + 1;
  }
  console.log('by source:', bySource);
  console.log('by category:', byCategory);

  const planned = new Set(plan.map(p => p.id));
  const leftover = new Map<string, number>();
  for (const r of blank) {
    if (planned.has(r.id)) continue;
    const name = r.merchant_display_name || r.merchant_name || '(no name)';
    leftover.set(name, (leftover.get(name) ?? 0) + 1);
  }
  console.log('still blank, most common merchants:', [...leftover.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));

  if (!APPLY) {
    console.log('\nDry run: nothing was written. Re-run with --apply to save.');
    return;
  }

  // One update per category and chunk of ids. The category_id IS NULL guard means a row someone categorized
  // in the meantime is never overwritten.
  const idsByCategory = new Map<string, string[]>();
  for (const item of plan) idsByCategory.set(item.categoryId, [...(idsByCategory.get(item.categoryId) ?? []), item.id]);

  let written = 0;
  for (const [categoryId, ids] of idsByCategory) {
    for (let i = 0; i < ids.length; i += UPDATE_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + UPDATE_CHUNK_SIZE);
      const { data, error } = await supabase
        .from('transactions')
        .update({ category_id: categoryId, needs_review: false })
        .in('id', chunk)
        .is('category_id', null)
        .select('id');
      if (error) throw error;
      written += data?.length ?? 0;
    }
  }
  console.log(`\nSaved ${written} categories.`);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
