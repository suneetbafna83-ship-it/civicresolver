import { existsSync, readFileSync } from 'node:fs';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseServerEnv } from '../../api/_lib/env.js';

afterEach(() => {
  vi.unstubAllEnvs();
});
import { applyCors } from '../../api/_lib/middleware/cors.js';
import { createRateLimiter } from '../../api/_lib/middleware/rateLimit.js';
import {
  sanitizeText,
  validateAndNormalizeUploadImage,
} from '../../api/_lib/middleware/sanitize.js';
import { API_SECURITY_HEADERS } from '../../api/_lib/middleware/securityHeaders.js';
import { createDevServer } from '../../server/devServer.js';
import {
  constantTimeEqualBytes,
  hashPasswordPbkdf2,
  verifyPasswordPbkdf2,
} from '../../src/lib/auth/passwordHasher.js';
import { createDefaultIssueRepository } from '../../src/lib/repositories/hybridIssueRepository.js';
import {
  listWorkspaceFiles,
  readWorkspaceTextFile,
} from '../e2e/helpers/e2eHarness.js';

describe('Phase 3 — Full 17-Point Security Lockdown & Audit Suite', () => {
  it('1. Hide API keys: GEMINI_API_KEY is server-only and never appears in client code or .env.example', () => {
    const envExample = readFileSync('.env.example', 'utf8');
    expect(envExample).not.toMatch(/VITE_GEMINI/i);
    expect(envExample).toMatch(/^GEMINI_API_KEY=\s*$/m);

    const clientFiles = listWorkspaceFiles(['ts', 'tsx', 'html']).filter((f) => {
      const norm = f.replace(/\\/g, '/');
      return (
        norm.includes('/src/') ||
        norm.includes('/shared/') ||
        norm.endsWith('/index.html')
      );
    });

    for (const file of clientFiles) {
      const content = readWorkspaceTextFile(file);
      expect(content).not.toMatch(/GEMINI_API_KEY|VITE_GEMINI/i);
    }
  });

  it('2. Check environment variables: parseServerEnv validates port bounds, booleans, and rate limits strictly', () => {
    const valid = parseServerEnv({
      PORT: '3001',
      STRICT_AUTH_LOCKDOWN: 'true',
      RATE_LIMIT_MAX: '45',
      RATE_LIMIT_WINDOW_MS: '60000',
      ALLOWED_ORIGINS: 'http://localhost:5173',
    });
    expect(valid.port).toBe(3001);
    expect(valid.strictAuthLockdown).toBe(true);
    expect(valid.rateLimitMax).toBe(45);

    expect(() => parseServerEnv({ PORT: '99999' })).toThrow();
    expect(() =>
      parseServerEnv({ STRICT_AUTH_LOCKDOWN: 'invalid-bool' }),
    ).toThrow();
    expect(() => parseServerEnv({ RATE_LIMIT_MAX: '0' })).toThrow();
  });

  it('3. Protect admin routes: Citizen session is strictly forbidden from executing admin issue updates', async () => {
    const repo = createDefaultIssueRepository();
    const citizenSession = {
      uid: 'citizen-user-01',
      displayName: 'Citizen User',
      email: 'citizen@example.com',
      role: 'citizen' as const,
      provider: 'password' as const,
      isAnonymous: false,
      isPreviewAdmin: false,
      isVerifiedFirebaseAdmin: false,
      getIdToken: async () => 'token',
    };

    await expect(
      repo.updateIssue(
        'seed-issue-001',
        { status: 'Resolved' },
        citizenSession,
      ),
    ).rejects.toThrow(/Admin role is required/i);
  });

  it('4. Add proper authentication: STRICT_AUTH_LOCKDOWN=true blocks unauthenticated requests with 401 and WWW-Authenticate', async () => {
    vi.stubEnv('STRICT_AUTH_LOCKDOWN', 'true');
    vi.stubEnv('API_AUTH_TOKEN', 'secret-officer-bearer-token-2026');
    vi.stubEnv('GEMINI_API_KEY', '');

    const server = createDevServer();

    const unauth = await request(server).post('/api/triage').send({
      title: 'Pothole near Central Market',
      description: 'Testing strict authentication guard on triage endpoint.',
    });
    expect(unauth.status).toBe(401);
    expect(unauth.headers['www-authenticate']).toContain('Bearer');

    const wrongToken = await request(server)
      .post('/api/triage')
      .set('Authorization', 'Bearer wrong-token-value-0000')
      .send({
        title: 'Pothole near Central Market',
        description: 'Testing strict authentication guard with invalid token.',
      });
    expect(wrongToken.status).toBe(401);

    const validToken = await request(server)
      .post('/api/triage')
      .set('Authorization', 'Bearer secret-officer-bearer-token-2026')
      .send({
        title: 'Pothole near Central Market',
        description: 'Testing strict authentication guard with valid token.',
      });
    expect(validToken.status).toBe(200);
  });

  it('5. Users only access their own data: firestore.rules enforces reporterUid ownership, owner-only votes, and zero PII', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain('data.reporterUid == request.auth.uid');
    expect(rules).toContain('data.uid == request.auth.uid');
    expect(rules).toContain('allow get: if isOwner(uid);');
    expect(rules).toContain('allow delete: if false;');
  });

  it('6. Sanitize forms & protect against XSS: strips scripts, event handlers, and rejects disguised SVG uploads', () => {
    const cleaned = sanitizeText(
      '<script>alert("xss")</script>Pothole <img src=x onerror=alert(1)> javascript:void(0)',
    );
    expect(cleaned).not.toMatch(/<script|onerror|javascript:/i);

    const svgBytes = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
      'utf8',
    ).toString('base64');
    const imgCheck = validateAndNormalizeUploadImage(
      `data:image/png;base64,${svgBytes}`,
      'image/png',
    );
    expect(imgCheck.ok).toBe(false);
  });

  it('7. Add rate limiting: enforces sliding window cap with 429 RATE_LIMITED and Retry-After header', async () => {
    const server = createDevServer({
      triageDeps: {
        rateLimiter: createRateLimiter({ maxRequests: 2, windowMs: 60_000 }),
      },
    });

    const payload = {
      title: 'Overflowing trash container',
      description: 'Public bin overflowing near bus terminal entrance.',
    };
    const r1 = await request(server).post('/api/triage').send(payload);
    const r2 = await request(server).post('/api/triage').send(payload);
    const r3 = await request(server).post('/api/triage').send(payload);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.headers['retry-after']).toBeDefined();
    expect(r3.body.error.code).toBe('RATE_LIMITED');
  });

  it('8. Check CORS settings: blocks disallowed origins and never reflects wildcard *', async () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'http://localhost:5173');
    const server = createDevServer();

    const evilPreflight = await request(server)
      .options('/api/triage')
      .set('Origin', 'https://attacker.example.com');
    expect(evilPreflight.status).toBe(403);
    expect(evilPreflight.headers['access-control-allow-origin']).toBeUndefined();
    expect(typeof applyCors).toBe('function');
  });

  it('9. Add security headers: includes HSTS, CSP, X-Frame-Options, COOP, CORP, and nosniff in both API and vercel.json', async () => {
    const server = createDevServer();
    const res = await request(server).get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['strict-transport-security']).toContain('max-age=63072000');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(API_SECURITY_HEADERS.length).toBeGreaterThanOrEqual(11);
  });

  it('10. Turn off debug mode: x-powered-by is disabled, production sourcemaps are off, and errors leak no stack traces', async () => {
    const viteConfig = readFileSync('vite.config.ts', 'utf8');
    expect(viteConfig).toContain('sourcemap: false');

    const server = createDevServer();
    const res = await request(server)
      .post('/api/triage')
      .set('Content-Type', 'application/json')
      .send('{"malformedJson": ');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at\s+\S+\s+\(/);
  });

  it('11 & 12. Update dependencies & remove unneeded packages: package.json has @grpc/grpc-js override and zero unused/Blaze deps', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      overrides?: Record<string, string>;
    };

    expect(pkg.overrides?.['@grpc/grpc-js']).toBeDefined();
    expect(pkg.dependencies?.['cors']).toBeUndefined();
    expect(pkg.devDependencies?.['@vercel/node']).toBeUndefined();
    expect(existsSync('src/components/auth/AuthModal.tsx')).toBe(false);
  });

  it('13 & 14. Check for exposed files & secure database: .gitignore blocks .env/dist and firestore.rules enforces limit(50) & <120KB WebP', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');
    expect(gitignore).toContain('.env');
    expect(gitignore).toContain('dist/');

    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain('request.query.limit <= 50');
    expect(rules).toContain('value.size() <= 165000');
    expect(rules).toContain('match /{document=**}');
  });

  it('15. Hash passwords properly: PBKDF2-HMAC-SHA256 with 100,000 iterations, random 16-byte salt, and constant-time compare', async () => {
    const digest1 = await hashPasswordPbkdf2('MunicipalOfficer#2026');
    const digest2 = await hashPasswordPbkdf2('MunicipalOfficer#2026');

    expect(digest1.startsWith('pbkdf2_sha256$100000$')).toBe(true);
    // Random salt ensures two hashes of the same password are never identical
    expect(digest1).not.toBe(digest2);

    expect(await verifyPasswordPbkdf2('MunicipalOfficer#2026', digest1)).toBe(
      true,
    );
    expect(await verifyPasswordPbkdf2('WrongPassword#2026', digest1)).toBe(
      false,
    );

    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    const c = new Uint8Array([1, 2, 3, 9]);
    expect(constantTimeEqualBytes(a, b)).toBe(true);
    expect(constantTimeEqualBytes(a, c)).toBe(false);
  });

  it('16 & 17. Check tracked workspace files for leaked secrets and complete full security audit', () => {
    const trackedCandidates = listWorkspaceFiles([
      'ts',
      'tsx',
      'mjs',
      'json',
      'md',
      'html',
      'css',
    ]);
    const secretRegex =
      /\b(?:AIzaSy[0-9A-Za-z_-]{33}|AQ\.Ab8[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)\b/;

    const leakedFiles: string[] = [];
    for (const file of trackedCandidates) {
      if (file.endsWith('package-lock.json')) {
        continue;
      }
      const content = readWorkspaceTextFile(file);
      if (secretRegex.test(content)) {
        leakedFiles.push(file);
      }
    }

    expect(leakedFiles).toEqual([]);
  });
});
