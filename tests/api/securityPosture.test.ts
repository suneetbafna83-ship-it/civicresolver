import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from '../../api/_lib/middleware/rateLimit.js';
import { API_SECURITY_HEADERS } from '../../api/_lib/middleware/securityHeaders.js';
import { createTriageCache } from '../../api/_lib/triage/triageCache.js';
import { createTriageService } from '../../api/_lib/triage/triageService.js';
import { createDevServer } from '../../server/devServer.js';

const CANARY_KEY = 'AIzaSyCanarySecretDoNotLeak999';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('R4 Security Posture & Zero-Leak Verification', () => {
  it('contains zero VITE_GEMINI references and zero Blaze dependencies across configs and backend', () => {
    const inspectedContents = [
      readFileSync('.env.example', 'utf8'),
      readFileSync('package.json', 'utf8'),
      readFileSync('vercel.json', 'utf8'),
      readFileSync('firebase.json', 'utf8'),
      readFileSync('api/_lib/env.ts', 'utf8'),
      readFileSync('api/_lib/http.ts', 'utf8'),
      readFileSync('api/health.ts', 'utf8'),
      readFileSync('api/triage.ts', 'utf8'),
      readFileSync('server/devServer.ts', 'utf8'),
    ];

    for (const content of inspectedContents) {
      expect(content).not.toMatch(/VITE_GEMINI/i);
    }

    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    for (const forbidden of [
      'firebase-functions',
      'firebase-admin',
      '@google-cloud/storage',
      'firebase/storage',
      'firebase/functions',
    ]) {
      expect(allDeps).not.toContain(forbidden);
    }
  });

  it('aligns API_SECURITY_HEADERS 1:1 with vercel.json headers', () => {
    const vercelConfig = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      headers: Array<{
        source: string;
        headers: Array<{ key: string; value: string }>;
      }>;
    };
    const apiRule = vercelConfig.headers.find(
      (entry) => entry.source === '/api/(.*)',
    );
    expect(apiRule).toBeDefined();

    const headerMap = new Map<string, string>();
    for (const [key, value] of API_SECURITY_HEADERS) {
      headerMap.set(key.toLowerCase(), value);
    }

    for (const item of apiRule?.headers ?? []) {
      expect(headerMap.get(item.key.toLowerCase())).toBe(item.value);
    }
  });

  it('never leaks canary GEMINI_API_KEY or stack traces across health, success, 400, 401, 405, 429, or upstream errors', async () => {
    vi.stubEnv('GEMINI_API_KEY', CANARY_KEY);
    vi.stubEnv('STRICT_AUTH_LOCKDOWN', 'false');

    const failingGeminiService = createTriageService({
      cache: createTriageCache(),
      apiKey: CANARY_KEY,
      geminiClient: {
        models: {
          generateContent: async () => {
            throw new Error(
              `Upstream error using ${CANARY_KEY} and Bearer leakedToken99\n    at internal.ts:42`,
            );
          },
        },
      },
    });

    const server = createDevServer({
      triageDeps: {
        rateLimiter: createRateLimiter({ maxRequests: 3, windowMs: 60_000 }),
        triageFn: failingGeminiService,
      },
    });

    const responses = [
      await request(server).get('/api/health'),
      await request(server).post('/api/triage').send({
        title: 'Water main burst on Pine St',
        description: 'Heavy water leak flooding the roadway intersection.',
      }),
      await request(server).post('/api/triage').send({ title: 'bad' }),
      await request(server).get('/api/triage'),
      await request(server).post('/api/triage').send({
        title: 'Duplicate water leak check',
        description: 'Testing rate limiter response envelope safety.',
      }),
      await request(server).post('/api/triage').send({
        title: 'Rate limit exceeded trigger',
        description: 'Fourth request should trigger 429 cleanly.',
      }),
    ];

    vi.stubEnv('STRICT_AUTH_LOCKDOWN', 'true');
    responses.push(
      await request(server).post('/api/triage').send({
        title: 'Locked endpoint probe',
        description: 'Should return 401 without leaking key.',
      }),
    );

    for (const res of responses) {
      const serializedBody = JSON.stringify(res.body);
      const serializedHeaders = JSON.stringify(res.headers);
      expect(serializedBody).not.toContain('AIzaSyCanary');
      expect(serializedHeaders).not.toContain('AIzaSyCanary');
      expect(serializedBody).not.toContain('at internal.ts');
    }
  });
});
