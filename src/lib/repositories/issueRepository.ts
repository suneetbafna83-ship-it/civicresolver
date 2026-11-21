import {
  MAX_ISSUES_LIMIT,
  MAX_STORED_WEBP_BYTES,
  MAX_STORED_WEBP_DATA_URL_LENGTH,
  type CivicIssue,
  type CivicSession,
  type Department,
  type IssueAdminUpdateInput,
  type IssueCreateInput,
  type IssueFilterOptions,
  type IssueStatus,
  type StorageMode,
} from '../../../shared/types/civic.js';
import {
  IssueCreateSchema,
  IssueUpdateSchema,
} from '../../../shared/schemas/issue.js';
import {
  DepartmentSchema,
  IssueStatusSchema,
  safeCivicText,
} from '../../../shared/schemas/triage.js';
import { validateStoredWebpImage } from '../media/imageValidation.js';

export {
  MAX_ISSUES_LIMIT,
  MAX_STORED_WEBP_BYTES,
  MAX_STORED_WEBP_DATA_URL_LENGTH,
};

export type RepositoryErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'DUPLICATE_VOTE'
  | 'INVALID_STATUS_TRANSITION'
  | 'STORAGE_UNAVAILABLE';

export class RepositoryError extends Error {
  public readonly code: RepositoryErrorCode;
  public override readonly cause?: unknown;

  public constructor(
    code: RepositoryErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface IssueRepository {
  getStorageMode(): StorageMode;
  listIssues(options?: IssueFilterOptions): Promise<CivicIssue[]>;
  getIssueById(id: string): Promise<CivicIssue | null>;
  createIssue(input: IssueCreateInput, session: CivicSession): Promise<CivicIssue>;
  upvoteIssue(issueId: string, session: CivicSession): Promise<CivicIssue>;
  updateIssue(
    issueId: string,
    patch: IssueAdminUpdateInput,
    session: CivicSession,
  ): Promise<CivicIssue>;
  hasUserVoted(issueId: string, uid: string): Promise<boolean>;
}

export interface ValidatedFilterOptions {
  readonly limitCount: number;
  readonly department?: Department;
  readonly status?: IssueStatus;
}

const reporterNameSchema = safeCivicText({
  min: 1,
  max: 50,
  fieldName: 'reporterDisplayName',
});

export function clampIssuesLimit(limitCount?: number): number {
  if (limitCount === undefined || !Number.isFinite(limitCount)) {
    return MAX_ISSUES_LIMIT;
  }
  const truncated = Math.trunc(limitCount);
  if (truncated < 1) {
    return 1;
  }
  if (truncated > MAX_ISSUES_LIMIT) {
    return MAX_ISSUES_LIMIT;
  }
  return truncated;
}

export function validateFilterOptions(
  options?: IssueFilterOptions,
): ValidatedFilterOptions {
  const limitCount = clampIssuesLimit(options?.limitCount);

  let department: Department | undefined;
  if (options?.department !== undefined) {
    const parsedDept = DepartmentSchema.safeParse(options.department);
    if (!parsedDept.success) {
      throw new RepositoryError(
        'VALIDATION_ERROR',
        `Invalid department filter: "${String(options.department)}"`,
      );
    }
    department = parsedDept.data;
  }

  let status: IssueStatus | undefined;
  if (options?.status !== undefined) {
    const parsedStatus = IssueStatusSchema.safeParse(options.status);
    if (!parsedStatus.success) {
      throw new RepositoryError(
        'VALIDATION_ERROR',
        `Invalid status filter: "${String(options.status)}"`,
      );
    }
    status = parsedStatus.data;
  }

  return {
    limitCount,
    ...(department !== undefined ? { department } : {}),
    ...(status !== undefined ? { status } : {}),
  };
}

export function validateIssueCreateInput(
  input: IssueCreateInput,
): IssueCreateInput {
  const parsed = IssueCreateSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new RepositoryError(
      'VALIDATION_ERROR',
      `Invalid issue creation payload: ${details}`,
    );
  }

  if (typeof parsed.data.imageDataUrl === 'string') {
    const webpResult = validateStoredWebpImage(parsed.data.imageDataUrl);
    if (!webpResult.valid) {
      throw new RepositoryError('VALIDATION_ERROR', webpResult.reason);
    }
  }

  return parsed.data;
}

export function validateIssueUpdateInput(
  patch: IssueAdminUpdateInput,
): IssueAdminUpdateInput {
  const parsed = IssueUpdateSchema.safeParse(patch);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new RepositoryError(
      'VALIDATION_ERROR',
      `Invalid issue update payload: ${details}`,
    );
  }
  return parsed.data;
}

export function assertValidStatusTransition(
  current: IssueStatus,
  next: IssueStatus,
): void {
  if (current === next) {
    return;
  }
  if (current === 'Reported' && (next === 'In Progress' || next === 'Resolved')) {
    return;
  }
  if (current === 'In Progress' && next === 'Resolved') {
    return;
  }
  throw new RepositoryError(
    'INVALID_STATUS_TRANSITION',
    `Cannot transition issue status from "${current}" to "${next}"`,
  );
}

export function sanitizeReporterDisplayName(
  displayName: string,
  isAnonymous: boolean,
): string {
  const candidate = displayName.trim().slice(0, 50);
  const parsed = reporterNameSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }
  return isAnonymous ? 'Guest Citizen' : 'Civic Citizen';
}

export function cloneCivicIssue(issue: CivicIssue): CivicIssue {
  return {
    ...issue,
    location: { ...issue.location },
    triageMeta: {
      ...issue.triageMeta,
      potentialDuplicateIds: [...issue.triageMeta.potentialDuplicateIds],
    },
  };
}
