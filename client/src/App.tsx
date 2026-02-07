import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout';
import { Spinner } from './components/ui';

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Transactions = lazy(() => import('./pages/Transactions').then(m => ({ default: m.Transactions })));
const Budget = lazy(() => import('./pages/Budget').then(m => ({ default: m.Budget })));
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
              <Route path="budget" element={<Budget />} />
              <Route path="investments" element={<Investments />} />
              <Route path="year" element={<YearOverview />} />
              <Route path="insights" element={<Insights />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="tags" element={<Tags />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="/oauth-callback" element={<OAuthCallback />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
