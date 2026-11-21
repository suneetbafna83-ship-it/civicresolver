import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CivicIssueSchema,
  IssueCreateSchema,
} from '../../shared/schemas/issue.js';
import { TriageResponseSchema } from '../../shared/schemas/triage.js';
import {
  MAX_STORED_WEBP_BYTES,
  type CivicIssue,
  type IssueCreateInput,
  type TriageResponse,
} from '../../shared/types/civic.js';
import {
  applyTestEnv,
  createDisguisedSvgBase64,
  createSampleRawImageBase64,
  createSampleTriageResult,
  createSampleWebpDataUrl,
  installLocalStorageShim,
  isRecord,
  listWorkspaceFiles,
  loadAuthService,
  loadHybridRepository,
  loadImageValidation,
  makeSession,
  readWorkspaceTextFile,
  requireAt,
  resetGenAIMockState,
  startEphemeralServer,
  type EphemeralServerHandle,
  type GenAIMockState,
  type LocalStorageShimController,
} from './helpers/e2eHarness.js';

const genaiMockState = vi.hoisted(
  (): GenAIMockState => ({
    calls: [],
    queue: [],
    defaultResult: {
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
        reason: 'Uploaded image matches street pothole description.',
      },
      duplicateDetection: {
        isLikelyDuplicate: false,
        matchedIssueIds: [],
        highestSimilarity: 0.1,
        reason: 'No matching nearby open issues.',
      },
      summary: 'Deep pothole near school gate requires asphalt repair.',
      reasoning: 'High hazard to cyclists and school traffic.',
    },
    handler: null,
  }),
);

vi.mock('@google/genai', async () => {
  const harness = await import('./helpers/e2eHarness.js');
  return harness.createGenAIMockModule(genaiMockState);
});

function triageToCreateInput(
  title: string,
  description: string,
  triageResp: TriageResponse,
  options: {
    lat: number;
    lng: number;
    address: string;
    imageDataUrl?: string | null;
  },
): IssueCreateInput {
  return {
    title,
    description,
    category: triageResp.triage.category,
    location: {
      lat: options.lat,
      lng: options.lng,
      address: options.address,
    },
    priorityLevel: triageResp.triage.priorityLevel,
    urgencyScore: triageResp.triage.urgencyScore,
    recommendedDepartment: triageResp.triage.recommendedDepartment,
    assignedDepartment: triageResp.triage.recommendedDepartment,
    slaEstimateHours: triageResp.triage.slaEstimateHours,
    slaSummary: triageResp.triage.slaEstimateText,
    triageMeta: {
      engine: triageResp.metadata.engine,
      model: triageResp.metadata.model,
      cacheHit: triageResp.metadata.cacheHit,
      authenticityStatus: triageResp.triage.authenticityCheck.status,
      authenticityReason: triageResp.triage.authenticityCheck.reason,
      potentialDuplicateIds:
        triageResp.triage.duplicateDetection.matchedIssueIds,
      highestSimilarity:
        triageResp.triage.duplicateDetection.highestSimilarity,
    },
    imageDataUrl: options.imageDataUrl ?? null,
  };
}

describe('Tier 3 — Cross-Feature Pairwise Integration Scenarios', () => {
  let activeServer: EphemeralServerHandle | null = null;
  let lsController: LocalStorageShimController | null = null;
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    resetGenAIMockState(genaiMockState);
    lsController = installLocalStorageShim();
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: undefined,
      GEMINI_MODEL: 'gemini-2.5-flash',
      STRICT_AUTH_LOCKDOWN: 'false',
      ALLOWED_ORIGINS: 'http://localhost:5173',
      VITE_FIREBASE_API_KEY: undefined,
      VITE_FIREBASE_PROJECT_ID: undefined,
    });
  });

  afterEach(async () => {
    if (activeServer !== null) {
      await activeServer.close();
      activeServer = null;
    }
    if (lsController !== null) {
      lsController.restore();
      lsController = null;
    }
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T3-01 (F3+F4+F5): HTTP POST /api/triage caches Gemini response on 2nd identical request', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: 'test-gemini-key',
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const payload = {
      title: 'Deep pothole outside Eastside Clinic',
      description:
        'Asphalt depression collecting rainwater at ambulance bay entrance.',
    };

    const first = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const second = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const parsedFirst = TriageResponseSchema.parse(first.json);
    const parsedSecond = TriageResponseSchema.parse(second.json);

    expect(parsedFirst.metadata.engine).toBe('gemini');
    expect(parsedFirst.metadata.cacheHit).toBe(false);
    expect(parsedSecond.metadata.cacheHit).toBe(true);
    expect(parsedSecond.metadata.cacheKey).toBe(parsedFirst.metadata.cacheKey);
    expect(parsedSecond.triage).toEqual(parsedFirst.triage);
    expect(genaiMockState.calls).toHaveLength(1);
  });

  it('T3-02 (F3+F6+F5): HTTP 429 failover returns nlp-fallback without poisoning SHA-256 cache', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: 'test-gemini-key',
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    genaiMockState.queue.push({
      kind: 'error',
      status: 429,
      message: 'Quota exceeded for minute window',
    });

    const payload = {
      title: 'Exposed electrical cable on 11th Ave',
      description:
        'Streetlight access panel open with exposed live wiring near sidewalk.',
    };

    const degraded = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(degraded.status).toBe(200);
    const parsedDegraded = TriageResponseSchema.parse(degraded.json);
    expect(parsedDegraded.metadata.engine).toBe('nlp-fallback');
    expect(['rate_limited', 'quota_exceeded']).toContain(
      parsedDegraded.metadata.fallbackReason,
    );

    const recovered = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(recovered.status).toBe(200);
    const parsedRecovered = TriageResponseSchema.parse(recovered.json);
    expect(parsedRecovered.metadata.engine).toBe('gemini');
    expect(parsedRecovered.metadata.cacheHit).toBe(false);
    expect(genaiMockState.calls).toHaveLength(2);
  });

  it('T3-03 (F3+F7+F4): XSS payload over HTTP is neutralized/rejected with security headers and zero secret leak', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: 'SENTINEL_KEY_XSS_CHECK_7788',
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const res = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '<script>alert(1)</script> Broken curb',
        description: 'javascript:alert(document.cookie) sidewalk crack.',
      }),
    });

    expect([200, 400]).toContain(res.status);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.text).not.toMatch(/<script/i);
    expect(res.text).not.toMatch(/javascript:/i);
    expect(res.text).not.toContain('SENTINEL_KEY_XSS_CHECK_7788');
  });

  it('T3-04 (F7+F3): Endpoint switches cleanly between STRICT_AUTH_LOCKDOWN=false and true', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
    });
    const openRes = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Overflowing trash container',
        description: 'Garbage bin overflowing near park bench.',
      }),
    });
    expect(openRes.status).toBe(200);
    await activeServer.close();
    activeServer = null;

    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'true',
    });
    const lockedRes = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Overflowing trash container',
        description: 'Garbage bin overflowing near park bench.',
      }),
    });
    expect(lockedRes.status).toBe(401);

    const bearerRes = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer valid-demo-token',
      },
      body: JSON.stringify({
        title: 'Overflowing trash container',
        description: 'Garbage bin overflowing near park bench.',
      }),
    });
    expect(bearerRes.status).toBe(200);
  });

  it('T3-05 (F4+F9): Gemini TriageResponse maps cleanly into HybridIssueRepository.createIssue', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: 'test-gemini-key',
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const title = 'Damaged manhole cover near River Park';
    const description =
      'Cracked steel manhole lid wobbling under bus traffic on River Rd.';
    const triageHttp = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, description }),
    });
    expect(triageHttp.status).toBe(200);
    const triageResp = TriageResponseSchema.parse(triageHttp.json);

    const repo = await loadHybridRepository();
    const citizen = makeSession({ uid: 'citizen-t3-05' });
    const created = await repo.createIssue(
      triageToCreateInput(title, description, triageResp, {
        lat: 12.9716,
        lng: 77.5946,
        address: 'River Rd & 2nd',
        imageDataUrl: createSampleWebpDataUrl(512),
      }),
      citizen,
    );

    expect(CivicIssueSchema.safeParse(created).success).toBe(true);
    expect(created.category).toBe(triageResp.triage.category);
    expect(created.priorityLevel).toBe(triageResp.triage.priorityLevel);
    expect(created.urgencyScore).toBe(triageResp.triage.urgencyScore);
    expect(created.triageMeta.engine).toBe('gemini');
  });

  it('T3-06 (F6+F9): Zero-key offline NLP triage persists to local HybridIssueRepository and filters by department', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const title = 'Burst water pipe flooding Maple Street';
    const description =
      'High-pressure water leak and broken sewage pipe flooding sidewalk.';
    const triageHttp = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, description }),
    });
    expect(triageHttp.status).toBe(200);
    const triageResp = TriageResponseSchema.parse(triageHttp.json);
    expect(triageResp.metadata.engine).toBe('nlp-fallback');
    expect(triageResp.triage.recommendedDepartment).toBe('Water & Sewage');

    const repo = await loadHybridRepository();
    expect(repo.getStorageMode()).toBe('local');
    const created = await repo.createIssue(
      triageToCreateInput(title, description, triageResp, {
        lat: 12.972,
        lng: 77.595,
        address: 'Maple Street 44',
      }),
      makeSession({ uid: 'offline-citizen' }),
    );

    const filtered = await repo.listIssues({
      department: 'Water & Sewage',
      limitCount: 50,
    });
    expect(filtered.some((item) => item.id === created.id)).toBe(true);
  });

  it('T3-07 (F9+F10): signInAsGuest creates issue and upvoteIssue increments once without double-counting', async () => {
    const auth = await loadAuthService();
    const repo = await loadHybridRepository();

    const guest1 = await auth.signInAsGuest();
    const created = await repo.createIssue(
      triageToCreateInput(
        'Streetlight outage on Pine Ave',
        'Pole #8 light completely dark near pedestrian tunnel.',
        {
          triage: createSampleTriageResult({
            category: 'Streetlight & Electrical',
            recommendedDepartment: 'Electrical & Streetlights',
          }),
          metadata: {
            engine: 'nlp-fallback',
            model: 'civic-nlp-v1',
            cacheHit: false,
            cacheKey: 'c'.repeat(64),
            fallbackReason: 'missing_api_key',
            latencyMs: 3,
            timestamp: '2026-11-21T06:00:00.000Z',
          },
        },
        { lat: 12.97, lng: 77.59, address: 'Pine Ave' },
      ),
      guest1,
    );
    expect(created.upvoteCount).toBe(1);

    const voter = makeSession({ uid: `${guest1.uid}-second-voter` });
    const upvoted = await repo.upvoteIssue(created.id, voter);
    expect(upvoted.upvoteCount).toBe(2);

    try {
      const duplicate = await repo.upvoteIssue(created.id, voter);
      expect(duplicate.upvoteCount).toBe(2);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
    }

    const persisted = await repo.getIssueById(created.id);
    expect(persisted?.upvoteCount).toBe(2);
  });

  it('T3-08 (F9+F10): Preview Admin resolves issue in local sandbox while Guest updateIssue is denied', async () => {
    const auth = await loadAuthService();
    const repo = await loadHybridRepository();

    const guest = await auth.signInAsGuest();
    const created = await repo.createIssue(
      triageToCreateInput(
        'Illegal garbage dumping near creek',
        'Construction rubble dumped beside creek walkway.',
        {
          triage: createSampleTriageResult({
            category: 'Garbage & Illegal Dumping',
            recommendedDepartment: 'Sanitation & Waste',
          }),
          metadata: {
            engine: 'nlp-fallback',
            model: 'civic-nlp-v1',
            cacheHit: false,
            cacheKey: 'd'.repeat(64),
            fallbackReason: 'missing_api_key',
            latencyMs: 2,
            timestamp: '2026-11-21T06:00:00.000Z',
          },
        },
        { lat: 12.96, lng: 77.58, address: 'Creek Trail' },
      ),
      guest,
    );

    await expect(
      repo.updateIssue(
        created.id,
        { status: 'Resolved', resolutionNotes: 'Guest cannot resolve' },
        guest,
      ),
    ).rejects.toThrow();

    const previewAdmin = await auth.signInAsPreviewAdmin();
    const resolved = await repo.updateIssue(
      created.id,
      {
        status: 'Resolved',
        resolutionNotes: 'Sanitation crew cleared debris.',
      },
      previewAdmin,
    );
    expect(resolved.status).toBe('Resolved');
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.resolutionNotes).toBe('Sanitation crew cleared debris.');
  });

  it('T3-09 (F2+F8+F9): Cross-layer WebP <= 120 KB (<= 165000 chars) invariant aligns across schemas, rules, and repo', async () => {
    const validWebp = createSampleWebpDataUrl(MAX_STORED_WEBP_BYTES);
    const overWebp = createSampleWebpDataUrl(MAX_STORED_WEBP_BYTES + 1);
    const pngDataUrl = `data:image/png;base64,${createSampleRawImageBase64('image/png', 128)}`;

    const validInput: IssueCreateInput = {
      title: 'Cross-layer WebP validation test',
      description: 'Testing exact 120 KB WebP storage limit across all layers.',
      category: 'Pothole & Road Damage',
      location: { lat: 12.97, lng: 77.59, address: '1st Cross' },
      priorityLevel: 'Medium',
      urgencyScore: 5,
      recommendedDepartment: 'Roads & Infrastructure',
      slaEstimateHours: 48,
      slaSummary: 'Within 48 hours',
      triageMeta: {
        engine: 'nlp-fallback',
        model: 'civic-nlp-v1',
        cacheHit: false,
        authenticityStatus: 'uncertain',
        authenticityReason: 'Boundary verification.',
        potentialDuplicateIds: [],
        highestSimilarity: 0,
      },
      imageDataUrl: validWebp,
    };

    expect(IssueCreateSchema.safeParse(validInput).success).toBe(true);
    expect(
      IssueCreateSchema.safeParse({ ...validInput, imageDataUrl: overWebp })
        .success,
    ).toBe(false);
    expect(
      IssueCreateSchema.safeParse({ ...validInput, imageDataUrl: pngDataUrl })
        .success,
    ).toBe(false);

    const validator = await loadImageValidation();
    expect(validator.validateStoredWebpDataUrl(validWebp).valid).toBe(true);
    expect(validator.validateStoredWebpDataUrl(overWebp).valid).toBe(false);
    expect(validator.validateStoredWebpDataUrl(pngDataUrl).valid).toBe(false);

    expect(existsSync('firestore.rules')).toBe(true);
    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain('data:image/webp;base64,');
    expect(rules).toContain('165000');

    const repo = await loadHybridRepository();
    const session = makeSession({ uid: 'webp-invariant-user' });
    const created = await repo.createIssue(validInput, session);
    expect(created.imageDataUrl).toBe(validWebp);
    await expect(
      repo.createIssue({ ...validInput, imageDataUrl: overWebp }, session),
    ).rejects.toThrow();
    await expect(
      repo.createIssue({ ...validInput, imageDataUrl: pngDataUrl }, session),
    ).rejects.toThrow();
  });

  it('T3-10 (F1+F7): Repo and live API endpoints never expose VITE_GEMINI* or GEMINI_API_KEY', async () => {
    const envExample = readFileSync('.env.example', 'utf8');
    const vercelJson = readFileSync('vercel.json', 'utf8');
    expect(envExample).not.toMatch(/VITE_GEMINI/i);
    expect(vercelJson).not.toMatch(/VITE_GEMINI/i);

    const files = listWorkspaceFiles(['ts', 'tsx']);
    for (const filePath of files) {
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.includes('/shared/') || normalized.includes('/src/')) {
        const text = readWorkspaceTextFile(filePath);
        expect(text).not.toMatch(/VITE_GEMINI|GEMINI_API_KEY/);
      }
    }

    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: 'SENTINEL_T3_10_SECRET_5566',
      STRICT_AUTH_LOCKDOWN: 'false',
    });
    const health = await activeServer.fetchJson('/api/health');
    const triage = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Flickering park floodlight',
        description: 'Sports field pole #3 flickers continuously after sunset.',
      }),
    });

    expect(health.text).not.toContain('SENTINEL_T3_10_SECRET_5566');
    expect(triage.text).not.toContain('SENTINEL_T3_10_SECRET_5566');
  });

  it('T3-11 (F4/F6+F9): Stored HybridIssueRepository issues passed as nearbyIssues trigger duplicate detection', async () => {
    const repo = await loadHybridRepository();
    const citizen = makeSession({ uid: 'dup-seed-citizen' });
    const stored = await repo.createIssue(
      triageToCreateInput(
        'Collapsed pothole at Oak St & 7th Ave',
        'Deep pothole filled with rainwater at Oak St & 7th Ave corner.',
        {
          triage: createSampleTriageResult(),
          metadata: {
            engine: 'nlp-fallback',
            model: 'civic-nlp-v1',
            cacheHit: false,
            cacheKey: 'e'.repeat(64),
            fallbackReason: 'missing_api_key',
            latencyMs: 2,
            timestamp: '2026-11-21T06:00:00.000Z',
          },
        },
        { lat: 12.9716, lng: 77.5946, address: 'Oak St & 7th Ave' },
      ),
      citizen,
    );

    const existing = await repo.listIssues({ limitCount: 50 });
    const nearbyIssues = existing.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      lat: item.location.lat,
      lng: item.location.lng,
      status: item.status,
    }));

    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const triageHttp = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Collapsed pothole at Oak St & 7th Ave',
        description:
          'Deep pothole filled with rainwater at Oak St & 7th Ave corner.',
        location: { lat: 12.97162, lng: 77.59462, address: 'Oak St & 7th Ave' },
        nearbyIssues,
      }),
    });

    expect(triageHttp.status).toBe(200);
    const parsed = TriageResponseSchema.parse(triageHttp.json);
    expect(parsed.triage.duplicateDetection.isLikelyDuplicate).toBe(true);
    expect(parsed.triage.duplicateDetection.matchedIssueIds).toContain(
      stored.id,
    );
  });

  it('T3-12 (F1+F8): Spark-only $0 architecture invariant holds across package.json, firebase.json, rules, and config.ts', () => {
    const pkg = readFileSync('package.json', 'utf8');
    const firebaseJson = readFileSync('firebase.json', 'utf8');
    expect(pkg).not.toMatch(/firebase-functions|@google-cloud\/storage|firebase-admin/);
    expect(firebaseJson).not.toMatch(/"storage"|"functions"/);

    expect(existsSync('firestore.rules')).toBe(true);
    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain('service cloud.firestore');

    expect(existsSync('src/lib/firebase/config.ts')).toBe(true);
    const fbConfig = readFileSync('src/lib/firebase/config.ts', 'utf8');
    expect(fbConfig).not.toMatch(/firebase\/storage|firebase\/functions/);
  });
});

describe('Tier 4 — Real-World Civic Application Scenarios', () => {
  let activeServer: EphemeralServerHandle | null = null;
  let lsController: LocalStorageShimController | null = null;
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    resetGenAIMockState(genaiMockState);
    lsController = installLocalStorageShim();
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: undefined,
      GEMINI_MODEL: 'gemini-2.5-flash',
      STRICT_AUTH_LOCKDOWN: 'false',
      ALLOWED_ORIGINS: 'http://localhost:5173',
      VITE_FIREBASE_API_KEY: undefined,
      VITE_FIREBASE_PROJECT_ID: undefined,
    });
  });

  afterEach(async () => {
    if (activeServer !== null) {
      await activeServer.close();
      activeServer = null;
    }
    if (lsController !== null) {
      lsController.restore();
      lsController = null;
    }
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T4-01: Zero-Key Showcase Citizen Journey (health -> guest login -> NLP triage -> local repo -> dept filter)', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const health = await activeServer.fetchJson('/api/health');
    expect(health.status).toBe(200);
    if (isRecord(health.json)) {
      const ai = Reflect.get(health.json, 'ai');
      expect(isRecord(ai)).toBe(true);
      if (isRecord(ai)) {
        expect(Reflect.get(ai, 'configured')).toBe(false);
        expect(Reflect.get(ai, 'mode')).toBe('nlp-fallback');
      }
    }

    const auth = await loadAuthService();
    const guest = await auth.signInAsGuest();
    expect(guest.role).toBe('citizen');

    const title = 'Emergency burst water main flooding 4th Ave';
    const description =
      'High-pressure broken water pipe and sewage backup flooding residential street.';
    const triageRes = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        location: { lat: 12.975, lng: 77.599, address: '4th Ave & Cedar' },
      }),
    });
    expect(triageRes.status).toBe(200);
    const triage = TriageResponseSchema.parse(triageRes.json);
    expect(triage.metadata.engine).toBe('nlp-fallback');
    expect(triage.triage.recommendedDepartment).toBe('Water & Sewage');
    expect(triage.triage.urgencyScore).toBeGreaterThanOrEqual(7);

    const repo = await loadHybridRepository();
    expect(repo.getStorageMode()).toBe('local');
    const created = await repo.createIssue(
      triageToCreateInput(title, description, triage, {
        lat: 12.975,
        lng: 77.599,
        address: '4th Ave & Cedar',
      }),
      guest,
    );

    const waterIssues = await repo.listIssues({
      department: 'Water & Sewage',
      limitCount: 50,
    });
    expect(waterIssues.some((item) => item.id === created.id)).toBe(true);
  });

  it('T4-02: Multimodal Photo Triage & Duplicate Upvote Boost across two citizens', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: 'test-gemini-key',
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const auth = await loadAuthService();
    const repo = await loadHybridRepository();
    const validator = await loadImageValidation();

    const citizen1 = await auth.signInAsGuest();
    const webpDataUrl = createSampleWebpDataUrl(800);
    expect(validator.validateStoredWebpDataUrl(webpDataUrl).valid).toBe(true);

    const title1 = 'Deep pothole near Central Metro Gate 2';
    const desc1 =
      'Large pothole outside Central Metro Gate 2 causing commuter falls.';
    const triage1Http = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: title1,
        description: desc1,
        imageBase64: webpDataUrl,
        imageMimeType: 'image/webp',
        location: { lat: 12.9716, lng: 77.5946, address: 'Metro Gate 2' },
      }),
    });
    const triage1 = TriageResponseSchema.parse(triage1Http.json);
    expect(triage1.metadata.engine).toBe('gemini');

    const storedIssue: CivicIssue = await repo.createIssue(
      triageToCreateInput(title1, desc1, triage1, {
        lat: 12.9716,
        lng: 77.5946,
        address: 'Metro Gate 2',
        imageDataUrl: webpDataUrl,
      }),
      citizen1,
    );
    expect(storedIssue.upvoteCount).toBe(1);

    const nearby = (await repo.listIssues({ limitCount: 50 })).map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      lat: item.location.lat,
      lng: item.location.lng,
      status: item.status,
    }));

    genaiMockState.queue.push({
      kind: 'triage',
      result: createSampleTriageResult({
        duplicateDetection: {
          isLikelyDuplicate: true,
          matchedIssueIds: [storedIssue.id],
          highestSimilarity: 0.94,
          reason: 'Matches existing pothole outside Central Metro Gate 2.',
        },
      }),
    });

    const triage2Http = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Pothole right at Metro Gate 2 exit',
        description: 'Same deep asphalt hole outside Gate 2.',
        location: { lat: 12.97162, lng: 77.59462, address: 'Metro Gate 2' },
        nearbyIssues: nearby,
      }),
    });
    const triage2 = TriageResponseSchema.parse(triage2Http.json);
    expect(triage2.triage.duplicateDetection.isLikelyDuplicate).toBe(true);
    expect(triage2.triage.duplicateDetection.matchedIssueIds).toContain(
      storedIssue.id,
    );

    const citizen2Base = await auth.signInAsGuest();
    const citizen2 =
      citizen2Base.uid === citizen1.uid
        ? makeSession({ ...citizen2Base, uid: `${citizen1.uid}-citizen-2` })
        : citizen2Base;
    const boosted = await repo.upvoteIssue(storedIssue.id, citizen2);
    expect(boosted.upvoteCount).toBe(2);
  });

  it('T4-03: Admin Command Center Triage & Resolution lifecycle with 1-click Preview Admin', async () => {
    const auth = await loadAuthService();
    const repo = await loadHybridRepository();

    const citizen = await auth.signInAsGuest();
    const created = await repo.createIssue(
      triageToCreateInput(
        'Downed streetlight pole blocking lane',
        'Metal streetlight pole leaning across eastbound traffic lane.',
        {
          triage: createSampleTriageResult({
            category: 'Streetlight & Electrical',
            priorityLevel: 'Critical',
            urgencyScore: 10,
            recommendedDepartment: 'Electrical & Streetlights',
          }),
          metadata: {
            engine: 'nlp-fallback',
            model: 'civic-nlp-v1',
            cacheHit: false,
            cacheKey: 'f'.repeat(64),
            fallbackReason: 'missing_api_key',
            latencyMs: 2,
            timestamp: '2026-11-21T06:00:00.000Z',
          },
        },
        { lat: 12.971, lng: 77.594, address: 'Ring Road East' },
      ),
      citizen,
    );

    await expect(
      repo.updateIssue(
        created.id,
        { status: 'Resolved', resolutionNotes: 'Citizen override' },
        citizen,
      ),
    ).rejects.toThrow();

    const admin = await auth.signInAsPreviewAdmin();
    expect(admin.role).toBe('admin');
    expect(await admin.getIdToken()).toBeNull();

    const openReported = await repo.listIssues({
      status: 'Reported',
      limitCount: 50,
    });
    expect(openReported.some((item) => item.id === created.id)).toBe(true);

    const resolved = await repo.updateIssue(
      created.id,
      {
        assignedDepartment: 'Public Safety',
        status: 'Resolved',
        resolutionNotes: 'Emergency crew removed downed pole and restored power.',
      },
      admin,
    );
    expect(resolved.status).toBe('Resolved');
    expect(resolved.assignedDepartment).toBe('Public Safety');
    expect(resolved.resolvedAt).not.toBeNull();

    const fetched = await repo.getIssueById(created.id);
    expect(fetched?.status).toBe('Resolved');

    const resolvedList = await repo.listIssues({
      status: 'Resolved',
      limitCount: 50,
    });
    expect(resolvedList.some((item) => item.id === created.id)).toBe(true);

    const stillReported = await repo.listIssues({
      status: 'Reported',
      limitCount: 50,
    });
    expect(stillReported.some((item) => item.id === created.id)).toBe(false);
  });

  it('T4-04: Quota Surge & Graceful Recovery preserves cache hits and upgrades degraded issues once quota recovers', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: 'test-gemini-key',
      STRICT_AUTH_LOCKDOWN: 'false',
    });

    const issueA = {
      title: 'Pothole A on North Corridor',
      description: 'Large pothole damaging commuter cars on North Corridor.',
    };
    const issueB = {
      title: 'Streetlight B out near subway',
      description: 'Subway plaza lamp post completely unlit after dark.',
    };

    const resA1 = TriageResponseSchema.parse(
      (
        await activeServer.fetchJson('/api/triage', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(issueA),
        })
      ).json,
    );
    expect(resA1.metadata.engine).toBe('gemini');
    expect(resA1.metadata.cacheHit).toBe(false);

    genaiMockState.queue.push({
      kind: 'error',
      status: 429,
      message: 'Quota exhausted during peak surge',
    });

    const resBDegraded = TriageResponseSchema.parse(
      (
        await activeServer.fetchJson('/api/triage', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(issueB),
        })
      ).json,
    );
    expect(resBDegraded.metadata.engine).toBe('nlp-fallback');
    expect(['rate_limited', 'quota_exceeded']).toContain(
      resBDegraded.metadata.fallbackReason,
    );

    const callsBeforeCachedHit = genaiMockState.calls.length;
    const resACached = TriageResponseSchema.parse(
      (
        await activeServer.fetchJson('/api/triage', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(issueA),
        })
      ).json,
    );
    expect(resACached.metadata.engine).toBe('gemini');
    expect(resACached.metadata.cacheHit).toBe(true);
    expect(genaiMockState.calls).toHaveLength(callsBeforeCachedHit);

    const resBRecovered = TriageResponseSchema.parse(
      (
        await activeServer.fetchJson('/api/triage', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(issueB),
        })
      ).json,
    );
    expect(resBRecovered.metadata.engine).toBe('gemini');
    expect(resBRecovered.metadata.cacheHit).toBe(false);
  });

  it('T4-05: Hostile Input & Rate-Limit Defense blocks attacks cleanly and keeps health green', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: 'SENTINEL_DEFENSE_SECRET_1122',
      STRICT_AUTH_LOCKDOWN: 'false',
      ALLOWED_ORIGINS: 'http://localhost:5173',
      RATE_LIMIT_MAX: '5',
      RATE_LIMIT_WINDOW_MS: '60000',
    });

    const xssRes = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({
        title: '<script>fetch("https://evil.example")</script> Pothole',
        description: 'Malicious payload injection test for civic portal.',
      }),
    });
    expect([200, 400]).toContain(xssRes.status);
    expect(xssRes.headers.get('access-control-allow-origin')).not.toBe(
      'https://evil.example',
    );
    expect(xssRes.text).not.toContain('SENTINEL_DEFENSE_SECRET_1122');

    const malformedRes = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"title": "Broken JSON',
    });
    expect(malformedRes.status).toBe(400);

    const svgRes = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Disguised SVG upload attempt',
        description: 'Testing server rejection of SVG payload disguised as image.',
        imageBase64: `data:image/svg+xml;base64,${createDisguisedSvgBase64()}`,
      }),
    });
    expect(svgRes.status).toBe(400);

    const repo = await loadHybridRepository();
    await expect(
      repo.createIssue(
        {
          title: 'Oversized stored WebP attempt',
          description: 'Must fail repository validation before persistence.',
          category: 'Pothole & Road Damage',
          location: { lat: 12.97, lng: 77.59, address: 'Main St' },
          priorityLevel: 'Low',
          urgencyScore: 2,
          recommendedDepartment: 'Roads & Infrastructure',
          slaEstimateHours: 72,
          slaSummary: 'Within 72 hours',
          triageMeta: {
            engine: 'nlp-fallback',
            model: 'civic-nlp-v1',
            cacheHit: false,
            authenticityStatus: 'uncertain',
            authenticityReason: 'Test',
            potentialDuplicateIds: [],
            highestSimilarity: 0,
          },
          imageDataUrl: createSampleWebpDataUrl(MAX_STORED_WEBP_BYTES + 1),
        },
        makeSession({ uid: 'hostile-repo-user' }),
      ),
    ).rejects.toThrow();

    let sawRateLimit = false;
    for (let i = 0; i < 120; i += 1) {
      const burst = await activeServer.fetchJson('/api/triage', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.88',
        },
        body: JSON.stringify({
          title: `Burst request ${i} pothole`,
          description: `Triggering rate limiter check iteration ${i}.`,
        }),
      });
      if (burst.status === 429) {
        expect(burst.headers.get('retry-after')).toBeTruthy();
        sawRateLimit = true;
        break;
      }
    }
    expect(sawRateLimit).toBe(true);

    const healthAfter = await activeServer.fetchJson('/api/health');
    expect(healthAfter.status).toBe(200);
    if (isRecord(healthAfter.json)) {
      expect(Reflect.get(healthAfter.json, 'ok')).toBe(true);
    }
  });

  it('T4-06: Production Auth Lockdown Mode enforces Bearer token on /api/triage and reports authLockdown: true on /api/health', async () => {
    activeServer = await startEphemeralServer({
      GEMINI_API_KEY: 'test-gemini-key',
      STRICT_AUTH_LOCKDOWN: 'true',
    });

    const health = await activeServer.fetchJson('/api/health');
    expect(health.status).toBe(200);
    if (isRecord(health.json)) {
      const security = Reflect.get(health.json, 'security');
      expect(isRecord(security)).toBe(true);
      if (isRecord(security)) {
        expect(Reflect.get(security, 'authLockdown')).toBe(true);
      }
    }

    const unauth = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Locked triage without bearer token',
        description: 'Must be rejected with 401 when lockdown is active.',
      }),
    });
    expect(unauth.status).toBe(401);

    const authed = await activeServer.fetchJson('/api/triage', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer verified-firebase-id-token',
      },
      body: JSON.stringify({
        title: 'Locked triage with valid bearer token',
        description: 'Authorized citizen submission under lockdown mode.',
      }),
    });
    expect(authed.status).toBe(200);
    const parsed = TriageResponseSchema.parse(authed.json);
    expect(parsed.metadata.engine).toBe('gemini');
    expect(requireAt(genaiMockState.calls, 0, 'authed call').model).toBe(
      'gemini-2.5-flash',
    );
  });
});
