import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout';
import { TabbedSection } from './components/layout/TabbedSection';
import { legacyRedirectRoutes } from './routes/legacyRedirects';
import { NET_WORTH_TABS, INSIGHTS_TABS, SETTINGS_TABS } from './utils/navigation';
import { Spinner } from './components/ui';
import { MonthProvider } from './hooks';
import { AuthProvider } from './hooks/AuthProvider';
import { RequireAuth } from './components/auth/RequireAuth';

// Eagerly prefetch the Dashboard chunk since it's the landing page — avoids a
// network waterfall (main bundle → React render → lazy import → Dashboard fetch).
const dashboardImport = import('./pages/Dashboard');
const Dashboard = lazy(() => dashboardImport.then(m => ({ default: m.Dashboard })));
const Transactions = lazy(() => import('./pages/Transactions').then(m => ({ default: m.Transactions })));
const FinancialPlan = lazy(() => import('./pages/FinancialPlan').then(m => ({ default: m.FinancialPlan })));
const NetWorthPage = lazy(() => import('./pages/NetWorthPage').then(m => ({ default: m.NetWorthPage })));
const YearOverview = lazy(() => import('./pages/YearOverview').then(m => ({ default: m.YearOverview })));
const Insights = lazy(() => import('./pages/Insights').then(m => ({ default: m.Insights })));
const Accounts = lazy(() => import('./pages/Accounts').then(m => ({ default: m.Accounts })));
const Tags = lazy(() => import('./pages/Tags').then(m => ({ default: m.Tags })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const OAuthCallback = lazy(() => import('./pages/OAuthCallback').then(m => ({ default: m.OAuthCallback })));
const Investments = lazy(() => import('./pages/Investments').then(m => ({ default: m.Investments })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// The routes without the providers or the router, so a test can mount them in a MemoryRouter.
export const AppRoutes = () => (
  <Suspense fallback={<Spinner className="py-12" />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="plan" element={<FinancialPlan />} />
        {/* Pages that used to be separate sidebar items are tabs inside their section. */}
        <Route path="net-worth" element={<TabbedSection label="Net worth sections" tabs={NET_WORTH_TABS} />}>
          <Route index element={<NetWorthPage />} />
          <Route path="investments" element={<Investments />} />
        </Route>
        <Route path="insights" element={<TabbedSection label="Insights sections" tabs={INSIGHTS_TABS} />}>
          <Route index element={<Insights />} />
          <Route path="year" element={<YearOverview />} />
        </Route>
        <Route path="accounts" element={<Accounts />} />
        <Route path="settings" element={<TabbedSection label="Settings sections" tabs={SETTINGS_TABS} />}>
          <Route index element={<Settings />} />
          <Route path="tags" element={<Tags />} />
        </Route>
        {/* The old addresses keep working and land on the page's new home. */}
        {legacyRedirectRoutes}
      </Route>
      {/* Finishing a bank link calls the API, so it needs the session too */}
      <Route path="/oauth-callback" element={<RequireAuth><OAuthCallback /></RequireAuth>} />
    </Routes>
  </Suspense>
);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MonthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </MonthProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
