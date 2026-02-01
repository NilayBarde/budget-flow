import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
import { categorizeWithPlaid, cleanMerchantName, PlaidPFC } from '../services/categorizer.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const DEFAULT_USER_ID = 'default-user';

// Helper to detect transaction type
type TransactionType = 'income' | 'expense' | 'transfer' | 'investment' | 'return';

const TRANSFER_PATTERNS = [
  /credit\s*card[- ]?auto[- ]?pay/i,
  /credit\s*card[- ]?payment/i,
  /card[- ]?payment/i,
  /payment.*thank\s*you/i,
  /autopay/i,
  /auto[- ]?pay/i,
  /epayment/i,
  /\btransfer\b/i,
  /bill\s*pay/i,
  /zelle/i,
  /cash\s*app/i,
  /acctverify/i,
];

const INVESTMENT_PATTERNS = [
  /robinhood[- ]?debits?/i,
  /fidelity/i,
  /vanguard/i,
  /schwab/i,
  /coinbase/i,
  /webull/i,
  /acorns/i,
  /betterment/i,
];

const detectTransactionType = (amount: number, texts: string[], plaidPFC?: PlaidPFC | null): TransactionType => {
  // Check text patterns first
  if (texts.some(t => TRANSFER_PATTERNS.some(p => p.test(t)))) return 'transfer';
  if (texts.some(t => INVESTMENT_PATTERNS.some(p => p.test(t)))) return 'investment';
  
  // Check Plaid's category for transfers
  if (plaidPFC?.primary) {
    if (plaidPFC.primary.startsWith('TRANSFER') || plaidPFC.primary.startsWith('LOAN_PAYMENTS')) {
      return 'transfer';
    }
    // Only actual income (paychecks, dividends, etc.) should be income
    if (plaidPFC.primary === 'INCOME') {
      return 'income';
    }
  }
  
  // Negative amounts: if Plaid says it's income, it's income; otherwise it's a return/refund
  if (amount < 0) {
    // If Plaid explicitly says INCOME, it's income; otherwise treat as return
    if (plaidPFC?.primary === 'INCOME') {
      return 'income';
    }
    return 'return';
  }
  return 'expense';
};

// Create link token for Plaid Link
router.post('/create-link-token', async (req, res) => {
  try {
    console.log('Creating Plaid link token...');
    console.log('PLAID_CLIENT_ID:', process.env.PLAID_CLIENT_ID ? 'Set' : 'NOT SET');
    console.log('PLAID_SECRET:', process.env.PLAID_SECRET ? 'Set' : 'NOT SET');
    console.log('PLAID_ENV:', process.env.PLAID_ENV);
    
    const { redirect_uri, webhook_url } = req.body;
    
    console.log('Request details:', {
      redirect_uri: redirect_uri || 'none (OAuth banks will not work)',
      webhook_url: webhook_url ? 'provided' : 'not provided',
    });
    
    // Use provided webhook URL or fall back to environment variable
    const webhookUrl = webhook_url || process.env.PLAID_WEBHOOK_URL;
    
    const linkToken = await plaidService.createLinkToken(DEFAULT_USER_ID, redirect_uri, webhookUrl);
    
    console.log('Link token created successfully');
    
    res.json({
      link_token: linkToken.link_token,
      expiration: linkToken.expiration,
    });
  } catch (error: unknown) {
    console.error('Error creating link token:', error);
    const plaidError = error as { response?: { data?: unknown } };
    if (plaidError.response?.data) {
      console.error('Plaid error details:', JSON.stringify(plaidError.response.data, null, 2));
      // Return more detailed error in development
      const isDevelopment = process.env.NODE_ENV !== 'production';
      if (isDevelopment) {
        return res.status(500).json({ 
          message: 'Failed to create link token',
          error: plaidError.response.data 
        });
      }
    }
    res.status(500).json({ message: 'Failed to create link token' });
  }
});

// Create update mode link token to add investments permission to existing accounts
router.post('/create-update-link-token', async (req, res) => {
  try {
    const { account_id, redirect_uri } = req.body;

    if (!account_id) {
      return res.status(400).json({ message: 'Account ID is required' });
    }

    // Get the account's access token
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('plaid_access_token, institution_name')
      .eq('id', account_id)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    if (!account.plaid_access_token) {
      return res.status(400).json({ message: 'Account does not have a Plaid connection' });
    }

    console.log(`Creating update link token for ${account.institution_name}...`);
    
    const linkToken = await plaidService.createUpdateLinkToken(
      DEFAULT_USER_ID,
      account.plaid_access_token,
      redirect_uri
    );

    console.log('Update link token created successfully');

    res.json({
      link_token: linkToken.link_token,
      expiration: linkToken.expiration,
    });
  } catch (error: unknown) {
    console.error('Error creating update link token:', error);
    const plaidError = error as { response?: { data?: unknown } };
    if (plaidError.response?.data) {
      console.error('Plaid error details:', JSON.stringify(plaidError.response.data, null, 2));
    }
    res.status(500).json({ message: 'Failed to create update link token' });
  }
});

// Log Plaid Link events for debugging (errors, exits, etc.)
router.post('/log-link-event', async (req, res) => {
  try {
    const {
      event_name,
      error,
      metadata,
      link_session_id,
      url,
      user_agent,
    } = req.body || {};

    console.log('=== Plaid Link Event Log ===');
    console.log('Event:', event_name);
    console.log('Link session ID:', link_session_id || 'N/A');
    console.log('URL:', url || 'N/A');
    console.log('User agent:', user_agent || 'N/A');
    if (error) {
      console.log('Error:', JSON.stringify(error, null, 2));
    }
    if (metadata) {
      console.log('Metadata:', JSON.stringify(metadata, null, 2));
    }

    res.status(204).send();
  } catch (err) {
    console.error('Failed to log Plaid Link event:', err);
    res.status(500).json({ message: 'Failed to log Plaid Link event' });
  }
});

// Exchange public token for access token
router.post('/exchange-token', async (req, res) => {
  try {
    const { public_token, metadata } = req.body;

    if (!public_token) {
      return res.status(400).json({ message: 'Public token is required' });
    }

    // Exchange the public token
    const exchangeResponse = await plaidService.exchangePublicToken(public_token);
    const accessToken = exchangeResponse.access_token;
    const itemId = exchangeResponse.item_id;

    // Get account info
    const accountsResponse = await plaidService.getAccounts(accessToken);
    
    if (!accountsResponse.accounts || accountsResponse.accounts.length === 0) {
      throw new Error('No accounts found. Please ensure your account is accessible and try again.');
    }
    
    const institutionName = metadata?.institution?.name || 'Unknown';
    const plaidAccounts = accountsResponse.accounts;
    const createdAccounts: Array<{ id: string; plaid_account_id: string }> = [];
    
    console.log(`Found ${plaidAccounts.length} accounts from ${institutionName}`);

    // Store ALL accounts from this Plaid Item
    for (const plaidAccount of plaidAccounts) {
      const accountId = uuidv4();
      const account = {
        id: accountId,
        user_id: DEFAULT_USER_ID,
        plaid_item_id: itemId,
        plaid_access_token: accessToken,
        institution_name: institutionName,
        account_name: plaidAccount.name || 'Account',
        account_type: plaidAccount.subtype || plaidAccount.type || 'unknown',
        plaid_account_id: plaidAccount.account_id, // Store Plaid's account ID for matching transactions
        current_balance: plaidAccount.balances?.current ?? null,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from('accounts').insert(account).select().single();

      if (error) {
        console.error(`Failed to create account ${plaidAccount.name}:`, error);
        continue;
      }
      
      console.log(`Created account: ${institutionName} - ${plaidAccount.name} (${plaidAccount.subtype || plaidAccount.type})`);
      createdAccounts.push({ id: accountId, plaid_account_id: plaidAccount.account_id });
    }

    if (createdAccounts.length === 0) {
      throw new Error('Failed to create any accounts');
    }

    // Auto-sync transactions after connecting using /transactions/sync
    console.log('Auto-syncing transactions for new accounts...');
    
    // Create a map of Plaid account IDs to our account IDs
    const accountIdMap = new Map(createdAccounts.map(a => [a.plaid_account_id, a.id]));
    
    try {
      const syncResult = await plaidService.syncTransactions(accessToken, null);
      
      // Get categories for mapping
      const { data: categories } = await supabase.from('categories').select('id, name');
      const categoryMap = new Map(categories?.map(c => [c.name, c.id]) || []);
      
      // Get merchant mappings for user-defined categorizations
      const { data: mappings } = await supabase.from('merchant_mappings').select('*');
      const mappingMap = new Map(mappings?.map(m => [m.original_name.toLowerCase(), m]) || []);
      
      let syncedCount = 0;
      for (const tx of syncResult.added) {
        // Map the transaction to the correct account using Plaid's account_id
        const accountId = accountIdMap.get(tx.account_id);
        if (!accountId) {
          console.warn(`No matching account for transaction with Plaid account_id: ${tx.account_id}`);
          continue;
        }
        
        const texts = [tx.merchant_name || '', tx.name || '', tx.original_description || ''];
        const displayName = cleanMerchantName(tx.merchant_name || tx.name);
        const plaidPFC = tx.personal_finance_category as PlaidPFC | undefined;
        const transactionType = detectTransactionType(tx.amount, texts, plaidPFC);
        
        // Check for existing merchant mapping (user's previous corrections)
        const mapping = mappingMap.get((tx.merchant_name || '').toLowerCase());
        
        // Auto-assign category based on type and Plaid's categorization
        let categoryId: string | null = null;
        let needsReview = false;
        
        if (transactionType === 'expense') {
          // Priority: merchant mapping > Plaid PFC > pattern matching
          if (mapping?.default_category_id) {
            categoryId = mapping.default_category_id;
          } else {
            const result = categorizeWithPlaid(
              tx.merchant_name || tx.name,
              tx.original_description,
              plaidPFC
            );
            categoryId = categoryMap.get(result.categoryName) || null;
            needsReview = result.needsReview;
          }
        } else if (transactionType === 'income') {
          categoryId = categoryMap.get('Income') || null;
        } else if (transactionType === 'investment') {
          categoryId = categoryMap.get('Investment') || null;
        }
        
        await supabase.from('transactions').insert({
          id: uuidv4(),
          account_id: accountId,
          plaid_transaction_id: tx.transaction_id,
          amount: tx.amount,
          date: tx.date,
          merchant_name: tx.merchant_name || tx.name,
          original_description: tx.original_description || tx.name,
          merchant_display_name: mapping?.display_name || displayName,
          category_id: categoryId,
          transaction_type: transactionType,
          is_split: false,
          is_recurring: false,
          needs_review: needsReview,
          pending: tx.pending,
          plaid_category: plaidPFC || null,
        });
        syncedCount++;
      }
      
      // Save the cursor for future syncs - store on the first account (they all share the same access token)
      const firstAccountId = createdAccounts[0].id;
      await supabase
        .from('accounts')
        .update({ plaid_cursor: syncResult.nextCursor })
        .eq('id', firstAccountId);
      
      console.log(`Auto-synced ${syncedCount} transactions across ${createdAccounts.length} accounts`);
    } catch (syncError) {
      console.error('Auto-sync failed (accounts created, but transactions need manual sync):', syncError);
    }

    // Auto-sync investment holdings if this item has investment accounts
    try {
      console.log('Attempting to sync investment holdings...');
      const holdingsResult = await plaidService.getInvestmentHoldings(accessToken);
      
      if (holdingsResult.holdings.length > 0) {
        // Upsert securities
        for (const security of holdingsResult.securities) {
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

        // Insert holdings
        let holdingsSynced = 0;
        for (const holding of holdingsResult.holdings) {
          const dbAccountId = accountIdMap.get(holding.account_id);
          const dbSecurityId = securityIdMap.get(holding.security_id);

          if (!dbAccountId || !dbSecurityId) continue;

          await supabase
            .from('holdings')
            .upsert({
              id: uuidv4(),
              account_id: dbAccountId,
              security_id: dbSecurityId,
              quantity: holding.quantity,
              cost_basis: holding.cost_basis,
              institution_value: holding.institution_value,
              iso_currency_code: holding.iso_currency_code || 'USD',
              updated_at: new Date().toISOString(),
            }, { onConflict: 'account_id,security_id' });
          
          holdingsSynced++;
        }
        console.log(`Auto-synced ${holdingsSynced} investment holdings`);
      } else {
        console.log('No investment holdings found for this item');
      }
    } catch (holdingsError) {
      // Not all accounts have investments, so this is expected to fail for non-investment accounts
      console.log('Investment holdings sync skipped (account may not have investments)');
    }

    // Return the first created account for backwards compatibility
    const { data: firstAccount } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', createdAccounts[0].id)
      .single();

    res.json(firstAccount);
  } catch (error) {
    console.error('Error exchanging token:', error);
    
    // Extract Plaid error details if available
    const plaidError = error as { response?: { data?: { error_code?: string; error_message?: string; display_message?: string } } };
    const errorDetails = plaidError.response?.data;
    
    // Log detailed error for debugging
    if (errorDetails) {
      console.error('Plaid error details:', JSON.stringify(errorDetails, null, 2));
    }
    
    // Return more helpful error message
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment && errorDetails) {
      return res.status(500).json({ 
        message: 'Failed to connect account',
        error: errorDetails.error_message || errorDetails.display_message,
        error_code: errorDetails.error_code,
        details: errorDetails
      });
    }
    
    // In production, return user-friendly message
    const userMessage = errorDetails?.display_message || errorDetails?.error_message || 'Failed to connect account. Please try again.';
    res.status(500).json({ message: userMessage });
  }
});

export default router;

