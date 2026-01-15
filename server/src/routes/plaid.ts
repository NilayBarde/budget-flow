import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as plaidService from '../services/plaid.js';
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
    
    const { redirect_uri } = req.body;
    const linkToken = await plaidService.createLinkToken(DEFAULT_USER_ID, redirect_uri);
    
    res.json({
      link_token: linkToken.link_token,
      expiration: linkToken.expiration,
    });
  } catch (error: unknown) {
    console.error('Error creating link token:', error);
    const plaidError = error as { response?: { data?: unknown } };
    if (plaidError.response?.data) {
      console.error('Plaid error details:', plaidError.response.data);
    }
    res.status(500).json({ message: 'Failed to create link token' });
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
    const plaidAccount = accountsResponse.accounts[0];

    // Store the account
    const account = {
      id: uuidv4(),
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
    res.json(data);
  } catch (error) {
    console.error('Error exchanging token:', error);
    res.status(500).json({ message: 'Failed to connect account' });
  }
});

export default router;

