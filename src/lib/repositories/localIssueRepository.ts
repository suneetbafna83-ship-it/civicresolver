import { z } from 'zod';
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
import { createSeedIssues } from './seedIssues.js';
import { generateSecureId } from '../utils/secureId.js';

export const LOCAL_ISSUES_STORAGE_KEY = 'civicresolve.issues.v1';
export const LOCAL_VOTES_STORAGE_KEY = 'civicresolve.votes.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocalIssueRepositoryOptions {
  readonly storage?: KeyValueStorage;
  readonly seedIssues?: () => CivicIssue[];
  readonly now?: () => Date;
  readonly idGenerator?: () => string;
}

const VotesArraySchema = z.array(z.string().min(1).max(260));

export function createInMemoryStorage(): KeyValueStorage {
  const store = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
  };
}

export function resolveBrowserStorage(): KeyValueStorage {
  // Node 26 emits ExperimentalWarning if bare localStorage is evaluated; guard via window first.
  if (typeof window !== 'undefined' && 'localStorage' in window) {
    try {
      const browserStorage = window.localStorage;
      if (browserStorage !== undefined && browserStorage !== null) {
        return browserStorage;
      }
    } catch {
      // Sandboxed iframe or storage disabled; fall back to in-memory Map.
    }
  }
  return createInMemoryStorage();
}

function defaultIdGenerator(): string {
  return generateSecureId('local');
}

export class LocalIssueRepository implements IssueRepository {
  private readonly storage: KeyValueStorage;
  private readonly seedIssuesFn: () => CivicIssue[];
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  public constructor(options?: LocalIssueRepositoryOptions) {
    this.storage = options?.storage ?? resolveBrowserStorage();
    this.seedIssuesFn = options?.seedIssues ?? createSeedIssues;
    this.now = options?.now ?? (() => new Date());
    this.idGenerator = options?.idGenerator ?? defaultIdGenerator;
  }

  public getStorageMode(): StorageMode {
    return 'local';
  }

  public async listIssues(
    options?: IssueFilterOptions,
    session?: CivicSession,
  ): Promise<CivicIssue[]> {
    const filter = applyDepartmentReadScope(options, session);
    const issues = this.loadIssues();

    const filtered = issues.filter((issue) => {
      if (filter.department !== undefined && issue.assignedDepartment !== filter.department) {
        return false;
      }
      if (filter.status !== undefined && issue.status !== filter.status) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return filtered.slice(0, filter.limitCount).map(cloneCivicIssue);
  }

  public async getIssueById(
    id: string,
    session?: CivicSession,
  ): Promise<CivicIssue | null> {
    if (id.trim().length === 0) {
      return null;
    }
    const found = this.loadIssues().find((issue) => issue.id === id);
    if (found === undefined) {
      return null;
    }
    assertDepartmentReadAccess(found.assignedDepartment, session);
    return cloneCivicIssue(found);
  }

  public async createIssue(
    input: IssueCreateInput,
    session: CivicSession,
  ): Promise<CivicIssue> {
    if (session.uid.trim().length === 0) {
      throw new RepositoryError('UNAUTHENTICATED', 'Authentication is required to create an issue');
    }

    const validated = validateIssueCreateInput(input);
    const nowIso = this.now().toISOString();

    const newIssue: CivicIssue = CivicIssueSchema.parse({
      id: this.idGenerator(),
      title: validated.title,
      description: validated.description,
      category: validated.category,
      location: { ...validated.location },
      status: 'Reported',
      priorityLevel: validated.priorityLevel,
      urgencyScore: validated.urgencyScore,
      recommendedDepartment: validated.recommendedDepartment,
      assignedDepartment: validated.assignedDepartment ?? validated.recommendedDepartment,
      slaEstimateHours: validated.slaEstimateHours,
      slaSummary: validated.slaSummary,
      triageMeta: {
        ...validated.triageMeta,
        potentialDuplicateIds: [...validated.triageMeta.potentialDuplicateIds],
      },
      imageDataUrl: validated.imageDataUrl ?? null,
      reporterUid: session.uid,
      reporterDisplayName: sanitizeReporterDisplayName(
        session.displayName,
        session.isAnonymous,
      ),
      isGuest: session.isAnonymous,
      upvoteCount: 1,
      resolutionNotes: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      resolvedAt: null,
    });

    const issues = this.loadIssues();
    issues.unshift(newIssue);
    this.saveIssues(issues);

    return cloneCivicIssue(newIssue);
  }

  public async upvoteIssue(
    issueId: string,
    session: CivicSession,
  ): Promise<CivicIssue> {
    if (session.uid.trim().length === 0) {
      throw new RepositoryError('UNAUTHENTICATED', 'Authentication is required to upvote an issue');
    }

    const issues = this.loadIssues();
    const index = issues.findIndex((issue) => issue.id === issueId);
    const existing = index >= 0 ? issues.at(index) : undefined;
    if (existing === undefined) {
      throw new RepositoryError('NOT_FOUND', `Issue "${issueId}" was not found`);
    }

    const voteKey = `${issueId}_${session.uid}`;
    const votes = this.loadVotes();
    if (votes.has(voteKey)) {
      throw new RepositoryError(
        'DUPLICATE_VOTE',
        'You have already upvoted this civic issue',
      );
    }

    const updated: CivicIssue = CivicIssueSchema.parse({
      ...existing,
      upvoteCount: existing.upvoteCount + 1,
      updatedAt: this.now().toISOString(),
    });

    issues.splice(index, 1, updated);
    votes.add(voteKey);
    this.saveIssues(issues);
    this.saveVotes(votes);

    return cloneCivicIssue(updated);
  }

  public async updateIssue(
    issueId: string,
    patch: IssueAdminUpdateInput,
    session: CivicSession,
  ): Promise<CivicIssue> {
    if (session.role !== 'admin') {
      throw new RepositoryError(
        'FORBIDDEN',
        'Admin role is required to update issue status or department routing',
      );
    }

    const validatedPatch = validateIssueUpdateInput(patch);
    const issues = this.loadIssues();
    const index = issues.findIndex((issue) => issue.id === issueId);
    const existing = index >= 0 ? issues.at(index) : undefined;
    if (existing === undefined) {
      throw new RepositoryError('NOT_FOUND', `Issue "${issueId}" was not found`);
    }

    assertDepartmentWriteScope(
      existing.assignedDepartment,
      validatedPatch.assignedDepartment,
      session,
    );

    const nextStatus = validatedPatch.status ?? existing.status;
    if (validatedPatch.status !== undefined) {
      assertValidStatusTransition(existing.status, nextStatus);
    }

    const nowIso = this.now().toISOString();
    let nextResolvedAt = existing.resolvedAt;
    if (existing.status !== 'Resolved' && nextStatus === 'Resolved') {
      nextResolvedAt = nowIso;
    }

    const updated: CivicIssue = CivicIssueSchema.parse({
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

    issues.splice(index, 1, updated);
    this.saveIssues(issues);

    return cloneCivicIssue(updated);
  }

  public async hasUserVoted(issueId: string, uid: string): Promise<boolean> {
    if (issueId.trim().length === 0 || uid.trim().length === 0) {
      return false;
    }
    return this.loadVotes().has(`${issueId}_${uid}`);
  }

  public reset(): void {
    const seeded = this.seedIssuesFn().map(cloneCivicIssue);
    this.saveIssues(seeded);
    this.saveVotes(new Set<string>());
  }

  private loadIssues(): CivicIssue[] {
    const raw = this.storage.getItem(LOCAL_ISSUES_STORAGE_KEY);
    if (raw === null) {
      const seeded = this.seedIssuesFn().map(cloneCivicIssue);
      this.saveIssues(seeded);
      return seeded;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      const seeded = this.seedIssuesFn().map(cloneCivicIssue);
      this.saveIssues(seeded);
      return seeded;
    }

    if (!Array.isArray(parsedJson)) {
      const seeded = this.seedIssuesFn().map(cloneCivicIssue);
      this.saveIssues(seeded);
      return seeded;
    }

    const validIssues: CivicIssue[] = [];
    for (const item of parsedJson) {
      const parsed = CivicIssueSchema.safeParse(item);
      if (parsed.success) {
        validIssues.push(cloneCivicIssue(parsed.data));
      }
    }
    return validIssues;
  }

  private saveIssues(issues: ReadonlyArray<CivicIssue>): void {
    try {
      this.storage.setItem(LOCAL_ISSUES_STORAGE_KEY, JSON.stringify(issues));
    } catch {
      // Ignore quota exceeded errors during local persistence
    }
  }

  private loadVotes(): Set<string> {
    const raw = this.storage.getItem(LOCAL_VOTES_STORAGE_KEY);
    if (raw === null) {
      return new Set<string>();
    }
    try {
      const parsedJson: unknown = JSON.parse(raw);
      const parsed = VotesArraySchema.safeParse(parsedJson);
      if (!parsed.success) {
        return new Set<string>();
      }
      return new Set<string>(parsed.data);
    } catch {
      return new Set<string>();
    }
  }

  private saveVotes(votes: ReadonlySet<string>): void {
    try {
      this.storage.setItem(LOCAL_VOTES_STORAGE_KEY, JSON.stringify([...votes]));
    } catch {
      // Ignore quota exceeded errors during local persistence
    }
  }
}
