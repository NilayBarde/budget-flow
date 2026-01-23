import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import type { PlaidLinkOptions } from 'react-plaid-link';
import { Plus } from 'lucide-react';
import { Button } from '../ui';
import { useCreatePlaidLinkToken, useExchangePlaidToken } from '../../hooks';
import { LINK_TOKEN_STORAGE_KEY } from '../../utils/constants';

// Only use OAuth redirect URI on HTTPS (Plaid production requires HTTPS)
const getOAuthRedirectUri = () => {
  if (typeof window === 'undefined') return;
  
  // Allow override via environment variable for local testing (e.g., with ngrok)
  if (import.meta.env.VITE_OAUTH_REDIRECT_URI) {
    return import.meta.env.VITE_OAUTH_REDIRECT_URI;
  }
  
  // Only send redirect_uri for HTTPS - Plaid production rejects HTTP
  if (window.location.protocol === 'https:') {
    return `${window.location.origin}/oauth-callback`;
  }
  
  // For localhost/HTTP, don't send redirect_uri (OAuth banks won't work locally anyway)
  // Note: To test OAuth locally, set VITE_OAUTH_REDIRECT_URI to an HTTPS URL (e.g., ngrok tunnel)
  return;
};

// Inner component that only renders when we have a token
const PlaidLinkOpener = ({ 
  linkToken, 
  onSuccess,
  onExit,
  isLoading 
}: { 
  linkToken: string; 
  onSuccess: PlaidLinkOptions['onSuccess'];
  onExit?: PlaidLinkOptions['onExit'];
  isLoading: boolean;
}) => {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  return (
    <Button
      onClick={() => open()}
      disabled={!ready}
      isLoading={isLoading}
    >
      <Plus className="h-4 w-4 mr-2" />
      Connect Account
    </Button>
  );
};

export const PlaidLinkButton = () => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const createLinkToken = useCreatePlaidLinkToken();
  const exchangeToken = useExchangePlaidToken();

  useEffect(() => {
    const fetchToken = async () => {
      try {
        // Pass redirect_uri for OAuth support (only on HTTPS)
        const result = await createLinkToken.mutateAsync(getOAuthRedirectUri());
        const token = result.link_token;
        
        // Store in localStorage for OAuth flow continuation
        localStorage.setItem(LINK_TOKEN_STORAGE_KEY, token);
        setLinkToken(token);
        setError(null);
      } catch (error) {
        console.error('Failed to create link token:', error);
        setError('Failed to initialize bank connection. Please try again.');
      }
    };
    fetchToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSuccess = useCallback(async (publicToken: string, metadata: unknown) => {
    try {
      await exchangeToken.mutateAsync({ publicToken, metadata });
      // Clear stored token after successful connection
      localStorage.removeItem(LINK_TOKEN_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to exchange token:', error);
      setError('Failed to complete bank connection. Please try again.');
    }
  }, [exchangeToken]);

  const onExit = useCallback((err: unknown, metadata?: unknown) => {
    console.log('Plaid Link exited', { err, metadata });
    console.log('Full error details:', JSON.stringify({ err, metadata }, null, 2));
    
    if (err) {
      console.error('Plaid Link error:', err);
      // Check if it's a Plaid error object
      const plaidError = err as { 
        error_code?: string; 
        error_message?: string; 
        display_message?: string;
        error_type?: string;
      };
      
      // Build detailed error message for development
      const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';
      let errorMessage = '';
      
      if (plaidError.display_message) {
        errorMessage = plaidError.display_message;
      } else if (plaidError.error_message) {
        errorMessage = plaidError.error_message;
      } else {
        errorMessage = 'Bank connection was cancelled or failed. Please try again.';
      }
      
      // Add debug info in development
      if (isDevelopment && (plaidError.error_code || plaidError.error_type)) {
        errorMessage += `\n\n[Debug] Error Code: ${plaidError.error_code || 'N/A'}, Type: ${plaidError.error_type || 'N/A'}`;
        if (window.location.protocol === 'http:') {
          errorMessage += '\n[Debug] OAuth banks require HTTPS. Use ngrok or test on production.';
        }
      }
      
      setError(errorMessage);
    }
    // Don't clear the token on exit - user might want to retry
  }, []);

  // Show development mode warning
  const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';
  const isHttp = window.location.protocol === 'http:';
  const showOAuthWarning = isDevelopment && isHttp;

  // Show loading button while fetching token
  if (!linkToken) {
    return (
      <div className="flex flex-col gap-2">
        <Button disabled isLoading={createLinkToken.isPending}>
          <Plus className="h-4 w-4 mr-2" />
          Connect Account
        </Button>
        {showOAuthWarning && (
          <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
            ⚠️ OAuth banks (Amex, etc.) won't work on HTTP. Use sandbox banks like "First Platypus Bank" for testing, or set up HTTPS (ngrok).
          </p>
        )}
        {error && (
          <p className="mt-2 text-sm text-red-500 whitespace-pre-line">{error}</p>
        )}
      </div>
    );
  }

  // Only render PlaidLink when we have a token
  return (
    <div className="flex flex-col gap-2">
      <PlaidLinkOpener 
        linkToken={linkToken} 
        onSuccess={onSuccess}
        onExit={onExit}
        isLoading={exchangeToken.isPending}
      />
      {showOAuthWarning && (
        <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
          ⚠️ OAuth banks (Amex, etc.) won't work on HTTP. Use sandbox banks like "First Platypus Bank" for testing, or set up HTTPS (ngrok).
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-500 whitespace-pre-line">{error}</p>
      )}
    </div>
  );
};

