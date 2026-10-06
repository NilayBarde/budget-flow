import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
import { applySyncResult } from '../services/sync-transactions.js';
import { redactError } from '../services/plaid-errors.js';
import { toPublicAccount } from '../services/account-redaction.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const DEFAULT_USER_ID = 'default-user';

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
    console.error('Error creating link token:', redactError(error));
    const plaidError = error as { response?: { data?: unknown } };
    if (plaidError.response?.data) {
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
    console.error('Error creating update link token:', redactError(error));
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
    const createdAccounts: Array<{ id: string; plaid_account_id: string; account_type: string }> = [];

    console.log(`Found ${plaidAccounts.length} accounts from ${institutionName}`);

    // Check for existing accounts with the same plaid_account_id to prevent duplicates
    // This handles the case where a user relinks the same bank (new item_id/access_token, same plaid_account_id)
    const plaidAccountIds = plaidAccounts.map(a => a.account_id);
    const { data: existingAccounts } = await supabase
      .from('accounts')
      .select('id, plaid_account_id')
      .in('plaid_account_id', plaidAccountIds);

    const existingByPlaidId = new Map(
      (existingAccounts || []).map(a => [a.plaid_account_id, a.id])
    );

    // Store or update ALL accounts from this Plaid Item
    for (const plaidAccount of plaidAccounts) {
      const existingId = existingByPlaidId.get(plaidAccount.account_id);

      if (existingId) {
        // Account already exists — update with new access token/item ID instead of creating a duplicate
        const { error } = await supabase
          .from('accounts')
          .update({
            plaid_item_id: itemId,
            plaid_access_token: accessToken,
            institution_name: institutionName,
            account_name: plaidAccount.name || 'Account',
            account_type: plaidAccount.subtype || plaidAccount.type || 'unknown',
            current_balance: plaidAccount.balances?.current ?? null,
          })
          .eq('id', existingId);

        if (error) {
          console.error(`Failed to update existing account ${plaidAccount.name}:`, redactError(error));
          continue;
        }

        console.log(`Updated existing account: ${institutionName} - ${plaidAccount.name} (relinked)`);
        createdAccounts.push({
          id: existingId,
          plaid_account_id: plaidAccount.account_id,
          account_type: plaidAccount.subtype || plaidAccount.type || 'unknown',
        });
      } else {
        // New account — create it
        const accountId = uuidv4();
        const account = {
          id: accountId,
          user_id: DEFAULT_USER_ID,
          plaid_item_id: itemId,
          plaid_access_token: accessToken,
          institution_name: institutionName,
          account_name: plaidAccount.name || 'Account',
          account_type: plaidAccount.subtype || plaidAccount.type || 'unknown',
          plaid_account_id: plaidAccount.account_id,
          current_balance: plaidAccount.balances?.current ?? null,
          created_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('accounts').insert(account).select().single();

        if (error) {
          console.error(`Failed to create account ${plaidAccount.name}:`, redactError(error));
          continue;
        }

        console.log(`Created account: ${institutionName} - ${plaidAccount.name} (${plaidAccount.subtype || plaidAccount.type})`);
        createdAccounts.push({
          id: accountId,
          plaid_account_id: plaidAccount.account_id,
          account_type: account.account_type,
        });
      }
    }

    if (createdAccounts.length === 0) {
      throw new Error('Failed to create any accounts');
    }

    // Auto-sync transactions after connecting using /transactions/sync
    console.log('Auto-syncing transactions for new accounts...');

    // Create a map of Plaid account IDs to our account IDs
    const accountIdMap = new Map(createdAccounts.map(a => [a.plaid_account_id, a.id]));
    const accountTypeById = new Map(createdAccounts.map(a => [a.id, a.account_type]));

    try {
      const syncResult = await plaidService.syncTransactions(accessToken, null);

      // The same save every sync path uses: the transactions, the cursor and the sync time. A first
      // link imports a long history, so card payments are paired across all of it.
      const counts = await applySyncResult({
        plaidItemId: itemId,
        syncResult,
        resolveAccountId: plaidAccountId => accountIdMap.get(plaidAccountId),
        accountTypeById,
        historicalComplete: syncResult.transactionsUpdateStatus === 'HISTORICAL_UPDATE_COMPLETE',
        reconcileSinceDate: null,
      });

      console.log(`Auto-synced ${counts.added} transactions across ${createdAccounts.length} accounts`);
    } catch (syncError) {
      console.error('Auto-sync failed (accounts created, but transactions need manual sync):', redactError(syncError));
    }

    // Return the first created account for backwards compatibility
    const { data: firstAccount } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', createdAccounts[0].id)
      .single();

    res.json(firstAccount && toPublicAccount(firstAccount));
  } catch (error) {
    console.error('Error exchanging token:', redactError(error));

    // Extract Plaid error details if available
    const plaidError = error as { response?: { data?: { error_code?: string; error_message?: string; display_message?: string } } };
    const errorDetails = plaidError.response?.data;

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

