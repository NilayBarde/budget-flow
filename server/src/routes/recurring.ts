import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { detectRecurringSeries, type DetectionTxn, type DetectedSeries } from '../services/recurring-detection.js';
import { matchCreditsToCharges } from '../services/credit-matching.js';
import { getMyShareAmount, type SplitShare } from '../services/category-spend.js';
import { monthlyEquivalentAmount, type RecurringFrequency } from '../services/recurring-normalize.js';

const router = Router();

// Detection looks back ~13 months so yearly series (card fees, Clear) have
// at least two occurrences to establish cadence.
const DETECTION_WINDOW_DAYS = 400;
const REFRESH_STALE_MS = 24 * 60 * 60 * 1000;
const LAST_REFRESHED_KEY = 'recurring_last_refreshed';
const FEE_PATTERN = /membership fee|annual fee/i;
const PERK_CREDIT_PATTERN = /credit/i;
const NOT_PERK_PATTERN = /dispute/i;

interface WindowTxn extends DetectionTxn {
  accountName: string | null;
}

const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

const fetchWindowTransactions = async (): Promise<WindowTxn[]> => {
  const since = isoDaysAgo(DETECTION_WINDOW_DAYS);
  const rows: WindowTxn[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'date, amount, merchant_name, merchant_display_name, transaction_type, is_split, splits:transaction_splits(amount, is_my_share), account:accounts(account_name)'
      )
      .gte('date', since)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    for (const t of data || []) {
      rows.push({
        merchant: t.merchant_display_name || t.merchant_name,
        amount: getMyShareAmount({
          amount: t.amount,
          is_split: t.is_split,
          splits: t.splits as SplitShare[] | null,
        }),
        date: t.date,
        transaction_type: t.transaction_type,
        accountName: (t.account as unknown as { account_name: string } | null)?.account_name ?? null,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return rows;
};

interface RefreshResult {
  charges: DetectedSeries[];
  credits: DetectedSeries[];
  matchedCreditNames: Set<string>;
  txns: WindowTxn[];
}

// Merchants the user deleted (kept as hidden rows). Detection skips them so a
// deleted series is not re-created, re-activated, or paired with credits.
const runDetection = (txns: WindowTxn[], today: string, deletedMerchants: ReadonlySet<string>) => {
  const charges = detectRecurringSeries(txns, today, 'expense').filter(
    c => !deletedMerchants.has(c.merchant),
  );
  const credits = detectRecurringSeries(txns, today, 'return');
  const offsets = matchCreditsToCharges(charges, credits);
  return { charges, credits, offsets };
};

// Reconcile the recurring_transactions table with what detection found.
// user_hidden is never touched; manual rows keep their source.
const refreshRecurringTable = async (today: string): Promise<RefreshResult> => {
  const txns = await fetchWindowTransactions();

  const { data: existing, error } = await supabase.from('recurring_transactions').select('*');
  if (error) throw error;
  const byName = new Map((existing || []).map(r => [r.merchant_display_name, r]));
  const deletedMerchants = new Set(
    (existing || []).filter(r => r.user_hidden).map(r => r.merchant_display_name),
  );

  const { charges, credits, offsets } = runDetection(txns, today, deletedMerchants);

  if (charges.length > 0) {
    const upserts = charges.map(c => ({
      merchant_display_name: c.merchant,
      average_amount: c.averageAmount,
      frequency: c.frequency,
      last_seen: c.lastSeen,
      is_active: c.isActive,
      source: byName.get(c.merchant)?.source === 'manual' ? 'manual' : 'detected',
      offset_merchant_name: offsets.get(c.merchant)?.merchant ?? null,
      offset_monthly_amount: offsets.get(c.merchant)?.monthlyAmount ?? null,
    }));
    const { error: upsertError } = await supabase
      .from('recurring_transactions')
      .upsert(upserts, { onConflict: 'merchant_display_name' });
    if (upsertError) throw upsertError;
  }

  // Detected rows that no longer detect (and aren't user-marked) go inactive.
  const detectedNames = new Set(charges.map(c => c.merchant));
  const staleIds = (existing || [])
    .filter(r => r.source === 'detected' && r.is_active && !detectedNames.has(r.merchant_display_name))
    .map(r => r.id);
  if (staleIds.length > 0) {
    const { error: staleError } = await supabase
      .from('recurring_transactions')
      .update({ is_active: false })
      .in('id', staleIds);
    if (staleError) throw staleError;
  }

  await supabase
    .from('app_settings')
    .upsert({ key: LAST_REFRESHED_KEY, value: new Date().toISOString() }, { onConflict: 'key' });

  const matchedCreditNames = new Set([...offsets.values()].map(m => m.merchant));
  return { charges, credits, matchedCreditNames, txns };
};

// Card fee report: annual fees per credit-card account vs the perk credits
// that landed on the same account over the trailing 12 months.
const buildCardFeeReport = (txns: WindowTxn[], matchedCreditNames: Set<string>) => {
  const yearAgo = isoDaysAgo(365);
  const cards = new Map<string, { fee: number; credits: number }>();

  for (const t of txns) {
    if (!t.accountName || t.date < yearAgo) continue;
    if (t.transaction_type === 'expense' && FEE_PATTERN.test(t.merchant)) {
      const entry = cards.get(t.accountName) || { fee: 0, credits: 0 };
      entry.fee += t.amount;
      cards.set(t.accountName, entry);
    }
  }

  // Only accounts that actually charge a fee get a report row.
  for (const t of txns) {
    if (!t.accountName || t.date < yearAgo || !cards.has(t.accountName)) continue;
    if (t.transaction_type !== 'return') continue;
    const isPerk =
      (PERK_CREDIT_PATTERN.test(t.merchant) && !NOT_PERK_PATTERN.test(t.merchant)) ||
      matchedCreditNames.has(t.merchant);
    if (isPerk) {
      const entry = cards.get(t.accountName) as { fee: number; credits: number };
      entry.credits += t.amount;
    }
  }

  return [...cards.entries()]
    .map(([account_name, v]) => ({
      account_name,
      fee_annual: Math.round(v.fee * 100) / 100,
      credits_12mo: Math.round(v.credits * 100) / 100,
      net_annual: Math.round((v.fee - v.credits) * 100) / 100,
      covered: v.credits >= v.fee,
    }))
    .sort((a, b) => b.fee_annual - a.fee_annual);
};

// Get all recurring transactions (legacy list; respects the hide preference)
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('is_active', true)
      .eq('user_hidden', false)
      .order('average_amount', { ascending: false });

    if (error) throw error;
    res.json(data);
  }),
);

// Full subscription overview: charges with matched credits and net cost,
// unmatched recurring credits, and the card fee report. Refreshes the
// detection-managed table when stale (or on ?refresh=1).
router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);

    const { data: marker } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', LAST_REFRESHED_KEY)
      .maybeSingle();
    const stale =
      !marker?.value || Date.now() - Date.parse(marker.value) > REFRESH_STALE_MS;

    let result: RefreshResult;
    if (stale || req.query.refresh === '1') {
      result = await refreshRecurringTable(today);
    } else {
      const txns = await fetchWindowTransactions();
      const { data: deletedRows, error: deletedError } = await supabase
        .from('recurring_transactions')
        .select('merchant_display_name')
        .eq('user_hidden', true);
      if (deletedError) throw deletedError;
      const deletedMerchants = new Set((deletedRows || []).map(r => r.merchant_display_name));
      const { charges, credits, offsets } = runDetection(txns, today, deletedMerchants);
      result = {
        charges,
        credits,
        matchedCreditNames: new Set([...offsets.values()].map(m => m.merchant)),
        txns,
      };
    }

    const { data: rows, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('is_active', true)
      .eq('user_hidden', false)
      .order('average_amount', { ascending: false });
    if (error) throw error;

    const charges = (rows || []).map(r => {
      const monthly = monthlyEquivalentAmount(r.frequency as RecurringFrequency, Number(r.average_amount));
      const creditMonthly = r.offset_monthly_amount ? Number(r.offset_monthly_amount) : 0;
      return {
        id: r.id,
        merchant: r.merchant_display_name,
        frequency: r.frequency,
        average_amount: Number(r.average_amount),
        monthly_amount: Math.round(monthly * 100) / 100,
        source: r.source,
        last_seen: r.last_seen,
        offset_merchant_name: r.offset_merchant_name,
        offset_monthly_amount: creditMonthly || null,
        net_monthly: Math.round(Math.max(0, monthly - creditMonthly) * 100) / 100,
      };
    });

    const unmatchedCredits = result.credits
      .filter(c => c.isActive && !result.matchedCreditNames.has(c.merchant))
      .map(c => ({
        merchant: c.merchant,
        frequency: c.frequency,
        monthly_amount: Math.round(monthlyEquivalentAmount(c.frequency, c.averageAmount) * 100) / 100,
      }));

    const grossMonthly = charges.reduce((s, c) => s + c.monthly_amount, 0);
    const creditsMonthly =
      charges.reduce((s, c) => s + (c.offset_monthly_amount || 0), 0) +
      unmatchedCredits.reduce((s, c) => s + c.monthly_amount, 0);

    res.json({
      charges,
      credits: unmatchedCredits,
      cards: buildCardFeeReport(result.txns, result.matchedCreditNames),
      summary: {
        gross_monthly: Math.round(grossMonthly * 100) / 100,
        credits_monthly: Math.round(creditsMonthly * 100) / 100,
        net_monthly: Math.round(Math.max(0, grossMonthly - creditsMonthly) * 100) / 100,
      },
    });
  }),
);

// Delete a recurring series. Its transactions stop being flagged recurring,
// and the row is kept as a hidden, inactive marker so the next detection
// refresh does not re-create the series (detection never touches
// user_hidden). Marking the merchant recurring again clears the marker.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { data: series, error: findError } = await supabase
      .from('recurring_transactions')
      .select('merchant_display_name')
      .eq('id', id)
      .maybeSingle();
    if (findError) throw findError;
    if (!series) {
      res.status(404).json({ message: 'Recurring charge not found' });
      return;
    }

    // The series key is the display name, falling back to the raw merchant
    // name when a transaction has no display name.
    const name = series.merchant_display_name;
    const { error: byDisplayError } = await supabase
      .from('transactions')
      .update({ is_recurring: false })
      .eq('merchant_display_name', name);
    if (byDisplayError) throw byDisplayError;

    const { error: byNameError } = await supabase
      .from('transactions')
      .update({ is_recurring: false })
      .is('merchant_display_name', null)
      .eq('merchant_name', name);
    if (byNameError) throw byNameError;

    // Marker last: if clearing the flags failed above, the series is still
    // visible and the delete can simply be retried.
    const { error } = await supabase
      .from('recurring_transactions')
      .update({ user_hidden: true, is_active: false })
      .eq('id', id);
    if (error) throw error;

    res.status(204).send();
  }),
);

export default router;
