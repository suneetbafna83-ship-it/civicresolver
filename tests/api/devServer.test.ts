import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from '../../api/_lib/middleware/rateLimit.js';
import { createTriageCache } from '../../api/_lib/triage/triageCache.js';
import { createTriageService } from '../../api/_lib/triage/triageService.js';
import { app, createDevServer } from '../../server/devServer.js';
import { TriageResponseSchema } from '../../shared/schemas/triage.js';
import {
  MAX_NEARBY_ISSUES_CONTEXT,
  MAX_RAW_UPLOAD_IMAGE_BYTES,
  type NearbyIssueContext,
} from '../../shared/types/civic.js';

function makeWebpBase64(totalBytes: number): string {
  const buf = Buffer.alloc(totalBytes, 0x41);
  Buffer.from('RIFF', 'ascii').copy(buf, 0);
  Buffer.from('WEBP', 'ascii').copy(buf, 8);
  return buf.toString('base64');
}

function makeNearbyIssues(count: number): NearbyIssueContext[] {
  const list: NearbyIssueContext[] = [];
  for (let i = 0; i < count; i += 1) {
    list.push({
      id: `nearby-${i}`,
      title: `Nearby civic issue ${i}`,
      description: `Reported road hazard near intersection block ${i}.`,
      category: 'Pothole & Road Damage',
      lat: 37.7749 + i * 0.0001,
      lng: -122.4194 + i * 0.0001,
      status: 'Reported',
    });
  }
  return list;
}

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', '');
  vi.stubEnv('STRICT_AUTH_LOCKDOWN', 'false');
  vi.stubEnv('ALLOWED_ORIGINS', 'http://localhost:5173');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Express devServer (server/devServer.ts)', () => {
  it('serves GET /api/health with security headers and without X-Powered-By', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(res.headers['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.body).toMatchObject({
      ok: true,
      service: 'civicresolve-api',
      ai: { configured: false, mode: 'nlp-fallback' },
      security: { authLockdown: false },
    });
  });

  it('handles CORS OPTIONS preflight for allowed and disallowed origins', async () => {
    const allowed = await request(app)
      .options('/api/triage')
      .set('Origin', 'http://localhost:5173');
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );

    const blocked = await request(app)
      .options('/api/triage')
      .set('Origin', 'https://evil.example');
    expect(blocked.status).toBe(403);
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns JSON 400 on malformed JSON, 404 on unknown route, and 405 on wrong method', async () => {
    const malformed = await request(app)
      .post('/api/triage')
      .set('Content-Type', 'application/json')
      .send('{"title":');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({
      error: { code: 'INVALID_PAYLOAD' },
    });

    const notFound = await request(app).get('/api/unknown');
    expect(notFound.status).toBe(404);
    expect(notFound.headers['x-content-type-options']).toBe('nosniff');
    expect(notFound.body).toMatchObject({
      error: { code: 'INVALID_PAYLOAD', message: 'Route not found' },
    });

    const methodNotAllowed = await request(app).get('/api/triage');
    expect(methodNotAllowed.status).toBe(405);
    expect(methodNotAllowed.headers['allow']).toContain('POST');
  });

  it('accepts valid ~6.8 MB multimodal payload and rejects >8 MB with 413 PAYLOAD_TOO_LARGE', async () => {
    const isolatedServer = createDevServer({
      triageDeps: {
        rateLimiter: createRateLimiter({ maxRequests: 20, windowMs: 60_000 }),
        triageFn: createTriageService({
          cache: createTriageCache(),
          apiKey: undefined,
        }),
      },
    });

    const largeValid = await request(isolatedServer)
      .post('/api/triage')
      .send({
        title: 'Large pothole photo report',
        description:
          'Uploading full 5 MB WebP civic photo with 50 nearby issues.',
        imageBase64: makeWebpBase64(MAX_RAW_UPLOAD_IMAGE_BYTES),
        imageMimeType: 'image/webp',
        location: { lat: 37.7749, lng: -122.4194, address: 'Market St' },
        nearbyIssues: makeNearbyIssues(MAX_NEARBY_ISSUES_CONTEXT),
      });

    expect(largeValid.status).toBe(200);
    expect(TriageResponseSchema.safeParse(largeValid.body).success).toBe(true);

    const tooLargeBody = JSON.stringify({
      title: 'Oversized body test',
      description: 'Payload exceeding 8 MB limit.',
      extra: 'x'.repeat(8_500_000),
    });
    const over8Mb = await request(isolatedServer)
      .post('/api/triage')
      .set('Content-Type', 'application/json')
      .send(tooLargeBody);

    expect(over8Mb.status).toBe(413);
    expect(over8Mb.body).toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE' },
    });
    expect(JSON.stringify(over8Mb.body)).not.toContain('stack');
  });

  it('enforces rate limit burst (429 + Retry-After) and dynamic STRICT_AUTH_LOCKDOWN toggle', async () => {
    const burstServer = createDevServer({
      triageDeps: {
        rateLimiter: createRateLimiter({ maxRequests: 2, windowMs: 60_000 }),
        triageFn: createTriageService({
          cache: createTriageCache(),
          apiKey: undefined,
        }),
      },
    });

    const payload = {
      title: 'Broken streetlight on Elm St',
      description: 'Streetlight pole has been completely dark for three nights.',
    };

    const r1 = await request(burstServer).post('/api/triage').send(payload);
    expect(r1.status).toBe(200);
    expect(r1.headers['x-ratelimit-remaining']).toBe('1');

    const r2 = await request(burstServer).post('/api/triage').send(payload);
    expect(r2.status).toBe(200);
    expect(r2.headers['x-ratelimit-remaining']).toBe('0');

    const r3 = await request(burstServer).post('/api/triage').send(payload);
    expect(r3.status).toBe(429);
    expect(Number(r3.headers['retry-after'])).toBeGreaterThanOrEqual(1);

    const authServer = createDevServer({
      triageDeps: {
        rateLimiter: createRateLimiter({ maxRequests: 20, windowMs: 60_000 }),
        triageFn: createTriageService({
          cache: createTriageCache(),
          apiKey: undefined,
        }),
      },
    });

    vi.stubEnv('STRICT_AUTH_LOCKDOWN', 'true');
    const unauth = await request(authServer).post('/api/triage').send(payload);
    expect(unauth.status).toBe(401);
    expect(unauth.headers['www-authenticate']).toContain('Bearer');

    const authOk = await request(authServer)
      .post('/api/triage')
      .set('Authorization', 'Bearer valid-test-token-123')
      .send(payload);
    expect(authOk.status).toBe(200);

    vi.stubEnv('STRICT_AUTH_LOCKDOWN', 'false');
    const unlockedOk = await request(authServer)
      .post('/api/triage')
      .send(payload);
    expect(unlockedOk.status).toBe(200);
  });
});
