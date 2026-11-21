import { z } from 'zod';
import {
  MAX_DUPLICATE_MATCH_IDS,
  MAX_ISSUES_LIMIT,
  MAX_SLA_ESTIMATE_HOURS,
  MAX_STORED_WEBP_BYTES,
  MAX_STORED_WEBP_DATA_URL_LENGTH,
  WEBP_DATA_URL_PREFIX,
} from '../types/civic.js';
import {
  AuthenticityStatusSchema,
  DepartmentSchema,
  IsoDatetimeSchema,
  IssueCategorySchema,
  IssueStatusSchema,
  LatitudeSchema,
  LongitudeSchema,
  PriorityLevelSchema,
  TriageEngineSchema,
  getBase64DecodedByteLength,
  safeCivicText,
} from './triage.js';

export type StoredWebpValidationResult =
  | { valid: true; byteLength: number }
  | { valid: false; reason: string };

export function validateStoredWebpDataUrl(
  dataUrl: string,
): StoredWebpValidationResult {
  if (dataUrl.length > MAX_STORED_WEBP_DATA_URL_LENGTH) {
    return {
      valid: false,
      reason: `imageDataUrl exceeds maximum length of ${MAX_STORED_WEBP_DATA_URL_LENGTH} characters`,
    };
  }
  if (!dataUrl.startsWith(WEBP_DATA_URL_PREFIX)) {
    return {
      valid: false,
      reason: `imageDataUrl must start with ${WEBP_DATA_URL_PREFIX}`,
    };
  }
  const base64Payload = dataUrl.slice(WEBP_DATA_URL_PREFIX.length);
  const byteLength = getBase64DecodedByteLength(base64Payload);
  if (byteLength <= 0) {
    return {
      valid: false,
      reason: 'imageDataUrl must contain valid non-empty base64 WebP data',
    };
  }
  if (byteLength > MAX_STORED_WEBP_BYTES) {
    return {
      valid: false,
      reason: `Decoded WebP payload (${byteLength} bytes) exceeds maximum of ${MAX_STORED_WEBP_BYTES} bytes (120 KB)`,
    };
  }
  return { valid: true, byteLength };
}

export const StoredWebpDataUrlSchema = z.string().superRefine((val, ctx) => {
  const result = validateStoredWebpDataUrl(val);
  if (!result.valid) {
    ctx.addIssue({
      code: 'custom',
      message: result.reason,
    });
  }
});

export const IssueLocationSchema = z.object({
  lat: LatitudeSchema,
  lng: LongitudeSchema,
  address: safeCivicText({
    min: 1,
    max: 240,
    fieldName: 'location.address',
  }),
});

export const CivicIssueTriageMetaSchema = z.object({
  engine: TriageEngineSchema,
  model: safeCivicText({ min: 1, max: 64, fieldName: 'triageMeta.model' }),
  cacheHit: z.boolean(),
  authenticityStatus: AuthenticityStatusSchema,
  authenticityReason: safeCivicText({
    min: 1,
    max: 300,
    fieldName: 'triageMeta.authenticityReason',
  }),
  potentialDuplicateIds: z
    .array(
      safeCivicText({
        min: 1,
        max: 128,
        fieldName: 'triageMeta.potentialDuplicateIds',
      }),
    )
    .max(MAX_DUPLICATE_MATCH_IDS),
  highestSimilarity: z.number().finite().min(0).max(1),
});

export const IssueCreateSchema = z.object({
  title: safeCivicText({ min: 5, max: 120, fieldName: 'title' }),
  description: safeCivicText({
    min: 10,
    max: 2000,
    fieldName: 'description',
  }),
  category: IssueCategorySchema,
  location: IssueLocationSchema,
  priorityLevel: PriorityLevelSchema,
  urgencyScore: z.number().int().min(1).max(10),
  recommendedDepartment: DepartmentSchema,
  assignedDepartment: DepartmentSchema.optional(),
  slaEstimateHours: z.number().finite().positive().max(MAX_SLA_ESTIMATE_HOURS),
  slaSummary: safeCivicText({ min: 1, max: 160, fieldName: 'slaSummary' }),
  triageMeta: CivicIssueTriageMetaSchema,
  imageDataUrl: StoredWebpDataUrlSchema.nullable().optional(),
});

export const IssueUpdateSchema = z
  .object({
    status: IssueStatusSchema.optional(),
    assignedDepartment: DepartmentSchema.optional(),
    resolutionNotes: safeCivicText({
      min: 1,
      max: 1000,
      fieldName: 'resolutionNotes',
    })
      .nullable()
      .optional(),
  })
  .refine(
    (data) =>
      data.status !== undefined ||
      data.assignedDepartment !== undefined ||
      data.resolutionNotes !== undefined,
    {
      message:
        'At least one field (status, assignedDepartment, or resolutionNotes) must be provided',
    },
  );

export const IssueFilterSchema = z.object({
  limitCount: z
    .number()
    .int()
    .min(1)
    .max(
      MAX_ISSUES_LIMIT,
      `limitCount cannot exceed ${MAX_ISSUES_LIMIT}`,
    )
    .optional(),
  department: DepartmentSchema.optional(),
  status: IssueStatusSchema.optional(),
});

export const CivicIssueSchema = z.object({
  id: safeCivicText({ min: 1, max: 128, fieldName: 'id' }),
  title: safeCivicText({ min: 5, max: 120, fieldName: 'title' }),
  description: safeCivicText({
    min: 10,
    max: 2000,
    fieldName: 'description',
  }),
  category: IssueCategorySchema,
  location: IssueLocationSchema,
  status: IssueStatusSchema,
  priorityLevel: PriorityLevelSchema,
  urgencyScore: z.number().int().min(1).max(10),
  recommendedDepartment: DepartmentSchema,
  assignedDepartment: DepartmentSchema,
  slaEstimateHours: z.number().finite().positive().max(MAX_SLA_ESTIMATE_HOURS),
  slaSummary: safeCivicText({ min: 1, max: 160, fieldName: 'slaSummary' }),
  triageMeta: CivicIssueTriageMetaSchema,
  imageDataUrl: StoredWebpDataUrlSchema.nullable(),
  reporterUid: safeCivicText({ min: 1, max: 128, fieldName: 'reporterUid' }),
  reporterDisplayName: safeCivicText({
    min: 1,
    max: 50,
    fieldName: 'reporterDisplayName',
  }),
  isGuest: z.boolean(),
  upvoteCount: z.number().int().min(1),
  resolutionNotes: safeCivicText({
    min: 1,
    max: 1000,
    fieldName: 'resolutionNotes',
  }).nullable(),
  createdAt: IsoDatetimeSchema,
  updatedAt: IsoDatetimeSchema,
  resolvedAt: IsoDatetimeSchema.nullable(),
});
