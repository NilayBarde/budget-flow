import { createHash, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from 'jose';
import { plaidClient } from '../services/plaid.js';

export type RawBodyRequest = Request & { rawBody?: Buffer };

type VerificationKey = { key: JWK; expiredAt: number | null };
type KeyFetcher = (keyId: string) => Promise<VerificationKey>;

const MAX_TOKEN_AGE = '5 minutes';

const fetchPlaidKey: KeyFetcher = async (keyId) => {
  const { data } = await plaidClient.webhookVerificationKeyGet({ key_id: keyId });
  return { key: data.key as unknown as JWK, expiredAt: data.key.expired_at ?? null };
};

// Verifies Plaid's `Plaid-Verification` JWT so only Plaid can trigger syncs.
// https://plaid.com/docs/api/webhooks/webhook-verification/
export const createPlaidWebhookVerifier = (getKey: KeyFetcher = fetchPlaidKey) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers['plaid-verification'];
      const rawBody = (req as RawBodyRequest).rawBody;
      if (typeof token !== 'string' || !rawBody) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const header = decodeProtectedHeader(token);
      if (header.alg !== 'ES256' || !header.kid) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { key, expiredAt } = await getKey(header.kid);
      if (expiredAt !== null) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { payload } = await jwtVerify(token, await importJWK(key, 'ES256'), {
        algorithms: ['ES256'],
        maxTokenAge: MAX_TOKEN_AGE,
      });

      const claimed = Buffer.from(String(payload.request_body_sha256 ?? ''), 'hex');
      const actual = createHash('sha256').update(rawBody).digest();
      if (claimed.length !== actual.length || !timingSafeEqual(claimed, actual)) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      next();
    } catch {
      res.status(401).json({ message: 'Unauthorized' });
    }
  };

export const verifyPlaidWebhook = createPlaidWebhookVerifier();
