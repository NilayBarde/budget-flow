import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout';
import { TabbedSection } from './components/layout/TabbedSection';
import { legacyRedirectRoutes } from './routes/legacyRedirects';
import { NET_WORTH_TABS, INSIGHTS_TABS, SETTINGS_TABS } from './utils/navigation';
import { Spinner } from './components/ui';

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<Spinner className="py-12" />}>
          <Routes>
            <Route path="/" element={<Layout />}>
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
            <Route path="/oauth-callback" element={<OAuthCallback />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
