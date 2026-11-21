import { z } from 'zod';
import {
  AUTHENTICITY_STATUSES,
  DEPARTMENTS,
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  MAX_DUPLICATE_MATCH_IDS,
  MAX_NEARBY_ISSUES_CONTEXT,
  MAX_RAW_UPLOAD_BASE64_LENGTH,
  MAX_RAW_UPLOAD_IMAGE_BYTES,
  MAX_SLA_ESTIMATE_HOURS,
  PRIORITY_LEVELS,
  SUPPORTED_UPLOAD_IMAGE_MIMES,
  TRIAGE_ENGINES,
  TRIAGE_FALLBACK_REASONS,
  type UploadImageMimeType,
} from '../types/civic.js';

const UNSAFE_HTML_TAG_REGEX = /<[a-z!/]/i;
const UNSAFE_URI_SCHEME_REGEX =
  /\b(?:javascript|vbscript)\s*:|data\s*:\s*(?:text\/html|image\/svg\+xml|application\/xhtml\+xml)/i;
const COMPACT_UNSAFE_URI_SCHEME_REGEX =
  /(?:javascript|vbscript):|data:(?:text\/html|image\/svg\+xml|application\/xhtml\+xml)/i;
const EVENT_HANDLER_REGEX = /\bon[a-z]{3,40}\s*=/i;
const HTML_HEX_ENTITY_REGEX = /&#x([0-9a-f]+);?/gi;
const HTML_DEC_ENTITY_REGEX = /&#(\d+);?/g;
const HTML_NAMED_URI_ENTITY_REGEX = /&(colon|tab|newline|nbsp|equals);/gi;
const BASE64_PAYLOAD_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;
const ISO_DATETIME_BASE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const ISO_FRACTION_REGEX = /^\.\d{1,9}$/;
const ISO_OFFSET_REGEX = /^[+-]\d{2}:\d{2}$/;
const MAX_LEADING_TRAILING_WHITESPACE_BUFFER = 64;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function isValidIsoDatetime(value: string): boolean {
  if (value.length < 20 || value.length > 36) {
    return false;
  }
  const base = value.slice(0, 19);
  if (!ISO_DATETIME_BASE_REGEX.test(base)) {
    return false;
  }
  const year = Number.parseInt(base.slice(0, 4), 10);
  const month = Number.parseInt(base.slice(5, 7), 10);
  const day = Number.parseInt(base.slice(8, 10), 10);
  const hour = Number.parseInt(base.slice(11, 13), 10);
  const minute = Number.parseInt(base.slice(14, 16), 10);
  const second = Number.parseInt(base.slice(17, 19), 10);

  if (month < 1 || month > 12) {
    return false;
  }
  if (day < 1 || day > getDaysInMonth(year, month)) {
    return false;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return false;
  }

  const rest = value.slice(19);
  let fraction: string;
  if (rest.endsWith('Z')) {
    fraction = rest.slice(0, -1);
  } else if (rest.length >= 6) {
    const offset = rest.slice(-6);
    if (!ISO_OFFSET_REGEX.test(offset)) {
      return false;
    }
    const offsetHour = Number.parseInt(offset.slice(1, 3), 10);
    const offsetMinute = Number.parseInt(offset.slice(4, 6), 10);
    if (offsetHour > 23 || offsetMinute > 59) {
      return false;
    }
    fraction = rest.slice(0, -6);
  } else {
    return false;
  }
  if (fraction.length > 0 && !ISO_FRACTION_REGEX.test(fraction)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function decodeHtmlEntityCodePoint(
  match: string,
  digits: string,
  radix: number,
): string {
  const codePoint = Number.parseInt(digits, radix);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return match;
  }
  if (codePoint <= 0x1f) {
    return ' ';
  }
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    return '\uFFFD';
  }
  return String.fromCodePoint(codePoint);
}

function decodeEntitiesForSecurityCheck(value: string): string {
  if (!value.includes('&')) {
    return value;
  }
  return value
    .replace(HTML_HEX_ENTITY_REGEX, (match, hex: string) =>
      decodeHtmlEntityCodePoint(match, hex, 16),
    )
    .replace(HTML_DEC_ENTITY_REGEX, (match, dec: string) =>
      decodeHtmlEntityCodePoint(match, dec, 10),
    )
    .replace(HTML_NAMED_URI_ENTITY_REGEX, (match, name: string) => {
      switch (name.toLowerCase()) {
        case 'colon':
          return ':';
        case 'tab':
          return '\t';
        case 'newline':
          return '\n';
        case 'nbsp':
          return ' ';
        case 'equals':
          return '=';
        default:
          return match;
      }
    });
}

export function hasDisallowedControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    ) {
      return true;
    }
  }
  return false;
}

export function hasUnsafeXssPattern(value: string): boolean {
  if (
    UNSAFE_HTML_TAG_REGEX.test(value) ||
    UNSAFE_URI_SCHEME_REGEX.test(value) ||
    EVENT_HANDLER_REGEX.test(value)
  ) {
    return true;
  }
  const decoded = decodeEntitiesForSecurityCheck(value);
  if (
    decoded !== value &&
    (UNSAFE_HTML_TAG_REGEX.test(decoded) ||
      UNSAFE_URI_SCHEME_REGEX.test(decoded) ||
      EVENT_HANDLER_REGEX.test(decoded))
  ) {
    return true;
  }
  const compact = decoded.replace(/\s+/g, '');
  return COMPACT_UNSAFE_URI_SCHEME_REGEX.test(compact);
}

export function isValidBase64Payload(payload: string): boolean {
  return (
    payload.length > 0 &&
    payload.length % 4 === 0 &&
    BASE64_PAYLOAD_REGEX.test(payload)
  );
}

export function getBase64DecodedByteLength(base64Payload: string): number {
  if (!isValidBase64Payload(base64Payload)) {
    return -1;
  }
  let padding = 0;
  if (base64Payload.endsWith('==')) {
    padding = 2;
  } else if (base64Payload.endsWith('=')) {
    padding = 1;
  }
  return (base64Payload.length / 4) * 3 - padding;
}

export function safeCivicText(options: {
  min: number;
  max: number;
  fieldName: string;
}) {
  const rawMax = options.max + MAX_LEADING_TRAILING_WHITESPACE_BUFFER;
  return z
    .string()
    .max(
      rawMax,
      `${options.fieldName} exceeds maximum raw length of ${rawMax} characters`,
    )
    .trim()
    .min(
      options.min,
      `${options.fieldName} must be at least ${options.min} character(s)`,
    )
    .max(
      options.max,
      `${options.fieldName} must be at most ${options.max} character(s)`,
    )
    .refine(
      (value) => !hasDisallowedControlChars(value),
      `${options.fieldName} contains disallowed control characters`,
    )
    .refine(
      (value) => !hasUnsafeXssPattern(value),
      `${options.fieldName} contains potentially unsafe HTML or script content`,
    );
}

export const LatitudeSchema = z
  .number()
  .finite('Latitude must be a finite number')
  .min(-90, 'Latitude must be >= -90')
  .max(90, 'Latitude must be <= 90');

export const LongitudeSchema = z
  .number()
  .finite('Longitude must be a finite number')
  .min(-180, 'Longitude must be >= -180')
  .max(180, 'Longitude must be <= 180');

export const IsoDatetimeSchema = z
  .string()
  .refine(isValidIsoDatetime, 'Must be a valid ISO-8601 datetime');

export const DepartmentSchema = z.enum(DEPARTMENTS);
export const PriorityLevelSchema = z.enum(PRIORITY_LEVELS);
export const IssueStatusSchema = z.enum(ISSUE_STATUSES);
export const IssueCategorySchema = z.enum(ISSUE_CATEGORIES);
export const TriageEngineSchema = z.enum(TRIAGE_ENGINES);
export const TriageFallbackReasonSchema = z.enum(TRIAGE_FALLBACK_REASONS);
export const UploadImageMimeTypeSchema = z.enum(SUPPORTED_UPLOAD_IMAGE_MIMES);
export const AuthenticityStatusSchema = z.enum(AUTHENTICITY_STATUSES);

export const TriageLocationInputSchema = z.object({
  lat: LatitudeSchema,
  lng: LongitudeSchema,
  address: safeCivicText({
    min: 1,
    max: 240,
    fieldName: 'location.address',
  }).optional(),
});

export const NearbyIssueContextSchema = z.object({
  id: safeCivicText({ min: 1, max: 128, fieldName: 'nearbyIssues.id' }),
  title: safeCivicText({ min: 1, max: 120, fieldName: 'nearbyIssues.title' }),
  description: safeCivicText({
    min: 1,
    max: 2000,
    fieldName: 'nearbyIssues.description',
  }),
  category: IssueCategorySchema.optional(),
  lat: LatitudeSchema,
  lng: LongitudeSchema,
  status: IssueStatusSchema.optional(),
});

function hasExcessiveEdgeWhitespace(
  value: string,
  maxEdgeWhitespace: number,
): boolean {
  const head = value.slice(0, maxEdgeWhitespace + 1);
  const leading = head.length - head.trimStart().length;
  if (leading > maxEdgeWhitespace) {
    return true;
  }
  const tail = value.slice(
    Math.max(leading, value.length - (maxEdgeWhitespace + 1)),
  );
  const trailing = tail.length - tail.trimEnd().length;
  return leading + trailing > maxEdgeWhitespace;
}

function isUploadImageMimeType(value: string): value is UploadImageMimeType {
  return (
    value === 'image/webp' ||
    value === 'image/jpeg' ||
    value === 'image/png'
  );
}

export const TriageRequestSchema = z
  .object({
    title: safeCivicText({ min: 5, max: 120, fieldName: 'title' }),
    description: safeCivicText({
      min: 10,
      max: 2000,
      fieldName: 'description',
    }),
    imageBase64: z
      .string()
      .max(
        MAX_RAW_UPLOAD_BASE64_LENGTH + MAX_LEADING_TRAILING_WHITESPACE_BUFFER,
        'imageBase64 exceeds maximum encoded length for 5 MB upload',
      )
      .refine(
        (value) =>
          !hasExcessiveEdgeWhitespace(
            value,
            MAX_LEADING_TRAILING_WHITESPACE_BUFFER,
          ),
        'imageBase64 contains excessive leading or trailing whitespace',
      )
      .trim()
      .min(1, 'imageBase64 cannot be empty')
      .max(
        MAX_RAW_UPLOAD_BASE64_LENGTH,
        'imageBase64 exceeds maximum encoded length for 5 MB upload',
      )
      .optional(),
    imageMimeType: UploadImageMimeTypeSchema.optional(),
    location: TriageLocationInputSchema.optional(),
    nearbyIssues: z
      .array(NearbyIssueContextSchema)
      .max(
        MAX_NEARBY_ISSUES_CONTEXT,
        `nearbyIssues cannot exceed ${MAX_NEARBY_ISSUES_CONTEXT} entries`,
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.imageBase64 === undefined) {
      if (data.imageMimeType !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['imageMimeType'],
          message: 'imageMimeType cannot be set without imageBase64',
        });
      }
      return;
    }

    const raw = data.imageBase64;
    let prefixMime: UploadImageMimeType | null = null;
    let base64Body = raw;

    if (raw.slice(0, 5).toLowerCase() === 'data:') {
      const markerIndex = raw.slice(0, 80).toLowerCase().indexOf(';base64,');
      if (markerIndex === -1 || markerIndex > 64) {
        ctx.addIssue({
          code: 'custom',
          path: ['imageBase64'],
          message: 'Image data URI must be base64-encoded webp, jpeg, or png',
        });
        return;
      }
      const rawMime = raw.slice(5, markerIndex).toLowerCase();
      if (!isUploadImageMimeType(rawMime)) {
        ctx.addIssue({
          code: 'custom',
          path: ['imageBase64'],
          message:
            'Unsupported image MIME type; allowed: image/webp, image/jpeg, image/png',
        });
        return;
      }
      prefixMime = rawMime;
      base64Body = raw.slice(markerIndex + ';base64,'.length);
    }

    if (prefixMime === null && data.imageMimeType === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['imageMimeType'],
        message:
          'imageMimeType is required when imageBase64 does not include a data URI prefix',
      });
    } else if (
      prefixMime !== null &&
      data.imageMimeType !== undefined &&
      data.imageMimeType !== prefixMime
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['imageMimeType'],
        message: 'imageMimeType does not match imageBase64 data URI MIME type',
      });
    }

    const decodedBytes = getBase64DecodedByteLength(base64Body);
    if (decodedBytes <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['imageBase64'],
        message: 'imageBase64 must contain valid non-empty base64 image data',
      });
      return;
    }

    if (decodedBytes > MAX_RAW_UPLOAD_IMAGE_BYTES) {
      ctx.addIssue({
        code: 'custom',
        path: ['imageBase64'],
        message: `Image exceeds maximum upload size of ${MAX_RAW_UPLOAD_IMAGE_BYTES} bytes (5 MB)`,
      });
    }
  });

export const AuthenticityCheckSchema = z.object({
  isAuthentic: z.boolean(),
  status: AuthenticityStatusSchema,
  confidence: z.number().finite().min(0).max(1),
  reason: safeCivicText({
    min: 1,
    max: 300,
    fieldName: 'authenticityCheck.reason',
  }),
});

export const DuplicateDetectionSchema = z.object({
  isLikelyDuplicate: z.boolean(),
  matchedIssueIds: z
    .array(
      safeCivicText({
        min: 1,
        max: 128,
        fieldName: 'duplicateDetection.matchedIssueIds',
      }),
    )
    .max(MAX_DUPLICATE_MATCH_IDS),
  highestSimilarity: z.number().finite().min(0).max(1),
  reason: safeCivicText({
    min: 1,
    max: 300,
    fieldName: 'duplicateDetection.reason',
  }),
});

export const TriageResultSchema = z.object({
  category: IssueCategorySchema,
  urgencyScore: z.number().int().min(1).max(10),
  priorityLevel: PriorityLevelSchema,
  recommendedDepartment: DepartmentSchema,
  slaEstimateHours: z.number().finite().positive().max(MAX_SLA_ESTIMATE_HOURS),
  slaEstimateText: safeCivicText({
    min: 1,
    max: 160,
    fieldName: 'slaEstimateText',
  }),
  authenticityCheck: AuthenticityCheckSchema,
  duplicateDetection: DuplicateDetectionSchema,
  summary: safeCivicText({ min: 1, max: 500, fieldName: 'summary' }),
  reasoning: safeCivicText({ min: 1, max: 1000, fieldName: 'reasoning' }),
});

export const TriageMetadataSchema = z.object({
  engine: TriageEngineSchema,
  model: safeCivicText({ min: 1, max: 64, fieldName: 'metadata.model' }),
  cacheHit: z.boolean(),
  cacheKey: safeCivicText({
    min: 1,
    max: 128,
    fieldName: 'metadata.cacheKey',
  }),
  fallbackReason: TriageFallbackReasonSchema.optional(),
  latencyMs: z.number().finite().nonnegative().max(120_000),
  timestamp: IsoDatetimeSchema,
});

export const TriageResponseSchema = z.object({
  triage: TriageResultSchema,
  metadata: TriageMetadataSchema,
});
