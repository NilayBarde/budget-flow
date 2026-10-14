import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './AuthContext';

export const useAuth = (): AuthContextValue => {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside AuthProvider');
  return auth;
};
