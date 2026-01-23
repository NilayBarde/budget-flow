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
      setError(null); // Clear any previous errors
    } catch (error) {
      console.error('Failed to exchange token:', error);
      
      // Extract error message from API response
      const apiError = error as { message?: string; error?: string; error_code?: string };
      let errorMessage = apiError.message || apiError.error || 'Failed to complete bank connection. Please try again.';
      
      // Add error code if available (helpful for debugging)
      if (apiError.error_code) {
        errorMessage += ` (Error: ${apiError.error_code})`;
      }
      
      setError(errorMessage);
    }
  }, [exchangeToken]);

  const onExit = useCallback((err: unknown, metadata?: unknown) => {
    // Always log in production for debugging
    console.log('=== Plaid Link Exit ===');
    console.log('Error:', err);
    console.log('Error type:', typeof err);
    console.log('Error stringified:', JSON.stringify(err, null, 2));
    console.log('Metadata:', metadata);
    console.log('Metadata stringified:', JSON.stringify(metadata, null, 2));
    console.log('Current URL:', window.location.href);
    console.log('Link token exists:', !!linkToken);
    
    if (err) {
      console.error('Plaid Link error detected:', err);
      // Check if it's a Plaid error object
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
      
      // Build detailed error message
      const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';
      let errorMessage = '';
      
      // Handle specific error codes with helpful messages
      if (plaidError.error_code === 'INTERNAL_SERVER_ERROR') {
        // Check if this is American Express (from metadata or error context)
        const isAmex = metadata && typeof metadata === 'object' && 'institution' in metadata 
          ? (metadata as { institution?: { name?: string } }).institution?.name?.toLowerCase().includes('american express')
          : false;
        
        if (isAmex) {
          errorMessage = 'American Express connection error (Known Plaid Issue KI563877)\n\n';
          errorMessage += 'This is a known Plaid issue affecting less than 1% of Amex connections.\n\n';
          errorMessage += 'Possible causes:\n';
          errorMessage += '• Known Plaid integration issue with American Express\n';
          errorMessage += '• Amex requires frequent MFA (Multi-Factor Authentication)\n';
          errorMessage += '• Your security token may have expired\n\n';
          errorMessage += 'Please try:\n';
          errorMessage += '• Wait a few minutes and try connecting again\n';
          errorMessage += '• Reconnect your Amex account through the Plaid flow\n';
          errorMessage += '• Ensure your Amex credentials are correct\n';
          errorMessage += '• Complete any required MFA steps during connection\n';
          errorMessage += '• If it persists, try again later (this is a known Plaid issue)\n\n';
          errorMessage += 'Note: Amex accounts often require daily re-authentication due to strict security protocols.';
        } else {
          errorMessage = 'Connection temporarily unavailable. This is usually a temporary issue on Plaid\'s side.\n\n';
          errorMessage += 'Please try:\n';
          errorMessage += '• Wait a few minutes and try again\n';
          errorMessage += '• Check Plaid status page for service issues\n';
          errorMessage += '• Try connecting again later';
        }
      } else if (plaidError.error_code === 'ITEM_LOGIN_REQUIRED' || plaidError.error_code === 'INVALID_CREDENTIALS') {
        errorMessage = 'Account re-authentication required.\n\n';
        errorMessage += 'Please reconnect your account:\n';
        errorMessage += '• Your security token has expired\n';
        errorMessage += '• Complete the connection flow again\n';
        errorMessage += '• Note: American Express accounts often require daily re-authentication';
      } else if (plaidError.display_message) {
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
    } else {
      console.log('No error - user cancelled or exited normally');
    }
    // Don't clear the token on exit - user might want to retry
  }, [linkToken]);

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

