import { Router } from 'express';
import { supabase } from '../db/supabase.js';

const router = Router();

// Investment account types
const INVESTMENT_ACCOUNT_TYPES = [
  'investment',
  'brokerage',
  '401k',
  '401a',
  '403b',
  'ira',
  'roth',
  'roth 401k',
  'pension',
  'retirement',
  'stock plan',
  'crypto exchange',
];

// Helper to check if an account is an investment account
const isInvestmentAccount = (accountType: string): boolean => {
  const normalizedType = accountType.toLowerCase();
  return INVESTMENT_ACCOUNT_TYPES.some(type => normalizedType.includes(type));
};

// Liability account types (balances represent what you OWE)
const LIABILITY_ACCOUNT_TYPES = [
  'credit card',
  'credit',
  'loan',
  'mortgage',
  'line of credit',
  'student',
  'auto',
];

// Helper to check if an account is a liability (credit card, loan, etc.)
const isLiabilityAccount = (accountType: string): boolean => {
  const normalizedType = accountType.toLowerCase();
  return LIABILITY_ACCOUNT_TYPES.some(type => normalizedType.includes(type));
};

// GET /investments/summary - Get portfolio totals and net worth based on ACCOUNT BALANCES only
router.get('/summary', async (req, res) => {
  try {
    // Get all account balances
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, current_balance, account_type, institution_name, account_name, exclude_from_investments');

    if (accountsError) throw accountsError;

    // Separate accounts by type
    const investmentAccounts = accounts?.filter(a =>
      isInvestmentAccount(a.account_type)
    ) || [];

    const liabilityAccounts = accounts?.filter(a =>
      !isInvestmentAccount(a.account_type) &&
      isLiabilityAccount(a.account_type)
    ) || [];

    const cashAccounts = accounts?.filter(a =>
      !isInvestmentAccount(a.account_type) &&
      !isLiabilityAccount(a.account_type)
    ) || [];

    // Calculate Investment Totals
    // Filter out excluded accounts from the total calculation
    const includedInvestmentAccounts = investmentAccounts.filter(a => !a.exclude_from_investments);

    const totalInvestmentValue = includedInvestmentAccounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);

    // Cash assets (checking, savings, etc.) - positive balances = money you HAVE
    const totalCashAssets = cashAccounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);

    // Liabilities (credit cards, loans) - positive balances = money you OWE
    const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);

    // Net cash position = assets - liabilities
    const netCashBalance = totalCashAssets - totalLiabilities;

    // Net worth = investment value + net cash (assets - liabilities)
    const netWorth = totalInvestmentValue + netCashBalance;

    res.json({
      investments: {
        totalValue: totalInvestmentValue,
        accountCount: includedInvestmentAccounts.length,
      },
      cash: {
        totalAssets: totalCashAssets,
        totalLiabilities,
        netBalance: netCashBalance,
        assetAccountCount: cashAccounts.length,
        liabilityAccountCount: liabilityAccounts.length,
      },
      netWorth,
      accounts: accounts?.map(a => ({
        id: a.id,
        name: `${a.institution_name} - ${a.account_name}`,
        type: a.account_type,
        balance: a.current_balance,
        isInvestment: isInvestmentAccount(a.account_type),
        isLiability: isLiabilityAccount(a.account_type),
        excluded: a.exclude_from_investments,
      })) || [],
    });
  } catch (error) {
    console.error('Error fetching investment summary:', error);
    res.status(500).json({ message: 'Failed to fetch investment summary' });
  }
});

// PATCH /investments/accounts/:accountId/exclude - Toggle account exclusion from investments
router.patch('/accounts/:accountId/exclude', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { exclude_from_investments, investment_exclusion_note } = req.body;

    const { data, error } = await supabase
      .from('accounts')
      .update({
        exclude_from_investments: exclude_from_investments ?? true,
        investment_exclusion_note: investment_exclusion_note || null,
      })
      .eq('id', accountId)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating account exclusion:', error);
    res.status(500).json({ message: 'Failed to update account' });
  }
});

export default router;
