import { Router } from 'express';
import type { Db } from '../db/supabase.js';
import { userContext } from '../db/context.js';
import { ACCOUNT_COLUMNS } from '../db/columns.js';
import { getAccountSecrets, insertAccount, saveCursor, updateAccountCredentials } from '../services/plaid-secrets.js';
import * as plaidService from '../services/plaid.js';
import { buildAccountResolver } from '../services/sync-attribution.js';
import { applySyncResult } from '../services/sync-transactions.js';
import { getPlaidErrorCode, needsReconnect, redactError } from '../services/plaid-errors.js';
import { recordSyncFailure } from '../services/sync-error.js';
import { removeItemIfUnused } from '../services/plaid-items.js';
import { findIdleConnections, IDLE_SNOOZE_DAYS, type IdleCheckAccount, type IdleConnection } from '../services/idle-connections.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { classifySyncHealth, DEFAULT_STALE_DAYS, INVESTMENT_STALE_DAYS, parseStaleDaysOverride } from '../services/sync-health.js';
import { toPublicAccount } from '../services/account-redaction.js';
import { randomUUID } from 'node:crypto';

const router = Router();

// In-memory cooldown map: accountId → last sync timestamp
// Prevents rapid repeated syncs from burning Plaid API calls
const SYNC_COOLDOWN_MS = 30_000; // 30 seconds
const lastSyncByAccount = new Map<string, number>();

// Get all accounts
router.get('/', asyncHandler(async (req, res) => {
  const { db } = userContext(req);
  const { data: accounts, error } = await db
    .from('accounts')
    .select(ACCOUNT_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Get the most recent CSV import date for each account
  const { data: lastImports } = await db
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

  const idle = await findIdleAccounts(db, (accounts || []) as unknown as IdleCheckAccount[]);

  // Merge last import dates into accounts
  // Use csv_imports table first, fall back to account's own last_csv_import_at (set by holdings import)
  const accountsWithLastImport = (accounts as unknown as { id: string; last_csv_import_at: string | null }[] | null)?.map(account => ({
    ...toPublicAccount(account),
    last_csv_import_at: lastImportMap.get(account.id) || account.last_csv_import_at || null,
    idle: idle.get(account.id) ?? null,
  }));

  res.json(accountsWithLastImport);
}));

// Plaid connections with no activity in a while, which the Accounts page suggests disconnecting.
// One "newest transaction" lookup per Plaid account (about 20, run in parallel). It is a nudge, so
// a failed lookup leaves it out rather than failing the accounts list.
const findIdleAccounts = async (db: Db, accounts: IdleCheckAccount[]) => {
  try {
    const plaidAccounts = accounts.filter(a => !a.is_manual);
    const withDates = await Promise.all(plaidAccounts.map(async account => {
      const { data: newest, error } = await db
        .from('transactions')
        .select('date')
        .eq('account_id', account.id)
        .order('date', { ascending: false })
        .limit(1);
      if (error) throw error;
      return { ...account, last_transaction_date: newest?.[0]?.date ?? null };
    }));
    return findIdleConnections(withDates, Date.now());
  } catch (error) {
    console.warn('Could not check for idle Plaid connections:', redactError(error));
    return new Map<string, IdleConnection>();
  }
};

// Sync health: which Plaid-linked accounts need attention (re-auth required, or
// haven't synced successfully in a while). Manual accounts are excluded since
// they never sync via Plaid.
router.get('/sync-health', asyncHandler(async (req, res) => {
  try {
    const staleDaysOverride = parseStaleDaysOverride(req.query.staleDays);

    const { data: accounts, error } = await userContext(req).db
      .from('accounts')
      .select('id, institution_name, account_name, account_type, needs_reauth, reauth_detected_at, last_synced_at, last_sync_error, last_sync_error_at')
      .eq('is_manual', false);

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
}));

// Create a manual account (for banks that can't be linked via Plaid, e.g., American Express)
router.post('/manual', asyncHandler(async (req, res) => {
  try {
    const { userId } = userContext(req);
    const { institution_name, account_name, account_type, current_balance } = req.body;

    if (!institution_name || !account_name || !account_type) {
      return res.status(400).json({
        message: 'institution_name, account_name, and account_type are required'
      });
    }

    const accountId = randomUUID();
    const manualId = `manual-${accountId}`;

    const account: Record<string, unknown> = {
      id: accountId,
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

    // Accounts are created through the service role (they carry the 'manual' token sentinel).
    const data = await insertAccount(userId, account);

    console.log(`Created manual account: ${institution_name} - ${account_name}`);
    res.status(201).json(toPublicAccount(data));
  } catch (error) {
    console.error('Error creating manual account:', error);
    res.status(500).json({ message: 'Failed to create manual account' });
  }
}));

// Sync transactions for an account using Plaid's /transactions/sync (recommended)
router.post('/:id/sync', asyncHandler(async (req, res) => {
  const ctx = userContext(req);
  const { db, userId } = ctx;
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

    const { data: account, error: accountError } = await db
      .from('accounts')
      .select(ACCOUNT_COLUMNS)
      .eq('id', id)
      .single<{
        id: string;
        plaid_item_id: string;
        plaid_account_id: string | null;
        institution_name: string;
        current_balance: number | null;
        historical_sync_complete: boolean | null;
        is_manual: boolean;
      }>();
    const secrets = account ? await getAccountSecrets(userId, id) : null;

    if (accountError || !account || !secrets) {
      return res.status(404).json({ message: 'Account not found' });
    }
    // Manual and disconnected accounts have no Plaid token, only the 'manual' placeholder
    if (account.is_manual) {
      return res.status(400).json({ message: 'Account is not connected to Plaid' });
    }

    // Record sync timestamp before making Plaid calls
    lastSyncByAccount.set(id, Date.now());

    // 1. Fetch latest balance (works for investment accounts too)
    let latestBalance: number | null = account.current_balance;
    try {
      console.log(`[Sync] Fetching account balance for ${account.institution_name} (${id})...`);
      const plaidData = await plaidService.getAccounts(secrets.plaid_access_token);
      const plaidAccount = plaidData.accounts.find(a => a.account_id === account.plaid_account_id);
      // Some institutions report no current balance; keep the last known one instead of blanking it
      if (plaidAccount && plaidAccount.balances.current !== null) {
        latestBalance = plaidAccount.balances.current;
        console.log(`[Sync] Success via getAccounts: ${latestBalance}`);
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
        secrets.plaid_access_token,
        secrets.plaid_cursor
      );
    } catch (syncError) {
      console.error(`Transaction sync failed for account ${id}:`, redactError(syncError));
      await recordSyncFailure(ctx, account.plaid_item_id, syncError);
      // If balance was updated, we can still return success for the balance part
      if (latestBalance !== account.current_balance) {
        await db.from('accounts').update({ current_balance: latestBalance }).eq('id', id);
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
    const { data: itemAccounts } = await db
      .from('accounts')
      .select('id, plaid_account_id, account_type')
      .eq('plaid_item_id', account.plaid_item_id);

    // Balance is per account, unlike the cursor, so it is saved here. It goes first: it is already
    // fetched and correct, and saving the transactions can throw, which must not throw it away.
    await db
      .from('accounts')
      .update({ current_balance: latestBalance })
      .eq('id', id);

    const historicalComplete = syncResult.transactionsUpdateStatus === 'HISTORICAL_UPDATE_COMPLETE';
    const counts = await applySyncResult({
      ctx,
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
      const { data: failedAccount } = await db
        .from('accounts')
        .select('plaid_item_id')
        .eq('id', req.params.id)
        .single();
      await recordSyncFailure(ctx, failedAccount?.plaid_item_id, error);
    } catch (recordError) {
      console.error('Could not record the sync failure:', redactError(recordError));
    }

    if (needsReconnect(plaidErrorCode)) {
      return res.status(409).json({ message: 'This connection needs to be reconnected', code: plaidErrorCode });
    }

    res.status(500).json({ message: 'Failed to sync account', code: plaidErrorCode });
  }
}));

// Update webhook URL on an existing account (doesn't use up an Item!)
router.post('/:id/update-webhook', asyncHandler(async (req, res) => {
  try {
    const { userId } = userContext(req);
    const { id } = req.params;
    const webhookUrl = process.env.PLAID_WEBHOOK_URL;

    if (!webhookUrl) {
      return res.status(400).json({ message: 'PLAID_WEBHOOK_URL not configured' });
    }

    const secrets = await getAccountSecrets(userId, id);
    if (!secrets) {
      return res.status(404).json({ message: 'Account not found' });
    }

    await plaidService.updateWebhook(secrets.plaid_access_token, webhookUrl);

    res.json({ message: 'Webhook updated', webhook_url: webhookUrl });
  } catch (error) {
    console.error('Error updating webhook:', redactError(error));
    res.status(500).json({ message: 'Failed to update webhook' });
  }
}));

// Disconnect a bank connection from Plaid but keep its accounts and their history: each becomes a
// manual account (balance edited by hand, new activity from CSV imports). It acts on the whole Plaid
// Item, not one account, because Plaid bills per Item and keeps sending every account on it: a
// single account taken off a live Item would have its new transactions filed under a sibling.
router.post('/:id/disconnect', asyncHandler(async (req, res) => {
  const { db, userId } = userContext(req);
  const { id } = req.params;

  const { data: account, error: lookupError } = await db
    .from('accounts')
    .select('plaid_item_id, is_manual')
    .eq('id', id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!account) return res.status(404).json({ message: 'Account not found' });
  if (account.is_manual) {
    return res.status(400).json({ message: 'Account is not connected to Plaid' });
  }
  const secrets = await getAccountSecrets(userId, id);
  if (!secrets) return res.status(404).json({ message: 'Account not found' });

  const { data: connection, error: connectionError } = await db
    .from('accounts')
    .select('id, account_name')
    .eq('plaid_item_id', account.plaid_item_id);
  if (connectionError) throw connectionError;

  // Remove the Item at Plaid first. If that fails nothing has changed here, and the access token is
  // still stored so the user can retry; dropping it first would leave an Item billing forever. An
  // Item Plaid no longer knows is already gone, which is the outcome we want.
  try {
    await plaidService.removeItem(secrets.plaid_access_token);
  } catch (plaidError) {
    const code = getPlaidErrorCode(plaidError);
    if (code !== 'ITEM_NOT_FOUND' && code !== 'INVALID_ACCESS_TOKEN') {
      console.warn('Could not remove item from Plaid:', redactError(plaidError));
      return res.status(502).json({ message: 'Plaid could not remove the connection, so nothing was changed. Try again.' });
    }
  }

  for (const row of connection ?? []) {
    await updateAccountCredentials(
      userId,
      row.id,
      { plaid_item_id: `manual-${row.id}`, plaid_access_token: 'manual', plaid_cursor: null },
      {
        needs_reauth: false,
        reauth_detected_at: null,
        last_sync_error: null,
        last_sync_error_at: null,
        relinked_at: null,
        idle_snoozed_until: null,
      },
    );
  }

  // Pending rows will never post now, so they would count as spending forever
  const ids = (connection ?? []).map(row => row.id);
  if (ids.length > 0) {
    const { error } = await db.from('transactions').delete().in('account_id', ids).eq('pending', true);
    if (error) throw error;
  }

  res.json({ disconnected: (connection ?? []).map(row => row.account_name) });
}));

// "Keep" on an idle connection: hide the disconnect suggestion for IDLE_SNOOZE_DAYS. It applies to
// every account on the connection, since the suggestion is about the connection.
router.post('/:id/snooze-idle', asyncHandler(async (req, res) => {
  const { db } = userContext(req);
  const { id } = req.params;

  const { data: account, error: lookupError } = await db
    .from('accounts')
    .select('plaid_item_id, is_manual')
    .eq('id', id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!account) return res.status(404).json({ message: 'Account not found' });
  if (account.is_manual) {
    return res.status(400).json({ message: 'Account is not connected to Plaid' });
  }

  const snoozedUntil = new Date(Date.now() + IDLE_SNOOZE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await db
    .from('accounts')
    .update({ idle_snoozed_until: snoozedUntil })
    .eq('plaid_item_id', account.plaid_item_id);
  if (error) throw error;

  res.json({ idle_snoozed_until: snoozedUntil });
}));

// Delete an account (and its Plaid Item once no other account uses it)
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const { db, userId } = userContext(req);
    const { id } = req.params;

    const secrets = await getAccountSecrets(userId, id);

    // Delete all transactions for this account first
    await db.from('transactions').delete().eq('account_id', id);

    const { error } = await db.from('accounts').delete().eq('id', id);

    if (error) throw error;

    // Stop Plaid billing for the connection, unless another account (the same bank's card, say) still uses it
    if (secrets?.plaid_access_token) await removeItemIfUnused(secrets.plaid_access_token);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
}));

// Refresh accounts from Plaid - fetches any missing accounts from an existing Plaid Item
// This is useful when the original link only stored one account but Plaid has multiple
router.post('/:id/refresh-accounts', asyncHandler(async (req, res) => {
  try {
    const { db, userId } = userContext(req);
    const { id } = req.params;

    // Get the existing account and its access token
    const { data: existingAccount, error: accountError } = await db
      .from('accounts')
      .select('plaid_item_id, institution_name, is_manual')
      .eq('id', id)
      .single();
    const secrets = existingAccount ? await getAccountSecrets(userId, id) : null;

    if (accountError || !existingAccount || !secrets) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Check if it's a manual account
    if (existingAccount.is_manual) {
      return res.status(400).json({ message: 'Cannot refresh accounts for manual accounts' });
    }

    // Fetch all accounts from Plaid
    const plaidData = await plaidService.getAccounts(secrets.plaid_access_token);

    if (!plaidData.accounts || plaidData.accounts.length === 0) {
      return res.status(400).json({ message: 'No accounts found in Plaid' });
    }

    console.log(`Found ${plaidData.accounts.length} accounts from Plaid for ${existingAccount.institution_name}`);

    // Get all existing accounts for this Plaid Item
    const { data: existingAccounts } = await db
      .from('accounts')
      .select('plaid_account_id')
      .eq('plaid_item_id', existingAccount.plaid_item_id);

    const existingPlaidAccountIds = new Set(
      existingAccounts?.map(a => a.plaid_account_id).filter(Boolean) || []
    );

    // Also check by account name as fallback for older accounts without plaid_account_id
    const { data: existingByName } = await db
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
        const { data: existing } = await db
          .from('accounts')
          .select('id, plaid_account_id, account_type')
          .eq('plaid_item_id', existingAccount.plaid_item_id)
          .or(`plaid_account_id.eq.${plaidAccount.account_id},account_name.eq.${plaidAccount.name}`)
          .single();

        if (existing && !existing.plaid_account_id) {
          await updateAccountCredentials(
            userId,
            existing.id,
            { plaid_account_id: plaidAccount.account_id },
            {
              current_balance: plaidAccount.balances?.current ?? null,
              // Plaid sometimes sends neither; keep the stored type rather than blanking it
              account_type: plaidAccount.subtype || plaidAccount.type || existing.account_type,
            },
          );
          updatedAccounts.push(plaidAccount.name);
        }
        continue;
      }

      // Create new account
      const accountId = randomUUID();
      const account = {
        id: accountId,
        plaid_item_id: existingAccount.plaid_item_id,
        plaid_access_token: secrets.plaid_access_token,
        plaid_account_id: plaidAccount.account_id,
        institution_name: existingAccount.institution_name,
        account_name: plaidAccount.name || 'Account',
        account_type: plaidAccount.subtype || plaidAccount.type || 'unknown',
        current_balance: plaidAccount.balances?.current ?? null,
        created_at: new Date().toISOString(),
      };

      try {
        await insertAccount(userId, account);
      } catch (insertError) {
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
}));

// Update an account (balance threshold, etc.)
router.patch('/:id', asyncHandler(async (req, res) => {
  try {
    const { db } = userContext(req);
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

    const { data, error } = await db
      .from('accounts')
      .update(updates)
      .eq('id', id)
      .select(ACCOUNT_COLUMNS)
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
}));

// Reset an account's Plaid sync cursor. The next sync then re-delivers the full
// transaction history from Plaid, which re-runs attribution and corrects rows
// that a prior sync filed under the wrong card on a multi-account item.
router.post('/:id/reset-cursor', asyncHandler(async (req, res) => {
  try {
    const { db, userId } = userContext(req);
    const { id } = req.params;

    // Look up the account's item so we can reset the cursor for every account
    // under it. The Plaid cursor is item-level; nulling only one row's cursor
    // would leave siblings able to resume from a stale cursor, so the full
    // re-delivery (and re-attribution) might not happen.
    const { data: account, error: accountError } = await db
      .from('accounts')
      .select('id, plaid_item_id, institution_name')
      .eq('id', id)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Signed-in users can't write the cursor, so it is cleared through the service role.
    await saveCursor(userId, account.plaid_item_id, null);
    const { data, error } = await db
      .from('accounts')
      .select('id, account_name')
      .eq('plaid_item_id', account.plaid_item_id);

    if (error) throw error;

    console.log(`Reset Plaid cursor for ${data?.length ?? 0} account(s) under item ${account.plaid_item_id} (${account.institution_name})`);
    res.json({ success: true, reset_count: data?.length ?? 0, accounts: data });
  } catch (error) {
    console.error('Error resetting cursor:', error);
    res.status(500).json({ message: 'Failed to reset cursor' });
  }
}));

export default router;

