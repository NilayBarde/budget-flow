import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
import { buildAccountResolver } from '../services/sync-attribution.js';
import { applySyncResult } from '../services/sync-transactions.js';
import { redactError } from '../services/plaid-errors.js';
import { recordSyncFailure } from '../services/sync-error.js';

const router = Router();

// Per-item cooldown for webhook-triggered syncs.
// Each transactionsSync call costs $0.12 ("Transactions Refresh").
// Plaid can fire multiple SYNC_UPDATES_AVAILABLE webhooks in rapid succession;
// batching them with a 5-minute cooldown means the cursor-based sync picks up
// all accumulated changes in a single call instead of one call per webhook.
const WEBHOOK_SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const lastWebhookSyncByItem = new Map<string, number>();

interface ItemAccount {
  id: string;
  plaid_item_id: string;
  plaid_access_token: string;
  plaid_cursor: string | null;
  plaid_account_id: string | null;
  account_type?: string | null;
}

// Sync an item from its stored cursor and save the result. An item can hold several accounts
// (an Amex login with two cards): the first row supplies the access token and cursor, and every
// row drives per card attribution of the transactions.
const syncItem = async (itemAccounts: ItemAccount[], historicalComplete = false) => {
  const account = itemAccounts[0];
  try {
    const syncResult = await plaidService.syncTransactions(account.plaid_access_token, account.plaid_cursor);

    const resolveAccountId = buildAccountResolver(itemAccounts, account.id);
    return await applySyncResult({
      plaidItemId: account.plaid_item_id,
      syncResult,
      resolveAccountId,
      accountTypeById: new Map(itemAccounts.map(a => [a.id, a.account_type])),
      historicalComplete,
    });
  } catch (error) {
    // The webhook always answers 200, so without this a failed sync leaves no trace in the app.
    await recordSyncFailure(account.plaid_item_id, error);
    throw error;
  }
};

// Plaid webhook endpoint
router.post('/plaid', async (req, res) => {
  try {
    const { webhook_type, webhook_code, item_id, initial_update_complete, historical_update_complete } = req.body;

    console.log(`Plaid webhook received: ${webhook_type} - ${webhook_code}`);
    console.log('Webhook body:', JSON.stringify(req.body, null, 2));

    // Handle ITEM webhooks (authentication issues)
    if (webhook_type === 'ITEM') {
      // These codes mean the user must reconnect the item before it will sync
      // again (common for OAuth banks like American Express, which re-auth often).
      const reauthCodes = ['ITEM_LOGIN_REQUIRED', 'ERROR', 'PENDING_EXPIRATION', 'PENDING_DISCONNECT'];
      if (reauthCodes.includes(webhook_code)) {
        const { data: flagged } = await supabase
          .from('accounts')
          .update({ needs_reauth: true, reauth_detected_at: new Date().toISOString() })
          .eq('plaid_item_id', item_id)
          .select('id, institution_name');
        console.log(`⚠️ Item ${item_id} flagged for re-auth (${webhook_code}) — ${flagged?.length ?? 0} account(s): ${flagged?.map(a => a.institution_name).join(', ') || 'none'}`);
      }
    }

    // Handle TRANSACTIONS webhooks
    if (webhook_type === 'TRANSACTIONS') {
      // An item can have multiple accounts (e.g. an Amex login with two cards).
      const { data: itemAccounts, error: accountError } = await supabase
        .from('accounts')
        .select('*')
        .eq('plaid_item_id', item_id);

      if (accountError || !itemAccounts || itemAccounts.length === 0) {
        console.error('Account not found for item_id:', item_id);
        return res.status(200).json({ received: true, error: 'Account not found' });
      }

      const account = itemAccounts[0];

      if (webhook_code === 'SYNC_UPDATES_AVAILABLE') {
        console.log(`Sync updates available for account ${account.id}`);
        console.log(`  initial_update_complete: ${initial_update_complete}`);
        console.log(`  historical_update_complete: ${historical_update_complete}`);

        // Cooldown: skip if we already synced this item recently.
        // Each transactionsSync call costs $0.12, and Plaid can fire multiple
        // SYNC_UPDATES_AVAILABLE webhooks in quick succession. The cursor-based
        // sync will pick up all accumulated changes on the next call, so
        // skipping intermediate webhooks is safe and saves money.
        const lastSync = lastWebhookSyncByItem.get(item_id);
        if (lastSync && (Date.now() - lastSync) < WEBHOOK_SYNC_COOLDOWN_MS) {
          const minutesLeft = ((WEBHOOK_SYNC_COOLDOWN_MS - (Date.now() - lastSync)) / 60000).toFixed(1);
          console.log(`Skipping webhook sync for item ${item_id} — cooldown active (${minutesLeft}m remaining). Next webhook or manual sync will catch up.`);
        } else {
          // Record sync timestamp
          lastWebhookSyncByItem.set(item_id, Date.now());

          let counts;
          try {
            counts = await syncItem(itemAccounts, Boolean(historical_update_complete));
          } catch (syncError) {
            // The sync did not complete and the cursor stayed put. Without this the cooldown would
            // block the next webhook for 5 minutes, which is exactly the retry that fixes it.
            lastWebhookSyncByItem.delete(item_id);
            throw syncError;
          }
          console.log(`Processed: +${counts.added} added, ~${counts.modified} modified, -${counts.removed} removed, ⇄${counts.reattributed} re-attributed, ⤳${counts.reconciled} pending-reconciled`);
          console.log(`Cursor updated for item ${item_id} (${itemAccounts.length} account(s))`);
        }
      } else if (webhook_code === 'INITIAL_UPDATE') {
        console.log(`Initial update received for account ${account.id}`);
        // Trigger a sync to get the initial 30 days of data
        const counts = await syncItem(itemAccounts);
        console.log(`Initial sync: +${counts.added} transactions`);
      } else if (webhook_code === 'HISTORICAL_UPDATE') {
        console.log(`Historical update complete for item ${item_id}`);
        // Mark historical sync as complete for every account under the item
        await supabase
          .from('accounts')
          .update({ historical_sync_complete: true })
          .eq('plaid_item_id', item_id);
      }
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', redactError(error));
    // Still return 200 to prevent Plaid from retrying
    res.status(200).json({ received: true, error: 'Processing error' });
  }
});

export default router;
