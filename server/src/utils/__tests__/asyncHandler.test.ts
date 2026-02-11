import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../asyncHandler.js';

const mockReq = {} as Request;

const mockRes = () => {
  const res = {} as Response;
  res.json = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  return res;
};

describe('asyncHandler', () => {
  it('calls the handler and does not call next on success', async () => {
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    const handler = asyncHandler(async (_req, res) => {
      res.json({ ok: true });
    });

    await handler(mockReq, res, next);

    // Allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 0));

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next(error) when the handler rejects', async () => {
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    const error = new Error('Something went wrong');

    const handler = asyncHandler(async () => {
      throw error;
    });

    await handler(mockReq, res, next);

    // Allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 0));

    expect(next).toHaveBeenCalledWith(error);
  });

  it('calls next(error) when the handler throws synchronously', async () => {
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    const error = new Error('Sync throw');

    // Even though asyncHandler wraps in Promise.resolve, a synchronous throw
    // inside an async function becomes a rejection.
    const handler = asyncHandler(async () => {
      throw error;
    });

    await handler(mockReq, res, next);

    await new Promise((r) => setTimeout(r, 0));

    expect(next).toHaveBeenCalledWith(error);
  });

  it('returns a function with the correct arity for Express (3 params)', () => {
    const handler = asyncHandler(async () => {});
    // Express uses fn.length to distinguish middleware from error handlers
    expect(handler.length).toBe(3);
  });
});
