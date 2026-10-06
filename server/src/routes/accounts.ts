import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
import { buildAccountResolver } from '../services/sync-attribution.js';
import { applySyncResult } from '../services/sync-transactions.js';
import { getPlaidErrorCode, needsReconnect, redactError } from '../services/plaid-errors.js';
import { recordSyncFailure } from '../services/sync-error.js';
import { classifySyncHealth, DEFAULT_STALE_DAYS, INVESTMENT_STALE_DAYS, parseStaleDaysOverride } from '../services/sync-health.js';
import { isHoldingsAccountType } from '../services/account-types.js';
import { toPublicAccount } from '../services/account-redaction.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// In-memory cooldown map: accountId → last sync timestamp
// Prevents rapid repeated syncs from burning Plaid API calls
const SYNC_COOLDOWN_MS = 30_000; // 30 seconds
const lastSyncByAccount = new Map<string, number>();

// Get all accounts
router.get('/', async (req, res) => {
  try {
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get the most recent CSV import date for each account
    const { data: lastImports } = await supabase
      .from('csv_imports')
      .select('account_id, created_at')
      .order('created_at', { ascending: false });

    // Build a map of account_id -> most recent import date
    const lastImportMap = new Map<string, string>();
    for (const imp of lastImports || []) {
      if (!lastImportMap.has(imp.account_id)) {
        lastImportMap.set(imp.account_id, imp.created_at);
      }
    }

    // Merge last import dates into accounts
    // Use csv_imports table first, fall back to account's own last_csv_import_at (set by holdings import)
    const accountsWithLastImport = accounts?.map(account => ({
      ...toPublicAccount(account),
      last_csv_import_at: lastImportMap.get(account.id) || account.last_csv_import_at || null,
    }));

    res.json(accountsWithLastImport);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ message: 'Failed to fetch accounts' });
  }
});

// Sync health: which Plaid-linked accounts need attention (re-auth required, or
// haven't synced successfully in a while). Manual accounts are excluded since
// they never sync via Plaid.
router.get('/sync-health', async (req, res) => {
  try {
    const staleDaysOverride = parseStaleDaysOverride(req.query.staleDays);

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, institution_name, account_name, account_type, needs_reauth, reauth_detected_at, last_synced_at, last_sync_error, last_sync_error_at')
      .neq('plaid_access_token', 'manual');

    if (error) throw error;

    // Stale = never synced, or last successful sync older than the window for its account type.
    // Failing = the last sync errored for a reason other than needing a reconnect.
    const { needsReauth, failing, stale } = classifySyncHealth(accounts || [], Date.now(), staleDaysOverride);

    res.json({
      healthy: needsReauth.length === 0 && failing.length === 0 && stale.length === 0,
      staleDays: staleDaysOverride ?? DEFAULT_STALE_DAYS,
      investmentStaleDays: staleDaysOverride ?? INVESTMENT_STALE_DAYS,
      needs_reauth: needsReauth,
      failing,
      stale,
    });
  } catch (error) {
    console.error('Error fetching sync health:', error);
    res.status(500).json({ message: 'Failed to fetch sync health' });
  }
});

// Create a manual account (for banks that can't be linked via Plaid, e.g., American Express)
router.post('/manual', async (req, res) => {
  try {
    const { institution_name, account_name, account_type, current_balance } = req.body;

    if (!institution_name || !account_name || !account_type) {
      return res.status(400).json({
        message: 'institution_name, account_name, and account_type are required'
      });
    }

    const accountId = uuidv4();
    const manualId = `manual-${accountId}`;

    const account: Record<string, unknown> = {
      id: accountId,
      user_id: 'default-user',
      plaid_item_id: manualId,
      plaid_access_token: 'manual',
      institution_name,
      account_name,
      account_type,
      created_at: new Date().toISOString(),
    };

    if (current_balance !== undefined && current_balance !== null) {
      account.current_balance = parseFloat(current_balance);
    }

    const { data, error } = await supabase
      .from('accounts')
      .insert(account)
      .select()
      .single();

    if (error) throw error;

    console.log(`Created manual account: ${institution_name} - ${account_name}`);
    res.status(201).json(toPublicAccount(data));
  } catch (error) {
    console.error('Error creating manual account:', error);
    res.status(500).json({ message: 'Failed to create manual account' });
  }
});

// Sync transactions for an account using Plaid's /transactions/sync (recommended)
router.post('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    const { use_legacy } = req.query; // Optional: use old /transactions/get method

    // Throttle: reject if this account was synced recently
    const lastSync = lastSyncByAccount.get(id);
    if (lastSync && (Date.now() - lastSync) < SYNC_COOLDOWN_MS) {
      const secondsLeft = Math.ceil((SYNC_COOLDOWN_MS - (Date.now() - lastSync)) / 1000);
      return res.status(429).json({
        message: `Sync was just performed. Please wait ${secondsLeft}s before syncing again.`
      });
    }

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Record sync timestamp before making Plaid calls
    lastSyncByAccount.set(id, Date.now());

    // 1. Fetch Latest Balances (Concurrently if possible)
    let latestBalance: number | null = account.current_balance;
    const isInvestment = isHoldingsAccountType(account.account_type);

    try {
      if (isInvestment) {
        console.log(`[Sync] Attempting investment holdings balance for ${account.institution_name} (${id})...`);
        try {
          const holdings = await plaidService.getInvestmentHoldings(account.plaid_access_token);
          const plaidAccount = holdings.accounts.find(a => a.account_id === account.plaid_account_id);
          if (plaidAccount && plaidAccount.balances.current !== null) {
            latestBalance = plaidAccount.balances.current;
            console.log(`[Sync] Success via getInvestmentHoldings: ${latestBalance}`);
          } else {
            console.log(`[Sync] No balance found in holdings for ${id}, falling back to getAccounts...`);
            const plaidData = await plaidService.getAccounts(account.plaid_access_token);
            const fallbackAccount = plaidData.accounts.find(a => a.account_id === account.plaid_account_id);
            if (fallbackAccount) {
              latestBalance = fallbackAccount.balances.current;
              console.log(`[Sync] Success via getAccounts (fallback): ${latestBalance}`);
            }
          }
        } catch (holdingsError) {
          console.warn(`[Sync] getInvestmentHoldings failed for ${id}, attempting fallback to getAccounts...`, redactError(holdingsError));
          const plaidData = await plaidService.getAccounts(account.plaid_access_token);
          const fallbackAccount = plaidData.accounts.find(a => a.account_id === account.plaid_account_id);
          if (fallbackAccount) {
            latestBalance = fallbackAccount.balances.current;
            console.log(`[Sync] Success via getAccounts (after holdings error): ${latestBalance}`);
          }
        }
      } else {
        console.log(`[Sync] Fetching regular account balance for ${account.institution_name} (${id})...`);
        const plaidData = await plaidService.getAccounts(account.plaid_access_token);
        const plaidAccount = plaidData.accounts.find(a => a.account_id === account.plaid_account_id);
        if (plaidAccount) {
          latestBalance = plaidAccount.balances.current;
          console.log(`[Sync] Success via getAccounts: ${latestBalance}`);
        }
      }
    } catch (balanceError) {
      console.warn(`[Sync] Final balance fetch failure for account ${id}:`, redactError(balanceError));
      // Continue with transaction sync even if balance fetch fails
    }

    // 2. Sync Transactions
    console.log(`Syncing transactions for account ${id} using /transactions/sync...`);
    let syncResult;
    try {
      syncResult = await plaidService.syncTransactions(
        account.plaid_access_token,
        account.plaid_cursor
      );
    } catch (syncError) {
      console.error(`Transaction sync failed for account ${id}:`, redactError(syncError));
      await recordSyncFailure(account.plaid_item_id, syncError);
      // If balance was updated, we can still return success for the balance part
      if (latestBalance !== account.current_balance) {
        await supabase.from('accounts').update({ current_balance: latestBalance }).eq('id', id);
        return res.json({
          message: 'Balance updated, but transaction sync failed.',
          balance_updated: true,
          added: 0,
          modified: 0,
          removed: 0,
        });
      }
      throw syncError;
    }

    // A Plaid item can hold multiple accounts (e.g. an Amex login with both a Gold and a Platinum
    // card). /transactions/sync returns all of them tagged with their own account_id, so each
    // transaction is attributed to the right local row rather than to the row that triggered sync.
    const { data: itemAccounts } = await supabase
      .from('accounts')
      .select('id, plaid_account_id, account_type')
      .eq('plaid_item_id', account.plaid_item_id);

    // Balance is per account, unlike the cursor, so it is saved here. It goes first: it is already
    // fetched and correct, and saving the transactions can throw, which must not throw it away.
    await supabase
      .from('accounts')
      .update({ current_balance: latestBalance })
      .eq('id', id);

    const historicalComplete = syncResult.transactionsUpdateStatus === 'HISTORICAL_UPDATE_COMPLETE';
    const counts = await applySyncResult({
      plaidItemId: account.plaid_item_id,
      syncResult,
      resolveAccountId: buildAccountResolver(itemAccounts || [], id),
      accountTypeById: new Map((itemAccounts || []).map(a => [a.id, a.account_type])),
      historicalComplete,
    });

    console.log(`Sync complete: +${counts.added} added, ~${counts.modified} modified, -${counts.removed} removed, ⇄${counts.reattributed} re-attributed, ⤳${counts.reconciled} pending-reconciled`);
    console.log(`Historical sync status: ${syncResult.transactionsUpdateStatus || 'unknown'}`);

    res.json({
      added: counts.added,
      modified: counts.modified,
      removed: counts.removed,
      reattributed: counts.reattributed,
      reconciled: counts.reconciled,
      cursor_updated: true,
      transactions_update_status: syncResult.transactionsUpdateStatus,
      historical_complete: historicalComplete || account.historical_sync_complete,
    });
  } catch (error) {
    const plaidErrorCode = getPlaidErrorCode(error);
    // redactError, not the raw error: an axios error carries the request headers, including the Plaid secret.
    console.error('Error syncing account:', redactError(error));

    // Save the reason on the item so the app can show it, and flag an expired login so the
    // dashboard offers Reconnect (webhooks also flag this, but they can be missed). Errors from the
    // transaction fetch were already saved above and are saved again here, which is harmless. This
    // must not stop the response below, so a failure here is only logged.
    try {
      const { data: failedAccount } = await supabase
        .from('accounts')
        .select('plaid_item_id')
        .eq('id', req.params.id)
        .single();
      await recordSyncFailure(failedAccount?.plaid_item_id, error);
    } catch (recordError) {
      console.error('Could not record the sync failure:', redactError(recordError));
    }

    if (needsReconnect(plaidErrorCode)) {
      return res.status(409).json({ message: 'This connection needs to be reconnected', code: plaidErrorCode });
    }

    res.status(500).json({ message: 'Failed to sync account', code: plaidErrorCode });
  }
});

// Update webhook URL on an existing account (doesn't use up an Item!)
router.post('/:id/update-webhook', async (req, res) => {
  try {
    const { id } = req.params;
    const webhookUrl = process.env.PLAID_WEBHOOK_URL;

    if (!webhookUrl) {
      return res.status(400).json({ message: 'PLAID_WEBHOOK_URL not configured' });
    }

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('plaid_access_token')
      .eq('id', id)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    await plaidService.updateWebhook(account.plaid_access_token, webhookUrl);

    res.json({ message: 'Webhook updated', webhook_url: webhookUrl });
  } catch (error) {
    console.error('Error updating webhook:', redactError(error));
    res.status(500).json({ message: 'Failed to update webhook' });
  }
});

// Delete an account (also removes from Plaid to keep things clean)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the access token to remove from Plaid
    const { data: account } = await supabase
      .from('accounts')
      .select('plaid_access_token')
      .eq('id', id)
      .single();

    // Remove from Plaid (optional - helps keep Plaid dashboard clean)
    if (account?.plaid_access_token) {
      try {
        await plaidService.removeItem(account.plaid_access_token);
      } catch (plaidError) {
        console.warn('Could not remove item from Plaid:', redactError(plaidError));
        // Continue with local deletion even if Plaid removal fails
      }
    }

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

// Refresh accounts from Plaid - fetches any missing accounts from an existing Plaid Item
// This is useful when the original link only stored one account but Plaid has multiple
router.post('/:id/refresh-accounts', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the existing account to get the access token
    const { data: existingAccount, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (accountError || !existingAccount) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Check if it's a manual account
    if (existingAccount.plaid_access_token === 'manual') {
      return res.status(400).json({ message: 'Cannot refresh accounts for manual accounts' });
    }

    // Fetch all accounts from Plaid
    const plaidData = await plaidService.getAccounts(existingAccount.plaid_access_token);

    if (!plaidData.accounts || plaidData.accounts.length === 0) {
      return res.status(400).json({ message: 'No accounts found in Plaid' });
    }

    console.log(`Found ${plaidData.accounts.length} accounts from Plaid for ${existingAccount.institution_name}`);

    // Get all existing accounts for this Plaid Item
    const { data: existingAccounts } = await supabase
      .from('accounts')
      .select('plaid_account_id')
      .eq('plaid_item_id', existingAccount.plaid_item_id);

    const existingPlaidAccountIds = new Set(
      existingAccounts?.map(a => a.plaid_account_id).filter(Boolean) || []
    );

    // Also check by account name as fallback for older accounts without plaid_account_id
    const { data: existingByName } = await supabase
      .from('accounts')
      .select('account_name')
      .eq('plaid_item_id', existingAccount.plaid_item_id);

    const existingNames = new Set(
      existingByName?.map(a => a.account_name) || []
    );

    const newAccounts: Array<{ id: string; name: string; type: string }> = [];
    const updatedAccounts: string[] = [];

    for (const plaidAccount of plaidData.accounts) {
      const alreadyExists = existingPlaidAccountIds.has(plaidAccount.account_id) ||
        existingNames.has(plaidAccount.name);

      if (alreadyExists) {
        // Update existing account with plaid_account_id and balance if missing
        const { data: existing } = await supabase
          .from('accounts')
          .select('id, plaid_account_id')
          .eq('plaid_item_id', existingAccount.plaid_item_id)
          .or(`plaid_account_id.eq.${plaidAccount.account_id},account_name.eq.${plaidAccount.name}`)
          .single();

        if (existing && !existing.plaid_account_id) {
          await supabase
            .from('accounts')
            .update({
              plaid_account_id: plaidAccount.account_id,
              current_balance: plaidAccount.balances?.current ?? null,
              account_type: plaidAccount.subtype || plaidAccount.type || existing.plaid_account_id,
            })
            .eq('id', existing.id);
          updatedAccounts.push(plaidAccount.name);
        }
        continue;
      }

      // Create new account
      const accountId = uuidv4();
      const account = {
        id: accountId,
        user_id: existingAccount.user_id,
        plaid_item_id: existingAccount.plaid_item_id,
        plaid_access_token: existingAccount.plaid_access_token,
        plaid_account_id: plaidAccount.account_id,
        institution_name: existingAccount.institution_name,
        account_name: plaidAccount.name || 'Account',
        account_type: plaidAccount.subtype || plaidAccount.type || 'unknown',
        current_balance: plaidAccount.balances?.current ?? null,
        created_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from('accounts')
        .insert(account);

      if (insertError) {
        console.error(`Failed to create account ${plaidAccount.name}:`, redactError(insertError));
        continue;
      }

      console.log(`Created new account: ${existingAccount.institution_name} - ${plaidAccount.name} (${plaidAccount.subtype || plaidAccount.type})`);
      newAccounts.push({
        id: accountId,
        name: plaidAccount.name,
        type: plaidAccount.subtype || plaidAccount.type || 'unknown'
      });
    }

    res.json({
      message: `Found ${plaidData.accounts.length} accounts in Plaid`,
      created: newAccounts,
      updated: updatedAccounts,
      total_new: newAccounts.length,
      total_updated: updatedAccounts.length,
    });
  } catch (error) {
    console.error('Error refreshing accounts:', redactError(error));
    res.status(500).json({ message: 'Failed to refresh accounts from Plaid' });
  }
});

// Update an account (balance threshold, etc.)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { account_name, account_type, current_balance } = req.body;

    // Build update object with only allowed fields
    const updates: Record<string, unknown> = {};

    if (account_name) updates.account_name = account_name;
    if (account_type) updates.account_type = account_type;
    if (current_balance !== undefined) updates.current_balance = current_balance;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ message: 'Account not found' });
    }

    console.log(`Updated account ${id}`);
    res.json(toPublicAccount(data));
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ message: 'Failed to update account' });
  }
});

// Reset an account's Plaid sync cursor. The next sync then re-delivers the full
// transaction history from Plaid, which re-runs attribution and corrects rows
// that a prior sync filed under the wrong card on a multi-account item.
router.post('/:id/reset-cursor', async (req, res) => {
  try {
    const { id } = req.params;

    // Look up the account's item so we can reset the cursor for every account
    // under it. The Plaid cursor is item-level; nulling only one row's cursor
    // would leave siblings able to resume from a stale cursor, so the full
    // re-delivery (and re-attribution) might not happen.
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, plaid_item_id, institution_name')
      .eq('id', id)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const { data, error } = await supabase
      .from('accounts')
      .update({ plaid_cursor: null })
      .eq('plaid_item_id', account.plaid_item_id)
      .select('id, account_name');

    if (error) throw error;

    console.log(`Reset Plaid cursor for ${data?.length ?? 0} account(s) under item ${account.plaid_item_id} (${account.institution_name})`);
    res.json({ success: true, reset_count: data?.length ?? 0, accounts: data });
  } catch (error) {
    console.error('Error resetting cursor:', error);
    res.status(500).json({ message: 'Failed to reset cursor' });
  }
});

export default router;

