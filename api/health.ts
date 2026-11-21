import type { HealthResponse } from '../shared/types/civic.js';
import { getServerEnv } from './_lib/env.js';
import {
  createRequestId,
  sanitizeErrorMessage,
  sendError,
  sendJson,
  toHttpRequest,
  toHttpResponse,
  type HttpRequestLike,
  type HttpResponseLike,
} from './_lib/http.js';
import { applyCors } from './_lib/middleware/cors.js';
import { applySecurityHeaders } from './_lib/middleware/securityHeaders.js';

export async function handleHealth(
  req: HttpRequestLike,
  res: HttpResponseLike,
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

    if (req.method?.toUpperCase() !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      sendError(
        res,
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed. Use GET for /api/health.',
        requestId,
      );
      return;
    }

    const configured = Boolean(env.geminiApiKey);
    const payload: HealthResponse = {
      ok: true,
      service: 'civicresolve-api',
      ai: {
        configured,
        mode: configured ? 'gemini' : 'nlp-fallback',
        model: env.geminiModel,
      },
      security: {
        authLockdown: env.strictAuthLockdown,
      },
    };

    sendJson(res, 200, payload);
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
  await handleHealth(toHttpRequest(req), toHttpResponse(res));
}
