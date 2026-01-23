import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
import { categorizeWithPlaid, cleanMerchantName, PlaidPFC } from '../services/categorizer.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const DEFAULT_USER_ID = 'default-user';

// Helper to detect transaction type
type TransactionType = 'income' | 'expense' | 'transfer' | 'investment';

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
    if (plaidPFC.primary === 'INCOME') {
      return 'income';
    }
  }
  
  // Negative amounts are income
  if (amount < 0) return 'income';
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
    
    const plaidAccount = accountsResponse.accounts[0];

    // Store the account
    const accountId = uuidv4();
    const account = {
      id: accountId,
      user_id: DEFAULT_USER_ID,
      plaid_item_id: itemId,
      plaid_access_token: accessToken,
      institution_name: metadata?.institution?.name || 'Unknown',
      account_name: plaidAccount?.name || 'Account',
      account_type: plaidAccount?.type || 'unknown',
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('accounts').insert(account).select().single();

    if (error) throw error;

    // Auto-sync transactions after connecting using /transactions/sync
    console.log('Auto-syncing transactions for new account...');
    
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
          plaid_category: plaidPFC || null,
        });
        syncedCount++;
      }
      
      // Save the cursor for future syncs
      await supabase
        .from('accounts')
        .update({ plaid_cursor: syncResult.nextCursor })
        .eq('id', accountId);
      
      console.log(`Auto-synced ${syncedCount} transactions`);
    } catch (syncError) {
      console.error('Auto-sync failed (account created, but transactions need manual sync):', syncError);
    }

    res.json(data);
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

