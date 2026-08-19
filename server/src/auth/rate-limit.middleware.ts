import { NextFunction, Request, Response } from 'express';
import { sendError } from '../common/api-error.js';

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  code: string;
  message: string;
}) {
  const hits = new Map<string, Bucket>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of hits) {
      if (bucket.resetAt <= now) hits.delete(key);
    }
  }, options.windowMs).unref();

  return (request: Request, response: Response, next: NextFunction): void => {
    const key = request.ip ?? 'unknown';
    const now = Date.now();
    const bucket = hits.get(key);

    if (!bucket || bucket.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (bucket.count >= options.max) {
      response.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000).toString());
      sendError(response, 429, options.code, options.message);
      return;
    }

    bucket.count += 1;
    next();
  };
}
