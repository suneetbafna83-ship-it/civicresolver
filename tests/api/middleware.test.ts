import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_PORT,
  getServerEnv,
  parseServerEnv,
} from '../../api/_lib/env.js';
import {
  getClientIp,
  getHeader,
  parseJsonObjectBody,
  sanitizeErrorMessage,
  toHttpRequest,
  type HttpRequestLike,
  type HttpResponseLike,
} from '../../api/_lib/http.js';
import {
  checkAuthGuard,
  extractAndValidateBearerToken,
} from '../../api/_lib/middleware/authGuard.js';
import { applyCors } from '../../api/_lib/middleware/cors.js';
import { createRateLimiter } from '../../api/_lib/middleware/rateLimit.js';
import {
  sanitizeText,
  sanitizeTriageResult,
  validateAndNormalizeUploadImage,
} from '../../api/_lib/middleware/sanitize.js';
import {
  API_SECURITY_HEADERS,
  applySecurityHeaders,
} from '../../api/_lib/middleware/securityHeaders.js';
import { TriageResultSchema } from '../../shared/schemas/triage.js';
import { MAX_RAW_UPLOAD_IMAGE_BYTES } from '../../shared/types/civic.js';

interface MockResponseState {
  statusCode: number;
  headers: Map<string, string>;
  body: unknown;
  ended: boolean;
}

function createMockResponse(): {
  res: HttpResponseLike;
  state: MockResponseState;
} {
  const state: MockResponseState = {
    statusCode: 200,
    headers: new Map<string, string>(),
    body: undefined,
    ended: false,
  };

  const res: HttpResponseLike = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(code: number | undefined) {
      if (code !== undefined) {
        state.statusCode = code;
      }
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string | readonly string[]) {
      state.headers.set(
        name.toLowerCase(),
        Array.isArray(value) ? value.join(', ') : String(value),
      );
      return res;
    },
    getHeader(name: string) {
      return state.headers.get(name.toLowerCase());
    },
    json(body: unknown) {
      state.body = body;
      state.ended = true;
      return res;
    },
    end() {
      state.ended = true;
      return res;
    },
  };

  return { res, state };
}

function makeWebpBase64(totalBytes = 32): string {
  const buf = Buffer.alloc(totalBytes, 0x41);
  Buffer.from('RIFF', 'ascii').copy(buf, 0);
  Buffer.from('WEBP', 'ascii').copy(buf, 8);
  return buf.toString('base64');
}

function makeJpegBase64(totalBytes = 32): string {
  const buf = Buffer.alloc(totalBytes, 0x42);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf.toString('base64');
}

function makePngBase64(totalBytes = 32): string {
  const buf = Buffer.alloc(totalBytes, 0x43);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  return buf.toString('base64');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('env.ts & http.ts helpers', () => {
  it('normalizes blank env strings to defaults and parses booleans explicitly', () => {
    const parsed = parseServerEnv({
      GEMINI_API_KEY: '   ',
      GEMINI_MODEL: '',
      PORT: ' ',
      ALLOWED_ORIGINS: '',
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    expect(parsed.geminiApiKey).toBeUndefined();
    expect(parsed.geminiModel).toBe(DEFAULT_GEMINI_MODEL);
    expect(parsed.port).toBe(DEFAULT_PORT);
    expect(parsed.allowedOrigins).toEqual(DEFAULT_ALLOWED_ORIGINS);
    expect(parsed.strictAuthLockdown).toBe(false);

    const locked = parseServerEnv({ STRICT_AUTH_LOCKDOWN: '1' });
    expect(locked.strictAuthLockdown).toBe(true);
    expect(() =>
      parseServerEnv({ STRICT_AUTH_LOCKDOWN: 'maybe' }),
    ).toThrow();
  });

  it('reads process.env dynamically via getServerEnv without stale caching', () => {
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-pro');
    vi.stubEnv('STRICT_AUTH_LOCKDOWN', 'true');
    const first = getServerEnv();
    expect(first.geminiModel).toBe('gemini-2.5-pro');
    expect(first.strictAuthLockdown).toBe(true);

    vi.stubEnv('STRICT_AUTH_LOCKDOWN', 'false');
    const second = getServerEnv();
    expect(second.strictAuthLockdown).toBe(false);
  });

  it('handles Vercel lazy req.body getter throwing SyntaxError cleanly', () => {
    const throwingReq = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      get body(): unknown {
        throw new SyntaxError('Unexpected token');
      },
    };
    const httpReq = toHttpRequest(throwingReq);
    const parsed = parseJsonObjectBody(httpReq);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toMatch(/Malformed JSON/i);
    }
  });

  it('extracts headers case-insensitively, client IPs, and redacts secrets in errors', () => {
    const req: HttpRequestLike = {
      headers: {
        'X-Forwarded-For': '203.0.113.10, 10.0.0.1',
        Authorization: 'Bearer test-token-1234',
      },
    };
    expect(getHeader(req.headers, 'authorization')).toBe(
      'Bearer test-token-1234',
    );
    expect(getClientIp(req)).toBe('203.0.113.10');

    const sanitized = sanitizeErrorMessage(
      new Error(
        'Upstream failed with AIzaSySuperSecretKey12345 and Bearer mySecretToken99 GEMINI_API_KEY=AIzaAbcdefgh\n    at secretFile.ts:10',
      ),
    );
    expect(sanitized).not.toContain('AIzaSySuperSecretKey12345');
    expect(sanitized).not.toContain('mySecretToken99');
    expect(sanitized).not.toContain('AIzaAbcdefgh');
    expect(sanitized).not.toContain('at secretFile.ts');
  });
});

describe('securityHeaders.ts', () => {
  it('applies all vercel.json headers plus CSP and cross-domain policy', () => {
    const { res, state } = createMockResponse();
    applySecurityHeaders(res);

    const vercelRaw = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      headers: Array<{
        source: string;
        headers: Array<{ key: string; value: string }>;
      }>;
    };
    const apiRule = vercelRaw.headers.find(
      (rule) => rule.source === '/api/(.*)',
    );
    expect(apiRule).toBeDefined();
    for (const pair of apiRule?.headers ?? []) {
      expect(state.headers.get(pair.key.toLowerCase())).toBe(pair.value);
    }

    expect(API_SECURITY_HEADERS.length).toBeGreaterThanOrEqual(8);
    expect(state.headers.get('content-security-policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(state.headers.get('x-permitted-cross-domain-policies')).toBe('none');
  });
});

describe('cors.ts', () => {
  it('passes requests with absent Origin and handles OPTIONS with 204', () => {
    const { res, state } = createMockResponse();
    const outcome = applyCors(
      { method: 'OPTIONS', headers: {} },
      res,
      ['http://localhost:5173'],
      'req-1',
    );
    expect(outcome).toEqual({ handled: true, allowed: true, origin: null });
    expect(state.statusCode).toBe(204);
    expect(state.headers.get('vary')).toBe('Origin');
    expect(state.headers.get('access-control-allow-origin')).toBeUndefined();
  });

  it('reflects exact allowlisted Origin and VERCEL_URL, never wildcard', () => {
    const { res, state } = createMockResponse();
    const outcome = applyCors(
      {
        method: 'OPTIONS',
        headers: { origin: 'https://civic.example.com' },
      },
      res,
      ['https://civic.example.com', '*'],
      'req-2',
      { vercelUrl: 'civicresolve-preview.vercel.app', nodeEnv: 'production' },
    );
    expect(outcome).toEqual({
      handled: true,
      allowed: true,
      origin: 'https://civic.example.com',
    });
    expect(state.statusCode).toBe(204);
    expect(state.headers.get('access-control-allow-origin')).toBe(
      'https://civic.example.com',
    );
    expect(state.headers.get('vary')).toBe('Origin');

    const vercelRes = createMockResponse();
    const vercelOutcome = applyCors(
      {
        method: 'POST',
        headers: { origin: 'https://civicresolve-preview.vercel.app' },
      },
      vercelRes.res,
      ['https://civic.example.com'],
      'req-3',
      { vercelUrl: 'civicresolve-preview.vercel.app', nodeEnv: 'production' },
    );
    expect(vercelOutcome.allowed).toBe(true);
    expect(
      vercelRes.state.headers.get('access-control-allow-origin'),
    ).toBe('https://civicresolve-preview.vercel.app');
  });

  it('blocks untrusted, null, and userinfo Origins without reflection', () => {
    for (const badOrigin of [
      'https://evil.example',
      'null',
      'http://localhost:5173@evil.example',
    ]) {
      const preflight = createMockResponse();
      const outcome = applyCors(
        { method: 'OPTIONS', headers: { origin: badOrigin } },
        preflight.res,
        ['http://localhost:5173'],
        'req-bad',
        { allowLocalhost: false },
      );
      expect(outcome).toEqual({ handled: true, allowed: false, origin: null });
      expect(preflight.state.statusCode).toBe(403);
      expect(
        preflight.state.headers.get('access-control-allow-origin'),
      ).toBeUndefined();
      expect(preflight.state.headers.get('vary')).toBe('Origin');
    }
  });
});

describe('rateLimit.ts', () => {
  it('enforces sliding-window limit, isolates IPs, resets after window, and bounds memory', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T06:00:00Z'));

    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      maxEntries: 3,
      now: () => Date.now(),
    });

    const reqIp1: HttpRequestLike = {
      headers: { 'x-forwarded-for': '198.51.100.1' },
    };
    const reqIp2: HttpRequestLike = {
      headers: { 'x-real-ip': '198.51.100.2' },
    };

    const r1 = createMockResponse();
    expect(limiter.check(reqIp1, r1.res, 'id-1')).toBe(true);
    expect(r1.state.headers.get('x-ratelimit-limit')).toBe('2');
    expect(r1.state.headers.get('x-ratelimit-remaining')).toBe('1');

    const r2 = createMockResponse();
    expect(limiter.check(reqIp1, r2.res, 'id-2')).toBe(true);
    expect(r2.state.headers.get('x-ratelimit-remaining')).toBe('0');

    const r3 = createMockResponse();
    expect(limiter.check(reqIp1, r3.res, 'id-3')).toBe(false);
    expect(r3.state.statusCode).toBe(429);
    expect(Number(r3.state.headers.get('retry-after'))).toBeGreaterThanOrEqual(
      1,
    );

    const rOtherIp = createMockResponse();
    expect(limiter.check(reqIp2, rOtherIp.res, 'id-4')).toBe(true);

    vi.advanceTimersByTime(61_000);
    const rAfterExpiry = createMockResponse();
    expect(limiter.check(reqIp1, rAfterExpiry.res, 'id-5')).toBe(true);

    for (let i = 0; i < 20; i += 1) {
      const rBurst = createMockResponse();
      limiter.check(
        { headers: { 'x-real-ip': `203.0.113.${i}` } },
        rBurst.res,
        `burst-${i}`,
      );
    }
    expect(limiter.size()).toBeLessThanOrEqual(3);
  });
});

describe('authGuard.ts', () => {
  it('passes when STRICT_AUTH_LOCKDOWN=false and enforces Bearer RFC6750 when true', async () => {
    const unlockedEnv = parseServerEnv({ STRICT_AUTH_LOCKDOWN: 'false' });
    const lockedEnv = parseServerEnv({ STRICT_AUTH_LOCKDOWN: 'true' });

    const rOpen = createMockResponse();
    const openOutcome = await checkAuthGuard(
      { headers: {} },
      rOpen.res,
      unlockedEnv,
      'req-open',
    );
    expect(openOutcome.authorized).toBe(true);
    expect(openOutcome.lockdownEnabled).toBe(false);

    for (const badAuth of [
      undefined,
      'Basic dXNlcjpwYXNz',
      'Bearer',
      'Bearer   ',
      'Bearer x',
      'Bearer bad token',
      'Bearer <script>',
    ]) {
      const rDeny = createMockResponse();
      const denyOutcome = await checkAuthGuard(
        {
          headers:
            badAuth !== undefined ? { authorization: badAuth } : {},
        },
        rDeny.res,
        lockedEnv,
        'req-deny',
      );
      expect(denyOutcome.authorized).toBe(false);
      expect(rDeny.state.statusCode).toBe(401);
      expect(rDeny.state.headers.get('www-authenticate')).toContain('Bearer');
    }

    const rOk = createMockResponse();
    const okOutcome = await checkAuthGuard(
      { headers: { authorization: 'Bearer valid-test-token-123' } },
      rOk.res,
      lockedEnv,
      'req-ok',
    );
    expect(okOutcome.authorized).toBe(true);
    expect(okOutcome.token).toBe('valid-test-token-123');
    expect(extractAndValidateBearerToken('bearer eyJhbGciOiJIUzI1NiJ9.abc.def')).toBe(
      'eyJhbGciOiJIUzI1NiJ9.abc.def',
    );
  });
});

describe('sanitize.ts', () => {
  it('accepts valid WebP, JPEG, and PNG magic bytes and rejects spoofing/oversize', () => {
    const webp = validateAndNormalizeUploadImage(
      `data:image/webp;base64,${makeWebpBase64()}`,
    );
    expect(webp.ok).toBe(true);
    if (webp.ok) {
      expect(webp.mimeType).toBe('image/webp');
      expect(webp.base64Data.startsWith('data:')).toBe(false);
    }

    const jpeg = validateAndNormalizeUploadImage(
      makeJpegBase64(),
      'image/jpeg',
    );
    expect(jpeg.ok).toBe(true);

    const png = validateAndNormalizeUploadImage(makePngBase64(), 'image/png');
    expect(png.ok).toBe(true);

    const exact5Mb = validateAndNormalizeUploadImage(
      makeWebpBase64(MAX_RAW_UPLOAD_IMAGE_BYTES),
      'image/webp',
    );
    expect(exact5Mb.ok).toBe(true);

    const over5Mb = validateAndNormalizeUploadImage(
      makeWebpBase64(MAX_RAW_UPLOAD_IMAGE_BYTES + 1),
      'image/webp',
    );
    expect(over5Mb.ok).toBe(false);

    const spoofedPngAsJpeg = validateAndNormalizeUploadImage(
      makePngBase64(),
      'image/jpeg',
    );
    expect(spoofedPngAsJpeg.ok).toBe(false);

    const svgDisguised = validateAndNormalizeUploadImage(
      Buffer.from('<svg onload=alert(1)></svg>').toString('base64'),
      'image/png',
    );
    expect(svgDisguised.ok).toBe(false);

    const svgMime = validateAndNormalizeUploadImage(
      `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
    );
    expect(svgMime.ok).toBe(false);
  });

  it('strips XSS & control chars while preserving safe civic measurements', () => {
    const cleaned = sanitizeText(
      'Crack < 2m wide near O\'Brien & Sons\n\t<script>alert(1)</script><img src=x onerror=alert(1)> javascript:void(0)\x00\x1b',
    );
    expect(cleaned).toContain('< 2m wide');
    expect(cleaned).toContain("O'Brien & Sons");
    expect(cleaned).not.toContain('<script');
    expect(cleaned).not.toContain('onerror=');
    expect(cleaned).not.toContain('javascript:');
    expect(cleaned).not.toContain('\x00');
    expect(cleaned).not.toContain('\x1b');

    const sanitizedResult = sanitizeTriageResult({
      category: 'Pothole & Road Damage',
      urgencyScore: 7,
      priorityLevel: 'High',
      recommendedDepartment: 'Roads & Infrastructure',
      slaEstimateHours: 24,
      slaEstimateText: 'Within 24 hours <script>evil()</script>',
      authenticityCheck: {
        isAuthentic: true,
        status: 'likely_authentic',
        confidence: 0.9,
        reason: 'Matches road damage <img onerror=alert(1)>',
      },
      duplicateDetection: {
        isLikelyDuplicate: false,
        matchedIssueIds: [],
        highestSimilarity: 0.1,
        reason: 'No close matches\x00',
      },
      summary: 'Deep pothole < 2m from curb',
      reasoning: 'High traffic hazard javascript:alert(1)',
    });

    expect(TriageResultSchema.safeParse(sanitizedResult).success).toBe(true);
  });
});
