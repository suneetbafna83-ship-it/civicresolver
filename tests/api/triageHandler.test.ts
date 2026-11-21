import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequestLike, HttpResponseLike } from '../../api/_lib/http.js';
import { createRateLimiter } from '../../api/_lib/middleware/rateLimit.js';
import { detectDuplicates } from '../../api/_lib/triage/duplicateDetector.js';
import {
  HEURISTIC_MODEL_ID,
  runHeuristicTriage,
} from '../../api/_lib/triage/heuristicTriage.js';
import { createTriageCache } from '../../api/_lib/triage/triageCache.js';
import { createTriageService } from '../../api/_lib/triage/triageService.js';
import { handleHealth } from '../../api/health.js';
import { handleTriage } from '../../api/triage.js';
import {
  TriageResponseSchema,
  TriageResultSchema,
} from '../../shared/schemas/triage.js';
import type {
  HealthResponse,
  TriageRequest,
  TriageResult,
} from '../../shared/types/civic.js';

const { mockGenerateContent, mockGoogleGenAICtor } = vi.hoisted(() => {
  const mockGenerateContent = vi.fn();
  const mockGoogleGenAICtor = vi.fn(function MockGoogleGenAI() {
    return {
      models: {
        generateContent: mockGenerateContent,
      },
    };
  });
  return { mockGenerateContent, mockGoogleGenAICtor };
});

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: mockGoogleGenAICtor,
  };
});

function createMockResponse(): {
  res: HttpResponseLike;
  getStatus: () => number;
  getBody: () => unknown;
  getHeader: (name: string) => string | undefined;
} {
  let statusCode = 200;
  let body: unknown;
  const headers = new Map<string, string>();

  const res: HttpResponseLike = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code: number | undefined) {
      if (code !== undefined) {
        statusCode = code;
      }
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    setHeader(name: string, value: string | readonly string[]) {
      headers.set(
        name.toLowerCase(),
        Array.isArray(value) ? value.join(', ') : String(value),
      );
      return res;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
    end() {
      return res;
    },
  };

  return {
    res,
    getStatus: () => statusCode,
    getBody: () => body,
    getHeader: (name: string) => headers.get(name.toLowerCase()),
  };
}

function makeWebpDataUri(): string {
  const buf = Buffer.alloc(32, 0x55);
  Buffer.from('RIFF', 'ascii').copy(buf, 0);
  Buffer.from('WEBP', 'ascii').copy(buf, 8);
  return `data:image/webp;base64,${buf.toString('base64')}`;
}

function makeSampleGeminiResult(): TriageResult {
  return {
    category: 'Pothole & Road Damage',
    urgencyScore: 8,
    priorityLevel: 'High',
    recommendedDepartment: 'Roads & Infrastructure',
    slaEstimateHours: 24,
    slaEstimateText: 'Within 24 hours',
    authenticityCheck: {
      isAuthentic: true,
      status: 'likely_authentic',
      confidence: 0.94,
      reason: 'Image shows asphalt pothole consistent with description.',
    },
    duplicateDetection: {
      isLikelyDuplicate: true,
      matchedIssueIds: ['issue-near-1'],
      highestSimilarity: 0.88,
      reason: 'Matches existing pothole report 45m away.',
    },
    summary: 'Deep pothole near school bus lane requiring urgent repair.',
    reasoning:
      'High-traffic intersection pothole poses tire and pedestrian safety risk.',
  };
}

const VALID_REQUEST: TriageRequest = {
  title: 'Deep pothole on Oak Avenue',
  description:
    'Large asphalt crater at the Oak Avenue crosswalk causing cars to swerve dangerously.',
  location: { lat: 37.7749, lng: -122.4194, address: '120 Oak Ave' },
  nearbyIssues: [
    {
      id: 'issue-near-1',
      title: 'Pothole near 120 Oak Ave',
      description: 'Deep asphalt pothole near crosswalk on Oak Avenue.',
      category: 'Pothole & Road Damage',
      lat: 37.7751,
      lng: -122.4195,
      status: 'Reported',
    },
  ],
};

beforeEach(() => {
  mockGenerateContent.mockReset();
  mockGoogleGenAICtor.mockClear();
  vi.stubEnv('GEMINI_API_KEY', 'test-server-key-123456');
  vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash');
  vi.stubEnv('STRICT_AUTH_LOCKDOWN', 'false');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Gemini AI Triage, Caching, and Failover', () => {
  it('calls @google/genai with responseSchema, fail-fast httpOptions, and stripped multimodal inlineData', async () => {
    const cache = createTriageCache();
    const service = createTriageService({ cache });
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify(makeSampleGeminiResult()),
    });

    const reqWithImage: TriageRequest = {
      ...VALID_REQUEST,
      imageBase64: makeWebpDataUri(),
      imageMimeType: 'image/webp',
    };

    const first = await service(reqWithImage);
    expect(TriageResponseSchema.safeParse(first).success).toBe(true);
    expect(first.metadata.engine).toBe('gemini');
    expect(first.metadata.model).toBe('gemini-2.5-flash');
    expect(first.metadata.cacheHit).toBe(false);
    expect(first.metadata.cacheKey.startsWith('sha256:')).toBe(true);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const callArg = mockGenerateContent.mock.calls[0]?.[0] as {
      model: string;
      contents: Array<{
        parts: Array<{ inlineData?: { mimeType: string; data: string } }>;
      }>;
      config: {
        responseMimeType: string;
        responseSchema: unknown;
        httpOptions: { timeout: number; retryOptions: { attempts: number } };
      };
    };

    expect(callArg.model).toBe('gemini-2.5-flash');
    expect(callArg.config.responseMimeType).toBe('application/json');
    expect(callArg.config.responseSchema).toBeDefined();
    expect(callArg.config.httpOptions).toEqual({
      timeout: 8000,
      retryOptions: { attempts: 1 },
    });
    const imagePart = callArg.contents[0]?.parts[1]?.inlineData;
    expect(imagePart?.mimeType).toBe('image/webp');
    expect(imagePart?.data.startsWith('data:')).toBe(false);

    const second = await service(reqWithImage);
    expect(second.metadata.cacheHit).toBe(true);
    expect(second.metadata.cacheKey).toBe(first.metadata.cacheKey);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    const changed = await service({
      ...reqWithImage,
      title: 'Different civic report title here',
    });
    expect(changed.metadata.cacheHit).toBe(false);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('produces order-independent cache keys for nearbyIssues and never caches nlp-fallback', async () => {
    const cache = createTriageCache();
    const service = createTriageService({ cache });

    mockGenerateContent.mockRejectedValueOnce(
      Object.assign(new Error('Too many requests'), { status: 429 }),
    );
    const fallbackResp = await service(VALID_REQUEST);
    expect(fallbackResp.metadata.engine).toBe('nlp-fallback');
    expect(fallbackResp.metadata.fallbackReason).toBe('rate_limited');
    expect(fallbackResp.metadata.cacheHit).toBe(false);
    expect(cache.size()).toBe(0);

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(makeSampleGeminiResult()),
    });
    const recoveredResp = await service(VALID_REQUEST);
    expect(recoveredResp.metadata.engine).toBe('gemini');
    expect(recoveredResp.metadata.cacheHit).toBe(false);
    expect(cache.size()).toBe(1);

    const reorderedReq: TriageRequest = {
      ...VALID_REQUEST,
      nearbyIssues: [
        ...(VALID_REQUEST.nearbyIssues ?? []),
        {
          id: 'issue-aaa-0',
          title: 'Another issue',
          description: 'Minor sidewalk crack nearby.',
          lat: 37.7752,
          lng: -122.4196,
        },
      ],
    };
    const reversedReq: TriageRequest = {
      ...VALID_REQUEST,
      nearbyIssues: [...(reorderedReq.nearbyIssues ?? [])].reverse(),
    };
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify(makeSampleGeminiResult()),
    });
    const r1 = await service(reorderedReq);
    const r2 = await service(reversedReq);
    expect(r1.metadata.cacheKey).toBe(r2.metadata.cacheKey);
    expect(r2.metadata.cacheHit).toBe(true);
  });

  it('handles all 8 TriageFallbackReason failure modes cleanly', async () => {
    const cache = createTriageCache();
    const service = createTriageService({ cache });

    const missingKeyResp = await service(VALID_REQUEST, { apiKey: undefined });
    expect(missingKeyResp.metadata.engine).toBe('nlp-fallback');
    expect(missingKeyResp.metadata.fallbackReason).toBe('missing_api_key');
    expect(missingKeyResp.metadata.model).toBe(HEURISTIC_MODEL_ID);
    expect(mockGenerateContent).toHaveBeenCalledTimes(0);

    const failureCases: Array<{
      readonly err: unknown;
      readonly expected: string;
    }> = [
      {
        err: Object.assign(new Error('Rate limit hit'), { status: 429 }),
        expected: 'rate_limited',
      },
      {
        err: Object.assign(new Error('Insufficient quota for project'), {
          status: 429,
        }),
        expected: 'quota_exceeded',
      },
      {
        err: Object.assign(new Error('Request timed out'), {
          name: 'AbortError',
        }),
        expected: 'timeout',
      },
      {
        err: Object.assign(new Error('API key not valid'), { status: 401 }),
        expected: 'auth_error',
      },
      {
        err: Object.assign(new Error('Permission denied'), { status: 403 }),
        expected: 'auth_error',
      },
      {
        err: Object.assign(new Error('Model not found'), { status: 404 }),
        expected: 'model_unavailable',
      },
      {
        err: Object.assign(new Error('Service unavailable'), { status: 503 }),
        expected: 'upstream_error',
      },
    ];

    for (const testCase of failureCases) {
      mockGenerateContent.mockRejectedValueOnce(testCase.err);
      const res = await service(VALID_REQUEST);
      expect(res.metadata.engine).toBe('nlp-fallback');
      expect(res.metadata.fallbackReason).toBe(testCase.expected);
      expect(TriageResponseSchema.safeParse(res).success).toBe(true);
    }

    mockGenerateContent.mockResolvedValueOnce({ text: '{bad-json' });
    const badJsonResp = await service(VALID_REQUEST);
    expect(badJsonResp.metadata.fallbackReason).toBe('invalid_response');

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ category: 'Invalid' }),
    });
    const badSchemaResp = await service(VALID_REQUEST);
    expect(badSchemaResp.metadata.fallbackReason).toBe('invalid_response');
  });
});

describe('Deterministic Civic NLP & Duplicate Detector', () => {
  it('routes across all 5 departments, 6 categories, 4 priorities, and validates schema', () => {
    const cases: Array<{
      req: TriageRequest;
      dept: string;
      category: string;
    }> = [
      {
        req: {
          title: 'Deep pothole near highway lane',
          description: 'Broken asphalt pavement causing severe tire damage.',
        },
        dept: 'Roads & Infrastructure',
        category: 'Pothole & Road Damage',
      },
      {
        req: {
          title: 'Illegal dumping of garbage bags',
          description: 'Overflowing trash dumpster with terrible stench.',
        },
        dept: 'Sanitation & Waste',
        category: 'Garbage & Illegal Dumping',
      },
      {
        req: {
          title: 'Downed live wire sparking',
          description:
            'Street light pole wire is sparking near school sidewalk emergency.',
        },
        dept: 'Electrical & Streetlights',
        category: 'Streetlight & Electrical',
      },
      {
        req: {
          title: 'Burst water main flooding',
          description:
            'Raw sewage and pipe leak flooding intersection near hospital.',
        },
        dept: 'Water & Sewage',
        category: 'Water Leak & Sewage',
      },
      {
        req: {
          title: 'Traffic signal outage at crosswalk',
          description:
            'Pedestrian crossing traffic light failed at busy school intersection.',
        },
        dept: 'Public Safety',
        category: 'Traffic & Public Safety',
      },
      {
        req: {
          title: 'Peeling paint on park bench',
          description: 'Minor cosmetic request to repaint wooden park bench.',
        },
        dept: 'Roads & Infrastructure',
        category: 'Other Civic Issue',
      },
    ];

    const prioritiesSeen = new Set<string>();
    for (const item of cases) {
      const result = runHeuristicTriage(item.req);
      expect(TriageResultSchema.safeParse(result).success).toBe(true);
      expect(result.recommendedDepartment).toBe(item.dept);
      expect(result.category).toBe(item.category);
      expect(result.urgencyScore).toBeGreaterThanOrEqual(1);
      expect(result.urgencyScore).toBeLessThanOrEqual(10);
      expect(result.slaEstimateHours).toBeGreaterThan(0);
      expect(result.slaEstimateHours).toBeLessThanOrEqual(720);
      prioritiesSeen.add(result.priorityLevel);
    }

    expect(prioritiesSeen.has('Critical')).toBe(true);
    expect(prioritiesSeen.has('Low')).toBe(true);
  });

  it('detects nearby duplicates within 500m and excludes distant reports >500m', () => {
    const dupes = detectDuplicates(
      {
        ...VALID_REQUEST,
        nearbyIssues: [
          ...(VALID_REQUEST.nearbyIssues ?? []),
          {
            id: 'issue-far-away',
            title: 'Deep pothole on Oak Avenue',
            description: 'Identical wording but 5km away.',
            category: 'Pothole & Road Damage',
            lat: 37.82,
            lng: -122.42,
          },
        ],
      },
      'Pothole & Road Damage',
    );
    expect(dupes.isLikelyDuplicate).toBe(true);
    expect(dupes.matchedIssueIds).toContain('issue-near-1');
    expect(dupes.matchedIssueIds).not.toContain('issue-far-away');
  });
});

describe('API HTTP Handlers (api/health.ts & api/triage.ts)', () => {
  it('returns HealthResponse without leaking GEMINI_API_KEY and rejects non-GET with 405', async () => {
    const okMock = createMockResponse();
    await handleHealth(
      { method: 'GET', headers: { origin: 'http://localhost:5173' } },
      okMock.res,
    );
    expect(okMock.getStatus()).toBe(200);
    const body = okMock.getBody() as HealthResponse;
    expect(body).toEqual({
      ok: true,
      service: 'civicresolve-api',
      ai: {
        configured: true,
        mode: 'gemini',
        model: 'gemini-2.5-flash',
      },
      security: {
        authLockdown: false,
      },
    });
    expect(JSON.stringify(okMock.getBody())).not.toContain('test-server-key');

    const badMethodMock = createMockResponse();
    await handleHealth({ method: 'POST', headers: {} }, badMethodMock.res);
    expect(badMethodMock.getStatus()).toBe(405);
    expect(badMethodMock.getHeader('allow')).toContain('GET');
  });

  it('rejects unsupported methods, bad images, and XSS payloads with clean error envelopes', async () => {
    const limiter = createRateLimiter({ maxRequests: 50, windowMs: 60_000 });

    const getRes = createMockResponse();
    await handleTriage(
      { method: 'GET', headers: {} },
      getRes.res,
      { rateLimiter: limiter },
    );
    expect(getRes.getStatus()).toBe(405);

    const xssRes = createMockResponse();
    await handleTriage(
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          title: '<script>alert(1)</script>',
          description: 'Valid length civic issue description here.',
        },
      },
      xssRes.res,
      { rateLimiter: limiter },
    );
    expect(xssRes.getStatus()).toBe(400);

    const badImgRes = createMockResponse();
    await handleTriage(
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          title: 'Broken streetlight near park',
          description: 'Light pole is dark and unsafe at night.',
          imageBase64: Buffer.from('<svg onload=alert(1)>').toString('base64'),
          imageMimeType: 'image/png',
        },
      },
      badImgRes.res,
      { rateLimiter: limiter },
    );
    expect(badImgRes.getStatus()).toBe(400);

    const validReq: HttpRequestLike = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: VALID_REQUEST,
    };
    const validRes = createMockResponse();
    const isolatedService = createTriageService({
      cache: createTriageCache(),
      apiKey: undefined,
    });
    await handleTriage(validReq, validRes.res, {
      rateLimiter: limiter,
      triageFn: (input) => isolatedService(input),
    });
    expect(validRes.getStatus()).toBe(200);
    expect(TriageResponseSchema.safeParse(validRes.getBody()).success).toBe(
      true,
    );
  });
});
