import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Plus } from 'lucide-react';
import { Button } from '../ui';
import { useCreatePlaidLinkToken, useExchangePlaidToken } from '../../hooks';

export const PlaidLinkButton = () => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  
  const createLinkToken = useCreatePlaidLinkToken();
  const exchangeToken = useExchangePlaidToken();

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const result = await createLinkToken.mutateAsync();
        setLinkToken(result.link_token);
      } catch (error) {
        console.error('Failed to create link token:', error);
      }
    };
    fetchToken();
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

