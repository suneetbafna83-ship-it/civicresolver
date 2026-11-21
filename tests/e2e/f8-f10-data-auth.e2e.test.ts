import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CivicIssueSchema } from '../../shared/schemas/issue.js';
import {
  DEPARTMENTS,
  MAX_ISSUES_LIMIT,
  MAX_RAW_UPLOAD_IMAGE_BYTES,
  MAX_STORED_WEBP_BYTES,
  MAX_STORED_WEBP_DATA_URL_LENGTH,
  PRIORITY_LEVELS,
  WEBP_DATA_URL_PREFIX,
  type CivicSession,
  type Department,
  type PriorityLevel,
} from '../../shared/types/civic.js';
import {
  applyTestEnv,
  createSampleIssueInput,
  createSampleJpegBuffer,
  createSamplePngBuffer,
  createSampleRawImageBase64,
  createSampleWebpDataUrl,
  installLocalStorageShim,
  isRecord,
  loadAuthService,
  loadHybridRepository,
  loadImageValidation,
  loadLocalRepository,
  makeSession,
  resetFirebaseAuthMockState,
  withoutLocalStorage,
  type FirebaseAuthMockState,
  type LocalStorageShimController,
} from './helpers/e2eHarness.js';

const firebaseAuthMockState = vi.hoisted(
  (): FirebaseAuthMockState => ({
    emailSignInCalls: [],
    emailCreateCalls: [],
    googlePopupCalls: 0,
    googleRedirectCalls: 0,
    anonymousCalls: 0,
    signOutCalls: 0,
    nextPopupError: null,
    nextEmailError: null,
    currentUser: null,
    listeners: [],
  }),
);

vi.mock('firebase/app', async () => {
  const harness = await import('./helpers/e2eHarness.js');
  return harness.createFirebaseAppMockModule();
});

vi.mock('firebase/auth', async () => {
  const harness = await import('./helpers/e2eHarness.js');
  return harness.createFirebaseAuthMockModule(firebaseAuthMockState);
});

vi.mock('firebase/firestore', async () => {
  const harness = await import('./helpers/e2eHarness.js');
  return harness.createFirebaseFirestoreMockModule();
});

function readFirestoreRules(): string {
  expect(existsSync('firestore.rules')).toBe(true);
  return readFileSync('firestore.rules', 'utf8');
}

describe('Tier 1 — F8: Spark Plan firestore.rules & Indexes', () => {
  it('T1-F8-01: firestore.rules uses rules_version 2 and a default deny catch-all', () => {
    const rules = readFirestoreRules();
    expect(rules).toMatch(/rules_version\s*=\s*['"]2['"]\s*;/);
    expect(rules).toContain('service cloud.firestore');
    expect(rules).toMatch(
      /match\s+\/\{document=\*\*\}\s*\{[\s\S]*allow\s+read,\s*write:\s*if\s+false\s*;/,
    );
  });

  it('T1-F8-02: issues/{issueId} splits allow get and allow list with limit <= 50', () => {
    const rules = readFirestoreRules();
    expect(rules).toMatch(/match\s+\/issues\/\{issueId\}/);
    expect(rules).toMatch(/allow\s+get\s*:/);
    expect(rules).toMatch(/allow\s+list\s*:[\s\S]*request\.query\.limit\s*<=\s*50/);

    const getClauseMatch = /allow\s+get\s*:[^;]*;/.exec(rules);
    expect(getClauseMatch).not.toBeNull();
    if (getClauseMatch !== null) {
      expect(getClauseMatch[0]).not.toContain('request.query');
    }
  });

  it('T1-F8-03: issues rules forbid PII and constrain imageDataUrl to <= 165000 char WebP', () => {
    const rules = readFirestoreRules();
    expect(rules).toContain('data:image/webp;base64,');
    expect(rules).toContain('165000');
    expect(rules).toMatch(/hasOnly|!.*(?:email|phone|ipAddress)/);
    expect(rules).toMatch(
      /(?:imageDataUrl|value)\s*==\s*null[\s\S]*(?:imageDataUrl|value)\s+is\s+string/,
    );
  });

  it('T1-F8-04: issue_votes enforces deterministic {issueId}_{uid} IDs and replay-safe getAfter()', () => {
    const rules = readFirestoreRules();
    expect(rules).toMatch(/match\s+\/issue_votes\/\{voteId\}/);
    expect(rules).toMatch(/_\s*'\s*\+\s*request\.auth\.uid|issueId\s*\+\s*'_'\s*\+\s*request\.auth\.uid/);
    expect(rules).toContain('getAfter(');
  });

  it('T1-F8-05: admins/{uid} allows read-own-only get and forbids list and client writes', () => {
    const rules = readFirestoreRules();
    expect(rules).toMatch(/match\s+\/admins\/\{uid\}/);
    expect(rules).toMatch(/request\.auth\.uid\s*==\s*uid/);
    const deniesWrite =
      /allow\s+write:\s*if\s+false\s*;/.test(rules) ||
      /allow\s+list,\s*write:\s*if\s+false\s*;/.test(rules);
    expect(deniesWrite).toBe(true);
  });
});

describe('Tier 2 — F8: Security Rules & Index Boundaries', () => {
  it('T2-F8-01: Rules forbid unauthenticated writes and require verified admin for status edits', () => {
    const rules = readFirestoreRules();
    expect(rules).toContain('request.auth != null');
    expect(rules).toMatch(/admins\/\$\(request\.auth\.uid\)|request\.auth\.token\.admin/);
  });

  it('T2-F8-02: Rules enforce upvoteCount == resource.data.upvoteCount + 1 and strict affectedKeys', () => {
    const rules = readFirestoreRules();
    expect(rules).toMatch(/upvoteCount\s*==\s*resource\.data\.upvoteCount\s*\+\s*1/);
    expect(rules).toContain('affectedKeys()');
  });

  it('T2-F8-03: firestore.indexes.json parses cleanly with composite indexes for issues queries', () => {
    expect(existsSync('firestore.indexes.json')).toBe(true);
    const parsed = JSON.parse(
      readFileSync('firestore.indexes.json', 'utf8'),
    ) as unknown;
    expect(isRecord(parsed)).toBe(true);
    if (isRecord(parsed)) {
      const indexes = Reflect.get(parsed, 'indexes');
      expect(Array.isArray(indexes)).toBe(true);
      if (Array.isArray(indexes)) {
        expect(indexes.length).toBeGreaterThanOrEqual(2);
        for (const entry of indexes) {
          expect(isRecord(entry)).toBe(true);
          if (isRecord(entry)) {
            expect(Reflect.get(entry, 'collectionGroup')).toBe('issues');
            expect(Reflect.get(entry, 'queryScope')).toBe('COLLECTION');
            expect(Array.isArray(Reflect.get(entry, 'fields'))).toBe(true);
          }
        }
      }
    }
  });

  it('T2-F8-04: firebase.json wires Firestore rules and indexes with zero Blaze keys', () => {
    const firebaseJson = JSON.parse(
      readFileSync('firebase.json', 'utf8'),
    ) as unknown;
    expect(isRecord(firebaseJson)).toBe(true);
    if (isRecord(firebaseJson)) {
      const firestore = Reflect.get(firebaseJson, 'firestore');
      expect(isRecord(firestore)).toBe(true);
      if (isRecord(firestore)) {
        expect(Reflect.get(firestore, 'rules')).toBe('firestore.rules');
        expect(Reflect.get(firestore, 'indexes')).toBe(
          'firestore.indexes.json',
        );
      }
      expect(Reflect.get(firebaseJson, 'storage')).toBeUndefined();
      expect(Reflect.get(firebaseJson, 'functions')).toBeUndefined();
    }
  });

  it('T2-F8-05: Rules enforce coordinate bounds, string bounds, and enum constraints', () => {
    const rules = readFirestoreRules();
    expect(rules).toContain('-90');
    expect(rules).toContain('90');
    expect(rules).toContain('-180');
    expect(rules).toContain('180');
    expect(rules).toContain('Reported');
    expect(rules).toContain('In Progress');
    expect(rules).toContain('Resolved');
    expect(rules).toContain('Roads & Infrastructure');
  });
});

describe('Tier 1 — F9: HybridIssueRepository & localStorage Fallback', () => {
  let lsController: LocalStorageShimController | null = null;
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    lsController = installLocalStorageShim();
    restoreEnv = applyTestEnv({
      VITE_FIREBASE_API_KEY: undefined,
      VITE_FIREBASE_AUTH_DOMAIN: undefined,
      VITE_FIREBASE_PROJECT_ID: undefined,
      VITE_FIREBASE_APP_ID: undefined,
    });
  });

  afterEach(() => {
    if (lsController !== null) {
      lsController.restore();
      lsController = null;
    }
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T1-F9-01: Unset Firebase env falls back to local mode with seeded issues spanning all departments and priorities', async () => {
    const repo = await loadHybridRepository();
    expect(repo.getStorageMode()).toBe('local');

    const issues = await repo.listIssues({ limitCount: 50 });
    expect(issues.length).toBeGreaterThanOrEqual(5);

    const seenDepts = new Set<Department>();
    const seenPriorities = new Set<PriorityLevel>();
    for (const issue of issues) {
      expect(CivicIssueSchema.safeParse(issue).success).toBe(true);
      seenDepts.add(issue.assignedDepartment);
      seenPriorities.add(issue.priorityLevel);
    }

    for (const dept of DEPARTMENTS) {
      expect(seenDepts.has(dept)).toBe(true);
    }
    for (const priority of PRIORITY_LEVELS) {
      expect(seenPriorities.has(priority)).toBe(true);
    }
  });

  it('T1-F9-02: listIssues filters accurately by department, status, and limitCount', async () => {
    const repo = await loadHybridRepository();
    const filtered = await repo.listIssues({
      department: 'Roads & Infrastructure',
      status: 'Reported',
      limitCount: 2,
    });

    expect(filtered.length).toBeLessThanOrEqual(2);
    for (const issue of filtered) {
      expect(issue.assignedDepartment).toBe('Roads & Infrastructure');
      expect(issue.status).toBe('Reported');
    }
  });

  it('T1-F9-03: createIssue persists a valid CivicIssue retrievable via getIssueById', async () => {
    const repo = await loadHybridRepository();
    const guestSession = makeSession({
      uid: 'guest-reporter-101',
      displayName: 'Guest Alice',
      isAnonymous: true,
    });

    const created = await repo.createIssue(
      createSampleIssueInput(),
      guestSession,
    );
    expect(CivicIssueSchema.safeParse(created).success).toBe(true);
    expect(created.status).toBe('Reported');
    expect(created.upvoteCount).toBe(1);
    expect(created.reporterUid).toBe('guest-reporter-101');
    expect(created.isGuest).toBe(true);
    expect(created.resolvedAt).toBeNull();

    const fetched = await repo.getIssueById(created.id);
    expect(fetched).toEqual(created);
  });

  it('T1-F9-04: upvoteIssue increments once per uid and prevents duplicate double-counting', async () => {
    const repo = await loadHybridRepository();
    const creator = makeSession({ uid: 'creator-1' });
    const voter1 = makeSession({ uid: 'voter-1' });
    const voter2 = makeSession({ uid: 'voter-2' });

    const created = await repo.createIssue(createSampleIssueInput(), creator);
    expect(created.upvoteCount).toBe(1);

    const afterFirst = await repo.upvoteIssue(created.id, voter1);
    expect(afterFirst.upvoteCount).toBe(2);

    try {
      const afterDuplicate = await repo.upvoteIssue(created.id, voter1);
      expect(afterDuplicate.upvoteCount).toBe(2);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
    }

    const persistedAfterDup = await repo.getIssueById(created.id);
    expect(persistedAfterDup?.upvoteCount).toBe(2);

    const afterSecondVoter = await repo.upvoteIssue(created.id, voter2);
    expect(afterSecondVoter.upvoteCount).toBe(3);
  });

  it('T1-F9-05: updateIssue by admin transitions issue to Resolved with department and resolutionNotes', async () => {
    const repo = await loadHybridRepository();
    const citizen = makeSession({ uid: 'citizen-1', role: 'citizen' });
    const previewAdmin = makeSession({
      uid: 'preview-admin',
      displayName: 'Preview Admin',
      role: 'admin',
      provider: 'preview-admin',
      isAnonymous: false,
      isPreviewAdmin: true,
      isVerifiedFirebaseAdmin: false,
    });

    const created = await repo.createIssue(createSampleIssueInput(), citizen);
    const updated = await repo.updateIssue(
      created.id,
      {
        status: 'Resolved',
        assignedDepartment: 'Public Safety',
        resolutionNotes: 'Crew secured perimeter and patched pavement.',
      },
      previewAdmin,
    );

    expect(updated.status).toBe('Resolved');
    expect(updated.assignedDepartment).toBe('Public Safety');
    expect(updated.resolutionNotes).toBe(
      'Crew secured perimeter and patched pavement.',
    );
    expect(updated.resolvedAt).not.toBeNull();
    expect(Number.isNaN(Date.parse(updated.resolvedAt ?? ''))).toBe(false);
  });
});

describe('Tier 2 — F9: Repository Caps, Image Limits & Storage Resilience', () => {
  let lsController: LocalStorageShimController | null = null;
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    lsController = installLocalStorageShim();
    restoreEnv = applyTestEnv({
      VITE_FIREBASE_API_KEY: undefined,
      VITE_FIREBASE_PROJECT_ID: undefined,
    });
  });

  afterEach(() => {
    if (lsController !== null) {
      lsController.restore();
      lsController = null;
    }
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T2-F9-01: listIssues clamps limitCount > 50 to MAX_ISSUES_LIMIT (50)', async () => {
    const repo = await loadHybridRepository();
    const session = makeSession({ uid: 'bulk-reporter' });

    for (let i = 0; i < 55; i += 1) {
      await repo.createIssue(
        createSampleIssueInput({
          title: `Bulk issue entry #${i} on Main Road`,
          imageDataUrl: null,
        }),
        session,
      );
    }

    const clamped100 = await repo.listIssues({ limitCount: 100 });
    expect(clamped100.length).toBeLessThanOrEqual(MAX_ISSUES_LIMIT);
    expect(clamped100.length).toBe(MAX_ISSUES_LIMIT);

    const clamped51 = await repo.listIssues({ limitCount: 51 });
    expect(clamped51.length).toBeLessThanOrEqual(MAX_ISSUES_LIMIT);
  });

  it('T2-F9-02: createIssue rejects oversized WebP (> 120 KB / > 165000 chars) and non-WebP imageDataUrl before persisting', async () => {
    const repo = await loadHybridRepository();
    const session = makeSession({ uid: 'validator-citizen' });
    const initialCount = (await repo.listIssues({ limitCount: 50 })).length;

    const badImages = [
      createSampleWebpDataUrl(MAX_STORED_WEBP_BYTES + 1),
      `${WEBP_DATA_URL_PREFIX}${'A'.repeat(
        MAX_STORED_WEBP_DATA_URL_LENGTH + 1 - WEBP_DATA_URL_PREFIX.length,
      )}`,
      `data:image/png;base64,${createSampleRawImageBase64('image/png', 128)}`,
      `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
      'https://example.com/external.webp',
    ];

    for (const badImage of badImages) {
      await expect(
        repo.createIssue(
          createSampleIssueInput({ imageDataUrl: badImage }),
          session,
        ),
      ).rejects.toThrow();
    }

    const afterCount = (await repo.listIssues({ limitCount: 50 })).length;
    expect(afterCount).toBe(initialCount);
  });

  it('T2-F9-03: Pre-compression validator enforces <= 5 MB and image-only MIME; stored validator enforces <= 120 KB WebP', async () => {
    const validator = await loadImageValidation();

    const maxValidFile = new File(
      [new Uint8Array(createSampleJpegBuffer(MAX_RAW_UPLOAD_IMAGE_BYTES))],
      'pothole.jpg',
      { type: 'image/jpeg' },
    );
    expect((await validator.validateRawUploadImage(maxValidFile)).valid).toBe(
      true,
    );

    const oversizedFile = new File(
      [new Uint8Array(createSamplePngBuffer(MAX_RAW_UPLOAD_IMAGE_BYTES + 1))],
      'too-big.png',
      { type: 'image/png' },
    );
    expect((await validator.validateRawUploadImage(oversizedFile)).valid).toBe(
      false,
    );

    const exeFile = new File([new Uint8Array([0x4d, 0x5a])], 'malware.exe', {
      type: 'application/x-msdownload',
    });
    expect((await validator.validateRawUploadImage(exeFile)).valid).toBe(false);

    const svgFile = new File([Buffer.from('<svg/>')], 'xss.svg', {
      type: 'image/svg+xml',
    });
    expect((await validator.validateRawUploadImage(svgFile)).valid).toBe(false);

    expect(
      validator.validateStoredWebpDataUrl(
        createSampleWebpDataUrl(MAX_STORED_WEBP_BYTES),
      ).valid,
    ).toBe(true);
    expect(
      validator.validateStoredWebpDataUrl(
        createSampleWebpDataUrl(MAX_STORED_WEBP_BYTES + 1),
      ).valid,
    ).toBe(false);
  });

  it('T2-F9-04: Citizen updateIssue is denied; Preview Admin updateIssue succeeds in local sandbox', async () => {
    const repo = await loadHybridRepository();
    const citizen = makeSession({ uid: 'citizen-user', role: 'citizen' });
    const previewAdmin = makeSession({
      uid: 'preview-admin',
      role: 'admin',
      provider: 'preview-admin',
      isAnonymous: false,
      isPreviewAdmin: true,
      isVerifiedFirebaseAdmin: false,
    });

    const created = await repo.createIssue(createSampleIssueInput(), citizen);

    await expect(
      repo.updateIssue(
        created.id,
        { status: 'Resolved', resolutionNotes: 'Unauthorized attempt' },
        citizen,
      ),
    ).rejects.toThrow();

    const unchanged = await repo.getIssueById(created.id);
    expect(unchanged?.status).toBe('Reported');

    const updated = await repo.updateIssue(
      created.id,
      { status: 'In Progress', resolutionNotes: 'Dispatched local crew.' },
      previewAdmin,
    );
    expect(updated.status).toBe('In Progress');
  });

  it('T2-F9-05: Missing localStorage (SSR) and QuotaExceededError degrade gracefully to in-memory storage', async () => {
    await withoutLocalStorage(async () => {
      vi.resetModules();
      const ssrRepo = await loadLocalRepository();
      const session = makeSession({ uid: 'ssr-citizen' });
      const created = await ssrRepo.createIssue(
        createSampleIssueInput({ imageDataUrl: null }),
        session,
      );
      expect(await ssrRepo.getIssueById(created.id)).toEqual(created);
    });

    if (lsController !== null) {
      lsController.failNextWrite(new Error('QuotaExceededError'));
    }
    vi.resetModules();
    const hybridRepo = await loadHybridRepository();
    const session = makeSession({ uid: 'quota-citizen' });
    const createdDuringQuotaError = await hybridRepo.createIssue(
      createSampleIssueInput({ imageDataUrl: null }),
      session,
    );
    expect(await hybridRepo.getIssueById(createdDuringQuotaError.id)).toEqual(
      createdDuringQuotaError,
    );
  });
});

describe('Tier 1 — F10: Auth Helpers & 1-Click Preview Admin', () => {
  let lsController: LocalStorageShimController | null = null;
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    resetFirebaseAuthMockState(firebaseAuthMockState);
    lsController = installLocalStorageShim();
    restoreEnv = applyTestEnv({
      VITE_FIREBASE_API_KEY: undefined,
      VITE_FIREBASE_AUTH_DOMAIN: undefined,
      VITE_FIREBASE_PROJECT_ID: undefined,
      VITE_FIREBASE_APP_ID: undefined,
    });
  });

  afterEach(() => {
    if (lsController !== null) {
      lsController.restore();
      lsController = null;
    }
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T1-F10-01: signInAsGuest returns citizen session with anonymous flags', async () => {
    const auth = await loadAuthService();
    const session = await auth.signInAsGuest();

    expect(session.role).toBe('citizen');
    expect(session.isAnonymous).toBe(true);
    expect(session.isPreviewAdmin).toBe(false);
    expect(session.isVerifiedFirebaseAdmin).toBe(false);
    expect(session.uid.length).toBeGreaterThan(0);
    expect(['anonymous', 'local-guest']).toContain(session.provider);
  });

  it('T1-F10-02: signInAsPreviewAdmin returns 1-click admin session without verified Firebase admin claim', async () => {
    const auth = await loadAuthService();
    const session = await auth.signInAsPreviewAdmin();

    expect(session.role).toBe('admin');
    expect(session.provider).toBe('preview-admin');
    expect(session.isPreviewAdmin).toBe(true);
    expect(session.isVerifiedFirebaseAdmin).toBe(false);
    expect(session.uid.length).toBeGreaterThan(0);
  });

  it('T1-F10-03: Email/password sign-in and registration return citizen password session', async () => {
    if (restoreEnv !== null) {
      restoreEnv();
    }
    restoreEnv = applyTestEnv({
      VITE_FIREBASE_API_KEY: 'mock-firebase-web-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'civic-sense-43d74.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'civic-sense-43d74',
      VITE_FIREBASE_APP_ID: '1:123456:web:abcdef',
    });
    vi.resetModules();

    const auth = await loadAuthService();
    const registered = await auth.registerWithEmail(
      'citizen@civic.test',
      'StrongPass!2026',
      'Citizen Tester',
    );
    expect(registered.provider).toBe('password');
    expect(registered.role).toBe('citizen');
    expect(registered.email).toBe('citizen@civic.test');
    expect(registered.isAnonymous).toBe(false);
    expect(registered.isPreviewAdmin).toBe(false);

    const signedIn = await auth.signInWithEmail(
      'citizen@civic.test',
      'StrongPass!2026',
    );
    expect(signedIn.provider).toBe('password');
    expect(signedIn.role).toBe('citizen');
    expect(signedIn.email).toBe('citizen@civic.test');
  });

  it('T1-F10-04: Google sign-in flow returns citizen google session', async () => {
    if (restoreEnv !== null) {
      restoreEnv();
    }
    restoreEnv = applyTestEnv({
      VITE_FIREBASE_API_KEY: 'mock-firebase-web-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'civic-sense-43d74.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'civic-sense-43d74',
      VITE_FIREBASE_APP_ID: '1:123456:web:abcdef',
    });
    vi.resetModules();

    const auth = await loadAuthService();
    const session = await auth.signInWithGoogle();
    expect(session).not.toBeNull();
    if (session !== null) {
      expect(session.provider).toBe('google');
      expect(session.role).toBe('citizen');
      expect(session.isAnonymous).toBe(false);
      expect(session.isPreviewAdmin).toBe(false);
    }
  });

  it('T1-F10-05: signOut resets active session and notifies subscribers with null', async () => {
    const auth = await loadAuthService();
    const observed: Array<CivicSession | null> = [];
    const unsubscribe = auth.subscribeAuthSession((sess) => {
      observed.push(sess);
    });

    await auth.signInAsPreviewAdmin();
    expect((await auth.getCurrentSession())?.isPreviewAdmin).toBe(true);

    await auth.signOut();
    expect(await auth.getCurrentSession()).toBeNull();
    expect(observed.at(-1)).toBeNull();
    unsubscribe();
  });
});

describe('Tier 2 — F10: Auth Edge Cases & Privilege Escalation Guards', () => {
  let lsController: LocalStorageShimController | null = null;
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    resetFirebaseAuthMockState(firebaseAuthMockState);
    lsController = installLocalStorageShim();
    restoreEnv = applyTestEnv({
      VITE_FIREBASE_API_KEY: undefined,
      VITE_FIREBASE_AUTH_DOMAIN: undefined,
      VITE_FIREBASE_PROJECT_ID: undefined,
      VITE_FIREBASE_APP_ID: undefined,
    });
  });

  afterEach(() => {
    if (lsController !== null) {
      lsController.restore();
      lsController = null;
    }
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T2-F10-01: Preview Admin getIdToken() resolves to null and never fabricates a Firebase JWT', async () => {
    const auth = await loadAuthService();
    const previewAdmin = await auth.signInAsPreviewAdmin();
    const token = await previewAdmin.getIdToken();
    expect(token).toBeNull();
  });

  it('T2-F10-02: Empty/malformed email or empty password is rejected before calling Firebase SDK', async () => {
    if (restoreEnv !== null) {
      restoreEnv();
    }
    restoreEnv = applyTestEnv({
      VITE_FIREBASE_API_KEY: 'mock-firebase-web-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'civic-sense-43d74.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'civic-sense-43d74',
      VITE_FIREBASE_APP_ID: '1:123456:web:abcdef',
    });
    vi.resetModules();

    const auth = await loadAuthService();
    await expect(auth.signInWithEmail('', 'ValidPass123')).rejects.toThrow();
    await expect(
      auth.signInWithEmail('not-an-email', 'ValidPass123'),
    ).rejects.toThrow();
    await expect(
      auth.signInWithEmail('citizen@civic.test', ''),
    ).rejects.toThrow();
    expect(firebaseAuthMockState.emailSignInCalls).toHaveLength(0);
  });

  it('T2-F10-03: Google popup-blocked error falls back to redirect or returns controlled error', async () => {
    if (restoreEnv !== null) {
      restoreEnv();
    }
    restoreEnv = applyTestEnv({
      VITE_FIREBASE_API_KEY: 'mock-firebase-web-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'civic-sense-43d74.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'civic-sense-43d74',
      VITE_FIREBASE_APP_ID: '1:123456:web:abcdef',
    });
    vi.resetModules();

    firebaseAuthMockState.nextPopupError = {
      code: 'auth/popup-blocked',
      message: 'Popup blocked by browser',
    };

    const auth = await loadAuthService();
    let handledGracefully: boolean;
    try {
      const result = await auth.signInWithGoogle();
      handledGracefully =
        firebaseAuthMockState.googleRedirectCalls > 0 || result === null;
    } catch (err: unknown) {
      handledGracefully = err instanceof Error;
    }
    expect(handledGracefully).toBe(true);
  });

  it('T2-F10-04: Auth guest and Preview Admin remain functional when Firebase env vars are unset', async () => {
    const auth = await loadAuthService();
    const guest = await auth.signInAsGuest();
    expect(guest.role).toBe('citizen');

    const admin = await auth.signInAsPreviewAdmin();
    expect(admin.role).toBe('admin');
    expect(admin.isPreviewAdmin).toBe(true);
  });

  it('T2-F10-05: Citizen sign-in flows cannot self-escalate to admin role or verified admin claims', async () => {
    if (restoreEnv !== null) {
      restoreEnv();
    }
    restoreEnv = applyTestEnv({
      VITE_FIREBASE_API_KEY: 'mock-firebase-web-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'civic-sense-43d74.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'civic-sense-43d74',
      VITE_FIREBASE_APP_ID: '1:123456:web:abcdef',
    });
    vi.resetModules();

    const auth = await loadAuthService();
    const guest = await auth.signInAsGuest();
    const emailUser = await auth.signInWithEmail(
      'citizen@civic.test',
      'StrongPass!2026',
    );
    const googleUser = await auth.signInWithGoogle();

    const sessions = [guest, emailUser, ...(googleUser !== null ? [googleUser] : [])];
    for (const sess of sessions) {
      expect(sess.role).toBe('citizen');
      expect(sess.isPreviewAdmin).toBe(false);
      expect(sess.isVerifiedFirebaseAdmin).toBe(false);
    }
  });
});
