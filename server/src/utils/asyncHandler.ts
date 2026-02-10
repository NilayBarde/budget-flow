import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async Express route handler so that rejected promises are
 * automatically forwarded to Express error handling via `next(error)`.
 *
 * Usage:
 *   router.get('/foo', asyncHandler(async (req, res) => { ... }));
 *
 * This eliminates repetitive try/catch blocks in every route.
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
