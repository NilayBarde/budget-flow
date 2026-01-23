import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import type { PlaidLinkOptions } from 'react-plaid-link';
import { Plus } from 'lucide-react';
import { Button } from '../ui';
import { logPlaidLinkEvent } from '../../services/api';
import { useCreatePlaidLinkToken, useExchangePlaidToken } from '../../hooks';

const AMEX_INSTITUTION_NAME = 'american express';
const AMEX_TOKEN_STORAGE_KEY = 'plaid_link_token_amex';
const AMEX_TOKEN_TTL_MS = 30 * 60 * 1000;

// Type for Plaid metadata
type PlaidMetadata = {
  institution?: { name?: string; institution_id?: string };
  link_session_id?: string;
  request_id?: string;
  [key: string]: unknown;
};

// Type for Plaid error
type PlaidError = {
  error_code?: string;
  error_message?: string;
  display_message?: string;
  error_type?: string;
  [key: string]: unknown;
};

type StoredLinkToken = {
  token: string;
  expiration?: string;
  storedAt: string;
  institution?: string;
};

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

// Error message builders
const getAmexErrorMessage = () =>
  `American Express connection error (Known Plaid Issue KI563877)

This is a known Plaid issue. Please try:
• Wait a few minutes and try connecting again
• Ensure you complete all MFA steps
• Plaid will usually resume automatically on retry`;

const getInternalServerErrorMessage = () =>
  `Connection temporarily unavailable. This is usually a temporary issue on Plaid's side.

Please try:
• Wait a few minutes and try again
• Check Plaid status page for service issues
• Try connecting again later`;

const getReauthErrorMessage = () =>
  `Account re-authentication required.

Please reconnect your account:
• Your security token has expired
• Complete the connection flow again
• Note: American Express accounts often require daily re-authentication`;

const isAmexInstitution = (institutionName?: string) =>
  institutionName?.toLowerCase().includes(AMEX_INSTITUTION_NAME) ?? false;

const getStoredAmexLinkToken = () => {
  try {
    const storedValue = localStorage.getItem(AMEX_TOKEN_STORAGE_KEY);
    if (!storedValue) return;

    const parsed = JSON.parse(storedValue) as StoredLinkToken;
    const { token, expiration, storedAt } = parsed;

    if (!token || !storedAt) return;

    if (expiration) {
      const expirationDate = new Date(expiration);
      if (Number.isNaN(expirationDate.getTime()) || expirationDate <= new Date()) {
        localStorage.removeItem(AMEX_TOKEN_STORAGE_KEY);
        return;
      }
    } else {
      const storedAtDate = new Date(storedAt);
      if (Number.isNaN(storedAtDate.getTime()) || Date.now() - storedAtDate.getTime() > AMEX_TOKEN_TTL_MS) {
        localStorage.removeItem(AMEX_TOKEN_STORAGE_KEY);
        return;
      }
    }

    return parsed;
  } catch {
    localStorage.removeItem(AMEX_TOKEN_STORAGE_KEY);
    return;
  }
};

const persistAmexLinkToken = (token: string, expiration?: string, institution?: string) => {
  const payload: StoredLinkToken = {
    token,
    expiration,
    storedAt: new Date().toISOString(),
    institution,
  };

  localStorage.setItem(AMEX_TOKEN_STORAGE_KEY, JSON.stringify(payload));
};

const clearAmexLinkToken = () => {
  localStorage.removeItem(AMEX_TOKEN_STORAGE_KEY);
};

// Inner component that only renders when we have a token
const PlaidLinkOpener = ({ 
  linkToken, 
  onSuccess,
  onExit,
  onEvent,
  isLoading 
}: { 
  linkToken: string; 
  onSuccess: PlaidLinkOptions['onSuccess'];
  onExit?: PlaidLinkOptions['onExit'];
  onEvent?: PlaidLinkOptions['onEvent'];
  isLoading: boolean;
}) => {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
    onEvent,
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
  const [linkSessionId, setLinkSessionId] = useState<string | null>(null);
  const [tokenExpiration, setTokenExpiration] = useState<string | undefined>(undefined);
  
  const createLinkToken = useCreatePlaidLinkToken();
  const exchangeToken = useExchangePlaidToken();
  
  // Memoize redirect URI to avoid recomputation
  const oAuthRedirectUri = useMemo(() => getOAuthRedirectUri(), []);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = getStoredAmexLinkToken();
        if (storedToken?.token) {
          setLinkToken(storedToken.token);
          setTokenExpiration(storedToken.expiration);
          setError(null);
          return;
        }

        // Pass redirect_uri for OAuth support (only on HTTPS)
        // Plaid can resume OAuth flow automatically without localStorage persistence
        const result = await createLinkToken.mutateAsync(oAuthRedirectUri);
        const token = result.link_token;
        
        // Keep token in React state only - no localStorage persistence
        // This maintains OAuth session continuity better, especially for OAuth banks like Amex
        setLinkToken(token);
        setTokenExpiration(result.expiration);
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
      clearAmexLinkToken();
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

  const onEvent = useCallback((eventName: string, metadata: unknown) => {
    console.log('Plaid Link event:', eventName, metadata);
    const md = metadata as unknown as PlaidMetadata | undefined;
    const nextLinkSessionId = md?.link_session_id || null;
    const institutionName = md?.institution?.name;
    const isAmex = isAmexInstitution(institutionName);

    if (eventName === 'ERROR') {
      if (nextLinkSessionId) {
        setLinkSessionId(nextLinkSessionId);
      }
      void logPlaidLinkEvent({
        event_name: eventName,
        metadata,
        link_session_id: nextLinkSessionId,
        url: window.location.href,
        user_agent: navigator.userAgent,
      }).catch(() => {});
    }
    if (eventName === 'SELECT_INSTITUTION' && isAmex && linkToken) {
      persistAmexLinkToken(linkToken, tokenExpiration, institutionName);
    }
  }, [linkToken, tokenExpiration]);

  const onExit = useCallback((err: unknown, metadata?: unknown) => {
    // Always log in production for debugging
    console.log('=== Plaid Link Exit ===');
    console.log('Error:', JSON.stringify(err, null, 2));
    console.log('Metadata:', JSON.stringify(metadata, null, 2));
    console.log('Current URL:', window.location.href);
    
    if (!err) {
      console.log('No error - user cancelled or exited normally');
      return;
    }
    
    const plaidError = err as PlaidError;
    const md = metadata as PlaidMetadata | undefined;
    const institutionName = md?.institution?.name;
    const isAmex = isAmexInstitution(institutionName);
    const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';
    const errorCode = plaidError.error_code;
    
    console.error('Plaid Link error:', errorCode, plaidError.error_message);
    
    // Build error message based on error code
    let errorMessage: string;
    
    if (errorCode === 'INTERNAL_SERVER_ERROR') {
      errorMessage = isAmex ? getAmexErrorMessage() : getInternalServerErrorMessage();
    } else if (errorCode === 'ITEM_LOGIN_REQUIRED' || errorCode === 'INVALID_CREDENTIALS') {
      errorMessage = getReauthErrorMessage();
    } else {
      errorMessage = plaidError.display_message || plaidError.error_message || 'Bank connection was cancelled or failed. Please try again.';
    }
    
    // Add debug info in development
    if (isDevelopment && (errorCode || plaidError.error_type)) {
      errorMessage += `\n\n[Debug] Error Code: ${errorCode || 'N/A'}, Type: ${plaidError.error_type || 'N/A'}`;
      if (window.location.protocol === 'http:') {
        errorMessage += '\n[Debug] OAuth banks require HTTPS. Use ngrok or test on production.';
      }
    }
    
    const nextLinkSessionId = md?.link_session_id || null;
    if (nextLinkSessionId) {
      setLinkSessionId(nextLinkSessionId);
    }

    setError(errorMessage);

    void logPlaidLinkEvent({
      event_name: 'EXIT',
      error: plaidError,
      metadata,
      link_session_id: nextLinkSessionId,
      url: window.location.href,
      user_agent: navigator.userAgent,
    }).catch(() => {});
  }, []);

  // Show development mode warning for HTTP
  const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';
  const isHttp = window.location.protocol === 'http:';
  const showOAuthWarning = isDevelopment && isHttp;
  
  // Determine if we're in a loading state (token fetching or exchange pending)
  const isLoading = createLinkToken.isPending || exchangeToken.isPending;

  return (
    <div className="flex flex-col gap-2">
      {/* Button: either loading state or PlaidLinkOpener */}
      {linkToken ? (
        <PlaidLinkOpener 
          linkToken={linkToken} 
          onSuccess={onSuccess}
          onExit={onExit}
          onEvent={onEvent}
          isLoading={exchangeToken.isPending}
        />
      ) : (
        <Button disabled isLoading={createLinkToken.isPending}>
          <Plus className="h-4 w-4 mr-2" />
          Connect Account
        </Button>
      )}
      
      {/* OAuth warning for HTTP development */}
      {showOAuthWarning && (
        <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
          ⚠️ OAuth banks (Amex, etc.) won't work on HTTP. Use sandbox banks like "First Platypus Bank" for testing, or set up HTTPS (ngrok).
        </p>
      )}
      
      {/* Only show errors when not in a loading state */}
      {error && !isLoading && (
        <div className="text-sm text-red-500 whitespace-pre-line">
          {error}
          {linkSessionId && (
            <div className="mt-2 text-xs text-slate-400">
              Plaid Link session: {linkSessionId}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

