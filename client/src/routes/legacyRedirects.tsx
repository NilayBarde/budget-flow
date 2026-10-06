import { Navigate, Route, useLocation } from 'react-router-dom';
import { LEGACY_REDIRECTS } from '../utils/navigation';

// Sends an old address to the page's new home, keeping any query string.
const RedirectTo = ({ to }: { to: string }) => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
};

// Route elements for the old addresses. `replace` keeps the old address out of the history, so the
// back button does not bounce through it.
export const legacyRedirectRoutes = LEGACY_REDIRECTS.map(({ from, to }) => (
  <Route key={from} path={from} element={<RedirectTo to={to} />} />
));
