import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePlaidLink } from 'react-plaid-link';
import { exchangePlaidToken } from '../services/api';
import { Spinner } from '../components/ui';
import { LINK_TOKEN_STORAGE_KEY } from '../utils/constants';

export const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get the OAuth state from URL params - Plaid includes this to verify the redirect
  const oauthStateId = searchParams.get('oauth_state_id');

  useEffect(() => {
    // Validate that this is a legitimate OAuth callback
    if (!oauthStateId) {
      setError('Invalid OAuth callback. Missing state.');
      return;
    }

    // Retrieve link token from localStorage (stored when PlaidLinkButton created it)
    const storedToken = localStorage.getItem(LINK_TOKEN_STORAGE_KEY);
    
    if (!storedToken) {
      setError('Failed to continue bank connection. Please try connecting again.');
      return;
    }

    setLinkToken(storedToken);
  }, [oauthStateId]);

  const onSuccess = useCallback(async (publicToken: string, metadata: unknown) => {
    try {
      await exchangePlaidToken(publicToken, metadata);
      // Clear stored token after successful connection
      localStorage.removeItem(LINK_TOKEN_STORAGE_KEY);
      navigate('/accounts', { replace: true });
    } catch (err) {
      console.error('Failed to exchange token:', err);
      setError('Failed to complete bank connection.');
    }
  }, [navigate]);

  const onExit = useCallback((err: unknown, metadata?: unknown) => {
    // Always log in production for debugging
    console.log('=== Plaid OAuth Callback Exit ===');
    console.log('Error:', err);
    console.log('Error type:', typeof err);
    console.log('Error stringified:', JSON.stringify(err, null, 2));
    console.log('Metadata:', metadata);
    console.log('Metadata stringified:', JSON.stringify(metadata, null, 2));
    console.log('Current URL:', window.location.href);
    console.log('OAuth state ID:', oauthStateId);
    console.log('Link token exists:', !!linkToken);
    
    if (err) {
      console.error('Plaid Link error detected:', err);
      const plaidError = err as { 
        error_code?: string; 
        error_message?: string; 
        display_message?: string;
        error_type?: string;
        [key: string]: unknown;
      };
      
      // Log all error properties
      console.error('Error code:', plaidError.error_code);
      console.error('Error message:', plaidError.error_message);
      console.error('Display message:', plaidError.display_message);
      console.error('Error type:', plaidError.error_type);
      console.error('All error keys:', Object.keys(plaidError));
      
      setError(plaidError.display_message || plaidError.error_message || 'Bank connection failed. Please try connecting again.');
    } else {
      // User cancelled or exited without error
      console.log('No error - user cancelled or exited normally');
      navigate('/accounts', { replace: true });
    }
  }, [navigate, oauthStateId, linkToken]);

  const { open, ready } = usePlaidLink({
    token: linkToken || '',
    onSuccess,
    onExit,
    receivedRedirectUri: window.location.href,
  });

  // Auto-open Plaid Link when ready (for OAuth continuation)
  useEffect(() => {
    if (ready && linkToken) {
      open();
    }
  }, [ready, linkToken, open]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-lg mb-4">{error}</div>
        <button
          onClick={() => navigate('/accounts')}
          className="text-blue-500 hover:underline"
        >
          Return to Accounts
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <Spinner size="lg" />
      <p className="mt-4 text-gray-600">Completing bank connection...</p>
    </div>
  );
};
