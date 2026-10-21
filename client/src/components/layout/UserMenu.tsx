import { useContext } from 'react';
import { LogOut, UserCircle } from 'lucide-react';
import { AuthContext } from '../../hooks/AuthContext';

/** Who is signed in, with a way to sign out. Renders nothing outside AuthProvider or when signed out. */
export const UserMenu = () => {
  const auth = useContext(AuthContext);
  const user = auth?.session?.user;
  if (!auth || !user) return null;

  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null;
  const name = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null;

  return (
    <div className="flex items-center gap-3 px-2">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full flex-shrink-0" />
      ) : (
        <UserCircle className="h-8 w-8 text-slate-500 flex-shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        {name && <p className="text-sm font-medium text-slate-200 truncate">{name}</p>}
        <p className="text-xs text-slate-500 truncate">{user.email}</p>
      </div>
      <button
        type="button"
        onClick={() => void auth.signOut()}
        className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-800 rounded-lg transition-colors"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
};
