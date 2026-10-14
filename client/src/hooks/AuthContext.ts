import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export interface AuthContextValue {
  session: Session | null;
  /** True until the stored session (or the one Google just returned) has been read */
  loading: boolean;
  /** Why the last session ended, such as an account that isn't invited, shown on the login page */
  notice: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: (notice?: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
