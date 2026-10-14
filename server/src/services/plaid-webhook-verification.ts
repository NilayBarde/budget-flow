import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import { plaidClient } from './plaid.js';
import { redactError } from './plaid-errors.js';

// Plaid signs every webhook: the Plaid-Verification header is an ES256 JWT whose payload carries the
// SHA-256 of the exact request body and when it was signed. Without this check anyone could post a
// webhook naming any user's item and make the server flag it for reconnect or run a paid sync.
// https://plaid.com/docs/api/webhooks/webhook-verification/

const MAX_AGE_SECONDS = 5 * 60;

// A JSON Web Key as Plaid returns it (EC P-256: kty, crv, x, y), plus Plaid's own fields.
type VerificationKey = Record<string, unknown> & { kid?: string; expired_at?: number | null };

// Plaid rotates keys rarely, so a key is fetched once per kid and kept.
const keyCache = new Map<string, VerificationKey>();

const fetchVerificationKey = async (keyId: string): Promise<VerificationKey> => {
  const cached = keyCache.get(keyId);
  if (cached) return cached;
  const response = await plaidClient.webhookVerificationKeyGet({ key_id: keyId });
  const key = response.data.key as unknown as VerificationKey;
  keyCache.set(keyId, key);
  return key;
};

const decodePart = (part: string): Record<string, unknown> | null => {
  try {
    const value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
};

const sameHex = (a: string, b: string) => {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
};

interface VerifyOptions {
  getKey?: (keyId: string) => Promise<VerificationKey>;
  now?: number;
}

/** Whether a webhook request really comes from Plaid, unchanged and recent. Never throws. */
export const verifyPlaidWebhook = async (
  token: string | undefined,
  rawBody: Buffer | undefined,
  { getKey = fetchVerificationKey, now = Date.now() }: VerifyOptions = {},
): Promise<boolean> => {
  if (!token || !rawBody) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [encodedHeader, encodedClaims, encodedSignature] = parts;

  const header = decodePart(encodedHeader);
  const claims = decodePart(encodedClaims);
  // The algorithm is fixed, never taken from the token: no 'none', no HMAC with a public key
  if (!header || !claims || header.alg !== 'ES256' || typeof header.kid !== 'string') return false;

  try {
    const jwk = await getKey(header.kid);
    if (jwk.expired_at) return false;

    const { kid: _kid, expired_at: _expiredAt, ...keyMaterial } = jwk;
    const publicKey = createPublicKey({ key: keyMaterial, format: 'jwk' });
    const signedOk = verify(
      'sha256',
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(encodedSignature, 'base64url'),
    );
    if (!signedOk) return false;
  } catch (error) {
    console.warn('Could not verify a Plaid webhook signature:', redactError(error));
    return false;
  }

  if (typeof claims.iat !== 'number' || now / 1000 - claims.iat > MAX_AGE_SECONDS) return false;

  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  return typeof claims.request_body_sha256 === 'string' && sameHex(claims.request_body_sha256, bodyHash);
};
