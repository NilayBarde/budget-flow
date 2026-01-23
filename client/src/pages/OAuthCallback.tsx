import { useEffect } from 'react';
import { Spinner } from '../components/ui';

/**
 * OAuth Callback Page
 * 
 * CRITICAL: This page should NOT recreate Plaid Link or retrieve tokens from storage.
 * Plaid automatically resumes the OAuth session in the same browser tab/session.
 * The original usePlaidLink hook in PlaidLinkButton will receive the onSuccess callback
 * after OAuth completes.
 * 
 * Recreating Plaid Link here breaks OAuth session continuity, especially for OAuth banks
 * like American Express.
 */
export const OAuthCallback = () => {
  useEffect(() => {
    // Optional: Log for analytics/debugging
    console.log('OAuth callback page loaded:', window.location.href);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-midnight-900">
      <Spinner size="lg" />
      <p className="mt-4 text-slate-300">Completing secure bank connection...</p>
    </div>
  );
};
