import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
import { applySyncResult } from '../services/sync-transactions.js';
import { redactError } from '../services/plaid-errors.js';
import { recordSyncFailure } from '../services/sync-error.js';
import { toPublicAccount } from '../services/account-redaction.js';
import { randomUUID } from 'node:crypto';
import { matchRelinkedAccounts, type LinkedPlaidAccount, type StoredPlaidAccount } from '../services/relink.js';
import { isManualToken } from '../services/account-types.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { removeItemIfUnused } from '../services/plaid-items.js';

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

// Create update mode link token to reconnect or change an existing Plaid connection
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
router.post('/exchange-token', asyncHandler(async (req, res) => {
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

    // A re-link of a bank we already have creates a new Item. Find the stored accounts it replaces:
    // any account Plaid kept the id of, plus this institution's other Plaid accounts, including ones
    // the user disconnected (manual now, but they keep their Plaid account id), which this reconnects.
    const plaidAccountIds = plaidAccounts.map(a => a.account_id);
    const columns = 'id, plaid_account_id, plaid_item_id, plaid_access_token, account_name, account_type';
    const [byId, byInstitution] = await Promise.all([
      supabase.from('accounts').select(columns).in('plaid_account_id', plaidAccountIds),
      supabase.from('accounts').select(columns).eq('institution_name', institutionName),
    ]);
    const relinkable = new Map<string, StoredPlaidAccount>();
    for (const row of [...(byId.data || []), ...(byInstitution.data || [])] as StoredPlaidAccount[]) {
      const wasPlaid = !isManualToken(row.plaid_access_token) || Boolean(row.plaid_account_id);
      if (row.plaid_item_id !== itemId && wasPlaid) relinkable.set(row.id, row);
    }

    // What each old Item still reports about its accounts, when it can still be read. Its masks keep a
    // second login's look-alike account from being taken for this one. /accounts/get is free.
    const oldPlaidAccounts = new Map<string, LinkedPlaidAccount>();
    for (const oldToken of new Set([...relinkable.values()].map(a => a.plaid_access_token))) {
      if (isManualToken(oldToken)) continue;
      try {
        const old = await plaidService.getAccounts(oldToken);
        for (const account of old.accounts) oldPlaidAccounts.set(account.account_id, account);
      } catch {
        // Usually the reason for the re-link (the login expired). The stored name and type stand in.
      }
    }

    const relinked = matchRelinkedAccounts(plaidAccounts, [...relinkable.values()], oldPlaidAccounts);
    const existingByPlaidId = new Map([...relinked].map(([plaidAccountId, stored]) => [plaidAccountId, stored.id]));

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
            plaid_account_id: plaidAccount.account_id,
            plaid_cursor: null,
            // The new Item resends the history: every sync adopts stored copies until it is all in
            historical_sync_complete: false,
            relinked_at: new Date().toISOString(),
            // A snooze was about the replaced connection
            idle_snoozed_until: null,
            institution_name: institutionName,
            // account_name is left alone: the user may have renamed it
            account_type: plaidAccount.subtype || plaidAccount.type || 'unknown',
            ...(plaidAccount.balances?.current != null && { current_balance: plaidAccount.balances.current }),
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
        const accountId = randomUUID();
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

    // The old Item's pending rows will never post now. The new Item sends today's pending
    // transactions again, so drop the stale copies rather than count them twice.
    const relinkedIds = [...relinked.values()].map(a => a.id);
    if (relinkedIds.length > 0) {
      const { error: pendingError } = await supabase.from('transactions').delete().in('account_id', relinkedIds).eq('pending', true);
      if (pendingError) console.warn('Could not clear pending rows from the replaced Item:', redactError(pendingError));
    }

    // Plaid bills every Item monthly, so remove each old Item once none of our accounts use it.
    for (const oldToken of new Set([...relinked.values()].map(a => a.plaid_access_token))) {
      if (await removeItemIfUnused(oldToken)) console.log(`Removed the replaced Plaid Item for ${institutionName}`);
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
      if (counts.adopted > 0) console.log(`Carried over ${counts.adopted} stored transaction(s) from the re-linked Item`);
      if (counts.skipped > 0) {
        // These belong to an account that failed to link, and the cursor has moved past them.
        console.warn(`Skipped ${counts.skipped} transaction(s) for accounts that could not be linked`);
      }
    } catch (syncError) {
      console.error('Auto-sync failed (accounts created, but transactions need manual sync):', redactError(syncError));
      // Without this the new accounts would show as never synced, with no reason.
      await recordSyncFailure(itemId, syncError);
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
}));

export default router;

