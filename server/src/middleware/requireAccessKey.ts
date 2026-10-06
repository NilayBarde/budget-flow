import { createHash, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

// Compare digests so the check is constant-time regardless of key length.
export const keysMatch = (provided: string, expected: string): boolean =>
  timingSafeEqual(sha256(provided), sha256(expected));

const extractBearer = (header: string | undefined): string | null => {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

// Single-user app: one shared access key, supplied via API_ACCESS_KEY.
// Fails closed. If the key is not configured, every request is rejected
// instead of silently serving financial data to anyone who can reach the API.
export const requireAccessKey = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.API_ACCESS_KEY;
  if (!expected) {
    res.status(503).json({ message: 'Server access key is not configured' });
    return;
  }

  const provided = extractBearer(req.headers.authorization);
  if (!provided || !keysMatch(provided, expected)) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  next();
};
