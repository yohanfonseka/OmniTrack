import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { HttpError } from '../util.js';

/** Wraps an async handler so thrown errors reach the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function str(v: unknown, field: string, { min = 0, max = 200, optional = false } = {}): string {
  if (v === undefined || v === null || v === '') {
    if (optional) return '';
    if (min > 0) throw new HttpError(400, `${field} is required.`);
    return '';
  }
  if (typeof v !== 'string') throw new HttpError(400, `${field} must be text.`);
  const s = v.trim();
  if (s.length < min) throw new HttpError(400, `${field} must be at least ${min} characters.`);
  if (s.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return s;
}

/** Only allow same-site relative redirects. */
export function safeReturnTo(v: unknown): string | null {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v.slice(0, 300) : null;
}

export function clientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() || req.socket.remoteAddress || '?';
}
