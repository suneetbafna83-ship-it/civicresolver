import {
  createRequestId,
  getHeader,
  sendError,
  type HttpRequestLike,
  type HttpResponseLike,
} from '../http.js';

export interface CorsOptions {
  readonly allowLocalhost?: boolean;
  readonly vercelUrl?: string;
  readonly nodeEnv?: string;
}

export interface CorsOutcome {
  readonly handled: boolean;
  readonly allowed: boolean;
  readonly origin: string | null;
}

type OriginCheckResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'allowed'; readonly origin: string }
  | { readonly kind: 'disallowed' };

function normalizeOriginCandidate(entry: string): string | null {
  const trimmed = entry.trim();
  if (trimmed.length === 0 || trimmed === '*') {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function buildAllowedOriginSet(
  allowedOrigins: readonly string[],
  options?: CorsOptions,
): Set<string> {
  const allowed = new Set<string>();
  for (const entry of allowedOrigins) {
    const normalized = normalizeOriginCandidate(entry);
    if (normalized !== null) {
      allowed.add(normalized);
    }
  }

  const vercelUrl = options?.vercelUrl ?? process.env.VERCEL_URL;
  if (vercelUrl !== undefined && vercelUrl.trim().length > 0) {
    const trimmedVercel = vercelUrl.trim();
    const withScheme =
      trimmedVercel.startsWith('http://') || trimmedVercel.startsWith('https://')
        ? trimmedVercel
        : `https://${trimmedVercel}`;
    const normalizedVercel = normalizeOriginCandidate(withScheme);
    if (normalizedVercel !== null) {
      allowed.add(normalizedVercel);
    }
  }

  return allowed;
}

function isLocalhostAllowed(url: URL, options?: CorsOptions): boolean {
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV;
  const allowLocalhost = options?.allowLocalhost ?? nodeEnv !== 'production';
  if (!allowLocalhost) {
    return false;
  }
  if (url.protocol !== 'http:') {
    return false;
  }
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

function parseValidOrigin(
  rawOrigin: string | undefined,
  allowedSet: ReadonlySet<string>,
  options?: CorsOptions,
): OriginCheckResult {
  if (rawOrigin === undefined) {
    return { kind: 'absent' };
  }
  const trimmed = rawOrigin.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === 'null') {
    return { kind: 'disallowed' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { kind: 'disallowed' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { kind: 'disallowed' };
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return { kind: 'disallowed' };
  }
  if (parsed.origin !== trimmed) {
    return { kind: 'disallowed' };
  }

  if (allowedSet.has(parsed.origin) || isLocalhostAllowed(parsed, options)) {
    return { kind: 'allowed', origin: parsed.origin };
  }

  return { kind: 'disallowed' };
}

export function appendVaryOrigin(res: HttpResponseLike): void {
  const existing = res.getHeader?.('Vary');
  if (existing === undefined) {
    res.setHeader('Vary', 'Origin');
    return;
  }

  const rawList = Array.isArray(existing) ? existing.join(',') : String(existing);
  const tokens = rawList
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const hasOrigin = tokens.some((token) => token.toLowerCase() === 'origin');
  if (!hasOrigin) {
    tokens.push('Origin');
    res.setHeader('Vary', tokens.join(', '));
  }
}

export function applyCors(
  req: HttpRequestLike,
  res: HttpResponseLike,
  allowedOrigins: readonly string[],
  requestId?: string,
  options?: CorsOptions,
): CorsOutcome {
  appendVaryOrigin(res);

  const rawOrigin = getHeader(req.headers, 'origin');
  const allowedSet = buildAllowedOriginSet(allowedOrigins, options);
  const originResult = parseValidOrigin(rawOrigin, allowedSet, options);
  const isPreflight = req.method?.toUpperCase() === 'OPTIONS';

  if (originResult.kind === 'allowed') {
    res.setHeader('Access-Control-Allow-Origin', originResult.origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With',
    );
    res.setHeader('Access-Control-Max-Age', '86400');

    if (isPreflight) {
      res.status(204).end();
      return { handled: true, allowed: true, origin: originResult.origin };
    }
    return { handled: false, allowed: true, origin: originResult.origin };
  }

  if (originResult.kind === 'absent') {
    if (isPreflight) {
      res.status(204).end();
      return { handled: true, allowed: true, origin: null };
    }
    return { handled: false, allowed: true, origin: null };
  }

  if (isPreflight) {
    sendError(
      res,
      403,
      'FORBIDDEN',
      'Origin not allowed by CORS policy',
      requestId ?? createRequestId(),
    );
    return { handled: true, allowed: false, origin: null };
  }

  return { handled: false, allowed: false, origin: null };
}
