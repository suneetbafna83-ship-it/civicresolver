import { getServerEnv } from '../env.js';
import {
  getClientIp,
  sendError,
  type HttpRequestLike,
  type HttpResponseLike,
} from '../http.js';

export interface RateLimiterOptions {
  readonly windowMs?: number;
  readonly maxRequests?: number;
  readonly maxEntries?: number;
  readonly sweepEvery?: number;
  readonly now?: () => number;
}

export interface RateLimiter {
  check(req: HttpRequestLike, res: HttpResponseLike, requestId: string): boolean;
  reset(): void;
  size(): number;
}

export function createRateLimiter(options?: RateLimiterOptions): RateLimiter {
  const maxEntries = Math.max(1, options?.maxEntries ?? 10_000);
  const sweepEvery = Math.max(1, options?.sweepEvery ?? 100);
  const nowFn = options?.now ?? (() => Date.now());
  const store = new Map<string, number[]>();
  let checkCounter = 0;

  function sweepExpired(cutoffMs: number): void {
    for (const [key, timestamps] of store.entries()) {
      const latest = timestamps[timestamps.length - 1];
      if (latest === undefined || latest <= cutoffMs) {
        store.delete(key);
      }
    }
  }

  function check(
    req: HttpRequestLike,
    res: HttpResponseLike,
    requestId: string,
  ): boolean {
    const windowMs = options?.windowMs ?? getServerEnv().rateLimitWindowMs;
    const maxRequests = options?.maxRequests ?? getServerEnv().rateLimitMax;
    const currentNow = nowFn();
    const cutoffMs = currentNow - windowMs;

    checkCounter += 1;
    if (checkCounter % sweepEvery === 0 || store.size >= maxEntries) {
      sweepExpired(cutoffMs);
    }

    const clientIp = getClientIp(req);
    const existing = store.get(clientIp);
    const active = existing ? existing.filter((ts) => ts > cutoffMs) : [];

    if (existing === undefined && store.size >= maxEntries) {
      const oldestKey = store.keys().next().value;
      if (oldestKey !== undefined) {
        store.delete(oldestKey);
      }
    }

    if (active.length >= maxRequests) {
      store.delete(clientIp);
      store.set(clientIp, active);

      const oldestTs = active[0] ?? currentNow;
      const resetEpochSeconds = Math.ceil((oldestTs + windowMs) / 1000);
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldestTs + windowMs - currentNow) / 1000),
      );

      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(resetEpochSeconds));
      res.setHeader('Retry-After', String(retryAfterSeconds));

      sendError(
        res,
        429,
        'RATE_LIMITED',
        'Rate limit exceeded. Please retry later.',
        requestId,
      );
      return false;
    }

    active.push(currentNow);
    store.delete(clientIp);
    store.set(clientIp, active);

    const oldestTs = active[0] ?? currentNow;
    const resetEpochSeconds = Math.ceil((oldestTs + windowMs) / 1000);
    const remaining = Math.max(0, maxRequests - active.length);

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetEpochSeconds));

    return true;
  }

  function reset(): void {
    store.clear();
    checkCounter = 0;
  }

  function size(): number {
    return store.size;
  }

  return { check, reset, size };
}

export const triageRateLimiter = createRateLimiter();
