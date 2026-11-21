import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import {
  DEPARTMENTS,
  ISSUE_STATUSES,
  MAX_ISSUES_LIMIT,
  PRIORITY_LEVELS,
  WEBP_DATA_URL_PREFIX,
  type CivicIssue,
  type CivicSession,
  type IssueCreateInput,
} from '../../shared/types/civic.js';
import { CivicIssueSchema } from '../../shared/schemas/issue.js';
import {
  getFirebaseConfig,
  isBrowserOffline,
  isFirebaseConfigured,
} from '../../src/lib/firebase/config.js';
import {
  RepositoryError,
  assertValidStatusTransition,
  clampIssuesLimit,
} from '../../src/lib/repositories/issueRepository.js';
import { createSeedIssues } from '../../src/lib/repositories/seedIssues.js';
import {
  LOCAL_ISSUES_STORAGE_KEY,
  LocalIssueRepository,
  createInMemoryStorage,
} from '../../src/lib/repositories/localIssueRepository.js';
import {
  FirestoreIssueRepository,
  isVerifiedAdminUid,
  type FirestoreDocSnapshotLike,
  type FirestoreOperations,
  type FirestoreTransactionLike,
} from '../../src/lib/repositories/firestoreIssueRepository.js';
import { HybridIssueRepository } from '../../src/lib/repositories/hybridIssueRepository.js';

function createValidWebpDataUrl(byteLength = 32): string {
  const bytes = new Uint8Array(Math.max(12, byteLength));
  bytes[0] = 0x52;
  bytes[1] = 0x49;
  bytes[2] = 0x46;
  bytes[3] = 0x46;
  bytes[8] = 0x57;
  bytes[9] = 0x45;
  bytes[10] = 0x42;
  bytes[11] = 0x50;
  return `${WEBP_DATA_URL_PREFIX}${Buffer.from(bytes).toString('base64')}`;
}

function createSampleIssueInput(overrides?: Partial<IssueCreateInput>): IssueCreateInput {
  return {
    title: 'Collapsed storm drain grate on 4th St',
    description:
      'The metal storm drain cover on 4th Street near the bike lane has collapsed inward creating a deep hazard.',
    category: 'Water Leak & Sewage',
    location: {
      lat: 37.7812,
      lng: -122.4112,
      address: '310 4th St, Soma',
    },
    priorityLevel: 'High',
    urgencyScore: 8,
    recommendedDepartment: 'Water & Sewage',
    slaEstimateHours: 12,
    slaSummary: 'Dispatch drainage repair team within 12 hours',
    triageMeta: {
      engine: 'gemini',
      model: 'gemini-2.5-flash',
      cacheHit: false,
      authenticityStatus: 'likely_authentic',
      authenticityReason: 'Specific infrastructure failure report.',
      potentialDuplicateIds: [],
      highestSimilarity: 0,
    },
    imageDataUrl: null,
    ...overrides,
  };
}

function createCitizenSession(uid = 'citizen-uid-1'): CivicSession {
  return {
    uid,
    displayName: 'Alex Mercer',
    email: 'alex@example.com',
    role: 'citizen',
    provider: 'google',
    isAnonymous: false,
    isPreviewAdmin: false,
    isVerifiedFirebaseAdmin: false,
    getIdToken: async () => 'fake-id-token',
  };
}

function createPreviewAdminSession(): CivicSession {
  return {
    uid: 'preview-admin',
    displayName: 'Preview Admin (Demo)',
    email: null,
    role: 'admin',
    provider: 'preview-admin',
    isAnonymous: false,
    isPreviewAdmin: true,
    isVerifiedFirebaseAdmin: false,
    getIdToken: async () => null,
  };
}

function createVerifiedAdminSession(): CivicSession {
  return {
    uid: 'admin-uid-1',
    displayName: 'City Ops Director',
    email: 'ops@city.gov',
    role: 'admin',
    provider: 'password',
    isAnonymous: false,
    isPreviewAdmin: false,
    isVerifiedFirebaseAdmin: true,
    getIdToken: async () => 'admin-id-token',
  };
}

function createMockFirestoreHarness(initialDocs?: {
  issues?: Record<string, Record<string, unknown>>;
  votes?: Record<string, Record<string, unknown>>;
  admins?: Record<string, Record<string, unknown>>;
}) {
  const issuesStore = new Map<string, Record<string, unknown>>(
    Object.entries(initialDocs?.issues ?? {}),
  );
  const votesStore = new Map<string, Record<string, unknown>>(
    Object.entries(initialDocs?.votes ?? {}),
  );
  const adminsStore = new Map<string, Record<string, unknown>>(
    Object.entries(initialDocs?.admins ?? {}),
  );
  const txCallOrder: string[] = [];
  const recordedLimits: number[] = [];
  const recordedWheres: Array<{ fieldPath: string; value: unknown }> = [];
  let autoIdCounter = 0;

  interface RefDescriptor {
    readonly collectionPath: string;
    readonly id: string;
  }

  type QueryConstraintDescriptor =
    | { readonly kind: 'where'; readonly fieldPath: string; readonly value: unknown }
    | { readonly kind: 'orderBy'; readonly fieldPath: string; readonly dir: string }
    | { readonly kind: 'limit'; readonly count: number };

  interface QueryDescriptor {
    readonly collectionPath: string;
    readonly constraints: ReadonlyArray<QueryConstraintDescriptor>;
  }

  function getCollectionStore(collectionPath: string): Map<string, Record<string, unknown>> {
    switch (collectionPath) {
      case 'issues':
        return issuesStore;
      case 'issue_votes':
        return votesStore;
      case 'admins':
        return adminsStore;
      default:
        return new Map<string, Record<string, unknown>>();
    }
  }

  function materializeDocData(data: Record<string, unknown>): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...data };
    const serverDate = new Date('2026-11-21T10:00:00.000Z');
    const serverTsObj = { toDate: () => serverDate };
    if (copy.createdAt === '__SERVER_TIMESTAMP__') {
      copy.createdAt = serverTsObj;
    }
    if (copy.updatedAt === '__SERVER_TIMESTAMP__') {
      copy.updatedAt = serverTsObj;
    }
    if (copy.resolvedAt === '__SERVER_TIMESTAMP__') {
      copy.resolvedAt = serverTsObj;
    }
    return copy;
  }

  function makeSnap(id: string, raw: Record<string, unknown> | undefined): FirestoreDocSnapshotLike {
    return {
      id,
      exists: () => raw !== undefined,
      data: () => (raw !== undefined ? materializeDocData(raw) : undefined),
    };
  }

  const fakeDb = {} as Firestore;

  const ops: FirestoreOperations = {
    collection(_db, path) {
      return { path } as unknown as ReturnType<FirestoreOperations['collection']>;
    },
    doc(parentOrDb, path?: string, ...pathSegments: string[]) {
      if (path === undefined) {
        const col = parentOrDb as unknown as { path: string };
        autoIdCounter += 1;
        return {
          collectionPath: col.path,
          id: `fs-auto-${autoIdCounter}`,
        } as unknown as ReturnType<FirestoreOperations['doc']>;
      }
      const id = pathSegments[0] ?? '';
      return {
        collectionPath: path,
        id,
      } as unknown as ReturnType<FirestoreOperations['doc']>;
    },
    async getDoc(docRef) {
      const ref = docRef as unknown as RefDescriptor;
      const raw = getCollectionStore(ref.collectionPath).get(ref.id);
      return makeSnap(ref.id, raw);
    },
    async getDocs(q) {
      const desc = q as unknown as QueryDescriptor;
      const store = getCollectionStore(desc.collectionPath);
      let rows = [...store.entries()];
      let limitVal = rows.length;

      for (const c of desc.constraints) {
        if (c.kind === 'where') {
          rows = rows.filter(([, docData]) => {
            if (c.fieldPath === 'assignedDepartment') {
              return docData.assignedDepartment === c.value;
            }
            if (c.fieldPath === 'status') {
              return docData.status === c.value;
            }
            return true;
          });
        } else if (c.kind === 'limit') {
          limitVal = c.count;
        }
      }

      const docs = rows
        .slice(0, limitVal)
        .map(([id, raw]) => makeSnap(id, raw));
      return { docs };
    },
    async setDoc(docRef, data) {
      const ref = docRef as unknown as RefDescriptor;
      getCollectionStore(ref.collectionPath).set(ref.id, { ...data });
    },
    query(col, ...constraints) {
      const colDesc = col as unknown as { path: string };
      return {
        collectionPath: colDesc.path,
        constraints: constraints as unknown as QueryConstraintDescriptor[],
      } as unknown as ReturnType<FirestoreOperations['query']>;
    },
    where(fieldPath, _opStr, value) {
      recordedWheres.push({ fieldPath, value });
      return {
        kind: 'where',
        fieldPath,
        value,
      } as unknown as ReturnType<FirestoreOperations['where']>;
    },
    orderBy(fieldPath, directionStr) {
      return {
        kind: 'orderBy',
        fieldPath,
        dir: directionStr,
      } as unknown as ReturnType<FirestoreOperations['orderBy']>;
    },
    limit(n) {
      recordedLimits.push(n);
      return {
        kind: 'limit',
        count: n,
      } as unknown as ReturnType<FirestoreOperations['limit']>;
    },
    async runTransaction<T>(_db: Firestore, fn: (tx: FirestoreTransactionLike) => Promise<T>) {
      const tx: FirestoreTransactionLike = {
        async get(docRef) {
          const ref = docRef as unknown as RefDescriptor;
          txCallOrder.push(`get:${ref.collectionPath}/${ref.id}`);
          const raw = getCollectionStore(ref.collectionPath).get(ref.id);
          return makeSnap(ref.id, raw);
        },
        set(docRef, data) {
          const ref = docRef as unknown as RefDescriptor;
          txCallOrder.push(`set:${ref.collectionPath}/${ref.id}`);
          getCollectionStore(ref.collectionPath).set(ref.id, { ...data });
          return tx;
        },
        update(docRef, data) {
          const ref = docRef as unknown as RefDescriptor;
          txCallOrder.push(`update:${ref.collectionPath}/${ref.id}`);
          const store = getCollectionStore(ref.collectionPath);
          const existing = store.get(ref.id) ?? {};
          store.set(ref.id, { ...existing, ...data });
          return tx;
        },
      };
      return fn(tx);
    },
    serverTimestamp() {
      return '__SERVER_TIMESTAMP__' as unknown as ReturnType<
        FirestoreOperations['serverTimestamp']
      >;
    },
  };

  return {
    fakeDb,
    ops,
    issuesStore,
    votesStore,
    adminsStore,
    txCallOrder,
    recordedLimits,
    recordedWheres,
  };
}

describe('Firebase Client Config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('rejects partial .env.example defaults and placeholder values', () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', '');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'civic-sense-43d74');
    vi.stubEnv('VITE_FIREBASE_APP_ID', '');
    expect(isFirebaseConfigured()).toBe(false);
    expect(getFirebaseConfig()).toBeNull();

    vi.stubEnv('VITE_FIREBASE_API_KEY', 'your_api_key_here');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', '<auth-domain>');
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'placeholder');
    expect(isFirebaseConfigured()).toBe(false);
  });

  it('returns config when all 4 client env vars are valid and omits storageBucket', () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'AIzaSyTestKey12345');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'civic-sense-43d74.firebaseapp.com');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'civic-sense-43d74');
    vi.stubEnv('VITE_FIREBASE_APP_ID', '1:12345:web:abcdef');

    const cfg = getFirebaseConfig();
    expect(cfg).toEqual({
      apiKey: 'AIzaSyTestKey12345',
      authDomain: 'civic-sense-43d74.firebaseapp.com',
      projectId: 'civic-sense-43d74',
      appId: '1:12345:web:abcdef',
    });
    expect(isFirebaseConfigured()).toBe(true);
    expect('storageBucket' in (cfg as unknown as Record<string, unknown>)).toBe(false);
  });

  it('detects offline state explicitly via navigator.onLine === false', () => {
    expect(isBrowserOffline()).toBe(false);

    vi.stubGlobal('navigator', { onLine: false });
    expect(isBrowserOffline()).toBe(true);

    vi.stubGlobal('navigator', { onLine: true });
    expect(isBrowserOffline()).toBe(false);
  });
});

describe('Seed Issues & Repository Helpers', () => {
  it('generates valid seed issues covering all 5 departments, 4 priorities, and 3 statuses', () => {
    const seeds = createSeedIssues();
    expect(seeds.length).toBeGreaterThanOrEqual(6);

    const departments = new Set<string>();
    const priorities = new Set<string>();
    const statuses = new Set<string>();

    for (const issue of seeds) {
      expect(CivicIssueSchema.safeParse(issue).success).toBe(true);
      departments.add(issue.assignedDepartment);
      priorities.add(issue.priorityLevel);
      statuses.add(issue.status);
      if (issue.status === 'Resolved') {
        expect(issue.resolvedAt).not.toBeNull();
        expect(issue.resolutionNotes).not.toBeNull();
      } else {
        expect(issue.resolvedAt).toBeNull();
      }
    }

    for (const dept of DEPARTMENTS) {
      expect(departments.has(dept)).toBe(true);
    }
    for (const prio of PRIORITY_LEVELS) {
      expect(priorities.has(prio)).toBe(true);
    }
    for (const st of ISSUE_STATUSES) {
      expect(statuses.has(st)).toBe(true);
    }

    // Mutating returned seed should not affect subsequent calls
    const first = seeds[0];
    if (first !== undefined) {
      first.title = 'Mutated title';
    }
    const freshSeeds = createSeedIssues();
    expect(freshSeeds[0]?.title).not.toBe('Mutated title');
  });

  it('clamps issue query limits to 1..50 and validates status transitions', () => {
    expect(clampIssuesLimit(undefined)).toBe(MAX_ISSUES_LIMIT);
    expect(clampIssuesLimit(Number.NaN)).toBe(MAX_ISSUES_LIMIT);
    expect(clampIssuesLimit(0)).toBe(1);
    expect(clampIssuesLimit(-5)).toBe(1);
    expect(clampIssuesLimit(25)).toBe(25);
    expect(clampIssuesLimit(100)).toBe(MAX_ISSUES_LIMIT);

    expect(() => assertValidStatusTransition('Reported', 'In Progress')).not.toThrow();
    expect(() => assertValidStatusTransition('Reported', 'Resolved')).not.toThrow();
    expect(() => assertValidStatusTransition('In Progress', 'Resolved')).not.toThrow();
    expect(() => assertValidStatusTransition('Resolved', 'Resolved')).not.toThrow();

    expect(() => assertValidStatusTransition('In Progress', 'Reported')).toThrow(
      RepositoryError,
    );
    expect(() => assertValidStatusTransition('Resolved', 'In Progress')).toThrow(
      RepositoryError,
    );
  });
});

describe('LocalIssueRepository', () => {
  it('auto-seeds on empty storage, recovers from corrupt JSON, and handles filters & limit clamping', async () => {
    const storage = createInMemoryStorage();
    const repo = new LocalIssueRepository({ storage });

    expect(repo.getStorageMode()).toBe('local');
    const all = await repo.listIssues({ limitCount: 100 });
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(all.length).toBeLessThanOrEqual(MAX_ISSUES_LIMIT);

    // Corrupt storage triggers clean re-seed
    storage.setItem(LOCAL_ISSUES_STORAGE_KEY, '{not-valid-json');
    const recovered = await repo.listIssues();
    expect(recovered.length).toBeGreaterThanOrEqual(6);

    const waterOnly = await repo.listIssues({
      department: 'Water & Sewage',
      status: 'In Progress',
      limitCount: 2,
    });
    expect(waterOnly.length).toBe(1);
    expect(waterOnly[0]?.assignedDepartment).toBe('Water & Sewage');
    expect(waterOnly[0]?.status).toBe('In Progress');
  });

  it('validates real WebP magic bytes and XSS on createIssue, enforces 1-vote-per-UID, and admin updates', async () => {
    const storage = createInMemoryStorage();
    const repo = new LocalIssueRepository({
      storage,
      now: () => new Date('2026-11-21T12:00:00.000Z'),
      idGenerator: () => 'local-test-1',
    });
    const citizen = createCitizenSession('user-a');
    const admin = createPreviewAdminSession();

    // Fake 0x41 WebP fails magic-byte check
    const fake0x41 = `${WEBP_DATA_URL_PREFIX}${Buffer.alloc(64, 0x41).toString('base64')}`;
    await expect(
      repo.createIssue(createSampleIssueInput({ imageDataUrl: fake0x41 }), citizen),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    // XSS fails validation
    await expect(
      repo.createIssue(
        createSampleIssueInput({ title: '<script>alert(1)</script> pothole' }),
        citizen,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    // Valid RIFF+WEBP succeeds
    const created = await repo.createIssue(
      createSampleIssueInput({ imageDataUrl: createValidWebpDataUrl(48) }),
      citizen,
    );
    expect(created.id).toBe('local-test-1');
    expect(created.status).toBe('Reported');
    expect(created.upvoteCount).toBe(1);

    // Upvote + duplicate vote protection
    const upvoted = await repo.upvoteIssue(created.id, citizen);
    expect(upvoted.upvoteCount).toBe(2);
    expect(await repo.hasUserVoted(created.id, citizen.uid)).toBe(true);
    await expect(repo.upvoteIssue(created.id, citizen)).rejects.toMatchObject({
      code: 'DUPLICATE_VOTE',
    });

    // Citizen cannot update issue status
    await expect(
      repo.updateIssue(created.id, { status: 'In Progress' }, citizen),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Admin resolves issue and sets resolvedAt
    const resolved = await repo.updateIssue(
      created.id,
      {
        status: 'Resolved',
        assignedDepartment: 'Roads & Infrastructure',
        resolutionNotes: 'Grate replaced and bolted.',
      },
      admin,
    );
    expect(resolved.status).toBe('Resolved');
    expect(resolved.assignedDepartment).toBe('Roads & Infrastructure');
    expect(resolved.resolvedAt).toBe('2026-11-21T12:00:00.000Z');

    // Reopening from Resolved fails
    await expect(
      repo.updateIssue(created.id, { status: 'In Progress' }, admin),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
  });
});

describe('FirestoreIssueRepository', () => {
  it('enforces limit(<=50), queries assignedDepartment, normalizes Timestamps, and pre-allocates doc id', async () => {
    const harness = createMockFirestoreHarness({
      admins: { 'admin-uid-1': { active: true } },
    });
    const repo = new FirestoreIssueRepository(
      harness.fakeDb,
      harness.ops,
      () => new Date('2026-11-21T10:00:00.000Z'),
    );

    expect(await isVerifiedAdminUid('admin-uid-1', harness.fakeDb, harness.ops)).toBe(true);
    expect(await isVerifiedAdminUid('citizen-uid-1', harness.fakeDb, harness.ops)).toBe(false);

    const created = await repo.createIssue(
      createSampleIssueInput({ imageDataUrl: createValidWebpDataUrl(32) }),
      createCitizenSession('citizen-uid-1'),
    );
    expect(created.id).toBe('fs-auto-1');

    const storedRaw = harness.issuesStore.get('fs-auto-1');
    expect(storedRaw?.id).toBe('fs-auto-1');
    expect(storedRaw?.createdAt).toBe('__SERVER_TIMESTAMP__');
    expect(storedRaw?.resolvedAt).toBeNull();
    expect(storedRaw?.resolutionNotes).toBeNull();

    const listed = await repo.listIssues({
      department: 'Water & Sewage',
      limitCount: 200,
    });
    expect(harness.recordedLimits).toContain(MAX_ISSUES_LIMIT);
    expect(harness.recordedWheres).toContainEqual({
      fieldPath: 'assignedDepartment',
      value: 'Water & Sewage',
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.createdAt).toBe('2026-11-21T10:00:00.000Z');
  });

  it('executes upvoteIssue with read-before-write inside runTransaction and prevents duplicate votes', async () => {
    const harness = createMockFirestoreHarness();
    const repo = new FirestoreIssueRepository(
      harness.fakeDb,
      harness.ops,
      () => new Date('2026-11-21T10:05:00.000Z'),
    );
    const citizen = createCitizenSession('voter-1');
    const created = await repo.createIssue(createSampleIssueInput(), citizen);

    const upvoted = await repo.upvoteIssue(created.id, citizen);
    expect(upvoted.upvoteCount).toBe(2);
    expect(harness.txCallOrder).toEqual([
      `get:issues/${created.id}`,
      `get:issue_votes/${created.id}_voter-1`,
      `update:issues/${created.id}`,
      `set:issue_votes/${created.id}_voter-1`,
    ]);

    await expect(repo.upvoteIssue(created.id, citizen)).rejects.toMatchObject({
      code: 'DUPLICATE_VOTE',
    });
  });

  it('requires isVerifiedFirebaseAdmin for Firestore updateIssue and sets resolvedAt once', async () => {
    const harness = createMockFirestoreHarness();
    const repo = new FirestoreIssueRepository(
      harness.fakeDb,
      harness.ops,
      () => new Date('2026-11-21T10:10:00.000Z'),
    );
    const created = await repo.createIssue(
      createSampleIssueInput(),
      createCitizenSession(),
    );

    await expect(
      repo.updateIssue(
        created.id,
        { status: 'In Progress' },
        createPreviewAdminSession(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const resolved = await repo.updateIssue(
      created.id,
      { status: 'Resolved', resolutionNotes: 'Completed' },
      createVerifiedAdminSession(),
    );
    expect(resolved.status).toBe('Resolved');
    expect(resolved.resolvedAt).toBe('2026-11-21T10:10:00.000Z');
  });
});

describe('HybridIssueRepository', () => {
  it('auto-fails over to LocalIssueRepository on transient Firestore errors without swallowing domain errors', async () => {
    const storage = createInMemoryStorage();
    const localRepo = new LocalIssueRepository({ storage });
    const modeEvents: string[] = [];

    const failingFirestoreRepo = {
      getStorageMode: () => 'firestore' as const,
      listIssues: vi.fn(async () => {
        throw Object.assign(new Error('Service unavailable'), {
          code: 'unavailable',
        });
      }),
      getIssueById: vi.fn(async () => null),
      createIssue: vi.fn(async () => {
        throw new Error('not called');
      }),
      upvoteIssue: vi.fn(async () => {
        throw new RepositoryError('DUPLICATE_VOTE', 'Already voted');
      }),
      updateIssue: vi.fn(async () => {
        throw new Error('not called');
      }),
      hasUserVoted: vi.fn(async () => false),
    };

    const hybrid = new HybridIssueRepository({
      firestoreRepo: failingFirestoreRepo,
      localRepo,
      isFirebaseConfigured: () => true,
      isOnline: () => true,
      onStorageModeChange: (mode) => modeEvents.push(mode),
    });

    expect(hybrid.getStorageMode()).toBe('firestore');

    // Domain error DUPLICATE_VOTE must propagate without tripping failover
    await expect(
      hybrid.upvoteIssue('seed-issue-001', createCitizenSession('u1')),
    ).rejects.toMatchObject({ code: 'DUPLICATE_VOTE' });
    expect(hybrid.getStorageMode()).toBe('firestore');
    expect(modeEvents).toEqual([]);

    // Transient 'unavailable' error triggers automatic failover to local
    const issues = await hybrid.listIssues();
    expect(issues.length).toBeGreaterThanOrEqual(6);
    expect(hybrid.getStorageMode()).toBe('local');
    expect(modeEvents).toEqual(['local']);
  });

  it('routes unverified Preview Admin mutations to local sandbox overlay and merges into list/get', async () => {
    const storage = createInMemoryStorage();
    const localRepo = new LocalIssueRepository({ storage });
    const baseSeed = createSeedIssues()[0] as CivicIssue;
    const remoteIssue: CivicIssue = {
      ...baseSeed,
      id: 'remote-issue-1',
      status: 'Reported',
      assignedDepartment: 'Roads & Infrastructure',
    };

    const firestoreRepo = {
      getStorageMode: () => 'firestore' as const,
      listIssues: vi.fn(async () => [remoteIssue]),
      getIssueById: vi.fn(async (id: string) =>
        id === remoteIssue.id ? remoteIssue : null,
      ),
      createIssue: vi.fn(async () => remoteIssue),
      upvoteIssue: vi.fn(async () => remoteIssue),
      updateIssue: vi.fn(async () => {
        throw new Error('Firestore updateIssue MUST NOT be called for Preview Admin');
      }),
      hasUserVoted: vi.fn(async () => false),
    };

    const hybrid = new HybridIssueRepository({
      firestoreRepo,
      localRepo,
      isFirebaseConfigured: () => true,
      isOnline: () => true,
    });

    const previewAdmin = createPreviewAdminSession();
    const updated = await hybrid.updateIssue(
      'remote-issue-1',
      {
        status: 'In Progress',
        assignedDepartment: 'Public Safety',
        resolutionNotes: 'Preview admin reassigned',
      },
      previewAdmin,
    );

    expect(firestoreRepo.updateIssue).not.toHaveBeenCalled();
    expect(updated.status).toBe('In Progress');
    expect(updated.assignedDepartment).toBe('Public Safety');

    const listed = await hybrid.listIssues({ department: 'Public Safety' });
    expect(listed.some((item) => item.id === 'remote-issue-1')).toBe(true);

    const fetched = await hybrid.getIssueById('remote-issue-1');
    expect(fetched?.status).toBe('In Progress');
  });
});
