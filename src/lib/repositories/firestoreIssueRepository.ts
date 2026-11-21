import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type CollectionReference,
  type DocumentReference,
  type FieldValue,
  type Firestore,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore';
import type {
  CivicIssue,
  CivicSession,
  Department,
  IssueAdminUpdateInput,
  IssueCreateInput,
  IssueFilterOptions,
  StorageMode,
} from '../../../shared/types/civic.js';
import { CivicIssueSchema } from '../../../shared/schemas/issue.js';
import { DepartmentSchema } from '../../../shared/schemas/triage.js';
import {
  RepositoryError,
  applyDepartmentReadScope,
  assertDepartmentReadAccess,
  assertDepartmentWriteScope,
  assertValidStatusTransition,
  cloneCivicIssue,
  sanitizeReporterDisplayName,
  validateIssueCreateInput,
  validateIssueUpdateInput,
  type IssueRepository,
} from './issueRepository.js';

export interface SnapshotDataOptions {
  readonly serverTimestamps?: 'estimate' | 'previous' | 'none';
}

export interface FirestoreDocSnapshotLike {
  readonly id: string;
  exists(): boolean;
  data(options?: SnapshotDataOptions): Record<string, unknown> | undefined;
}

export interface FirestoreQuerySnapshotLike {
  readonly docs: ReadonlyArray<FirestoreDocSnapshotLike>;
}

export interface FirestoreTransactionLike {
  get(docRef: DocumentReference): Promise<FirestoreDocSnapshotLike>;
  set(docRef: DocumentReference, data: Record<string, unknown>): unknown;
  update(docRef: DocumentReference, data: Record<string, unknown>): unknown;
}

export interface FirestoreOperations {
  collection(db: Firestore, path: string): CollectionReference;
  doc(parent: CollectionReference): DocumentReference;
  doc(db: Firestore, path: string, ...pathSegments: string[]): DocumentReference;
  getDoc(docRef: DocumentReference): Promise<FirestoreDocSnapshotLike>;
  getDocs(q: Query): Promise<FirestoreQuerySnapshotLike>;
  setDoc(docRef: DocumentReference, data: Record<string, unknown>): Promise<void>;
  query(col: CollectionReference, ...constraints: QueryConstraint[]): Query;
  where(fieldPath: string, opStr: '==', value: unknown): QueryConstraint;
  orderBy(fieldPath: string, directionStr: 'asc' | 'desc'): QueryConstraint;
  limit(n: number): QueryConstraint;
  runTransaction<T>(
    db: Firestore,
    updateFunction: (tx: FirestoreTransactionLike) => Promise<T>,
  ): Promise<T>;
  serverTimestamp(): FieldValue;
}

const defaultFirestoreOperations: FirestoreOperations = {
  collection(db: Firestore, path: string): CollectionReference {
    return collection(db, path);
  },
  doc(
    parentOrDb: CollectionReference | Firestore,
    path?: string,
    ...pathSegments: string[]
  ): DocumentReference {
    if (path === undefined) {
      return doc(parentOrDb as CollectionReference);
    }
    return doc(parentOrDb as Firestore, path, ...pathSegments);
  },
  async getDoc(docRef: DocumentReference): Promise<FirestoreDocSnapshotLike> {
    return getDoc(docRef);
  },
  async getDocs(q: Query): Promise<FirestoreQuerySnapshotLike> {
    return getDocs(q);
  },
  async setDoc(
    docRef: DocumentReference,
    data: Record<string, unknown>,
  ): Promise<void> {
    await setDoc(docRef, data);
  },
  query(col: CollectionReference, ...constraints: QueryConstraint[]): Query {
    return query(col, ...constraints);
  },
  where(fieldPath: string, opStr: '==', value: unknown): QueryConstraint {
    return where(fieldPath, opStr, value);
  },
  orderBy(fieldPath: string, directionStr: 'asc' | 'desc'): QueryConstraint {
    return orderBy(fieldPath, directionStr);
  },
  limit(n: number): QueryConstraint {
    return limit(n);
  },
  async runTransaction<T>(
    db: Firestore,
    updateFunction: (tx: FirestoreTransactionLike) => Promise<T>,
  ): Promise<T> {
    return runTransaction(db, (tx) => updateFunction(tx));
  },
  serverTimestamp(): FieldValue {
    return serverTimestamp();
  },
};

function isTimestampWithToDate(
  value: unknown,
): value is { toDate: () => Date } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  );
}

function isSecondsRecord(value: unknown): value is { seconds: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value &&
    typeof (value as { seconds?: unknown }).seconds === 'number'
  );
}

export function firestoreTimeToIso(value: unknown, fallbackIso: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallbackIso : value.toISOString();
  }
  if (isTimestampWithToDate(value)) {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? fallbackIso : date.toISOString();
  }
  if (isSecondsRecord(value) && Number.isFinite(value.seconds)) {
    return new Date(value.seconds * 1000).toISOString();
  }
  return fallbackIso;
}

export function snapshotToCivicIssue(
  id: string,
  rawData: Record<string, unknown> | undefined,
  fallbackIso: string,
): CivicIssue | null {
  if (rawData === undefined) {
    return null;
  }
  const normalized: Record<string, unknown> = {
    ...rawData,
    id: typeof rawData.id === 'string' && rawData.id.length > 0 ? rawData.id : id,
    imageDataUrl: rawData.imageDataUrl ?? null,
    resolutionNotes: rawData.resolutionNotes ?? null,
    createdAt: firestoreTimeToIso(rawData.createdAt, fallbackIso),
    updatedAt: firestoreTimeToIso(rawData.updatedAt, fallbackIso),
    resolvedAt:
      rawData.resolvedAt === null || rawData.resolvedAt === undefined
        ? null
        : firestoreTimeToIso(rawData.resolvedAt, fallbackIso),
  };

  const parsed = CivicIssueSchema.safeParse(normalized);
  if (!parsed.success) {
    return null;
  }
  return cloneCivicIssue(parsed.data);
}

export interface VerifiedAdminProfile {
  readonly isAdmin: boolean;
  readonly department: Department | null;
}

export async function getVerifiedAdminProfile(
  uid: string,
  db: Firestore,
  ops: FirestoreOperations = defaultFirestoreOperations,
): Promise<VerifiedAdminProfile> {
  if (uid.trim().length === 0) {
    return { isAdmin: false, department: null };
  }
  try {
    const adminRef = ops.doc(db, 'admins', uid);
    const snap = await ops.getDoc(adminRef);
    if (!snap.exists()) {
      return { isAdmin: false, department: null };
    }
    const data = snap.data();
    if (data === undefined || data.active !== true) {
      return { isAdmin: false, department: null };
    }
    if (typeof data.department === 'string') {
      const parsedDept = DepartmentSchema.safeParse(data.department);
      if (parsedDept.success) {
        return { isAdmin: true, department: parsedDept.data };
      }
    }
    return { isAdmin: true, department: null };
  } catch {
    return { isAdmin: false, department: null };
  }
}

export async function isVerifiedAdminUid(
  uid: string,
  db: Firestore,
  ops: FirestoreOperations = defaultFirestoreOperations,
): Promise<boolean> {
  const profile = await getVerifiedAdminProfile(uid, db, ops);
  return profile.isAdmin;
}

export class FirestoreIssueRepository implements IssueRepository {
  private readonly db: Firestore;
  private readonly ops: FirestoreOperations;
  private readonly now: () => Date;

  public constructor(
    db: Firestore,
    ops: FirestoreOperations = defaultFirestoreOperations,
    now: () => Date = () => new Date(),
  ) {
    this.db = db;
    this.ops = ops;
    this.now = now;
  }

  public getStorageMode(): StorageMode {
    return 'firestore';
  }

  public async listIssues(
    options?: IssueFilterOptions,
    session?: CivicSession,
  ): Promise<CivicIssue[]> {
    const filter = applyDepartmentReadScope(options, session);
    const constraints: QueryConstraint[] = [];

    if (filter.department !== undefined) {
      constraints.push(this.ops.where('assignedDepartment', '==', filter.department));
    }
    if (filter.status !== undefined) {
      constraints.push(this.ops.where('status', '==', filter.status));
    }
    constraints.push(this.ops.orderBy('createdAt', 'desc'));
    constraints.push(this.ops.limit(filter.limitCount));

    const issuesQuery = this.ops.query(
      this.ops.collection(this.db, 'issues'),
      ...constraints,
    );
    const querySnapshot = await this.ops.getDocs(issuesQuery);
    const fallbackIso = this.now().toISOString();

    const results: CivicIssue[] = [];
    for (const docSnap of querySnapshot.docs) {
      const issue = snapshotToCivicIssue(
        docSnap.id,
        docSnap.data({ serverTimestamps: 'estimate' }),
        fallbackIso,
      );
      if (issue !== null) {
        results.push(issue);
      }
    }
    return results;
  }

  public async getIssueById(
    id: string,
    session?: CivicSession,
  ): Promise<CivicIssue | null> {
    if (id.trim().length === 0) {
      return null;
    }
    const issueRef = this.ops.doc(this.db, 'issues', id);
    const snap = await this.ops.getDoc(issueRef);
    if (!snap.exists()) {
      return null;
    }
    const parsed = snapshotToCivicIssue(
      snap.id,
      snap.data({ serverTimestamps: 'estimate' }),
      this.now().toISOString(),
    );
    if (parsed !== null) {
      assertDepartmentReadAccess(parsed.assignedDepartment, session);
    }
    return parsed;
  }

  public async createIssue(
    input: IssueCreateInput,
    session: CivicSession,
  ): Promise<CivicIssue> {
    if (session.uid.trim().length === 0) {
      throw new RepositoryError(
        'UNAUTHENTICATED',
        'Authentication is required to create an issue',
      );
    }

    const validated = validateIssueCreateInput(input);
    const issueRef = this.ops.doc(this.ops.collection(this.db, 'issues'));
    const nowIso = this.now().toISOString();
    const assignedDepartment =
      validated.assignedDepartment ?? validated.recommendedDepartment;
    const reporterDisplayName = sanitizeReporterDisplayName(
      session.displayName,
      session.isAnonymous,
    );
    const imageDataUrl = validated.imageDataUrl ?? null;

    const payload: Record<string, unknown> = {
      id: issueRef.id,
      title: validated.title,
      description: validated.description,
      category: validated.category,
      location: { ...validated.location },
      status: 'Reported',
      priorityLevel: validated.priorityLevel,
      urgencyScore: validated.urgencyScore,
      recommendedDepartment: validated.recommendedDepartment,
      assignedDepartment,
      slaEstimateHours: validated.slaEstimateHours,
      slaSummary: validated.slaSummary,
      triageMeta: {
        ...validated.triageMeta,
        potentialDuplicateIds: [...validated.triageMeta.potentialDuplicateIds],
      },
      imageDataUrl,
      reporterUid: session.uid,
      reporterDisplayName,
      isGuest: session.isAnonymous,
      upvoteCount: 1,
      resolutionNotes: null,
      createdAt: this.ops.serverTimestamp(),
      updatedAt: this.ops.serverTimestamp(),
      resolvedAt: null,
    };

    await this.ops.setDoc(issueRef, payload);

    return cloneCivicIssue(
      CivicIssueSchema.parse({
        ...payload,
        createdAt: nowIso,
        updatedAt: nowIso,
        resolvedAt: null,
      }),
    );
  }

  public async upvoteIssue(
    issueId: string,
    session: CivicSession,
  ): Promise<CivicIssue> {
    if (session.uid.trim().length === 0) {
      throw new RepositoryError(
        'UNAUTHENTICATED',
        'Authentication is required to upvote an issue',
      );
    }

    const issueRef = this.ops.doc(this.db, 'issues', issueId);
    const voteRef = this.ops.doc(this.db, 'issue_votes', `${issueId}_${session.uid}`);

    return this.ops.runTransaction(this.db, async (tx) => {
      const [issueSnap, voteSnap] = await Promise.all([
        tx.get(issueRef),
        tx.get(voteRef),
      ]);

      if (!issueSnap.exists()) {
        throw new RepositoryError('NOT_FOUND', `Issue "${issueId}" was not found`);
      }
      if (voteSnap.exists()) {
        throw new RepositoryError(
          'DUPLICATE_VOTE',
          'You have already upvoted this civic issue',
        );
      }

      const fallbackIso = this.now().toISOString();
      const current = snapshotToCivicIssue(
        issueSnap.id,
        issueSnap.data({ serverTimestamps: 'estimate' }),
        fallbackIso,
      );
      if (current === null) {
        throw new RepositoryError(
          'VALIDATION_ERROR',
          `Stored issue "${issueId}" failed schema validation`,
        );
      }

      const nextCount = current.upvoteCount + 1;
      tx.update(issueRef, {
        upvoteCount: nextCount,
        updatedAt: this.ops.serverTimestamp(),
      });
      tx.set(voteRef, {
        issueId,
        uid: session.uid,
        createdAt: this.ops.serverTimestamp(),
      });

      return cloneCivicIssue(
        CivicIssueSchema.parse({
          ...current,
          upvoteCount: nextCount,
          updatedAt: fallbackIso,
        }),
      );
    });
  }

  public async updateIssue(
    issueId: string,
    patch: IssueAdminUpdateInput,
    session: CivicSession,
  ): Promise<CivicIssue> {
    if (session.role !== 'admin' || !session.isVerifiedFirebaseAdmin) {
      throw new RepositoryError(
        'FORBIDDEN',
        'Verified Firebase admin privileges are required for Firestore issue updates',
      );
    }

    const validatedPatch = validateIssueUpdateInput(patch);
    const issueRef = this.ops.doc(this.db, 'issues', issueId);

    return this.ops.runTransaction(this.db, async (tx) => {
      const issueSnap = await tx.get(issueRef);
      if (!issueSnap.exists()) {
        throw new RepositoryError('NOT_FOUND', `Issue "${issueId}" was not found`);
      }

      const nowIso = this.now().toISOString();
      const current = snapshotToCivicIssue(
        issueSnap.id,
        issueSnap.data({ serverTimestamps: 'estimate' }),
        nowIso,
      );
      if (current === null) {
        throw new RepositoryError(
          'VALIDATION_ERROR',
          `Stored issue "${issueId}" failed schema validation`,
        );
      }

      assertDepartmentWriteScope(
        current.assignedDepartment,
        validatedPatch.assignedDepartment,
        session,
      );

      const nextStatus = validatedPatch.status ?? current.status;
      if (validatedPatch.status !== undefined) {
        assertValidStatusTransition(current.status, nextStatus);
      }

      const updateFields: Record<string, unknown> = {
        updatedAt: this.ops.serverTimestamp(),
      };
      if (validatedPatch.status !== undefined) {
        updateFields.status = validatedPatch.status;
      }
      if (validatedPatch.assignedDepartment !== undefined) {
        updateFields.assignedDepartment = validatedPatch.assignedDepartment;
      }
      if (validatedPatch.resolutionNotes !== undefined) {
        updateFields.resolutionNotes = validatedPatch.resolutionNotes;
      }

      let nextResolvedAt = current.resolvedAt;
      if (current.status !== 'Resolved' && nextStatus === 'Resolved') {
        updateFields.resolvedAt = this.ops.serverTimestamp();
        nextResolvedAt = nowIso;
      }

      tx.update(issueRef, updateFields);

      return cloneCivicIssue(
        CivicIssueSchema.parse({
          ...current,
          status: nextStatus,
          assignedDepartment:
            validatedPatch.assignedDepartment ?? current.assignedDepartment,
          resolutionNotes:
            validatedPatch.resolutionNotes !== undefined
              ? validatedPatch.resolutionNotes
              : current.resolutionNotes,
          updatedAt: nowIso,
          resolvedAt: nextResolvedAt,
        }),
      );
    });
  }

  public async hasUserVoted(issueId: string, uid: string): Promise<boolean> {
    if (issueId.trim().length === 0 || uid.trim().length === 0) {
      return false;
    }
    const voteRef = this.ops.doc(this.db, 'issue_votes', `${issueId}_${uid}`);
    const snap = await this.ops.getDoc(voteRef);
    return snap.exists();
  }
}
