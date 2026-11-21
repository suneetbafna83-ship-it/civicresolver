import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { ApiErrorCode, ApiErrorEnvelope } from '../../shared/types/civic.js';

export type HttpHeaders = Record<string, string | string[] | undefined>;

export interface HttpRequestLike {
  readonly method?: string | undefined;
  readonly url?: string | undefined;
  readonly headers: HttpHeaders;
  readonly body?: unknown;
  readonly bodyParseError?: string | undefined;
  readonly ip?: string | undefined;
  readonly socket?: { readonly remoteAddress?: string | undefined } | undefined;
}

export interface HttpResponseLike {
  statusCode?: number;
  status(code: number): HttpResponseLike;
  setHeader(name: string, value: string | readonly string[]): unknown;
  getHeader?(name: string): number | string | string[] | undefined;
  json(body: unknown): unknown;
  end(chunk?: string): unknown;
}

export interface RawNodeLikeRequest {
  readonly method?: string | undefined;
  readonly url?: string | undefined;
  readonly headers: HttpHeaders;
  readonly ip?: string | undefined;
  readonly socket?: { readonly remoteAddress?: string | undefined } | undefined;
  readonly body?: unknown;
}

export interface RawNodeLikeResponse {
  statusCode?: number;
  status(code: number): unknown;
  setHeader(name: string, value: string | readonly string[]): unknown;
  getHeader?(name: string): number | string | string[] | undefined;
  json(body: unknown): unknown;
  end(chunk?: string): unknown;
}

export function toHttpRequest(req: RawNodeLikeRequest): HttpRequestLike {
  let rawBody: unknown;
  let bodyParseError: string | undefined;

  try {
    rawBody = req.body;
  } catch {
    rawBody = undefined;
    bodyParseError = 'Malformed JSON request body';
  }

  return {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: rawBody,
    bodyParseError,
    ip: req.ip,
    socket: req.socket,
  };
}

export function toHttpResponse(res: RawNodeLikeResponse): HttpResponseLike {
  const adapter: HttpResponseLike = {
    get statusCode(): number | undefined {
      return res.statusCode;
    },
    set statusCode(code: number | undefined) {
      if (code !== undefined) {
        res.statusCode = code;
      }
    },
    status(code: number): HttpResponseLike {
      res.status(code);
      return adapter;
    },
    setHeader(name: string, value: string | readonly string[]): unknown {
      return res.setHeader(name, value);
    },
    getHeader(name: string): number | string | string[] | undefined {
      return res.getHeader?.(name);
    },
    json(body: unknown): unknown {
      return res.json(body);
    },
    end(chunk?: string): unknown {
      return chunk !== undefined ? res.end(chunk) : res.end();
    },
  };
  return adapter;
}

export function getHeader(headers: HttpHeaders, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      const joined = value.map((item) => item.trim()).filter(Boolean).join(', ');
      return joined.length > 0 ? joined : undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

export function getClientIp(req: HttpRequestLike): string {
  const candidates: Array<string | undefined> = [
    getHeader(req.headers, 'x-vercel-forwarded-for'),
    getHeader(req.headers, 'x-real-ip'),
    getHeader(req.headers, 'x-forwarded-for')?.split(',')[0],
    req.ip,
    req.socket?.remoteAddress,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    let normalized = candidate.trim();
    if (normalized.startsWith('::ffff:')) {
      normalized = normalized.slice(7);
    }
    if (normalized.length > 0) {
      return normalized.slice(0, 128);
    }
  }

  return 'unknown';
}

export function createRequestId(): string {
  return randomUUID();
}

export type ParsedJsonObjectResult =
  | { readonly ok: true; readonly data: Record<string, unknown> }
  | { readonly ok: false; readonly message: string };

export function parseJsonObjectBody(req: HttpRequestLike): ParsedJsonObjectResult {
  if (req.bodyParseError !== undefined) {
    return { ok: false, message: req.bodyParseError };
  }

  let parsed: unknown = req.body;

  if (typeof parsed === 'string' || Buffer.isBuffer(parsed)) {
    const rawText = (typeof parsed === 'string' ? parsed : parsed.toString('utf8')).trim();
    if (rawText.length === 0) {
      return { ok: false, message: 'Request body must be a non-empty JSON object' };
    }
    try {
      parsed = JSON.parse(rawText) as unknown;
    } catch {
      return { ok: false, message: 'Malformed JSON request body' };
    }
  }

  if (parsed === null || parsed === undefined || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }

  return { ok: true, data: parsed as Record<string, unknown> };
}

const GOOGLE_KEY_PATTERN = /AIza[0-9A-Za-z\-_]{8,}/g;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const ENV_SECRET_PATTERN = /(GEMINI_API_KEY|API_AUTH_TOKEN)\s*[:=]\s*\S+/gi;

export function sanitizeErrorMessage(err: unknown, fallback = 'Internal server error'): string {
  let rawMessage = '';
  if (err instanceof Error) {
    rawMessage = err.message;
  } else if (typeof err === 'string') {
    rawMessage = err;
  } else if (typeof err === 'object' && err !== null && 'message' in err) {
    const candidate = err.message;
    if (typeof candidate === 'string') {
      rawMessage = candidate;
    }
  }

  const firstLine = rawMessage.split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (firstLine.length === 0) {
    return fallback;
  }

  const redacted = firstLine
    .replace(GOOGLE_KEY_PATTERN, '[REDACTED_KEY]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(ENV_SECRET_PATTERN, '$1=[REDACTED]')
    .trim();

  if (redacted.length === 0) {
    return fallback;
  }
  return redacted.slice(0, 240);
}

export function formatZodIssues(issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.slice(0, 20).map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return sanitizeErrorMessage(`${path}${issue.message}`, 'Invalid field value');
  });
}

export function sendJson(res: HttpResponseLike, statusCode: number, body: unknown): void {
  res.status(statusCode).json(body);
}

export function sendError(
  res: HttpResponseLike,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  requestId: string,
  details?: string[],
): void {
  const envelope: ApiErrorEnvelope = {
    error: {
      code,
      message: sanitizeErrorMessage(message, 'Request failed'),
      ...(details && details.length > 0 ? { details } : {}),
      requestId,
    },
  };
  sendJson(res, statusCode, envelope);
}
