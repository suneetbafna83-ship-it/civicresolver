import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { getServerEnv } from '../api/_lib/env.js';
import {
  createRequestId,
  sanitizeErrorMessage,
  sendError,
  toHttpRequest,
  toHttpResponse,
} from '../api/_lib/http.js';
import { applySecurityHeaders } from '../api/_lib/middleware/securityHeaders.js';
import { handleHealth } from '../api/health.js';
import { handleTriage, type TriageHandlerDeps } from '../api/triage.js';

if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

export interface DevServerOptions {
  readonly triageDeps?: TriageHandlerDeps;
}

export function createDevServer(options?: DevServerOptions): Express {
  const server = express();

  server.disable('x-powered-by');
  server.use(express.json({ limit: '8mb' }));

  server.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const httpRes = toHttpResponse(res);
      applySecurityHeaders(httpRes);
      const requestId = createRequestId();
      httpRes.setHeader('X-Request-Id', requestId);

      const errType =
        typeof err === 'object' && err !== null && 'type' in err
          ? err.type
          : undefined;
      const errStatus =
        typeof err === 'object' && err !== null && 'status' in err
          ? err.status
          : undefined;

      if (errType === 'entity.too.large' || errStatus === 413) {
        sendError(
          httpRes,
          413,
          'PAYLOAD_TOO_LARGE',
          'Request body exceeds 8 MB limit',
          requestId,
        );
        return;
      }

      if (
        err instanceof SyntaxError ||
        errType === 'entity.parse.failed' ||
        errStatus === 400
      ) {
        sendError(
          httpRes,
          400,
          'INVALID_PAYLOAD',
          'Malformed JSON request body',
          requestId,
        );
        return;
      }

      sendError(
        httpRes,
        500,
        'INTERNAL_ERROR',
        sanitizeErrorMessage(err),
        requestId,
      );
    },
  );

  server.all('/api/health', async (req: Request, res: Response) => {
    await handleHealth(toHttpRequest(req), toHttpResponse(res));
  });

  server.all('/api/triage', async (req: Request, res: Response) => {
    await handleTriage(
      toHttpRequest(req),
      toHttpResponse(res),
      options?.triageDeps,
    );
  });

  server.use((_req: Request, res: Response) => {
    const httpRes = toHttpResponse(res);
    applySecurityHeaders(httpRes);
    const requestId = createRequestId();
    httpRes.setHeader('X-Request-Id', requestId);
    sendError(httpRes, 404, 'INVALID_PAYLOAD', 'Route not found', requestId);
  });

  return server;
}

export const app: Express = createDevServer();

function isMainEntrypoint(): boolean {
  const entryArg = process.argv[1];
  if (!entryArg) {
    return false;
  }
  const currentFile = path.resolve(fileURLToPath(import.meta.url));
  const entryFile = path.resolve(entryArg);
  return process.platform === 'win32'
    ? currentFile.toLowerCase() === entryFile.toLowerCase()
    : currentFile === entryFile;
}

if (isMainEntrypoint()) {
  const env = getServerEnv();
  app.listen(env.port, () => {
    console.info(
      `CivicResolve API dev server listening on http://localhost:${env.port}`,
    );
  });
}
