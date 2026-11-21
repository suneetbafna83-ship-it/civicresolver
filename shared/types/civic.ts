export const DEPARTMENTS = [
  'Roads & Infrastructure',
  'Sanitation & Waste',
  'Electrical & Streetlights',
  'Water & Sewage',
  'Public Safety',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const PRIORITY_LEVELS = ['Low', 'Medium', 'High', 'Critical'] as const;

export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export const ISSUE_STATUSES = ['Reported', 'In Progress', 'Resolved'] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_CATEGORIES = [
  'Pothole & Road Damage',
  'Garbage & Illegal Dumping',
  'Streetlight & Electrical',
  'Water Leak & Sewage',
  'Traffic & Public Safety',
  'Other Civic Issue',
] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const TRIAGE_ENGINES = ['gemini', 'nlp-fallback'] as const;

export type TriageEngine = (typeof TRIAGE_ENGINES)[number];

export const TRIAGE_FALLBACK_REASONS = [
  'missing_api_key',
  'rate_limited',
  'quota_exceeded',
  'model_unavailable',
  'auth_error',
  'timeout',
  'invalid_response',
  'upstream_error',
] as const;

export type TriageFallbackReason = (typeof TRIAGE_FALLBACK_REASONS)[number];

export const SUPPORTED_UPLOAD_IMAGE_MIMES = [
  'image/webp',
  'image/jpeg',
  'image/png',
] as const;

export type UploadImageMimeType = (typeof SUPPORTED_UPLOAD_IMAGE_MIMES)[number];

export const AUTHENTICITY_STATUSES = [
  'likely_authentic',
  'uncertain',
  'flagged_mismatch',
] as const;

export type AuthenticityStatus = (typeof AUTHENTICITY_STATUSES)[number];

export const AUTH_PROVIDERS = [
  'google',
  'password',
  'anonymous',
  'preview-admin',
  'local-guest',
] as const;

export type AuthProviderKind = (typeof AUTH_PROVIDERS)[number];

export const USER_ROLES = ['citizen', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const STORAGE_MODES = ['firestore', 'local'] as const;

export type StorageMode = (typeof STORAGE_MODES)[number];

export const MAX_ISSUES_LIMIT = 50;
export const MAX_NEARBY_ISSUES_CONTEXT = 50;
export const MAX_DUPLICATE_MATCH_IDS = 10;
export const MAX_RAW_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024; // 5,242,880 bytes (5 MB)
export const MAX_RAW_UPLOAD_BASE64_LENGTH = 7_000_000; // ceil(5MB/3)*4 + data URI prefix headroom
export const MAX_STORED_WEBP_BYTES = 122_880; // 120 * 1024 bytes (120 KB)
export const MAX_STORED_WEBP_DATA_URL_LENGTH = 165_000;
export const WEBP_DATA_URL_PREFIX = 'data:image/webp;base64,';
export const MAX_SLA_ESTIMATE_HOURS = 720;

export interface TriageLocationInput {
  lat: number;
  lng: number;
  address?: string;
}

export interface NearbyIssueContext {
  id: string;
  title: string;
  description: string;
  category?: IssueCategory;
  lat: number;
  lng: number;
  status?: IssueStatus;
}

export interface TriageRequest {
  title: string;
  description: string;
  imageBase64?: string;
  imageMimeType?: UploadImageMimeType;
  location?: TriageLocationInput;
  nearbyIssues?: NearbyIssueContext[];
}

export interface AuthenticityCheck {
  isAuthentic: boolean;
  status: AuthenticityStatus;
  confidence: number;
  reason: string;
}

export interface DuplicateDetection {
  isLikelyDuplicate: boolean;
  matchedIssueIds: string[];
  highestSimilarity: number;
  reason: string;
}

export interface TriageResult {
  category: IssueCategory;
  urgencyScore: number;
  priorityLevel: PriorityLevel;
  recommendedDepartment: Department;
  slaEstimateHours: number;
  slaEstimateText: string;
  authenticityCheck: AuthenticityCheck;
  duplicateDetection: DuplicateDetection;
  summary: string;
  reasoning: string;
}

export interface TriageMetadata {
  engine: TriageEngine;
  model: string;
  cacheHit: boolean;
  cacheKey: string;
  fallbackReason?: TriageFallbackReason;
  latencyMs: number;
  timestamp: string;
}

export interface TriageResponse {
  triage: TriageResult;
  metadata: TriageMetadata;
}

export interface IssueLocation {
  lat: number;
  lng: number;
  address: string;
}

export interface CivicIssueTriageMeta {
  engine: TriageEngine;
  model: string;
  cacheHit: boolean;
  authenticityStatus: AuthenticityStatus;
  authenticityReason: string;
  potentialDuplicateIds: string[];
  highestSimilarity: number;
}

export interface CivicIssue {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  location: IssueLocation;
  status: IssueStatus;
  priorityLevel: PriorityLevel;
  urgencyScore: number;
  recommendedDepartment: Department;
  assignedDepartment: Department;
  slaEstimateHours: number;
  slaSummary: string;
  triageMeta: CivicIssueTriageMeta;
  imageDataUrl: string | null;
  reporterUid: string;
  reporterDisplayName: string;
  isGuest: boolean;
  upvoteCount: number;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface CivicSession {
  uid: string;
  displayName: string;
  email: string | null;
  role: UserRole;
  provider: AuthProviderKind;
  isAnonymous: boolean;
  isPreviewAdmin: boolean;
  isVerifiedFirebaseAdmin: boolean;
  getIdToken: () => Promise<string | null>;
}

export interface IssueCreateInput {
  title: string;
  description: string;
  category: IssueCategory;
  location: IssueLocation;
  priorityLevel: PriorityLevel;
  urgencyScore: number;
  recommendedDepartment: Department;
  assignedDepartment?: Department;
  slaEstimateHours: number;
  slaSummary: string;
  triageMeta: CivicIssueTriageMeta;
  imageDataUrl?: string | null;
}

export interface IssueAdminUpdateInput {
  status?: IssueStatus;
  assignedDepartment?: Department;
  resolutionNotes?: string | null;
}

export interface IssueFilterOptions {
  limitCount?: number;
  department?: Department;
  status?: IssueStatus;
}

export type ApiErrorCode =
  | 'INVALID_PAYLOAD'
  | 'METHOD_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR';

export interface ApiErrorDetail {
  code: ApiErrorCode;
  message: string;
  details?: string[];
  requestId: string;
}

export interface ApiErrorEnvelope {
  error: ApiErrorDetail;
}

export interface HealthResponse {
  ok: true;
  service: 'civicresolve-api';
  ai: {
    configured: boolean;
    mode: TriageEngine;
    model: string;
  };
  security: {
    authLockdown: boolean;
  };
}
