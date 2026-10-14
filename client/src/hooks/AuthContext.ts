import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export interface AuthContextValue {
  session: Session | null;
  /** True until the stored session (or the one Google just returned) has been read */
  loading: boolean;
  /** Why the last session ended, such as an account that isn't invited, shown on the login page */
  notice: string | null;
  /** Starts the redirect to Google, returning to `returnTo` (a path on this site) after. Resolves
   * to whether the redirect started; when it didn't, `notice` says why. */
  signInWithGoogle: (returnTo?: string) => Promise<boolean>;
  signOut: (notice?: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
