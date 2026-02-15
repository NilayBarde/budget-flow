import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

// env is loaded in index.ts

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
const PLAID_SECRET = process.env.PLAID_SECRET || '';
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

const configuration = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV as keyof typeof PlaidEnvironments],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

export const createLinkToken = async (userId: string, redirectUri?: string, webhookUrl?: string) => {
  const request: Parameters<typeof plaidClient.linkTokenCreate>[0] = {
    user: { client_user_id: userId },
    client_name: 'BudgetFlow',
    products: [Products.Transactions],  // Only require Transactions - widely supported
    optional_products: [Products.Investments],  // Request Investments if institution supports it
    // NOTE: Plaid's "Recurring Transactions" product ($0.15/account/month) is NOT used
    // by this app — our recurring transaction tracking is entirely local (Supabase).
    // Make sure Products.RecurringTransactions is NOT listed here and is DISABLED in
    // your Plaid Dashboard (dashboard.plaid.com → Products) to avoid unnecessary charges.
    country_codes: [CountryCode.Us],
    language: 'en',
    transactions: {
      days_requested: 730,  // Request 2 years of transaction history (max allowed)
    },
  };
  
  // Add webhook URL if provided (required for SYNC_UPDATES_AVAILABLE notifications)
  if (webhookUrl) {
    request.webhook = webhookUrl;
    console.log('Using webhook URL:', webhookUrl);
  }

  // Add redirect_uri for OAuth institutions (required for production)
  if (redirectUri) {
    request.redirect_uri = redirectUri;
    console.log('Using redirect_uri:', redirectUri);
  } else {
    console.log('No redirect_uri provided (localhost/HTTP mode)');
  }

  try {
    const response = await plaidClient.linkTokenCreate(request);
    console.log('Link token created successfully');
    return response.data;
  } catch (error: unknown) {
    const plaidError = error as { response?: { data?: unknown } };
    if (plaidError.response?.data) {
      console.error('Plaid API error:', JSON.stringify(plaidError.response.data, null, 2));
    }
    throw error;
  }
};

// Create a link token in update mode to add new products to an existing connection
export const createUpdateLinkToken = async (
  userId: string,
  accessToken: string,
  redirectUri?: string
) => {
  const request: Parameters<typeof plaidClient.linkTokenCreate>[0] = {
    user: { client_user_id: userId },
    client_name: 'BudgetFlow',
    access_token: accessToken, // This puts Link in update mode
    country_codes: [CountryCode.Us],
    language: 'en',
    // Request additional consent for the Investments product
    additional_consented_products: [Products.Investments],
    update: {
      account_selection_enabled: true,
    },
  };

  // Add redirect_uri for OAuth institutions (required for production)
  if (redirectUri) {
    request.redirect_uri = redirectUri;
    console.log('Using redirect_uri for update mode:', redirectUri);
  } else {
    console.log('No redirect_uri provided for update mode (localhost/HTTP mode)');
  }

  try {
    const response = await plaidClient.linkTokenCreate(request);
    console.log('Update mode link token created successfully (requesting Investments consent)');
    return response.data;
  } catch (error: unknown) {
    const plaidError = error as { response?: { data?: unknown } };
    if (plaidError.response?.data) {
      console.error('Plaid update link token error:', JSON.stringify(plaidError.response.data, null, 2));
    }
    throw error;
  }
};

export const exchangePublicToken = async (publicToken: string) => {
  try {
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    
    return response.data;
  } catch (error: unknown) {
    const plaidError = error as { response?: { data?: unknown } };
    if (plaidError.response?.data) {
      console.error('Plaid exchange token error:', JSON.stringify(plaidError.response.data, null, 2));
    }
    throw error;
  }
};

// Sync transactions using Plaid's recommended /transactions/sync endpoint
// Transaction type from Plaid sync response
interface PlaidSyncTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name?: string | null;
  category?: string[];
  pending: boolean;
  original_description?: string;
  personal_finance_category?: {
    primary?: string;
    detailed?: string;
  };
}

export interface SyncResult {
  added: PlaidSyncTransaction[];
  modified: PlaidSyncTransaction[];
  removed: { transaction_id: string }[];
  nextCursor: string;
  hasMore: boolean;
  transactionsUpdateStatus?: string; // INITIAL_UPDATE_COMPLETE, HISTORICAL_UPDATE_COMPLETE, NOT_READY, etc.
}

export const syncTransactions = async (
  accessToken: string,
  cursor?: string | null
): Promise<SyncResult> => {
  const allAdded: PlaidSyncTransaction[] = [];
  const allModified: PlaidSyncTransaction[] = [];
  const allRemoved: { transaction_id: string }[] = [];
  let currentCursor = cursor || '';
  let hasMore = true;
  let transactionsUpdateStatus: string | undefined;
  
  console.log(`Starting transactions sync${cursor ? ' from cursor' : ' (initial)'}...`);
  
  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor: currentCursor || undefined,
      options: {
        include_original_description: true,
      },
    });
    
    const data = response.data;
    allAdded.push(...(data.added as PlaidSyncTransaction[]));
    allModified.push(...(data.modified as PlaidSyncTransaction[]));
    allRemoved.push(...data.removed);
    
    hasMore = data.has_more;
    currentCursor = data.next_cursor;
    
    // Capture the transactions_update_status from first response
    if (!transactionsUpdateStatus && data.transactions_update_status) {
      transactionsUpdateStatus = data.transactions_update_status;
    }
    
    console.log(`Sync batch: +${data.added.length} added, ~${data.modified.length} modified, -${data.removed.length} removed`);
  }
  
  console.log(`Sync complete: ${allAdded.length} added, ${allModified.length} modified, ${allRemoved.length} removed`);
  console.log(`Transactions update status: ${transactionsUpdateStatus || 'unknown'}`);
  
  return {
    added: allAdded,
    modified: allModified,
    removed: allRemoved,
    nextCursor: currentCursor,
    hasMore: false,
    transactionsUpdateStatus,
  };
};

export const getAccounts = async (accessToken: string) => {
  try {
    const response = await plaidClient.accountsGet({
      access_token: accessToken,
    });
    
    return response.data;
  } catch (error: unknown) {
    const plaidError = error as { response?: { data?: unknown } };
    if (plaidError.response?.data) {
      console.error('Plaid get accounts error:', JSON.stringify(plaidError.response.data, null, 2));
    }
    throw error;
  }
};

// Update webhook URL on an existing Item (doesn't create a new Item!)
export const updateWebhook = async (accessToken: string, webhookUrl: string) => {
  const response = await plaidClient.itemWebhookUpdate({
    access_token: accessToken,
    webhook: webhookUrl,
  });
  
  console.log(`Webhook updated to: ${webhookUrl}`);
  return response.data;
};

// Remove an Item from Plaid (call this when deleting an account)
export const removeItem = async (accessToken: string) => {
  const response = await plaidClient.itemRemove({
    access_token: accessToken,
  });
  
  console.log('Item removed from Plaid');
  return response.data;
};

// Investment holdings types
export interface PlaidSecurity {
  security_id: string;
  ticker_symbol: string | null;
  name: string | null;
  type: string | null;
  close_price: number | null;
  close_price_as_of: string | null;
  iso_currency_code: string | null;
}

export interface PlaidHolding {
  account_id: string;
  security_id: string;
  quantity: number;
  cost_basis: number | null;
  institution_value: number | null;
  iso_currency_code: string | null;
}

export interface InvestmentHoldingsResult {
  holdings: PlaidHolding[];
  securities: PlaidSecurity[];
  accounts: Array<{
    account_id: string;
    name: string;
    type: string;
    subtype: string | null;
    balances: {
      current: number | null;
    };
  }>;
}

// Get investment holdings from Plaid
export const getInvestmentHoldings = async (accessToken: string): Promise<InvestmentHoldingsResult> => {
  try {
    const response = await plaidClient.investmentsHoldingsGet({
      access_token: accessToken,
    });
    
    const { holdings, securities, accounts } = response.data;
    
    console.log(`Fetched ${holdings.length} holdings across ${securities.length} securities`);
    
    return {
      holdings: holdings.map(h => ({
        account_id: h.account_id,
        security_id: h.security_id,
        quantity: h.quantity,
        cost_basis: h.cost_basis,
        institution_value: h.institution_value,
        iso_currency_code: h.iso_currency_code,
      })),
      securities: securities.map(s => ({
        security_id: s.security_id,
        ticker_symbol: s.ticker_symbol,
        name: s.name,
        type: s.type,
        close_price: s.close_price,
        close_price_as_of: s.close_price_as_of,
        iso_currency_code: s.iso_currency_code,
      })),
      accounts: accounts.map(a => ({
        account_id: a.account_id,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        balances: {
          current: a.balances.current,
        },
      })),
    };
  } catch (error: unknown) {
    const plaidError = error as { response?: { data?: { error_code?: string } } };
    // Don't log ADDITIONAL_CONSENT_REQUIRED - it's expected for accounts without investment consent
    if (plaidError.response?.data && plaidError.response.data.error_code !== 'ADDITIONAL_CONSENT_REQUIRED') {
      console.error('Plaid get investment holdings error:', JSON.stringify(plaidError.response.data, null, 2));
    }
    throw error;
  }
};
