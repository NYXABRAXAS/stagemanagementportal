import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found.`);
export const forbidden = (msg = 'You do not have permission to perform this action.') => new HttpError(403, msg);
export const conflict = (msg: string, details?: unknown) => new HttpError(409, msg, details);

/** Wraps async route handlers so rejected promises reach the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed: ' + err.issues.map((i) => `${i.path.join('.') || 'value'} — ${i.message}`).join('; '),
      details: err.issues,
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002')
      return res.status(409).json({ error: `A record with the same ${(err.meta?.target as string[])?.join(', ') ?? 'key'} already exists.` });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Record not found.' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Unexpected server error.' });
}
