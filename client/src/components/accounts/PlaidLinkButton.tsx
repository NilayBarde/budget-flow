import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Plus } from 'lucide-react';
import { Button } from '../ui';
import { useCreatePlaidLinkToken, useExchangePlaidToken } from '../../hooks';
import { LINK_TOKEN_STORAGE_KEY } from '../../utils/constants';

// Only use OAuth redirect URI on HTTPS (Plaid production requires HTTPS)
const getOAuthRedirectUri = () => {
  if (typeof window === 'undefined') return;
  // Only send redirect_uri for HTTPS - Plaid production rejects HTTP
  if (window.location.protocol === 'https:') {
    return import.meta.env.VITE_OAUTH_REDIRECT_URI || `${window.location.origin}/oauth-callback`;
  }
  // For localhost/HTTP, don't send redirect_uri (OAuth banks won't work locally anyway)
  return;
};

export const PlaidLinkButton = () => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  
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
      } catch (error) {
        console.error('Failed to create link token:', error);
      }
    };
    fetchToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSuccess = useCallback(async (publicToken: string, metadata: unknown) => {
    try {
      await exchangeToken.mutateAsync({ publicToken, metadata });
    } catch (error) {
      console.error('Failed to exchange token:', error);
    }
  }, [exchangeToken]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  return (
    <Button
      onClick={() => open()}
      disabled={!ready || createLinkToken.isPending}
      isLoading={createLinkToken.isPending || exchangeToken.isPending}
    >
      <Plus className="h-4 w-4 mr-2" />
      Connect Account
    </Button>
  );
};

