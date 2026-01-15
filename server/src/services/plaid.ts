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

export const createLinkToken = async (userId: string, redirectUri?: string) => {
  const request: Parameters<typeof plaidClient.linkTokenCreate>[0] = {
    user: { client_user_id: userId },
    client_name: 'BudgetFlow',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
  };

  // Add redirect_uri for OAuth institutions (required for production)
  if (redirectUri) {
    request.redirect_uri = redirectUri;
  }

  const response = await plaidClient.linkTokenCreate(request);
  
  return response.data;
};

export const exchangePublicToken = async (publicToken: string) => {
  const response = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });
  
  return response.data;
};

export const getTransactions = async (
  accessToken: string,
  startDate: string,
  endDate: string
) => {
  const response = await plaidClient.transactionsGet({
    access_token: accessToken,
    start_date: startDate,
    end_date: endDate,
  });
  
  return response.data;
};

export const getAccounts = async (accessToken: string) => {
  const response = await plaidClient.accountsGet({
    access_token: accessToken,
  });
  
  return response.data;
};

