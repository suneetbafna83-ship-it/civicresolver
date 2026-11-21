import type { HttpResponseLike } from '../http.js';

export const API_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ['Cache-Control', 'no-store'],
  ['X-DNS-Prefetch-Control', 'off'],
  ['X-Permitted-Cross-Domain-Policies', 'none'],
  ['Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'"],
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
  ['Cross-Origin-Opener-Policy', 'same-origin'],
  ['Cross-Origin-Resource-Policy', 'same-origin'],
];

export function applySecurityHeaders(res: Pick<HttpResponseLike, 'setHeader'>): void {
  for (const [key, value] of API_SECURITY_HEADERS) {
    res.setHeader(key, value);
  }
}
