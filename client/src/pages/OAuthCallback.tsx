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
  const [isInitializing, setIsInitializing] = useState(true);

  // Get the OAuth state from URL params - Plaid includes this to verify the redirect
  const oauthStateId = searchParams.get('oauth_state_id');

  useEffect(() => {
    // Validate that this is a legitimate OAuth callback
    if (!oauthStateId) {
      setError('Invalid OAuth callback. Missing state.');
      setIsInitializing(false);
      return;
    }

    // Retrieve link token from localStorage (stored when PlaidLinkButton created it)
    // Use a small delay to ensure localStorage is accessible (Vercel SPA routing timing)
    const retrieveToken = () => {
      try {
        const storedToken = localStorage.getItem(LINK_TOKEN_STORAGE_KEY);
        
        if (!storedToken) {
          console.error('No link token found in localStorage');
          setError('Failed to continue bank connection. Please try connecting again from the Accounts page.');
          setIsInitializing(false);
          return;
        }

        console.log('Link token retrieved from localStorage');
        setLinkToken(storedToken);
        setIsInitializing(false);
      } catch (err) {
        console.error('Error accessing localStorage:', err);
        setError('Failed to access stored connection data. Please try connecting again.');
        setIsInitializing(false);
      }
    };

    // Small delay to ensure DOM and storage are ready (helps with Vercel SPA routing)
    const timeoutId = setTimeout(retrieveToken, 100);
    
    return () => clearTimeout(timeoutId);
  }, [oauthStateId]);

  // Build the redirect URI exactly as it was configured in the link token
  // This must match exactly what was sent to Plaid during link token creation
  // CRITICAL: For Vercel SPA routing, we need to ensure the URL matches exactly
  const getRedirectUri = useCallback(() => {
    // Get the current URL - this should match the redirect_uri sent to Plaid
    // For Vercel, this should be: https://budget-flow-tawny.vercel.app/oauth-callback?oauth_state_id=...
    const currentUrl = window.location.href;
    
    // Log for debugging
    console.log('=== OAuth Redirect URI Debug ===');
    console.log('Current URL:', currentUrl);
    console.log('Origin:', window.location.origin);
    console.log('Pathname:', window.location.pathname);
    console.log('Search:', window.location.search);
    console.log('OAuth State ID:', oauthStateId);
    
    // Ensure we're using the full URL with query params
    // Vercel SPA routing should preserve query params, but we verify
    if (!currentUrl.includes('oauth_state_id')) {
      console.warn('WARNING: oauth_state_id not found in URL!');
    }
    
    return currentUrl;
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
    // Always log in production for debugging - critical for Amex OAuth issues
    console.log('=== Plaid OAuth Callback Exit ===');
    console.log('Error:', err);
    console.log('Error type:', typeof err);
    console.log('Error stringified:', JSON.stringify(err, null, 2));
    console.log('Metadata:', metadata);
    console.log('Metadata stringified:', JSON.stringify(metadata, null, 2));
    console.log('Current URL:', window.location.href);
    console.log('OAuth state ID:', oauthStateId);
    console.log('Link token exists:', !!linkToken);
    console.log('Redirect URI used:', getRedirectUri());
    
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
      
      // Check if this is the Amex OAuth redirect/resume failure
      const isAmexError = metadata && typeof metadata === 'object' && 'institution' in metadata
        ? (metadata as { institution?: { name?: string } }).institution?.name?.toLowerCase().includes('american express')
        : false;
      
      if (isAmexError && (plaidError.error_code === 'INTERNAL_SERVER_ERROR' || !plaidError.error_code)) {
        setError('American Express OAuth redirect failed (Known Issue KI563877). This is a known Plaid issue affecting Amex connections. Please try reconnecting in a few minutes.');
      } else {
        setError(plaidError.display_message || plaidError.error_message || 'Bank connection failed. Please try connecting again.');
      }
    } else {
      // User cancelled or exited without error
      console.log('No error - user cancelled or exited normally');
      navigate('/accounts', { replace: true });
    }
  }, [navigate, oauthStateId, linkToken, getRedirectUri]);

  const { open, ready } = usePlaidLink({
    token: linkToken || '',
    onSuccess,
    onExit,
    receivedRedirectUri: linkToken ? getRedirectUri() : undefined,
  });

  // Auto-open Plaid Link when ready (for OAuth continuation)
  // Only open if we have both the token and Link is ready
  useEffect(() => {
    if (ready && linkToken && !isInitializing) {
      console.log('Opening Plaid Link for OAuth continuation...');
      console.log('Redirect URI:', getRedirectUri());
      open();
    }
  }, [ready, linkToken, isInitializing, open, getRedirectUri]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-midnight-900">
        <div className="max-w-md text-center">
          <div className="text-red-400 text-lg mb-4 font-semibold">{error}</div>
          <div className="text-sm text-slate-400 mb-6">
            <p className="mb-2">If you're connecting American Express:</p>
            <ul className="list-disc list-inside text-left space-y-1">
              <li>This is a known issue with Amex OAuth (KI563877)</li>
              <li>Try waiting a few minutes and reconnect</li>
              <li>Ensure you complete all MFA steps</li>
              <li>The redirect flow may need to be retried</li>
            </ul>
          </div>
          <button
            onClick={() => navigate('/accounts')}
            className="px-4 py-2 bg-accent-500 hover:bg-accent-400 text-white rounded-lg transition-colors"
          >
            Return to Accounts
          </button>
        </div>
      </div>
    );
  }

  if (isInitializing || !linkToken) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-midnight-900">
        <Spinner size="lg" />
        <p className="mt-4 text-slate-300">Completing bank connection...</p>
        <p className="mt-2 text-sm text-slate-500">Please wait while we resume your session</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-midnight-900">
      <Spinner size="lg" />
      <p className="mt-4 text-slate-300">Completing bank connection...</p>
      <p className="mt-2 text-sm text-slate-500">Resuming Plaid Link session...</p>
    </div>
  );
};
