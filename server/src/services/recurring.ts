import { supabase } from '../db/supabase.js';

interface TransactionForRecurring {
  merchant_display_name: string | null;
  merchant_name: string;
  amount: number;
  date: string;
}

interface RecurringCandidate {
  merchant: string;
  transactions: TransactionForRecurring[];
  avgAmount: number;
  frequency: 'weekly' | 'monthly' | 'yearly';
}

export const detectRecurringTransactions = async () => {
  // Get all transactions from the last year
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('merchant_name, merchant_display_name, amount, date')
    .gte('date', oneYearAgo.toISOString().split('T')[0])
    .order('date', { ascending: true });

  if (error || !transactions) {
    console.error('Error fetching transactions for recurring detection:', error);
    return [];
  }

  // Group by merchant
  const merchantGroups = new Map<string, TransactionForRecurring[]>();

  for (const tx of transactions) {
    const merchant = tx.merchant_display_name || tx.merchant_name;
    const existing = merchantGroups.get(merchant) || [];
    existing.push(tx);
    merchantGroups.set(merchant, existing);
  }

  // Analyze each merchant for recurring patterns
  const recurringCandidates: RecurringCandidate[] = [];

  for (const [merchant, txs] of merchantGroups) {
    if (txs.length < 2) continue;

    // Check if amounts are similar (within 10%)
    const amounts = txs.map(t => Math.abs(t.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amountVariance = amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.1);

    if (!amountVariance) continue;

    // Check interval between transactions
    const dates = txs.map(t => new Date(t.date).getTime()).sort((a, b) => a - b);
    const intervals: number[] = [];
    
    for (let i = 1; i < dates.length; i++) {
      const daysDiff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
      intervals.push(daysDiff);
    }

    if (intervals.length === 0) continue;

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // Determine frequency
    let frequency: 'weekly' | 'monthly' | 'yearly' | null = null;
    
    if (avgInterval >= 5 && avgInterval <= 10) {
      frequency = 'weekly';
    } else if (avgInterval >= 25 && avgInterval <= 35) {
      frequency = 'monthly';
    } else if (avgInterval >= 350 && avgInterval <= 380) {
      frequency = 'yearly';
    }

    if (frequency) {
      recurringCandidates.push({
        merchant,
        transactions: txs,
        avgAmount,
        frequency,
      });
    }
  }

  // Upsert recurring transactions
  for (const candidate of recurringCandidates) {
    const lastTransaction = candidate.transactions[candidate.transactions.length - 1];
    
    await supabase
      .from('recurring_transactions')
      .upsert({
        merchant_display_name: candidate.merchant,
        average_amount: candidate.avgAmount,
        frequency: candidate.frequency,
        last_seen: lastTransaction.date,
        is_active: true,
      }, {
        onConflict: 'merchant_display_name',
      });
  }

  // Mark transactions as recurring
  for (const candidate of recurringCandidates) {
    for (const tx of candidate.transactions) {
      await supabase
        .from('transactions')
        .update({ is_recurring: true })
        .eq('merchant_name', tx.merchant_name)
        .eq('amount', tx.amount);
    }
  }

  const { data: recurring } = await supabase
    .from('recurring_transactions')
    .select('*')
    .eq('is_active', true);

  return recurring || [];
};

