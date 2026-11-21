import { TriageRequestSchema } from '../shared/schemas/triage.js';
import type { TriageRequest, TriageResponse } from '../shared/types/civic.js';
import { getServerEnv } from './_lib/env.js';
import {
  createRequestId,
  formatZodIssues,
  getHeader,
  parseJsonObjectBody,
  sanitizeErrorMessage,
  sendError,
  sendJson,
  toHttpRequest,
  toHttpResponse,
  type HttpRequestLike,
  type HttpResponseLike,
} from './_lib/http.js';
import {
  checkAuthGuard,
  type AuthGuardOptions,
} from './_lib/middleware/authGuard.js';
import { applyCors } from './_lib/middleware/cors.js';
import {
  triageRateLimiter,
  type RateLimiter,
} from './_lib/middleware/rateLimit.js';
import { sanitizeTriageRequest } from './_lib/middleware/sanitize.js';
import { applySecurityHeaders } from './_lib/middleware/securityHeaders.js';
import { triageCivicIssue } from './_lib/triage/triageService.js';

export const MAX_TRIAGE_CONTENT_LENGTH_BYTES = 8 * 1024 * 1024;

export interface TriageHandlerDeps {
  readonly triageFn?: (input: TriageRequest) => Promise<TriageResponse>;
  readonly rateLimiter?: RateLimiter;
  readonly authGuardOptions?: AuthGuardOptions;
}

export async function handleTriage(
  req: HttpRequestLike,
  res: HttpResponseLike,
  deps?: TriageHandlerDeps,
): Promise<void> {
  const requestId = createRequestId();
  res.setHeader('X-Request-Id', requestId);
  applySecurityHeaders(res);

  try {
    const env = getServerEnv();
    const corsOutcome = applyCors(req, res, env.allowedOrigins, requestId);
    if (corsOutcome.handled) {
      return;
    }

    if (req.method?.toUpperCase() !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      sendError(
        res,
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed. Use POST for /api/triage.',
        requestId,
      );
      return;
    }

    const authOutcome = await checkAuthGuard(
      req,
      res,
      env,
      requestId,
      deps?.authGuardOptions,
    );
    if (!authOutcome.authorized) {
      return;
    }

    const rateLimiter = deps?.rateLimiter ?? triageRateLimiter;
    if (!rateLimiter.check(req, res, requestId)) {
      return;
    }

    const rawContentLength = getHeader(req.headers, 'content-length');
    if (rawContentLength !== undefined && /^\d+$/.test(rawContentLength)) {
      const contentLength = Number.parseInt(rawContentLength, 10);
      if (
        Number.isSafeInteger(contentLength) &&
        contentLength > MAX_TRIAGE_CONTENT_LENGTH_BYTES
      ) {
        sendError(
          res,
          413,
          'PAYLOAD_TOO_LARGE',
          'Request body exceeds 8 MB limit',
          requestId,
        );
        return;
      }
    }

    const bodyResult = parseJsonObjectBody(req);
    if (!bodyResult.ok) {
      sendError(res, 400, 'INVALID_PAYLOAD', bodyResult.message, requestId);
      return;
    }

    const parsed = TriageRequestSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      sendError(
        res,
        400,
        'INVALID_PAYLOAD',
        'Triage request validation failed',
        requestId,
        formatZodIssues(parsed.error.issues),
      );
      return;
    }

    const sanitized = sanitizeTriageRequest(parsed.data);
    if (!sanitized.ok) {
      sendError(
        res,
        400,
        'INVALID_PAYLOAD',
        sanitized.message,
        requestId,
      );
      return;
    }

    const triageFn = deps?.triageFn ?? triageCivicIssue;
    const result = await triageFn(sanitized.data);
    sendJson(res, 200, result);
  } catch (err) {
    sendError(
      res,
      500,
      'INTERNAL_ERROR',
      sanitizeErrorMessage(err),
      requestId,
    );
  }
}

export default async function handler(
  req: HttpRequestLike,
  res: HttpResponseLike,
): Promise<void> {
  await handleTriage(toHttpRequest(req), toHttpResponse(res));
}
