import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TriageResponseSchema } from '../../shared/schemas/triage.js';
import {
  applyTestEnv,
  invokeVercelHandler,
  isRecord,
  loadVercelHandler,
  startEphemeralServer,
  type EphemeralServerHandle,
} from './helpers/e2eHarness.js';

describe('Tier 1 — F3: Vercel /api/* & Express Dev Server Contracts', () => {
  let activeServer: EphemeralServerHandle | null = null;
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
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

  it('T1-F3-01: Express GET /api/health returns 200 health contract envelope', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const res = await activeServer.fetchJson('/api/health');
    expect(res.status).toBe(200);
    expect(isRecord(res.json)).toBe(true);
    if (isRecord(res.json)) {
      expect(Reflect.get(res.json, 'ok')).toBe(true);
      expect(Reflect.get(res.json, 'service')).toBe('civicresolve-api');
      const ai = Reflect.get(res.json, 'ai');
      const security = Reflect.get(res.json, 'security');
      expect(isRecord(ai)).toBe(true);
      expect(isRecord(security)).toBe(true);
      if (isRecord(ai)) {
        expect(Reflect.get(ai, 'configured')).toBe(false);
        expect(Reflect.get(ai, 'mode')).toBe('nlp-fallback');
        expect(typeof Reflect.get(ai, 'model')).toBe('string');
      }
      if (isRecord(security)) {
        expect(Reflect.get(security, 'authLockdown')).toBe(false);
      }
    }
  });

  it('T1-F3-02: Vercel api/health.ts handler returns identical 200 health envelope', async () => {
    const handler = await loadVercelHandler('api/health.ts');
    const res = await invokeVercelHandler(handler, {
      method: 'GET',
      url: '/api/health',
    });

    expect(res.status).toBe(200);
    expect(isRecord(res.json)).toBe(true);
    if (isRecord(res.json)) {
      expect(Reflect.get(res.json, 'ok')).toBe(true);
      expect(Reflect.get(res.json, 'service')).toBe('civicresolve-api');
      expect(isRecord(Reflect.get(res.json, 'ai'))).toBe(true);
      expect(isRecord(Reflect.get(res.json, 'security'))).toBe(true);
    }
  });

  it('T1-F3-03: Express POST /api/triage returns 200 valid TriageResponse', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const res = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Broken streetlight outside Oakwood Station',
        description:
          'Streetlight pole 12 has been completely dark for three nights creating a pedestrian hazard.',
      }),
    });

    expect(res.status).toBe(200);
    const parsed = TriageResponseSchema.safeParse(res.json);
    expect(parsed.success).toBe(true);
  });

  it('T1-F3-04: Vercel api/triage.ts direct invocation returns 200 valid TriageResponse', async () => {
    const handler = await loadVercelHandler('api/triage.ts');
    const res = await invokeVercelHandler(handler, {
      method: 'POST',
      url: '/api/triage',
      body: {
        title: 'Overflowing garbage bins at Market Square',
        description:
          'Uncollected waste bins are spilling onto the sidewalk and blocking storm drains.',
      },
    });

    expect(res.status).toBe(200);
    const parsed = TriageResponseSchema.safeParse(res.json);
    expect(parsed.success).toBe(true);
  });

  it('T1-F3-05: Express OPTIONS /api/triage handles CORS preflight cleanly', async () => {
    activeServer = await startEphemeralServer({
      ALLOWED_ORIGINS: 'http://localhost:5173',
    });

    const res = await activeServer.fetchRaw('/api/triage', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      },
    });

    expect([200, 204]).toContain(res.status);
    const allowOrigin = res.headers.get('access-control-allow-origin');
    expect(['http://localhost:5173', '*']).toContain(allowOrigin);
    const allowMethods = res.headers.get('access-control-allow-methods') ?? '';
    expect(allowMethods.toUpperCase()).toContain('POST');
  });
});

describe('Tier 2 — F3: HTTP Boundary & Error Envelopes', () => {
  let activeServer: EphemeralServerHandle | null = null;
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
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

  it('T2-F3-01: Malformed JSON body to POST /api/triage returns 400 INVALID_PAYLOAD envelope', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: undefined,
    });

    const res = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"title": "Broken curb", "description": ',
    });

    expect(res.status).toBe(400);
    expect(isRecord(res.json)).toBe(true);
    if (isRecord(res.json)) {
      const errObj = Reflect.get(res.json, 'error');
      expect(isRecord(errObj)).toBe(true);
      if (isRecord(errObj)) {
        expect(Reflect.get(errObj, 'code')).toBe('INVALID_PAYLOAD');
        expect(typeof Reflect.get(errObj, 'message')).toBe('string');
        expect(typeof Reflect.get(errObj, 'requestId')).toBe('string');
      }
    }
  });

  it('T2-F3-02: Unsupported HTTP methods on /api/triage and /api/health return 405 without crashing', async () => {
    activeServer = await startEphemeralServer();

    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = await activeServer.fetchJson('/api/triage', { method });
      expect(res.status).toBe(405);
      expect(isRecord(res.json)).toBe(true);
    }

    const vercelTriage = await loadVercelHandler('api/triage.ts');
    const vercelGetRes = await invokeVercelHandler(vercelTriage, {
      method: 'GET',
      url: '/api/triage',
    });
    expect(vercelGetRes.status).toBe(405);

    const vercelHealth = await loadVercelHandler('api/health.ts');
    const vercelPostHealth = await invokeVercelHandler(vercelHealth, {
      method: 'POST',
      url: '/api/health',
      body: {},
    });
    expect(vercelPostHealth.status).toBe(405);
  });

  it('T2-F3-03: Oversized HTTP body (> 6mb) returns 413 or 400 structured JSON error', async () => {
    activeServer = await startEphemeralServer();

    const oversizedBody = JSON.stringify({
      title: 'Oversized civic submission payload',
      description: 'X'.repeat(6_600_000),
    });

    const res = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: oversizedBody,
    });

    expect([400, 413]).toContain(res.status);
    expect(isRecord(res.json)).toBe(true);
    if (isRecord(res.json)) {
      expect(isRecord(Reflect.get(res.json, 'error'))).toBe(true);
    }
  });

  it('T2-F3-04: Unknown API path GET /api/unknown returns 404 JSON without stack trace', async () => {
    activeServer = await startEphemeralServer();

    const res = await activeServer.fetchJson('/api/unknown');
    expect(res.status).toBe(404);
    expect(isRecord(res.json)).toBe(true);
    expect(res.text).not.toMatch(/\bat\s+\S+\s+\(/);
    expect(res.text).not.toContain('Error:');
  });

  it('T2-F3-05: Empty body or wrong Content-Type text/plain returns 400 INVALID_PAYLOAD', async () => {
    activeServer = await startEphemeralServer();

    const emptyRes = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '',
    });
    expect(emptyRes.status).toBe(400);

    const plainTextRes = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'title=pothole&description=street+hole',
    });
    expect([400, 415]).toContain(plainTextRes.status);
    expect(isRecord(plainTextRes.json)).toBe(true);
  });
});
