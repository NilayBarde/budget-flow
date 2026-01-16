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
    products: [Products.Transactions],
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

export const exchangePublicToken = async (publicToken: string) => {
  const response = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });
  
  return response.data;
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
  const response = await plaidClient.accountsGet({
    access_token: accessToken,
  });
  
  return response.data;
};

