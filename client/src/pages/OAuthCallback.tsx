import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePlaidLink } from 'react-plaid-link';
import { getStoredLinkToken, exchangePlaidToken } from '../services/api';
import { Spinner } from '../components/ui';

export const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get the OAuth state from URL params
  const oauthStateId = searchParams.get('oauth_state_id');

  useEffect(() => {
    const fetchLinkToken = async () => {
      try {
        const result = await getStoredLinkToken();
        setLinkToken(result.link_token);
      } catch (err) {
        console.error('Failed to get stored link token:', err);
        setError('Failed to continue bank connection. Please try again.');
      }
    };

    if (oauthStateId) {
      fetchLinkToken();
    } else {
      setError('Invalid OAuth callback. Missing state.');
    }
  }, [oauthStateId]);

  const onSuccess = useCallback(async (publicToken: string, metadata: unknown) => {
    try {
      await exchangePlaidToken(publicToken, metadata);
      navigate('/accounts', { replace: true });
    } catch (err) {
      console.error('Failed to exchange token:', err);
      setError('Failed to complete bank connection.');
    }
  }, [navigate]);

  const onExit = useCallback(() => {
    navigate('/accounts', { replace: true });
  }, [navigate]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
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
