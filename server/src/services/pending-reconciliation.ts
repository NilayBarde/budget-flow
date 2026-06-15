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

  const { data: pending } = await supabase
    .from('transactions')
    .select('id, amount, category_id, notes, merchant_display_name, merchant_name, is_split, needs_review, splits:transaction_splits(amount, description, is_my_share)')
    .eq('plaid_transaction_id', pendingPlaidTxId)
    .maybeSingle();

  if (!pending) return false;
  const p = pending as unknown as PendingRow;

  // 1) Carry user-intent fields onto the posted row.
  const updates: Record<string, unknown> = {};
  if (p.category_id) {
    updates.category_id = p.category_id;
    updates.needs_review = p.needs_review ?? false; // preserve a user-cleared review state
  }
  if (p.notes && p.notes.trim()) updates.notes = p.notes;
  // Only copy a display name the user actually customized (differs from the
  // auto-cleaned form), so we don't clobber the posted row's own clean name.
  if (p.merchant_display_name && p.merchant_display_name !== cleanMerchantName(p.merchant_name)) {
    updates.merchant_display_name = p.merchant_display_name;
  }
  if (Object.keys(updates).length) {
    await supabase.from('transactions').update(updates).eq('id', postedLocalId);
  }

  // 2) Recreate splits (scaled to the posted total) on the posted row.
  const splits = p.splits || [];
  if (p.is_split && splits.length) {
    const scaled = scaleSplits(splits, postedAmount);
    await supabase.from('transactions').update({ is_split: true }).eq('id', postedLocalId);
    await supabase.from('transaction_splits').insert(
      scaled.map(s => ({
        id: uuidv4(),
        parent_transaction_id: postedLocalId,
        amount: s.amount,
        description: s.description,
        is_my_share: s.is_my_share,
        created_at: new Date().toISOString(),
      }))
    );
  }

  // 3) Carry tags over.
  const { data: tags } = await supabase
    .from('transaction_tags')
    .select('tag_id')
    .eq('transaction_id', p.id);
  if (tags && tags.length) {
    await supabase
      .from('transaction_tags')
      .upsert(tags.map(t => ({ transaction_id: postedLocalId, tag_id: t.tag_id })));
  }

  // 4) Remove the superseded pending row (its splits/tags cascade via FK).
  await supabase.from('transactions').delete().eq('id', p.id);
  return true;
}
