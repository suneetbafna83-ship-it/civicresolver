import {
  getBase64DecodedByteLength,
  hasUnsafeXssPattern,
} from '../../../shared/schemas/triage.js';
import {
  MAX_RAW_UPLOAD_BASE64_LENGTH,
  MAX_RAW_UPLOAD_IMAGE_BYTES,
  type TriageRequest,
  type TriageResult,
  type UploadImageMimeType,
} from '../../../shared/types/civic.js';

const HTML_TAG_REGEX = /<\/?[a-z!][^>]*>/gi;
const EVENT_HANDLER_STRIP_REGEX = /\bon[a-z]{3,40}\s*=/gi;
const UNSAFE_SCHEME_STRIP_REGEX =
  /\b(?:javascript|vbscript)\s*:|data\s*:\s*(?:text\/html|image\/svg\+xml|application\/xhtml\+xml)/gi;
const HTML_ENTITY_PREFIX_REGEX = /&#x?[0-9a-f]+;?/gi;
const HTML_NAMED_CONTROL_ENTITY_REGEX = /&(colon|tab|newline|equals);/gi;

export type ImageValidationOutcome =
  | {
      readonly ok: true;
      readonly mimeType: UploadImageMimeType;
      readonly base64Data: string;
      readonly byteLength: number;
    }
  | {
      readonly ok: false;
      readonly code: 'INVALID_PAYLOAD';
      readonly message: string;
    };

function isUploadImageMimeType(value: string): value is UploadImageMimeType {
  return (
    value === 'image/webp' ||
    value === 'image/jpeg' ||
    value === 'image/png'
  );
}

function hasValidMagicBytes(
  header: Uint8Array,
  mimeType: UploadImageMimeType,
): boolean {
  switch (mimeType) {
    case 'image/png':
      return (
        header.length >= 8 &&
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47 &&
        header[4] === 0x0d &&
        header[5] === 0x0a &&
        header[6] === 0x1a &&
        header[7] === 0x0a
      );
    case 'image/jpeg':
      return (
        header.length >= 3 &&
        header[0] === 0xff &&
        header[1] === 0xd8 &&
        header[2] === 0xff
      );
    case 'image/webp':
      return (
        header.length >= 12 &&
        header[0] === 0x52 &&
        header[1] === 0x49 &&
        header[2] === 0x46 &&
        header[3] === 0x46 &&
        header[8] === 0x57 &&
        header[9] === 0x45 &&
        header[10] === 0x42 &&
        header[11] === 0x50
      );
  }
}

export function validateAndNormalizeUploadImage(
  imageBase64: string,
  imageMimeType?: UploadImageMimeType,
): ImageValidationOutcome {
  const trimmed = imageBase64.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_RAW_UPLOAD_BASE64_LENGTH) {
    return {
      ok: false,
      code: 'INVALID_PAYLOAD',
      message: 'Image payload is empty or exceeds maximum 5 MB encoded length',
    };
  }

  let declaredMime: UploadImageMimeType | null = null;
  let base64Body = trimmed;

  if (trimmed.slice(0, 5).toLowerCase() === 'data:') {
    const markerIndex = trimmed.slice(0, 80).toLowerCase().indexOf(';base64,');
    if (markerIndex === -1 || markerIndex > 64) {
      return {
        ok: false,
        code: 'INVALID_PAYLOAD',
        message: 'Image data URI must be base64-encoded webp, jpeg, or png',
      };
    }
    const rawMime = trimmed.slice(5, markerIndex).toLowerCase();
    if (!isUploadImageMimeType(rawMime)) {
      return {
        ok: false,
        code: 'INVALID_PAYLOAD',
        message:
          'Unsupported image MIME type; allowed: image/webp, image/jpeg, image/png',
      };
    }
    declaredMime = rawMime;
    base64Body = trimmed.slice(markerIndex + ';base64,'.length);
  }

  const resolvedMime = declaredMime ?? imageMimeType ?? null;
  if (resolvedMime === null) {
    return {
      ok: false,
      code: 'INVALID_PAYLOAD',
      message:
        'imageMimeType is required when imageBase64 does not include a data URI prefix',
    };
  }

  if (
    declaredMime !== null &&
    imageMimeType !== undefined &&
    declaredMime !== imageMimeType
  ) {
    return {
      ok: false,
      code: 'INVALID_PAYLOAD',
      message: 'imageMimeType does not match imageBase64 data URI MIME type',
    };
  }

  const byteLength = getBase64DecodedByteLength(base64Body);
  if (byteLength <= 0) {
    return {
      ok: false,
      code: 'INVALID_PAYLOAD',
      message: 'imageBase64 must contain valid non-empty base64 image data',
    };
  }

  if (byteLength > MAX_RAW_UPLOAD_IMAGE_BYTES) {
    return {
      ok: false,
      code: 'INVALID_PAYLOAD',
      message: `Image exceeds maximum upload size of ${MAX_RAW_UPLOAD_IMAGE_BYTES} bytes (5 MB)`,
    };
  }

  const headerSlice = base64Body.slice(0, 16);
  const headerBytes = Buffer.from(headerSlice, 'base64');
  if (!hasValidMagicBytes(headerBytes, resolvedMime)) {
    return {
      ok: false,
      code: 'INVALID_PAYLOAD',
      message: `Decoded image header bytes do not match declared MIME type ${resolvedMime}`,
    };
  }

  return {
    ok: true,
    mimeType: resolvedMime,
    base64Data: base64Body,
    byteLength,
  };
}

export function stripDisallowedControlChars(value: string): string {
  let result = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const isDisallowed =
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f;
    if (!isDisallowed) {
      result += value.charAt(i);
    }
  }
  return result;
}

function stripScriptBlocksLinear(value: string): string {
  let result = '';
  let cursor = 0;

  while (cursor < value.length) {
    const lowerSlice = value.slice(cursor).toLowerCase();
    const openRel = lowerSlice.indexOf('<script');
    if (openRel === -1) {
      result += value.slice(cursor);
      break;
    }

    result += value.slice(cursor, cursor + openRel);
    const afterOpen = cursor + openRel + '<script'.length;
    const closeRel = value.slice(afterOpen).toLowerCase().indexOf('</script>');
    if (closeRel === -1) {
      const gtRel = value.slice(afterOpen).indexOf('>');
      cursor = gtRel === -1 ? value.length : afterOpen + gtRel + 1;
    } else {
      cursor = afterOpen + closeRel + '</script>'.length;
    }
  }

  return result;
}

function cleanUnsafeMarkupPass(input: string): string {
  return stripScriptBlocksLinear(input)
    .replace(HTML_TAG_REGEX, ' ')
    .replace(EVENT_HANDLER_STRIP_REGEX, '')
    .replace(UNSAFE_SCHEME_STRIP_REGEX, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function sanitizeText(value: string): string {
  const withoutControls = stripDisallowedControlChars(value);
  let cleaned = cleanUnsafeMarkupPass(withoutControls);

  if (hasUnsafeXssPattern(cleaned)) {
    const withoutEntities = cleaned
      .replace(HTML_ENTITY_PREFIX_REGEX, ' ')
      .replace(HTML_NAMED_CONTROL_ENTITY_REGEX, ' ');
    cleaned = cleanUnsafeMarkupPass(withoutEntities);
  }

  if (hasUnsafeXssPattern(cleaned)) {
    cleaned = cleaned.replace(/[<>]/g, '').trim();
  }

  return cleaned;
}

function sanitizeBoundedText(
  value: string,
  maxLength: number,
  fallback: string,
): string {
  const cleaned = sanitizeText(value);
  if (cleaned.length === 0) {
    return fallback;
  }
  return cleaned.length > maxLength
    ? cleaned.slice(0, maxLength).trimEnd()
    : cleaned;
}

export function sanitizeTriageResult(result: TriageResult): TriageResult {
  return {
    ...result,
    slaEstimateText: sanitizeBoundedText(
      result.slaEstimateText,
      160,
      'Within 72 hours',
    ),
    authenticityCheck: {
      ...result.authenticityCheck,
      reason: sanitizeBoundedText(
        result.authenticityCheck.reason,
        300,
        'Civic report reviewed for consistency.',
      ),
    },
    duplicateDetection: {
      ...result.duplicateDetection,
      matchedIssueIds: result.duplicateDetection.matchedIssueIds
        .map((id) => sanitizeBoundedText(id, 128, ''))
        .filter((id) => id.length > 0),
      reason: sanitizeBoundedText(
        result.duplicateDetection.reason,
        300,
        'Checked against nearby civic reports.',
      ),
    },
    summary: sanitizeBoundedText(
      result.summary,
      500,
      'Civic issue triaged for municipal review.',
    ),
    reasoning: sanitizeBoundedText(
      result.reasoning,
      1000,
      'Categorized and prioritized based on civic impact signals.',
    ),
  };
}

export type SanitizedTriageRequestOutcome =
  | { readonly ok: true; readonly data: TriageRequest }
  | { readonly ok: false; readonly code: 'INVALID_PAYLOAD'; readonly message: string };

export function sanitizeTriageRequest(
  request: TriageRequest,
): SanitizedTriageRequestOutcome {
  let normalizedImage: ImageValidationOutcome | null = null;
  if (request.imageBase64 !== undefined) {
    normalizedImage = validateAndNormalizeUploadImage(
      request.imageBase64,
      request.imageMimeType,
    );
    if (!normalizedImage.ok) {
      return normalizedImage;
    }
  }

  const sanitizedLocation = request.location
    ? {
        lat: request.location.lat,
        lng: request.location.lng,
        ...(request.location.address !== undefined
          ? { address: sanitizeText(request.location.address) }
          : {}),
      }
    : undefined;

  const sanitizedNearby = request.nearbyIssues?.map((issue) => ({
    ...issue,
    id: sanitizeText(issue.id),
    title: sanitizeText(issue.title),
    description: sanitizeText(issue.description),
  }));

  const normalizedRequest: TriageRequest = {
    title: sanitizeText(request.title),
    description: sanitizeText(request.description),
    ...(normalizedImage !== null
      ? {
          imageBase64: normalizedImage.base64Data,
          imageMimeType: normalizedImage.mimeType,
        }
      : {}),
    ...(sanitizedLocation !== undefined ? { location: sanitizedLocation } : {}),
    ...(sanitizedNearby !== undefined ? { nearbyIssues: sanitizedNearby } : {}),
  };

  return { ok: true, data: normalizedRequest };
}
