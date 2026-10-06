import { supabase } from '../db/supabase.js';
import { cleanMerchantName } from './categorizer.js';
import { scaleSplits, type SplitInput } from './split-scaling.js';
import { v4 as uuidv4 } from 'uuid';

// Plaid issues a pending authorization and, when it clears, a separate posted
// transaction with a NEW transaction_id and a `pending_transaction_id` pointing
// back at the pending one. Without linking them, the pending row lingers
// (double-counting, e.g. a restaurant charge that posts higher once a tip is
// added) and any user edits made on the pending auth (split, category, notes)
// are lost when the posted row arrives fresh.

interface PendingRow {
  id: string;
  amount: number;
  category_id: string | null;
  notes: string | null;
  merchant_display_name: string | null;
  merchant_name: string;
  is_split: boolean;
  needs_review: boolean;
  split_dismissed: boolean | null;
  splits: SplitInput[] | null;
}

// When a posted transaction supersedes a pending one, migrate the user's edits
// from the pending row onto the just-inserted posted row, then delete the
// pending row. Returns true if a pending predecessor was found and reconciled.
export async function reconcilePendingTransaction(
  postedLocalId: string,
  postedAmount: number,
  pendingPlaidTxId: string | null | undefined,
): Promise<boolean> {
  if (!pendingPlaidTxId) return false;

  const { data: pending, error: lookupError } = await supabase
    .from('transactions')
    .select('id, amount, category_id, notes, merchant_display_name, merchant_name, is_split, needs_review, split_dismissed, splits:transaction_splits(amount, description, is_my_share)')
    .eq('plaid_transaction_id', pendingPlaidTxId)
    .maybeSingle();

  // A failed lookup must not read as "no pending row": the sync would count it a success and move
  // on, leaving the pending row to count twice with none of the user's edits on the posted row.
  if (lookupError) throw lookupError;
  if (!pending) return false;
  const p = pending as unknown as PendingRow;

  // 1) Carry user-intent fields onto the posted row. A retry after a failure further down applies
  // these again, so an edit made to the posted row in that window is replaced by the pending
  // row's. That is accepted: it is one category or note, and the alternative is a pending row that
  // is never reconciled.
  const updates: Record<string, unknown> = {};
  if (p.category_id) {
    updates.category_id = p.category_id;
    updates.needs_review = p.needs_review ?? false; // preserve a user-cleared review state
  }
  if (p.notes && p.notes.trim()) updates.notes = p.notes;
  // "This should stay whole" is a decision about the purchase, not about which row carries it.
  if (p.split_dismissed) updates.split_dismissed = true;
  // Only copy a display name the user actually customized (differs from the
  // auto-cleaned form), so we don't clobber the posted row's own clean name.
  if (p.merchant_display_name && p.merchant_display_name !== cleanMerchantName(p.merchant_name)) {
    updates.merchant_display_name = p.merchant_display_name;
  }
  // Every write below throws on failure. The pending row is deleted last, and with it the only copy
  // of the user's splits and tags, so nothing may fail quietly before that point. A thrown error
  // leaves the pending row in place for the sync's retry to finish.
  if (Object.keys(updates).length) {
    const { error } = await supabase.from('transactions').update(updates).eq('id', postedLocalId);
    if (error) throw error;
  }

  // 2) Recreate splits (scaled to the posted total) on the posted row. A sync that was interrupted
  // after this step but before the pending row was deleted is retried, so skip the copy when the
  // posted row already has splits; otherwise the retry would double them.
  const splits = p.splits || [];
  const { count: existingSplitCount, error: countError } = await supabase
    .from('transaction_splits')
    .select('id', { count: 'exact', head: true })
    .eq('parent_transaction_id', postedLocalId);
  // If the count is unknown, do not guess "none": a wrong guess doubles the splits.
  if (countError) throw countError;

  if (p.is_split && splits.length && !existingSplitCount) {
    const scaled = scaleSplits(splits, postedAmount);
    const { error: markError } = await supabase.from('transactions').update({ is_split: true }).eq('id', postedLocalId);
    if (markError) throw markError;

    const { error: splitError } = await supabase.from('transaction_splits').insert(
      scaled.map(s => ({
        id: uuidv4(),
        parent_transaction_id: postedLocalId,
        amount: s.amount,
        description: s.description,
        is_my_share: s.is_my_share,
        created_at: new Date().toISOString(),
      }))
    );
    if (splitError) throw splitError;
  }

  // 3) Carry tags over.
  const { data: tags, error: tagsError } = await supabase
    .from('transaction_tags')
    .select('tag_id')
    .eq('transaction_id', p.id);
  if (tagsError) throw tagsError;
  if (tags && tags.length) {
    const { error } = await supabase
      .from('transaction_tags')
      .upsert(tags.map(t => ({ transaction_id: postedLocalId, tag_id: t.tag_id })));
    if (error) throw error;
  }

  // 4) Remove the superseded pending row (its splits/tags cascade via FK).
  const { error: deleteError } = await supabase.from('transactions').delete().eq('id', p.id);
  if (deleteError) throw deleteError;
  return true;
}
