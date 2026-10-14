import { describe, it, expect, vi } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';

vi.mock('../plaid.js', () => ({ plaidClient: {} }));

const { verifyPlaidWebhook, createKeyCache } = await import('../plaid-webhook-verification.js');

// A key pair standing in for Plaid's, and a signer that builds a Plaid-Verification JWT.
const plaidKeys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const otherKeys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const publicJwk = (keys = plaidKeys) =>
  ({ ...(keys.publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid: 'key-1', alg: 'ES256', use: 'sig', expired_at: null as number | null });

const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');
const sha256 = (body: string) => createHash('sha256').update(body).digest('hex');

const NOW = Date.parse('2026-10-13T12:00:00Z');
const body = JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'item-1' }, null, 2);

const token = ({
  header = { alg: 'ES256', kid: 'key-1', typ: 'JWT' } as Record<string, unknown>,
  claims = { iat: Math.floor(NOW / 1000) - 10, request_body_sha256: sha256(body) } as Record<string, unknown>,
  signer = plaidKeys.privateKey,
} = {}) => {
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = sign('sha256', Buffer.from(signingInput), { key: signer, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64url(signature)}`;
};

// rawBody null: the request had no body to check
const verify = (jwt: string | undefined, rawBody: string | null = body, getKey = vi.fn(async () => publicJwk())) =>
  verifyPlaidWebhook(jwt, rawBody === null ? undefined : Buffer.from(rawBody), { getKey, now: NOW });

describe('verifyPlaidWebhook', () => {
  it('accepts a webhook Plaid signed, for exactly this body', async () => {
    const getKey = vi.fn(async () => publicJwk());
    expect(await verify(token(), body, getKey)).toBe(true);
    expect(getKey).toHaveBeenCalledWith('key-1');
  });

  it('rejects a request with no Plaid-Verification header', async () => {
    expect(await verify(undefined)).toBe(false);
  });

  it('rejects a request with no body to check against', async () => {
    expect(await verify(token(), null)).toBe(false);
  });

  it('rejects a token that is not three parts', async () => {
    expect(await verify('not-a-jwt')).toBe(false);
  });

  it.each(['HS256', 'none', 'RS256'])('rejects alg %s: Plaid signs with ES256 only', async alg => {
    expect(await verify(token({ header: { alg, kid: 'key-1' } }))).toBe(false);
  });

  it('rejects a token signed by any other key', async () => {
    expect(await verify(token({ signer: otherKeys.privateKey }))).toBe(false);
  });

  it('rejects a body that differs from the one that was signed', async () => {
    const tampered = body.replace('item-1', 'item-2');
    expect(await verify(token(), tampered)).toBe(false);
  });

  it('rejects a webhook signed more than five minutes ago, so a captured one cannot be replayed', async () => {
    expect(await verify(token({ claims: { iat: Math.floor(NOW / 1000) - 6 * 60, request_body_sha256: sha256(body) } }))).toBe(false);
  });

  it('rejects a key Plaid has retired', async () => {
    const getKey = vi.fn(async () => ({ ...publicJwk(), expired_at: 1700000000 }));
    expect(await verify(token(), body, getKey)).toBe(false);
  });

  it('rejects when the key cannot be fetched', async () => {
    const getKey = vi.fn(async () => {
      throw new Error('Plaid unavailable');
    });
    expect(await verify(token(), body, getKey)).toBe(false);
  });
});

describe('the verification key cache', () => {
  const key = (expired_at: number | null = null) => ({ kid: 'key-1', kty: 'EC', expired_at });

  it('reuses a key for an hour, then asks Plaid again so a retirement is noticed', async () => {
    let now = 0;
    const fetchKey = vi.fn(async () => key());
    const getKey = createKeyCache({ fetchKey, now: () => now });

    await getKey('key-1');
    now += 30 * 60 * 1000;
    await getKey('key-1');
    expect(fetchKey).toHaveBeenCalledTimes(1);

    now += 31 * 60 * 1000;
    await getKey('key-1');
    expect(fetchKey).toHaveBeenCalledTimes(2);
  });

  it('never caches a retired key', async () => {
    const fetchKey = vi.fn(async () => key(1700000000));
    const getKey = createKeyCache({ fetchKey, now: () => 0 });

    await getKey('key-1');
    await getKey('key-1');
    expect(fetchKey).toHaveBeenCalledTimes(2);
  });

  it('keeps keys apart by kid', async () => {
    const fetchKey = vi.fn(async (kid: string) => ({ ...key(), kid }));
    const getKey = createKeyCache({ fetchKey, now: () => 0 });

    expect((await getKey('a')).kid).toBe('a');
    expect((await getKey('b')).kid).toBe('b');
  });
});
