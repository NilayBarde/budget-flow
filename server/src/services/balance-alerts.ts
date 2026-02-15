/**
 * Balance alerts service for checking credit card balances and sending notifications
 */

import { supabase } from '../db/supabase.js';
import * as plaidService from './plaid.js';
import { sendBalanceAlert, isPushoverConfigured } from './pushover.js';

// Credit card account types to check
const CREDIT_CARD_TYPES = ['credit', 'credit card'];

// Cooldown period between alerts (24 hours in milliseconds)
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface AccountWithBalance {
  id: string;
  plaid_access_token: string;
  institution_name: string;
  account_name: string;
  account_type: string;
  current_balance: number | null;
  balance_threshold: number | null;
  last_balance_alert_at: string | null;
}

/**
 * Check if an account is a manual (non-Plaid) account
 */
const isManualAccount = (accessToken: string): boolean => {
  return accessToken === 'manual';
};

/**
 * Check if an account is a credit card type
 */
const isCreditCardAccount = (accountType: string): boolean => {
  return CREDIT_CARD_TYPES.some(type => 
    accountType.toLowerCase().includes(type)
  );
};

/**
 * Check if enough time has passed since the last alert
 */
const canSendAlert = (lastAlertAt: string | null): boolean => {
  if (!lastAlertAt) return true;
  
  const lastAlert = new Date(lastAlertAt).getTime();
  const now = Date.now();
  return (now - lastAlert) >= ALERT_COOLDOWN_MS;
};

/**
 * Fetch current balance from Plaid and update the database
 * @param accountId - The account ID to update
 * @returns The updated balance or null if fetch failed
 */
export const fetchAndUpdateBalance = async (
  accountId: string
): Promise<number | null> => {
  console.log(`fetchAndUpdateBalance called for ${accountId}`);
  
  // Get the account
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('id, plaid_access_token, plaid_account_id, account_name')
    .eq('id', accountId)
    .single();
  
  console.log(`Got account from DB: ${account?.account_name || 'not found'}`);

  if (accountError || !account) {
    console.error(`Account ${accountId} not found`);
    return null;
  }

  // Skip manual accounts
  if (isManualAccount(account.plaid_access_token)) {
    console.log(`Skipping balance fetch for manual account: ${account.account_name}`);
    return null;
  }

  try {
    // Fetch accounts from Plaid to get balances
    console.log(`Fetching balance from Plaid for ${account.account_name}...`);
    const plaidData = await plaidService.getAccounts(account.plaid_access_token);
    console.log(`Plaid returned ${plaidData.accounts?.length || 0} accounts`);
    
    // Find the specific account by plaid_account_id, or fall back to first account
    let plaidAccount = plaidData.accounts[0];
    
    if (account.plaid_account_id) {
      const matchingAccount = plaidData.accounts.find(
        a => a.account_id === account.plaid_account_id
      );
      if (matchingAccount) {
        plaidAccount = matchingAccount;
      } else {
        console.warn(`Could not find Plaid account ${account.plaid_account_id}, using first account`);
      }
    }
    
    if (!plaidAccount?.balances) {
      console.log(`No balance data for account: ${account.account_name}`);
      return null;
    }

    // For credit cards, use 'current' balance (what you owe)
    // This is positive for amount owed
    const currentBalance = plaidAccount.balances.current ?? null;

    if (currentBalance !== null) {
      // Update the balance in database
      await supabase
        .from('accounts')
        .update({ current_balance: currentBalance })
        .eq('id', accountId);

      console.log(`Updated balance for ${account.account_name}: $${currentBalance}`);
    }

    return currentBalance;
  } catch (error) {
    console.error(`Failed to fetch balance for ${account.account_name}:`, error);
    return null;
  }
};

/**
 * Check if an account's balance exceeds threshold and send alert if needed
 * @param account - The account to check
 * @returns True if an alert was sent
 */
export const checkBalanceThreshold = async (
  account: AccountWithBalance
): Promise<boolean> => {
  const { 
    id,
    institution_name,
    account_name,
    account_type,
    current_balance,
    balance_threshold,
    last_balance_alert_at,
    plaid_access_token,
  } = account;

  // Skip if no threshold set
  if (balance_threshold === null) {
    console.log(`No threshold set for ${account_name}, skipping alert check`);
    return false;
  }
  
  // Skip if not a credit card
  if (!isCreditCardAccount(account_type)) {
    console.log(`${account_name} is not a credit card (type: ${account_type}), skipping alert check`);
    return false;
  }

  // Skip manual accounts
  if (isManualAccount(plaid_access_token)) {
    console.log(`${account_name} is a manual account, skipping alert check`);
    return false;
  }

  // Skip if balance is null or below threshold
  if (current_balance === null) {
    console.log(`${account_name} has no balance data, skipping alert check`);
    return false;
  }
  
  if (current_balance <= balance_threshold) {
    console.log(`${account_name} balance ($${current_balance}) is within threshold ($${balance_threshold}), no alert needed`);
    return false;
  }

  console.log(`${account_name} balance ($${current_balance}) EXCEEDS threshold ($${balance_threshold})!`);

  // Check cooldown
  if (!canSendAlert(last_balance_alert_at)) {
    console.log(`Alert cooldown active for ${account_name}, skipping`);
    return false;
  }

  // Check if Pushover is configured
  if (!isPushoverConfigured()) {
    console.warn('Pushover not configured - cannot send balance alert. Add PUSHOVER_USER_KEY and PUSHOVER_APP_TOKEN to .env');
    return false;
  }

  // Send the alert
  const displayName = `${institution_name} ${account_name}`;
  
  try {
    await sendBalanceAlert(displayName, current_balance, balance_threshold);
    
    // Update last alert timestamp
    await supabase
      .from('accounts')
      .update({ last_balance_alert_at: new Date().toISOString() })
      .eq('id', id);

    console.log(`Balance alert sent for ${displayName}`);
    return true;
  } catch (error) {
    console.error(`Failed to send balance alert for ${displayName}:`, error);
    return false;
  }
};

/**
 * Check balance for a single account and send alert if needed.
 * Short-circuits before calling Plaid if the account doesn't qualify
 * (not a credit card, no threshold set, manual account, etc.)
 * @param accountId - The account ID to check
 * @returns True if an alert was sent
 */
export const checkAccountBalance = async (accountId: string): Promise<boolean> => {
  console.log(`Checking balance for account ${accountId}...`);

  // Read account from DB first to decide if a Plaid call is even needed
  const { data: account, error } = await supabase
    .from('accounts')
    .select('id, plaid_access_token, institution_name, account_name, account_type, current_balance, balance_threshold, last_balance_alert_at')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    console.error(`Failed to get account ${accountId} for balance check`);
    return false;
  }

  // Short-circuit: skip Plaid call if the account can never trigger an alert
  const { plaid_access_token, account_type, balance_threshold, account_name } = account;

  if (isManualAccount(plaid_access_token)) {
    console.log(`Skipping balance check for manual account: ${account_name}`);
    return false;
  }

  if (!isCreditCardAccount(account_type)) {
    console.log(`Skipping balance check for non-credit-card account: ${account_name} (type: ${account_type})`);
    return false;
  }

  if (balance_threshold === null) {
    console.log(`Skipping balance check for ${account_name} — no threshold set`);
    return false;
  }

  // Account qualifies — now fetch the latest balance from Plaid
  await fetchAndUpdateBalance(accountId);

  // Re-read account with updated balance
  const { data: updatedAccount } = await supabase
    .from('accounts')
    .select('id, plaid_access_token, institution_name, account_name, account_type, current_balance, balance_threshold, last_balance_alert_at')
    .eq('id', accountId)
    .single();

  if (!updatedAccount) {
    console.error(`Failed to re-read account ${accountId} after balance update`);
    return false;
  }

  console.log(`Balance check for ${updatedAccount.account_name}: type=${updatedAccount.account_type}, balance=${updatedAccount.current_balance}, threshold=${updatedAccount.balance_threshold}`);

  return checkBalanceThreshold(updatedAccount as AccountWithBalance);
};

/**
 * Check all accounts with balance thresholds set (for cron job)
 * @returns Object with counts of checked and alerted accounts
 */
export const checkAllBalances = async (): Promise<{
  checked: number;
  alerted: number;
  errors: number;
}> => {
  const results = { checked: 0, alerted: 0, errors: 0 };

  // Get all Plaid-connected accounts with thresholds set
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, plaid_access_token, institution_name, account_name, account_type, current_balance, balance_threshold, last_balance_alert_at')
    .not('balance_threshold', 'is', null)
    .neq('plaid_access_token', 'manual');

  if (error) {
    console.error('Failed to fetch accounts for balance check:', error);
    return results;
  }

  if (!accounts || accounts.length === 0) {
    console.log('No accounts with balance thresholds found');
    return results;
  }

  console.log(`Checking balances for ${accounts.length} accounts...`);

  for (const account of accounts) {
    try {
      // Fetch latest balance
      await fetchAndUpdateBalance(account.id);

      // Get updated account data
      const { data: updatedAccount } = await supabase
        .from('accounts')
        .select('id, plaid_access_token, institution_name, account_name, account_type, current_balance, balance_threshold, last_balance_alert_at')
        .eq('id', account.id)
        .single();

      if (updatedAccount) {
        results.checked++;
        const alerted = await checkBalanceThreshold(updatedAccount as AccountWithBalance);
        if (alerted) {
          results.alerted++;
        }
      }
    } catch (error) {
      console.error(`Error checking balance for account ${account.id}:`, error);
      results.errors++;
    }
  }

  console.log(`Balance check complete: ${results.checked} checked, ${results.alerted} alerted, ${results.errors} errors`);
  return results;
};
