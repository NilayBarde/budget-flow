import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireAccessKey } from '../requireAccessKey.js';

const mockRes = () => {
  const res = {} as Response;
  res.json = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  return res;
};

const reqWith = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {} }) as Request;

describe('requireAccessKey', () => {
  const original = process.env.API_ACCESS_KEY;

  beforeEach(() => {
    process.env.API_ACCESS_KEY = 'correct-key';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.API_ACCESS_KEY;
    else process.env.API_ACCESS_KEY = original;
  });

  it('calls next for the correct bearer token', () => {
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    requireAccessKey(reqWith('Bearer correct-key'), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a missing header with 401', () => {
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    requireAccessKey(reqWith(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a wrong key, including one of different length', () => {
    for (const bad of ['Bearer wrong-key', 'Bearer x', 'Bearer correct-key-and-more']) {
      const res = mockRes();
      const next = vi.fn() as unknown as NextFunction;
      requireAccessKey(reqWith(bad), res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('rejects a non-bearer scheme', () => {
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    requireAccessKey(reqWith('Basic correct-key'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when no key is configured', () => {
    delete process.env.API_ACCESS_KEY;
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    requireAccessKey(reqWith('Bearer anything'), res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });
});
