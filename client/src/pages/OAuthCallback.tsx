import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlaidLink } from 'react-plaid-link';
import { Spinner } from '../components/ui';
import { useExchangePlaidToken } from '../hooks';

const AMEX_TOKEN_STORAGE_KEY = 'plaid_link_token_amex';

/**
 * OAuth Callback Page
 * 
 * This page handles the OAuth redirect from banks like American Express.
 * It retrieves the stored link token and re-initializes Plaid Link to complete the flow.
 */
// Retrieve stored link token synchronously on initial render
const getStoredLinkToken = (): { token: string | null; error: string | null } => {
  try {
    const storedValue = localStorage.getItem(AMEX_TOKEN_STORAGE_KEY);
    if (storedValue) {
      const parsed = JSON.parse(storedValue);
      if (parsed?.token) {
        console.log('Retrieved stored link token for OAuth completion');
        return { token: parsed.token, error: null };
      }
    }
    console.error('No stored link token found for OAuth callback');
    return { token: null, error: 'OAuth session expired. Please try connecting again.' };
  } catch (err) {
    console.error('Error retrieving link token:', err);
    return { token: null, error: 'Failed to complete connection. Please try again.' };
  }
};

export const OAuthCallback = () => {
  const navigate = useNavigate();
  const exchangeToken = useExchangePlaidToken();
  
  // Initialize state from localStorage synchronously
  const [initialState] = useState(() => getStoredLinkToken());
  const [linkToken] = useState<string | null>(initialState.token);
  const [error, setError] = useState<string | null>(initialState.error);

  useEffect(() => {
    console.log('OAuth callback page loaded:', window.location.href);
  }, []);

  const onSuccess = useCallback(async (publicToken: string, metadata: unknown) => {
    console.log('OAuth flow completed successfully');
    try {
      await exchangeToken.mutateAsync({ publicToken, metadata });
      localStorage.removeItem(AMEX_TOKEN_STORAGE_KEY);
      navigate('/accounts');
    } catch (err) {
      console.error('Failed to exchange token:', err);
      setError('Failed to complete connection. Please try again.');
    }
  }, [exchangeToken, navigate]);

  const onExit = useCallback((err: unknown, metadata?: unknown) => {
    console.log('=== Plaid Link OAuth Exit ===');
    console.log('Error:', JSON.stringify(err, null, 2));
    console.log('Metadata:', JSON.stringify(metadata, null, 2));
    console.log('Current URL:', window.location.href);
    
    if (err) {
      const plaidErr = err as { error_code?: string; error_message?: string; display_message?: string };
      const errorMessage = plaidErr.display_message || plaidErr.error_message || 'Connection failed';
      const errorCode = plaidErr.error_code || 'UNKNOWN';
      console.error(`OAuth error [${errorCode}]: ${errorMessage}`);
      setError(`${errorMessage} (Code: ${errorCode})`);
    } else {
      // User closed without error - still navigate back
      console.log('User closed Plaid Link (no error)');
    }
    // Navigate back to accounts page after a delay
    setTimeout(() => navigate('/accounts'), 2000);
  }, [navigate]);

  const onEvent = useCallback((eventName: string, metadata: unknown) => {
    console.log('OAuth Plaid Link event:', eventName, metadata);
  }, []);

  // Render Plaid Link when we have a token - it will auto-detect OAuth params
  const { open, ready, error: plaidLinkError } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
    onEvent,
  });
  
  // Log any Plaid Link initialization errors
  useEffect(() => {
    if (plaidLinkError) {
      console.error('Plaid Link initialization error:', plaidLinkError);
    }
  }, [plaidLinkError]);

  // Open Plaid Link once ready - it will automatically complete the OAuth flow
  useEffect(() => {
    if (ready && linkToken) {
      console.log('Opening Plaid Link to complete OAuth flow');
      open();
    }
  }, [ready, linkToken, open]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-midnight-900">
        <div className="text-red-400 text-center max-w-md p-4">
          <p className="text-lg font-semibold mb-2">Connection Error</p>
          <p>{error}</p>
          <button 
            onClick={() => navigate('/accounts')}
            className="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            Back to Accounts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-midnight-900">
      <Spinner size="lg" />
      <p className="mt-4 text-slate-300">Completing secure bank connection...</p>
    </div>
  );
};
