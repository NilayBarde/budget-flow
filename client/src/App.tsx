import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout';
import { 
  Dashboard, 
  Transactions, 
  Budget, 
  YearOverview, 
  Subscriptions, 
  Accounts, 
  Tags, 
  Settings,
  OAuthCallback,
  Investments
} from './pages';

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
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="budget" element={<Budget />} />
            <Route path="investments" element={<Investments />} />
            <Route path="year" element={<YearOverview />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="tags" element={<Tags />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/oauth-callback" element={<OAuthCallback />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
