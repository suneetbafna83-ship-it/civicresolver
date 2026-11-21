import type {
  CivicIssue,
  CivicSession,
  IssueAdminUpdateInput,
  IssueCreateInput,
  IssueFilterOptions,
  StorageMode,
} from '../../../shared/types/civic.js';
import { CivicIssueSchema } from '../../../shared/schemas/issue.js';
import {
  getFirebaseDb,
  isBrowserOffline,
  isFirebaseConfigured,
} from '../firebase/config.js';
import {
  RepositoryError,
  assertValidStatusTransition,
  cloneCivicIssue,
  validateFilterOptions,
  validateIssueCreateInput,
  validateIssueUpdateInput,
  type IssueRepository,
} from './issueRepository.js';
import { LocalIssueRepository } from './localIssueRepository.js';
import { FirestoreIssueRepository } from './firestoreIssueRepository.js';

export interface HybridIssueRepositoryDeps {
  readonly firestoreRepo?: IssueRepository | null;
  readonly localRepo?: LocalIssueRepository;
  readonly isFirebaseConfigured?: () => boolean;
  readonly isOnline?: () => boolean;
  readonly onStorageModeChange?: (mode: StorageMode) => void;
  readonly now?: () => Date;
}

const FAILOVER_ERROR_CODES = new Set([
  'unavailable',
  'failed-precondition',
  'deadline-exceeded',
  'aborted',
  'internal',
  'unknown',
  'resource-exhausted',
  'unimplemented',
]);

const FAILOVER_MESSAGE_SUBSTRINGS = [
  'network',
  'offline',
  'failed to fetch',
  'timeout',
  'timed out',
  'econnrefused',
  'enotfound',
  'socket',
] as const;

function readErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    const raw = (error as { code: string }).code.trim().toLowerCase();
    return raw.startsWith('firestore/') ? raw.slice('firestore/'.length) : raw;
  }
  return '';
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message.toLowerCase();
  }
  return '';
}

export function isFirestoreFailoverError(error: unknown): boolean {
  if (error instanceof RepositoryError) {
    return error.code === 'STORAGE_UNAVAILABLE';
  }
  const code = readErrorCode(error);
  if (FAILOVER_ERROR_CODES.has(code)) {
    return true;
  }
  const message = readErrorMessage(error);
  for (const needle of FAILOVER_MESSAGE_SUBSTRINGS) {
    if (message.includes(needle)) {
      return true;
    }
  }
  return false;
}

function isPermissionDeniedError(error: unknown): boolean {
  return readErrorCode(error) === 'permission-denied';
}

function isLocalSessionProvider(session: CivicSession): boolean {
  return session.provider === 'preview-admin' || session.provider === 'local-guest';
}

function isUnverifiedPreviewAdmin(session: CivicSession): boolean {
  return session.isPreviewAdmin && !session.isVerifiedFirebaseAdmin;
}

export class HybridIssueRepository implements IssueRepository {
  private readonly firestoreRepo: IssueRepository | null;
  private readonly localRepo: LocalIssueRepository;
  private readonly isConfiguredFn: () => boolean;
  private readonly isOnlineFn: () => boolean;
  private readonly onStorageModeChange?: (mode: StorageMode) => void;
  private readonly now: () => Date;
  private readonly previewSandboxIssues = new Map<string, CivicIssue>();
  private readonly previewSandboxVotes = new Set<string>();
  private degradedToLocal = false;

  public constructor(deps?: HybridIssueRepositoryDeps) {
    this.isConfiguredFn = deps?.isFirebaseConfigured ?? isFirebaseConfigured;
    this.isOnlineFn = deps?.isOnline ?? (() => !isBrowserOffline());
    this.localRepo = deps?.localRepo ?? new LocalIssueRepository();
    if (deps?.onStorageModeChange !== undefined) {
      this.onStorageModeChange = deps.onStorageModeChange;
    }
    this.now = deps?.now ?? (() => new Date());

    if (deps?.firestoreRepo !== undefined) {
      this.firestoreRepo = deps.firestoreRepo;
    } else if (this.isConfiguredFn()) {
      const db = getFirebaseDb();
      this.firestoreRepo = db !== null ? new FirestoreIssueRepository(db) : null;
    } else {
      this.firestoreRepo = null;
    }
  }

  public getStorageMode(): StorageMode {
    if (
      this.firestoreRepo !== null &&
      !this.degradedToLocal &&
      this.isConfiguredFn() &&
      this.isOnlineFn()
    ) {
      return 'firestore';
    }
    return 'local';
  }

  public async listIssues(options?: IssueFilterOptions): Promise<CivicIssue[]> {
    const filter = validateFilterOptions(options);

    let baseIssues: CivicIssue[];
    if (this.getStorageMode() === 'firestore' && this.firestoreRepo !== null) {
      try {
        baseIssues = await this.firestoreRepo.listIssues(filter);
      } catch (error) {
        if (isFirestoreFailoverError(error)) {
          this.tripFailover();
          baseIssues = await this.localRepo.listIssues(filter);
        } else if (isPermissionDeniedError(error)) {
          baseIssues = await this.localRepo.listIssues(filter);
        } else {
          throw error;
        }
      }
    } else {
      baseIssues = await this.localRepo.listIssues(filter);
    }

    if (this.previewSandboxIssues.size === 0) {
      return baseIssues.map(cloneCivicIssue);
    }

    const mergedById = new Map<string, CivicIssue>();
    for (const issue of baseIssues) {
      mergedById.set(issue.id, cloneCivicIssue(issue));
    }
    for (const [id, sandboxIssue] of this.previewSandboxIssues.entries()) {
      if (
        (filter.department === undefined ||
          sandboxIssue.assignedDepartment === filter.department) &&
        (filter.status === undefined || sandboxIssue.status === filter.status)
      ) {
        mergedById.set(id, cloneCivicIssue(sandboxIssue));
      } else {
        // If an overlaid issue no longer matches the active filter, hide the stale base version.
        mergedById.delete(id);
      }
    }

    const combined = [...mergedById.values()];
    combined.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return combined.slice(0, filter.limitCount).map(cloneCivicIssue);
  }

  public async getIssueById(id: string): Promise<CivicIssue | null> {
    if (id.trim().length === 0) {
      return null;
    }
    const sandboxed = this.previewSandboxIssues.get(id);
    if (sandboxed !== undefined) {
      return cloneCivicIssue(sandboxed);
    }

    if (this.getStorageMode() === 'firestore' && this.firestoreRepo !== null) {
      try {
        return await this.firestoreRepo.getIssueById(id);
      } catch (error) {
        if (isFirestoreFailoverError(error)) {
          this.tripFailover();
          return this.localRepo.getIssueById(id);
        }
        if (isPermissionDeniedError(error)) {
          return this.localRepo.getIssueById(id);
        }
        throw error;
      }
    }

    return this.localRepo.getIssueById(id);
  }

  public async createIssue(
    input: IssueCreateInput,
    session: CivicSession,
  ): Promise<CivicIssue> {
    const validated = validateIssueCreateInput(input);

    if (this.getStorageMode() === 'firestore' && this.firestoreRepo !== null) {
      if (isLocalSessionProvider(session)) {
        const created = await this.localRepo.createIssue(validated, session);
        this.previewSandboxIssues.set(created.id, cloneCivicIssue(created));
        return cloneCivicIssue(created);
      }

      try {
        return await this.firestoreRepo.createIssue(validated, session);
      } catch (error) {
        if (isFirestoreFailoverError(error)) {
          this.tripFailover();
          return this.localRepo.createIssue(validated, session);
        }
        throw error;
      }
    }

    return this.localRepo.createIssue(validated, session);
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

    if (this.getStorageMode() === 'firestore' && this.firestoreRepo !== null) {
      if (isLocalSessionProvider(session)) {
        return this.upvoteInSandbox(issueId, session);
      }

      try {
        return await this.firestoreRepo.upvoteIssue(issueId, session);
      } catch (error) {
        if (isFirestoreFailoverError(error)) {
          this.tripFailover();
          return this.localRepo.upvoteIssue(issueId, session);
        }
        throw error;
      }
    }

    return this.localRepo.upvoteIssue(issueId, session);
  }

  public async updateIssue(
    issueId: string,
    patch: IssueAdminUpdateInput,
    session: CivicSession,
  ): Promise<CivicIssue> {
    if (session.role !== 'admin') {
      throw new RepositoryError(
        'FORBIDDEN',
        'Admin role is required to update civic issues',
      );
    }

    const validatedPatch = validateIssueUpdateInput(patch);

    if (this.getStorageMode() === 'firestore' && this.firestoreRepo !== null) {
      if (isUnverifiedPreviewAdmin(session)) {
        return this.updateInSandbox(issueId, validatedPatch);
      }

      try {
        return await this.firestoreRepo.updateIssue(issueId, validatedPatch, session);
      } catch (error) {
        if (isFirestoreFailoverError(error)) {
          this.tripFailover();
          return this.localRepo.updateIssue(issueId, validatedPatch, session);
        }
        throw error;
      }
    }

    return this.localRepo.updateIssue(issueId, validatedPatch, session);
  }

  public async hasUserVoted(issueId: string, uid: string): Promise<boolean> {
    if (issueId.trim().length === 0 || uid.trim().length === 0) {
      return false;
    }

    if (this.previewSandboxVotes.has(`${issueId}_${uid}`)) {
      return true;
    }

    if (this.getStorageMode() === 'firestore' && this.firestoreRepo !== null) {
      if (uid === 'preview-admin' || uid.startsWith('guest_')) {
        return this.localRepo.hasUserVoted(issueId, uid);
      }
      try {
        return await this.firestoreRepo.hasUserVoted(issueId, uid);
      } catch (error) {
        if (isFirestoreFailoverError(error)) {
          this.tripFailover();
          return this.localRepo.hasUserVoted(issueId, uid);
        }
        if (isPermissionDeniedError(error)) {
          return this.localRepo.hasUserVoted(issueId, uid);
        }
        throw error;
      }
    }

    return this.localRepo.hasUserVoted(issueId, uid);
  }

  private tripFailover(): void {
    if (!this.degradedToLocal) {
      this.degradedToLocal = true;
      this.onStorageModeChange?.('local');
    }
  }

  private async resolveTargetIssueForSandbox(
    issueId: string,
  ): Promise<CivicIssue | null> {
    const sandboxed = this.previewSandboxIssues.get(issueId);
    if (sandboxed !== undefined) {
      return cloneCivicIssue(sandboxed);
    }
    const fromLocal = await this.localRepo.getIssueById(issueId);
    if (fromLocal !== null) {
      return fromLocal;
    }
    if (this.firestoreRepo !== null) {
      try {
        return await this.firestoreRepo.getIssueById(issueId);
      } catch (error) {
        if (isFirestoreFailoverError(error)) {
          this.tripFailover();
          return null;
        }
        if (isPermissionDeniedError(error)) {
          return null;
        }
        throw error;
      }
    }
    return null;
  }

  private async upvoteInSandbox(
    issueId: string,
    session: CivicSession,
  ): Promise<CivicIssue> {
    const voteKey = `${issueId}_${session.uid}`;
    if (this.previewSandboxVotes.has(voteKey)) {
      throw new RepositoryError(
        'DUPLICATE_VOTE',
        'You have already upvoted this civic issue',
      );
    }

    const existing = await this.resolveTargetIssueForSandbox(issueId);
    if (existing === null) {
      throw new RepositoryError('NOT_FOUND', `Issue "${issueId}" was not found`);
    }

    const updated = CivicIssueSchema.parse({
      ...existing,
      upvoteCount: existing.upvoteCount + 1,
      updatedAt: this.now().toISOString(),
    });
    this.previewSandboxVotes.add(voteKey);
    this.previewSandboxIssues.set(issueId, cloneCivicIssue(updated));
    return cloneCivicIssue(updated);
  }

  private async updateInSandbox(
    issueId: string,
    validatedPatch: IssueAdminUpdateInput,
  ): Promise<CivicIssue> {
    const existing = await this.resolveTargetIssueForSandbox(issueId);
    if (existing === null) {
      throw new RepositoryError('NOT_FOUND', `Issue "${issueId}" was not found`);
    }

    const nextStatus = validatedPatch.status ?? existing.status;
    if (validatedPatch.status !== undefined) {
      assertValidStatusTransition(existing.status, nextStatus);
    }

    const nowIso = this.now().toISOString();
    let nextResolvedAt = existing.resolvedAt;
    if (existing.status !== 'Resolved' && nextStatus === 'Resolved') {
      nextResolvedAt = nowIso;
    }

    const updated = CivicIssueSchema.parse({
      ...existing,
      status: nextStatus,
      assignedDepartment:
        validatedPatch.assignedDepartment ?? existing.assignedDepartment,
      resolutionNotes:
        validatedPatch.resolutionNotes !== undefined
          ? validatedPatch.resolutionNotes
          : existing.resolutionNotes,
      updatedAt: nowIso,
      resolvedAt: nextResolvedAt,
    });

    this.previewSandboxIssues.set(issueId, cloneCivicIssue(updated));
    return cloneCivicIssue(updated);
  }
}

export function createDefaultIssueRepository(): HybridIssueRepository {
  return new HybridIssueRepository();
}
