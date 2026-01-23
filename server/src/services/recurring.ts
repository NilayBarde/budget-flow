import { supabase } from '../db/supabase.js';

interface TransactionForRecurring {
  merchant_display_name: string | null;
  merchant_name: string;
  amount: number;
  date: string;
  category_id: string | null;
}

interface RecurringCandidate {
  merchant: string;
  transactions: TransactionForRecurring[];
  avgAmount: number;
  frequency: 'weekly' | 'monthly' | 'yearly';
}

export const detectRecurringTransactions = async () => {
  // Get the Subscriptions category ID
  const { data: subscriptionCategory } = await supabase
    .from('categories')
    .select('id')
    .eq('name', 'Subscriptions')
    .single();
  
  const subscriptionCategoryId = subscriptionCategory?.id;

  // Get all EXPENSE transactions from the last year (exclude income, transfers, investments)
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('merchant_name, merchant_display_name, amount, date, category_id')
    .eq('transaction_type', 'expense')  // Only expenses, not income/transfers
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
    // Check if any transaction is categorized as "Subscriptions" - auto-include these
    const hasSubscriptionCategory = subscriptionCategoryId && 
      txs.some(t => t.category_id === subscriptionCategoryId);
    
    if (txs.length < 2 && !hasSubscriptionCategory) continue;

    // Check if amounts are similar (within 10%)
    const amounts = txs.map(t => Math.abs(t.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amountVariance = amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.1);

    // For subscription-categorized items, be more lenient with amount variance
    if (!amountVariance && !hasSubscriptionCategory) continue;

    // Check interval between transactions
    const dates = txs.map(t => new Date(t.date).getTime()).sort((a, b) => a - b);
    const intervals: number[] = [];
    
    for (let i = 1; i < dates.length; i++) {
      const daysDiff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
      intervals.push(daysDiff);
    }

    // Determine frequency
    let frequency: 'weekly' | 'monthly' | 'yearly' | null = null;
    
    if (intervals.length > 0) {
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      
      if (avgInterval >= 5 && avgInterval <= 10) {
        frequency = 'weekly';
      } else if (avgInterval >= 25 && avgInterval <= 35) {
        frequency = 'monthly';
      } else if (avgInterval >= 350 && avgInterval <= 380) {
        frequency = 'yearly';
      }
    }
    
    // For subscription-categorized items with only 1 transaction, default to monthly
    if (!frequency && hasSubscriptionCategory) {
      frequency = 'monthly';
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

