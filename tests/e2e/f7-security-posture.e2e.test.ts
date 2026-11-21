import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TriageResponseSchema } from '../../shared/schemas/triage.js';
import {
  applyTestEnv,
  createDisguisedSvgBase64,
  invokeVercelHandler,
  isRecord,
  listWorkspaceFiles,
  loadVercelHandler,
  readWorkspaceTextFile,
  resetGenAIMockState,
  startEphemeralServer,
  type EphemeralServerHandle,
  type GenAIMockState,
} from './helpers/e2eHarness.js';

const genaiMockState = vi.hoisted(
  (): GenAIMockState => ({
    calls: [],
    queue: [],
    defaultResult: {
      category: 'Traffic & Public Safety',
      urgencyScore: 7,
      priorityLevel: 'High',
      recommendedDepartment: 'Public Safety',
      slaEstimateHours: 12,
      slaEstimateText: 'Within 12 hours',
      authenticityCheck: {
        isAuthentic: true,
        status: 'likely_authentic',
        confidence: 0.9,
        reason: 'Consistent safety report.',
      },
      duplicateDetection: {
        isLikelyDuplicate: false,
        matchedIssueIds: [],
        highestSimilarity: 0.08,
        reason: 'No nearby duplicates found.',
      },
      summary: 'Damaged crosswalk warning sign needs replacement.',
      reasoning: 'Pedestrian safety sign at intersection.',
    },
    handler: null,
  }),
);

vi.mock('@google/genai', async () => {
  const harness = await import('./helpers/e2eHarness.js');
  return harness.createGenAIMockModule(genaiMockState);
});

describe('Tier 1 — F7: R4 Deferred Security Posture Middleware', () => {
  let activeServer: EphemeralServerHandle | null = null;
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    resetGenAIMockState(genaiMockState);
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: 'SENTINEL_GEMINI_KEY_DO_NOT_LEAK_9988',
      STRICT_AUTH_LOCKDOWN: 'false',
      ALLOWED_ORIGINS: 'http://localhost:5173',
    });
  });

  afterEach(async () => {
    if (activeServer !== null) {
      await activeServer.close();
      activeServer = null;
    }
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T1-F7-01: Zero GEMINI_API_KEY or VITE_GEMINI* exposure across config, client code, and API responses', async () => {
    const envExample = readFileSync('.env.example', 'utf8');
    const vercelJson = readFileSync('vercel.json', 'utf8');
    expect(envExample).not.toMatch(/VITE_GEMINI/i);
    expect(vercelJson).not.toMatch(/VITE_GEMINI/i);

    const workspaceTsFiles = listWorkspaceFiles(['ts', 'tsx']);
    const clientFacingHits: string[] = [];
    for (const filePath of workspaceTsFiles) {
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.includes('/shared/') || normalized.includes('/src/')) {
        const text = readWorkspaceTextFile(filePath);
        if (/VITE_GEMINI|GEMINI_API_KEY/.test(text)) {
          clientFacingHits.push(normalized);
        }
      }
    }
    expect(clientFacingHits).toEqual([]);

    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: 'SENTINEL_GEMINI_KEY_DO_NOT_LEAK_9988',
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const healthRes = await activeServer.fetchJson('/api/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.text).not.toContain('SENTINEL_GEMINI_KEY_DO_NOT_LEAK_9988');
    expect(healthRes.text).not.toMatch(/VITE_GEMINI/i);

    const triageRes = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Broken crosswalk warning beacon',
        description:
          'Pedestrian warning light unresponsive at Main and 2nd intersection.',
      }),
    });
    expect(triageRes.status).toBe(200);
    expect(triageRes.text).not.toContain('SENTINEL_GEMINI_KEY_DO_NOT_LEAK_9988');
    expect(triageRes.text).not.toContain('GEMINI_API_KEY');
  });

  it('T1-F7-02: Security headers are applied to all API responses', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const healthRes = await activeServer.fetchJson('/api/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get('x-content-type-options')).toBe('nosniff');
    expect(healthRes.headers.get('x-frame-options')).toBe('DENY');
    expect(healthRes.headers.get('referrer-policy')).toBeTruthy();
    expect(healthRes.headers.get('permissions-policy')).toBeTruthy();
    expect(healthRes.headers.get('cache-control')).toContain('no-store');

    const vercelTriage = await loadVercelHandler('api/triage.ts');
    const triageRes = await invokeVercelHandler(vercelTriage, {
      method: 'POST',
      url: '/api/triage',
      body: {
        title: 'Damaged storm drain grate',
        description: 'Drain cover cracked near elementary bus stop.',
      },
    });
    expect(triageRes.status).toBe(200);
    expect(triageRes.headers.get('x-content-type-options')).toBe('nosniff');
    expect(triageRes.headers.get('x-frame-options')).toBe('DENY');
    expect(triageRes.headers.get('cache-control')).toContain('no-store');
  });

  it('T1-F7-03: Allowlisted CORS origin receives matching Access-Control-Allow-Origin', async () => {
    activeServer = await startEphemeralServer({
      ALLOWED_ORIGINS: 'http://localhost:5173,https://civicresolve.example',
      GEMINI_API_KEY: undefined,
    });

    const res = await activeServer.fetchJson('/api/health', {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173',
    );
  });

  it('T1-F7-04: XSS, HTML tags, and control characters are rejected or sanitized cleanly', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const res = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '<script>alert(1)</script> Pothole hazard',
        description:
          'Road damage with <img src=x onerror="alert(1)"> and null\u0000byte.',
      }),
    });

    expect([200, 400]).toContain(res.status);
    expect(res.text).not.toMatch(/<script/i);
    expect(res.text).not.toMatch(/onerror\s*=/i);
    expect(res.text).not.toContain('\u0000');
  });

  it('T1-F7-05: Default STRICT_AUTH_LOCKDOWN=false showcase mode allows unauthenticated POST /api/triage', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const res = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Overflowing public recycling bin',
        description:
          'Sidewalk bin overflowing for two days near central plaza.',
      }),
    });

    expect(res.status).toBe(200);
    expect(TriageResponseSchema.safeParse(res.json).success).toBe(true);
  });
});

describe('Tier 2 — F7: Security Lockdown, CORS, Rate Limiting & Leak Prevention', () => {
  let activeServer: EphemeralServerHandle | null = null;
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    resetGenAIMockState(genaiMockState);
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
      ALLOWED_ORIGINS: 'http://localhost:5173',
    });
  });

  afterEach(async () => {
    if (activeServer !== null) {
      await activeServer.close();
      activeServer = null;
    }
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T2-F7-01: STRICT_AUTH_LOCKDOWN=true rejects missing Bearer token with 401', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'true',
    });

    const unauthRes = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Pothole report without bearer token',
        description:
          'Should be rejected when strict auth lockdown is enabled.',
      }),
    });
    expect(unauthRes.status).toBe(401);
    expect(isRecord(unauthRes.json)).toBe(true);
    if (isRecord(unauthRes.json)) {
      const errObj = Reflect.get(unauthRes.json, 'error');
      expect(isRecord(errObj)).toBe(true);
      if (isRecord(errObj)) {
        expect(Reflect.get(errObj, 'code')).toBe('UNAUTHORIZED');
      }
    }

    const authRes = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer test-citizen-session-token',
      },
      body: JSON.stringify({
        title: 'Pothole report with bearer token',
        description:
          'Should succeed when a valid Bearer header is provided in lockdown mode.',
      }),
    });
    expect(authRes.status).toBe(200);
  });

  it('T2-F7-02: Disallowed CORS origin is never reflected in Access-Control-Allow-Origin', async () => {
    activeServer = await startEphemeralServer({
      ALLOWED_ORIGINS: 'http://localhost:5173',
    });

    const res = await activeServer.fetchJson('/api/health', {
      headers: { Origin: 'https://evil.example' },
    });

    const reflected = res.headers.get('access-control-allow-origin');
    expect(reflected).not.toBe('https://evil.example');
    expect(reflected).not.toBe('*');
  });

  it('T2-F7-03: Rate limit exceeded returns 429 with Retry-After and safe error envelope', async () => {
    if (restoreEnv !== null) {
      restoreEnv();
    }
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
      RATE_LIMIT_MAX: '5',
      RATE_LIMIT_WINDOW_MS: '60000',
    });
    vi.resetModules();

    const handler = await loadVercelHandler('api/triage.ts');
    let rateLimitedResult: Awaited<ReturnType<typeof invokeVercelHandler>> | null =
      null;

    for (let i = 0; i < 120; i += 1) {
      const res = await invokeVercelHandler(handler, {
        method: 'POST',
        url: '/api/triage',
        remoteAddress: '203.0.113.77',
        headers: { 'x-forwarded-for': '203.0.113.77' },
        body: {
          title: `Rate limit probe #${i} pothole`,
          description: `Testing sliding window limiter on burst request ${i}.`,
        },
      });
      if (res.status === 429) {
        rateLimitedResult = res;
        break;
      }
    }

    expect(rateLimitedResult).not.toBeNull();
    if (rateLimitedResult !== null) {
      expect(rateLimitedResult.status).toBe(429);
      const retryAfter = rateLimitedResult.headers.get('retry-after');
      expect(retryAfter).toBeDefined();
      expect((retryAfter ?? '').length).toBeGreaterThan(0);
      expect(isRecord(rateLimitedResult.json)).toBe(true);
      if (isRecord(rateLimitedResult.json)) {
        const errObj = Reflect.get(rateLimitedResult.json, 'error');
        expect(isRecord(errObj)).toBe(true);
        if (isRecord(errObj)) {
          expect(Reflect.get(errObj, 'code')).toBe('RATE_LIMITED');
        }
      }
    }
  });

  it('T2-F7-04: Error responses (400/401/405) leak zero stack traces, file paths, or GEMINI_API_KEY', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: 'SENTINEL_SECRET_NEVER_EXPOSE_4455',
      STRICT_AUTH_LOCKDOWN: 'true',
    });

    const responses = [
      await activeServer.fetchJson('/api/triage', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: '{"broken": ',
      }),
      await activeServer.fetchJson('/api/triage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Valid title',
          description: 'Valid description for lockdown check.',
        }),
      }),
      await activeServer.fetchJson('/api/triage', {
        method: 'GET',
      }),
    ];

    for (const res of responses) {
      expect([400, 401, 405]).toContain(res.status);
      expect(res.text).not.toContain('SENTINEL_SECRET_NEVER_EXPOSE_4455');
      expect(res.text).not.toContain('GEMINI_API_KEY');
      expect(res.text).not.toMatch(/\bat\s+\S+\s+\(/);
      expect(res.text).not.toMatch(/f:\\gdg hackathon/i);
    }
  });

  it('T2-F7-05: Disguised SVG XSS payload in imageBase64 is rejected with 400 INVALID_PAYLOAD', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const disguisedSvgDataUri = `data:image/svg+xml;base64,${createDisguisedSvgBase64()}`;
    const res = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Streetlight outage with disguised SVG attachment',
        description:
          'Attempting to upload an inline SVG script disguised as an issue photo.',
        imageBase64: disguisedSvgDataUri,
      }),
    });

    expect(res.status).toBe(400);
    expect(isRecord(res.json)).toBe(true);
    if (isRecord(res.json)) {
      const errObj = Reflect.get(res.json, 'error');
      expect(isRecord(errObj)).toBe(true);
      if (isRecord(errObj)) {
        expect(Reflect.get(errObj, 'code')).toBe('INVALID_PAYLOAD');
      }
    }
  });
});
