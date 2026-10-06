import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

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
console.log('  SUPABASE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : process.env.SUPABASE_ANON_KEY ? 'anon' : 'NOT SET');
console.log('  API_ACCESS_KEY:', process.env.API_ACCESS_KEY ? 'Set' : 'NOT SET (all /api requests except health and Plaid webhooks will be rejected)');

// Now import routes (env vars are already loaded)
const { requireAccessKey } = await import('./middleware/requireAccessKey.js');
const { verifyPlaidWebhook } = await import('./middleware/verifyPlaidWebhook.js');
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
const { default: csvImportRouter } = await import('./routes/csv-import.js');
const { default: investmentsRouter } = await import('./routes/investments.js');
const { default: appSettingsRouter } = await import('./routes/app-settings.js');
const { default: exportRouter } = await import('./routes/export.js');

console.log('Routes loaded successfully');

const app = express();
const PORT = process.env.PORT || 3001;

// Behind a reverse proxy (Render, etc.) set TRUST_PROXY=1 so rate limiting sees
// the real client IP. Leave unset when the server is exposed directly.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY));
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.plaid.com'],
      frameSrc: ["'self'", 'https://cdn.plaid.com'],
      connectSrc: ["'self'", 'https://*.plaid.com'],
      imgSrc: ["'self'", 'data:', 'https://*.plaid.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
    },
  },
}));
app.use(compression());

// Only the configured client origins may call the API from a browser.
// CORS_ORIGINS is a comma separated list; the default is the Vite dev server.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));

// Keep the raw bytes of webhook bodies: Plaid signs a SHA-256 of the exact payload.
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as import('./middleware/verifyPlaidWebhook.js').RawBodyRequest).rawBody = buf;
  },
}));

// Health check (unauthenticated, reveals nothing)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Plaid webhooks authenticate with Plaid's signed JWT instead of the access key.
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120 });
app.use('/api/webhooks', webhookLimiter, verifyPlaidWebhook, webhooksRouter);

// Everything else requires the access key. Failed attempts are rate limited
// per IP to make guessing the key impractical.
const failedRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  skipSuccessfulRequests: true,
});
app.use('/api', failedRequestLimiter, requireAccessKey);

app.get('/api/auth/check', (req, res) => {
  res.json({ ok: true });
});

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
app.use('/api/csv-import', csvImportRouter);
app.use('/api/investments', investmentsRouter);
app.use('/api/settings', appSettingsRouter);
app.use('/api/export', exportRouter);

console.log('Routes registered');

// Serve static files from client/dist only if they exist (for monolith deployments)
// If client is deployed separately (e.g., Vercel), this will be skipped
const clientDistPath = path.resolve(__dirname, '../../client/dist');

try {
  const distExists = existsSync(clientDistPath);
  if (distExists) {
    app.use(express.static(clientDistPath));
    console.log(`Serving client from: ${clientDistPath}`);
    
    // SPA fallback - serve index.html for all non-API routes
    app.use((req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  } else {
    console.log('Client dist not found - API-only mode (client deployed separately)');
    // API-only mode - return 404 for non-API routes
    app.use((req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.status(404).json({ 
        message: 'Not found. This is an API server. Frontend is deployed separately.' 
      });
    });
  }
} catch (error) {
  console.log('Could not check client dist - API-only mode');
  // API-only mode
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.status(404).json({ 
      message: 'Not found. This is an API server. Frontend is deployed separately.' 
    });
  });
}

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
