import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Investment account types that should have holdings
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

// GET /investments/holdings - Get all holdings with security details
router.get('/holdings', async (req, res) => {
  try {
    const { data: holdings, error } = await supabase
      .from('holdings')
      .select(`
        *,
        security:securities(*),
        account:accounts(id, institution_name, account_name, account_type)
      `)
      .order('institution_value', { ascending: false });

    if (error) throw error;

    // Group holdings by account for easier frontend display
    const holdingsByAccount = holdings?.reduce((acc, holding) => {
      const accountId = holding.account_id;
      if (!acc[accountId]) {
        acc[accountId] = {
          account: holding.account,
          holdings: [],
          totalValue: 0,
          totalCostBasis: 0,
        };
      }
      acc[accountId].holdings.push(holding);
      acc[accountId].totalValue += holding.institution_value || 0;
      acc[accountId].totalCostBasis += holding.cost_basis || 0;
      return acc;
    }, {} as Record<string, { account: unknown; holdings: unknown[]; totalValue: number; totalCostBasis: number }>);

    res.json({
      holdings: holdings || [],
      byAccount: holdingsByAccount || {},
    });
  } catch (error) {
    console.error('Error fetching holdings:', error);
    res.status(500).json({ message: 'Failed to fetch holdings' });
  }
});

// GET /investments/summary - Get portfolio totals and net worth
router.get('/summary', async (req, res) => {
  try {
    // Get all holdings for investment totals
    const { data: holdings, error: holdingsError } = await supabase
      .from('holdings')
      .select('institution_value, cost_basis');

    if (holdingsError) throw holdingsError;

    // Calculate investment totals
    const totalInvestmentValue = holdings?.reduce((sum, h) => sum + (h.institution_value || 0), 0) || 0;
    const totalCostBasis = holdings?.reduce((sum, h) => sum + (h.cost_basis || 0), 0) || 0;
    const totalGainLoss = totalInvestmentValue - totalCostBasis;
    const totalGainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

    // Get all account balances for net worth calculation
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, current_balance, account_type, institution_name, account_name');

    if (accountsError) throw accountsError;

    // Separate accounts by type
    const investmentAccounts = accounts?.filter(a => isInvestmentAccount(a.account_type)) || [];
    const liabilityAccounts = accounts?.filter(a => 
      !isInvestmentAccount(a.account_type) && isLiabilityAccount(a.account_type)
    ) || [];
    const cashAccounts = accounts?.filter(a => 
      !isInvestmentAccount(a.account_type) && !isLiabilityAccount(a.account_type)
    ) || [];

    // Cash assets (checking, savings, etc.) - positive balances = money you HAVE
    const totalCashAssets = cashAccounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
    
    // Liabilities (credit cards, loans) - positive balances = money you OWE
    const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
    
    // Net cash position = assets - liabilities
    const netCashBalance = totalCashAssets - totalLiabilities;

    // Net worth = investment holdings value + net cash (assets - liabilities)
    // Note: We use holdings value instead of investment account balances since holdings is more accurate
    const netWorth = totalInvestmentValue + netCashBalance;

    res.json({
      investments: {
        totalValue: totalInvestmentValue,
        totalCostBasis,
        totalGainLoss,
        totalGainLossPercent,
        accountCount: investmentAccounts.length,
        holdingCount: holdings?.length || 0,
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
      })) || [],
    });
  } catch (error) {
    console.error('Error fetching investment summary:', error);
    res.status(500).json({ message: 'Failed to fetch investment summary' });
  }
});

// POST /investments/:accountId/sync - Sync holdings for a specific account
router.post('/:accountId/sync', async (req, res) => {
  try {
    const { accountId } = req.params;

    // Get the account to find its access token
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    if (!account.plaid_access_token || account.plaid_access_token === 'manual') {
      return res.status(400).json({ message: 'This account does not support investment sync' });
    }

    // Fetch holdings from Plaid
    const result = await plaidService.getInvestmentHoldings(account.plaid_access_token);

    // Upsert securities
    for (const security of result.securities) {
      const securityData = {
        plaid_security_id: security.security_id,
        ticker_symbol: security.ticker_symbol,
        name: security.name || 'Unknown Security',
        type: security.type || 'unknown',
        close_price: security.close_price,
        close_price_as_of: security.close_price_as_of,
        iso_currency_code: security.iso_currency_code || 'USD',
        updated_at: new Date().toISOString(),
      };

      const { error: securityError } = await supabase
        .from('securities')
        .upsert(securityData, { onConflict: 'plaid_security_id' });

      if (securityError) {
        console.error('Error upserting security:', securityError);
      }
    }

    // Get security ID mapping
    const { data: securities } = await supabase
      .from('securities')
      .select('id, plaid_security_id');
    
    const securityIdMap = new Map(
      securities?.map(s => [s.plaid_security_id, s.id]) || []
    );

    // Find the correct account ID for holdings (match by Plaid account ID)
    const { data: allAccounts } = await supabase
      .from('accounts')
      .select('id, plaid_account_id')
      .eq('plaid_item_id', account.plaid_item_id);

    const accountIdMap = new Map(
      allAccounts?.map(a => [a.plaid_account_id, a.id]) || []
    );

    // Delete existing holdings for accounts in this item, then insert fresh
    const accountIds = allAccounts?.map(a => a.id) || [];
    if (accountIds.length > 0) {
      await supabase
        .from('holdings')
        .delete()
        .in('account_id', accountIds);
    }

    // Insert new holdings
    let syncedCount = 0;
    for (const holding of result.holdings) {
      const dbAccountId = accountIdMap.get(holding.account_id);
      const dbSecurityId = securityIdMap.get(holding.security_id);

      if (!dbAccountId || !dbSecurityId) {
        console.warn(`Missing mapping for holding: account=${holding.account_id}, security=${holding.security_id}`);
        continue;
      }

      const holdingData = {
        id: uuidv4(),
        account_id: dbAccountId,
        security_id: dbSecurityId,
        quantity: holding.quantity,
        cost_basis: holding.cost_basis,
        institution_value: holding.institution_value,
        iso_currency_code: holding.iso_currency_code || 'USD',
        updated_at: new Date().toISOString(),
      };

      const { error: holdingError } = await supabase
        .from('holdings')
        .insert(holdingData);

      if (holdingError) {
        console.error('Error inserting holding:', holdingError);
      } else {
        syncedCount++;
      }
    }

    console.log(`Synced ${syncedCount} holdings for account ${accountId}`);

    res.json({
      message: 'Holdings synced successfully',
      synced: syncedCount,
      securities: result.securities.length,
    });
  } catch (error) {
    console.error('Error syncing holdings:', error);
    res.status(500).json({ message: 'Failed to sync holdings' });
  }
});

// POST /investments/sync-all - Sync holdings for all investment accounts
router.post('/sync-all', async (req, res) => {
  try {
    // Get all unique Plaid items (by access token)
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, plaid_access_token, plaid_item_id, account_type')
      .neq('plaid_access_token', 'manual');

    if (error) throw error;

    // Get unique items (multiple accounts can share the same access token)
    const processedItems = new Set<string>();
    let totalSynced = 0;
    let totalSecurities = 0;

    for (const account of accounts || []) {
      if (!account.plaid_item_id || processedItems.has(account.plaid_item_id)) {
        continue;
      }
      processedItems.add(account.plaid_item_id);

      try {
        // Fetch holdings from Plaid
        const result = await plaidService.getInvestmentHoldings(account.plaid_access_token);

        // Upsert securities
        for (const security of result.securities) {
          const securityData = {
            plaid_security_id: security.security_id,
            ticker_symbol: security.ticker_symbol,
            name: security.name || 'Unknown Security',
            type: security.type || 'unknown',
            close_price: security.close_price,
            close_price_as_of: security.close_price_as_of,
            iso_currency_code: security.iso_currency_code || 'USD',
            updated_at: new Date().toISOString(),
          };

          await supabase
            .from('securities')
            .upsert(securityData, { onConflict: 'plaid_security_id' });
        }

        // Get security ID mapping
        const { data: securities } = await supabase
          .from('securities')
          .select('id, plaid_security_id');
        
        const securityIdMap = new Map(
          securities?.map(s => [s.plaid_security_id, s.id]) || []
        );

        // Get account ID mapping for this item
        const { data: itemAccounts } = await supabase
          .from('accounts')
          .select('id, plaid_account_id')
          .eq('plaid_item_id', account.plaid_item_id);

        const accountIdMap = new Map(
          itemAccounts?.map(a => [a.plaid_account_id, a.id]) || []
        );

        // Delete existing holdings for accounts in this item
        const accountIds = itemAccounts?.map(a => a.id) || [];
        if (accountIds.length > 0) {
          await supabase
            .from('holdings')
            .delete()
            .in('account_id', accountIds);
        }

        // Insert new holdings
        for (const holding of result.holdings) {
          const dbAccountId = accountIdMap.get(holding.account_id);
          const dbSecurityId = securityIdMap.get(holding.security_id);

          if (!dbAccountId || !dbSecurityId) continue;

          await supabase
            .from('holdings')
            .insert({
              id: uuidv4(),
              account_id: dbAccountId,
              security_id: dbSecurityId,
              quantity: holding.quantity,
              cost_basis: holding.cost_basis,
              institution_value: holding.institution_value,
              iso_currency_code: holding.iso_currency_code || 'USD',
              updated_at: new Date().toISOString(),
            });
          
          totalSynced++;
        }
        totalSecurities += result.securities.length;
      } catch (itemError: unknown) {
        // Check if it's an ADDITIONAL_CONSENT_REQUIRED error (expected for non-updated items)
        const plaidError = (itemError as { response?: { data?: { error_code?: string } } })?.response?.data;
        if (plaidError?.error_code === 'ADDITIONAL_CONSENT_REQUIRED') {
          // This is expected for accounts that haven't been updated with investments consent
          // Just skip silently - user needs to use "Update Connection" for this account
          continue;
        }
        // Log other unexpected errors (but not the full object)
        console.error(`Failed to sync holdings for item ${account.plaid_item_id}:`, 
          plaidError?.error_code || (itemError instanceof Error ? itemError.message : 'Unknown error'));
        // Continue with other items
      }
    }

    res.json({
      message: 'All holdings synced',
      itemsProcessed: processedItems.size,
      totalHoldings: totalSynced,
      totalSecurities,
    });
  } catch (error) {
    console.error('Error syncing all holdings:', error);
    res.status(500).json({ message: 'Failed to sync holdings' });
  }
});

export default router;
