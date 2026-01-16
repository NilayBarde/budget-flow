import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
import { categorizeTransaction, cleanMerchantName } from '../services/categorizer.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

type TransactionType = 'income' | 'expense' | 'transfer' | 'investment';

// Investment detection patterns (checked AFTER transfers)
const INVESTMENT_PATTERNS = [
  /robinhood[- ]?debits?/i,  // Robinhood recurring investment debits (e.g., "Robinhood-Debits-123")
  /fidelity/i,
  /vanguard/i,
  /schwab/i,
  /etrade/i,
  /e-trade/i,
  /td\s*ameritrade/i,
  /coinbase/i,
  /webull/i,
  /acorns/i,
  /betterment/i,
];

// Transfer detection patterns
const TRANSFER_PATTERNS = [
  /card[- ]?payment/i,       // Generic card payment (e.g., "Card-Payment", "Card Payment")
  /payment.*thank\s*you/i,
  /autopay/i,
  /credit\s*card\s*payment/i,
  /credit\s*crd/i,           // "CREDIT CRD AUTOPAY"
  /crd\s*autopay/i,          // Abbreviated card autopay
  /epayment/i,               // Electronic payment
  /e-payment/i,
  /\btransfer\b/i,           // Any transfer (but not "Robinhood-transfer" investment patterns)
  /wire\s*transfer/i,
  /^payment$/i,
  /bill\s*pay/i,
  /billpay/i,
  /direct\s*debit/i,
  /loan\s*payment/i,
  /mortgage\s*payment/i,
  /\bpmt\b/i,                // Common abbreviation for payment
  /zelle/i,                  // Zelle transfers
  /cash\s*app/i,             // Cash App transfers
  /acctverify/i,             // Account verification micro-deposits
  /account\s*verification/i,
  /credit\s*card.*auto\s*pay/i,  // Credit card auto pay
  /bank\s*xfer/i,            // Bank transfer (e.g., Apple Cash-Bank Xfer)
  /mobile\s*pmt/i,           // Mobile payment
  /-ach\s*pmt/i,             // ACH payment (e.g., "Amex Epayment-Ach Pmt")
  // Note: Removed "money out/in" patterns - too broad for Wealthfront transactions
  // Note: Venmo intentionally excluded - users often receive reimbursements via Venmo
];

// Plaid categories that indicate transfers (legacy category field)
const TRANSFER_CATEGORIES = ['Transfer', 'Payment', 'Credit Card', 'Loan Payments'];

// Plaid personal_finance_category primary values that indicate transfers
const TRANSFER_PFC_PRIMARY = ['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS', 'BANK_FEES'];

interface PlaidPersonalFinanceCategory {
  primary?: string;
  detailed?: string;
}

/**
 * Detect transaction type based on amount and patterns
 * Priority: transfers > investments > amount sign
 * - Transfer pattern match = transfer (most specific, checked first)
 * - Investment pattern match = investment
 * - Plaid says it's a transfer = transfer
 * - Negative amount = income
 * - Positive amount = expense
 */
const detectTransactionType = (
  amount: number,
  merchantName: string | null,
  fullName: string | null,
  plaidCategories: string[] | undefined,
  personalFinanceCategory?: PlaidPersonalFinanceCategory | null,
  originalDescription?: string | null
): TransactionType => {
  const textsToCheck = [merchantName || '', fullName || '', originalDescription || ''];
  
  // Check for TRANSFERS FIRST - card payments, etc. should be transfers even from investment platforms
  const matchesTransferPattern = textsToCheck.some(text => 
    TRANSFER_PATTERNS.some(pattern => pattern.test(text))
  );
  
  if (matchesTransferPattern) {
    return 'transfer';
  }
  
  // Check for INVESTMENTS (after transfers ruled out)
  const matchesInvestmentPattern = textsToCheck.some(text =>
    INVESTMENT_PATTERNS.some(pattern => pattern.test(text))
  );
  
  if (matchesInvestmentPattern) {
    return 'investment';
  }

  // Check Plaid's personal_finance_category
  const pfcPrimary = personalFinanceCategory?.primary;
  const pfcDetailed = personalFinanceCategory?.detailed;
  
  // Check if it's an investment based on Plaid's detailed category
  if (pfcDetailed?.includes('INVESTMENT') || pfcDetailed?.includes('RETIREMENT')) {
    return 'investment';
  }
  
  // Check if Plaid says it's a transfer
  if (pfcPrimary && TRANSFER_PFC_PRIMARY.some(t => pfcPrimary.startsWith(t.split('_')[0]))) {
    if (pfcPrimary.startsWith('TRANSFER') || pfcPrimary.startsWith('LOAN')) {
      return 'transfer';
    }
  }
  
  // Check if Plaid legacy category indicates transfer
  const hasTransferCategory = plaidCategories?.some(cat => 
    TRANSFER_CATEGORIES.some(tc => cat.includes(tc))
  ) || false;

  if (hasTransferCategory) {
    return 'transfer';
  }

  // Income: negative amounts (money coming in) that aren't transfers
  if (amount < 0) {
    return 'income';
  }

  return 'expense';
};

// Get all accounts
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ message: 'Failed to fetch accounts' });
  }
});

// Sync transactions for an account
router.post('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Get transactions from Plaid (last 30 days)
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const plaidData = await plaidService.getTransactions(
      account.plaid_access_token,
      startDate,
      endDate
    );

    // Get categories for mapping
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name');

    const categoryMap = new Map(categories?.map(c => [c.name, c.id]) || []);

    // Get merchant mappings
    const { data: mappings } = await supabase
      .from('merchant_mappings')
      .select('*');

    const mappingMap = new Map(mappings?.map(m => [m.original_name.toLowerCase(), m]) || []);

    let syncedCount = 0;

    for (const tx of plaidData.transactions) {
      // Check if transaction already exists
      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('plaid_transaction_id', tx.transaction_id)
        .single();

      if (existing) continue;

      // Apply merchant mapping if exists
      const mapping = mappingMap.get(tx.merchant_name?.toLowerCase() || '');
      const displayName = mapping?.display_name || cleanMerchantName(tx.merchant_name || tx.name);
      
      // Detect transaction type (income, expense, transfer, or investment)
      // Pass merchant_name, full name, and original_description for accurate detection
      const originalDesc = (tx as { original_description?: string }).original_description;
      const transactionType = detectTransactionType(
        tx.amount,
        tx.merchant_name ?? null,
        tx.name, // Full transaction description from bank
        tx.category ?? undefined,
        tx.personal_finance_category as PlaidPersonalFinanceCategory | null,
        originalDesc
      );
      
      
      // Categorize transaction (for expenses, income, and investments)
      let categoryId: string | null = null;
      
      if (transactionType === 'expense') {
        const categoryName = categorizeTransaction(tx.merchant_name || tx.name, originalDesc);
        categoryId = mapping?.default_category_id || categoryMap.get(categoryName) || null;
      } else if (transactionType === 'income') {
        // Auto-assign Income category to income transactions
        categoryId = categoryMap.get('Income') || null;
      } else if (transactionType === 'investment') {
        // Auto-assign Investment category to investment transactions
        categoryId = categoryMap.get('Investment') || null;
      }

      await supabase.from('transactions').insert({
        id: uuidv4(),
        account_id: id,
        plaid_transaction_id: tx.transaction_id,
        amount: tx.amount,
        date: tx.date,
        merchant_name: tx.merchant_name || tx.name,
        // Use raw bank description if available, otherwise fall back to Plaid's cleaned name
        original_description: (tx as { original_description?: string }).original_description || tx.name,
        merchant_display_name: displayName,
        category_id: categoryId,
        transaction_type: transactionType,
        is_split: false,
        is_recurring: false,
      });

      syncedCount++;
    }

    res.json({ synced: syncedCount });
  } catch (error) {
    console.error('Error syncing account:', error);
    res.status(500).json({ message: 'Failed to sync account' });
  }
});

// Delete an account
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete all transactions for this account first
    await supabase.from('transactions').delete().eq('account_id', id);

    const { error } = await supabase.from('accounts').delete().eq('id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

// Reclassify all existing transactions with transaction_type
// This is a one-time migration endpoint
router.post('/reclassify-transactions', async (req, res) => {
  try {
    console.log('Starting transaction reclassification...');
    
    // Get all transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, amount, merchant_name, original_description');

    if (error) throw error;

    let reclassified = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    let transferCount = 0;
    let investmentCount = 0;

    for (const tx of transactions || []) {
      // Detect transaction type using both merchant_name and original_description
      // Note: personal_finance_category not available for reclassification (not stored)
      const detectedType = detectTransactionType(
        tx.amount, 
        tx.merchant_name, 
        tx.original_description,
        undefined,
        undefined,
        tx.original_description  // Also pass as originalDescription for investment detection
      );
      
      
      // Update the transaction
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ transaction_type: detectedType })
        .eq('id', tx.id);

      if (updateError) {
        console.error(`Error updating transaction ${tx.id}:`, updateError);
        continue;
      }

      reclassified++;
      if (detectedType === 'income') incomeCount++;
      else if (detectedType === 'expense') expenseCount++;
      else if (detectedType === 'transfer') transferCount++;
      else if (detectedType === 'investment') investmentCount++;
    }

    res.json({ 
      reclassified, 
      breakdown: {
        income: incomeCount,
        expense: expenseCount,
        transfer: transferCount,
        investment: investmentCount
      }
    });
  } catch (error) {
    console.error('Error reclassifying transactions:', error);
    res.status(500).json({ message: 'Failed to reclassify transactions' });
  }
});

// Assign categories to income and investment transactions
// This updates existing transactions that have transaction_type but no category
router.post('/assign-type-categories', async (req, res) => {
  try {
    console.log('Assigning categories to income/investment transactions...');
    
    // Get category IDs
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .in('name', ['Income', 'Investment']);
    
    const incomeCategory = categories?.find(c => c.name === 'Income');
    const investmentCategory = categories?.find(c => c.name === 'Investment');
    
    let incomeUpdated = 0;
    let investmentUpdated = 0;
    
    // Update income transactions that don't have a category
    if (incomeCategory) {
      const { data: incomeResult } = await supabase
        .from('transactions')
        .update({ category_id: incomeCategory.id })
        .eq('transaction_type', 'income')
        .is('category_id', null)
        .select('id');
      
      incomeUpdated = incomeResult?.length || 0;
    }
    
    // Update investment transactions that don't have a category
    if (investmentCategory) {
      const { data: investmentResult } = await supabase
        .from('transactions')
        .update({ category_id: investmentCategory.id })
        .eq('transaction_type', 'investment')
        .is('category_id', null)
        .select('id');
      
      investmentUpdated = investmentResult?.length || 0;
    }
    
    res.json({
      updated: {
        income: incomeUpdated,
        investment: investmentUpdated
      },
      categories_found: {
        income: !!incomeCategory,
        investment: !!investmentCategory
      }
    });
  } catch (error) {
    console.error('Error assigning type categories:', error);
    res.status(500).json({ message: 'Failed to assign categories' });
  }
});

export default router;

