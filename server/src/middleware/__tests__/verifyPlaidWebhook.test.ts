import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { SignJWT, generateKeyPair, exportJWK, type JWK } from 'jose';

// The verifier module imports the Plaid client, which needs credentials at import time.
vi.mock('../../services/plaid.js', () => ({ plaidClient: {} }));

const { createPlaidWebhookVerifier } = await import('../verifyPlaidWebhook.js');

const body = Buffer.from(JSON.stringify({ webhook_type: 'TRANSACTIONS', item_id: 'item-1' }));
const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

let privateKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  publicJwk = await exportJWK(pair.publicKey);
});

const sign = (opts: { hash?: string; iat?: number; kid?: string } = {}) =>
  new SignJWT({ request_body_sha256: opts.hash ?? sha(body) })
    .setProtectedHeader({ alg: 'ES256', kid: opts.kid ?? 'kid-1' })
    .setIssuedAt(opts.iat)
    .sign(privateKey);

const mockRes = () => {
  const res = {} as Response;
  res.json = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  return res;
};

const reqWith = (token: string | undefined, rawBody: Buffer | undefined = body) =>
  ({
    headers: token ? { 'plaid-verification': token } : {},
    rawBody,
  }) as unknown as Request;

const verifier = (expiredAt: number | null = null) =>
  createPlaidWebhookVerifier(async () => ({ key: publicJwk, expiredAt }));

const run = async (req: Request, expiredAt: number | null = null) => {
  const res = mockRes();
  const next = vi.fn() as unknown as NextFunction;
  await verifier(expiredAt)(req, res, next);
  return { res, next };
};

describe('verifyPlaidWebhook', () => {
  it('accepts a correctly signed webhook for the exact body', async () => {
    const { next, res } = await run(reqWith(await sign()));
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a request with no Plaid-Verification header', async () => {
    const { next, res } = await run(reqWith(undefined));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a body that does not match the signed hash', async () => {
    const tampered = Buffer.from(JSON.stringify({ webhook_type: 'ITEM', item_id: 'item-1' }));
    const { next, res } = await run(reqWith(await sign(), tampered));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token signed by a different key', async () => {
    const other = await generateKeyPair('ES256');
    const forged = await new SignJWT({ request_body_sha256: sha(body) })
      .setProtectedHeader({ alg: 'ES256', kid: 'kid-1' })
      .setIssuedAt()
      .sign(other.privateKey);
    const { next, res } = await run(reqWith(forged));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token older than five minutes', async () => {
    const old = Math.floor(Date.now() / 1000) - 10 * 60;
    const { next, res } = await run(reqWith(await sign({ iat: old })));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when Plaid reports the verification key as expired', async () => {
    const { next, res } = await run(reqWith(await sign()), Date.now());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects garbage tokens without throwing', async () => {
    const { next, res } = await run(reqWith('not-a-jwt'));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
