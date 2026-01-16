import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory BEFORE anything else uses env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Log loaded env vars for debugging
console.log('Environment loaded:');
console.log('  PLAID_CLIENT_ID:', process.env.PLAID_CLIENT_ID ? 'Set' : 'NOT SET');
console.log('  PLAID_SECRET:', process.env.PLAID_SECRET ? 'Set' : 'NOT SET');
console.log('  PLAID_ENV:', process.env.PLAID_ENV || 'NOT SET');
console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'NOT SET');

// Now import routes (env vars are already loaded)
const { default: accountsRouter } = await import('./routes/accounts.js');
const { default: plaidRouter } = await import('./routes/plaid.js');
const { default: transactionsRouter } = await import('./routes/transactions.js');
const { default: categoriesRouter } = await import('./routes/categories.js');
const { default: budgetGoalsRouter } = await import('./routes/budget-goals.js');
const { default: tagsRouter } = await import('./routes/tags.js');
const { default: recurringRouter } = await import('./routes/recurring.js');
const { default: statsRouter } = await import('./routes/stats.js');
const { default: merchantMappingsRouter } = await import('./routes/merchant-mappings.js');
const { default: webhooksRouter } = await import('./routes/webhooks.js');

console.log('Routes loaded successfully');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/accounts', accountsRouter);
app.use('/api/plaid', plaidRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/budget-goals', budgetGoalsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/recurring-transactions', recurringRouter);
app.use('/api/stats', statsRouter);
app.use('/api/merchant-mappings', merchantMappingsRouter);
app.use('/api/webhooks', webhooksRouter);

console.log('Routes registered');

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
