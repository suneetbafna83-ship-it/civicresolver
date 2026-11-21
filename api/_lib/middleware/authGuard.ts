import { timingSafeEqual } from 'node:crypto';
import type { ServerEnv } from '../env.js';
import {
  getHeader,
  sendError,
  type HttpRequestLike,
  type HttpResponseLike,
} from '../http.js';

const B64_TOKEN_REGEX = /^[A-Za-z0-9\-._~+/]+=*$/;
const MIN_BEARER_TOKEN_LENGTH = 8;
const MAX_BEARER_TOKEN_LENGTH = 4096;

export interface AuthGuardOptions {
  readonly verifyToken?: (token: string) => Promise<boolean> | boolean;
}

export interface AuthGuardOutcome {
  readonly authorized: boolean;
  readonly lockdownEnabled: boolean;
  readonly token: string | null;
}

export function extractAndValidateBearerToken(
  authorizationHeader: string | undefined,
): string | null {
  if (authorizationHeader === undefined) {
    return null;
  }

  const trimmed = authorizationHeader.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex <= 0) {
    return null;
  }

  const scheme = trimmed.slice(0, spaceIndex);
  if (scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  const token = trimmed.slice(spaceIndex + 1).trim();
  if (
    token.length < MIN_BEARER_TOKEN_LENGTH ||
    token.length > MAX_BEARER_TOKEN_LENGTH
  ) {
    return null;
  }

  if (!B64_TOKEN_REGEX.test(token)) {
    return null;
  }

  return token;
}

function constantTimeTokenMatch(submitted: string, expected: string): boolean {
  const submittedBuf = Buffer.from(submitted, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (submittedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(submittedBuf, expectedBuf);
}

export async function checkAuthGuard(
  req: HttpRequestLike,
  res: HttpResponseLike,
  env: ServerEnv,
  requestId: string,
  options?: AuthGuardOptions,
): Promise<AuthGuardOutcome> {
  const rawAuth = getHeader(req.headers, 'authorization');
  const parsedToken = extractAndValidateBearerToken(rawAuth);

  if (!env.strictAuthLockdown) {
    return {
      authorized: true,
      lockdownEnabled: false,
      token: parsedToken,
    };
  }

  let isAuthorized = parsedToken !== null;
  if (isAuthorized && parsedToken !== null) {
    if (options?.verifyToken !== undefined) {
      isAuthorized = await options.verifyToken(parsedToken);
    } else if (env.apiAuthToken !== undefined) {
      isAuthorized = constantTimeTokenMatch(parsedToken, env.apiAuthToken);
    }
  }

  if (!isAuthorized) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="civicresolve-api"');
    sendError(
      res,
      401,
      'UNAUTHORIZED',
      'Authentication required. Provide a valid Bearer token.',
      requestId,
    );
    return {
      authorized: false,
      lockdownEnabled: true,
      token: null,
    };
  }

  return {
    authorized: true,
    lockdownEnabled: true,
    token: parsedToken,
  };
}
