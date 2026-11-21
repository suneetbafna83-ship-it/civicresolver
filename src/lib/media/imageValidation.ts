import {
  MAX_RAW_UPLOAD_IMAGE_BYTES,
  MAX_STORED_WEBP_BYTES,
  MAX_STORED_WEBP_DATA_URL_LENGTH,
  SUPPORTED_UPLOAD_IMAGE_MIMES,
  WEBP_DATA_URL_PREFIX,
  type UploadImageMimeType,
} from '../../../shared/types/civic.js';
import { validateStoredWebpDataUrl } from '../../../shared/schemas/issue.js';

export type ImageValidationErrorCode =
  | 'INVALID_TYPE'
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_BASE64'
  | 'INVALID_MAGIC_BYTES';

export type ImageValidationResult =
  | {
      readonly valid: true;
      readonly mimeType: UploadImageMimeType;
      readonly byteLength: number;
    }
  | {
      readonly valid: false;
      readonly code: ImageValidationErrorCode;
      readonly reason: string;
    };

export interface UploadImageBlobLike {
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  slice?: (start?: number, end?: number) => Blob;
}

const MAGIC_HEADER_READ_BYTES = 12;
const WEBP_HEADER_BASE64_CHARS = 16;

export function isSupportedUploadImageMime(mime: string): mime is UploadImageMimeType {
  const normalized = mime.trim().toLowerCase();
  for (const allowed of SUPPORTED_UPLOAD_IMAGE_MIMES) {
    if (allowed === normalized) {
      return true;
    }
  }
  return false;
}

function isJpegMagicBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function isPngMagicBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isWebpMagicBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  );
}

export function detectImageMimeFromMagicBytes(
  bytes: Uint8Array,
): UploadImageMimeType | null {
  if (isJpegMagicBytes(bytes)) {
    return 'image/jpeg';
  }
  if (isPngMagicBytes(bytes)) {
    return 'image/png';
  }
  if (isWebpMagicBytes(bytes)) {
    return 'image/webp';
  }
  return null;
}

export function hasValidImageMagicBytes(
  bytes: Uint8Array,
  expectedMime: UploadImageMimeType,
): boolean {
  switch (expectedMime) {
    case 'image/jpeg':
      return isJpegMagicBytes(bytes);
    case 'image/png':
      return isPngMagicBytes(bytes);
    case 'image/webp':
      return isWebpMagicBytes(bytes);
    default:
      return false;
  }
}

export function validateUploadImageBytes(
  bytes: Uint8Array,
  declaredMime: string,
): ImageValidationResult {
  const normalizedMime = declaredMime.trim().toLowerCase();
  if (!isSupportedUploadImageMime(normalizedMime)) {
    return {
      valid: false,
      code: 'INVALID_TYPE',
      reason: `Unsupported image MIME type "${declaredMime}". Allowed: ${SUPPORTED_UPLOAD_IMAGE_MIMES.join(', ')}`,
    };
  }
  if (bytes.byteLength <= 0) {
    return {
      valid: false,
      code: 'EMPTY_FILE',
      reason: 'Uploaded image file is empty (0 bytes)',
    };
  }
  if (bytes.byteLength > MAX_RAW_UPLOAD_IMAGE_BYTES) {
    return {
      valid: false,
      code: 'FILE_TOO_LARGE',
      reason: `Uploaded image (${bytes.byteLength} bytes) exceeds 5 MB (${MAX_RAW_UPLOAD_IMAGE_BYTES} bytes) limit`,
    };
  }
  if (!hasValidImageMagicBytes(bytes, normalizedMime)) {
    return {
      valid: false,
      code: 'INVALID_MAGIC_BYTES',
      reason: `Image binary header does not match declared MIME type "${normalizedMime}"`,
    };
  }
  return {
    valid: true,
    mimeType: normalizedMime,
    byteLength: bytes.byteLength,
  };
}

export async function validateUploadImageFile(
  file: UploadImageBlobLike,
): Promise<ImageValidationResult> {
  const normalizedMime = file.type.trim().toLowerCase();
  if (!isSupportedUploadImageMime(normalizedMime)) {
    return {
      valid: false,
      code: 'INVALID_TYPE',
      reason: `Unsupported image MIME type "${file.type}". Allowed: ${SUPPORTED_UPLOAD_IMAGE_MIMES.join(', ')}`,
    };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return {
      valid: false,
      code: 'EMPTY_FILE',
      reason: 'Uploaded image file is empty (0 bytes)',
    };
  }
  if (file.size > MAX_RAW_UPLOAD_IMAGE_BYTES) {
    return {
      valid: false,
      code: 'FILE_TOO_LARGE',
      reason: `Uploaded image (${file.size} bytes) exceeds 5 MB (${MAX_RAW_UPLOAD_IMAGE_BYTES} bytes) limit`,
    };
  }

  let headerBytes: Uint8Array;
  try {
    const headerSlice =
      typeof file.slice === 'function'
        ? file.slice(0, MAGIC_HEADER_READ_BYTES)
        : file;
    const buffer = await headerSlice.arrayBuffer();
    headerBytes = new Uint8Array(buffer);
  } catch {
    return {
      valid: false,
      code: 'INVALID_MAGIC_BYTES',
      reason: 'Unable to read image binary header',
    };
  }

  if (headerBytes.byteLength === 0) {
    return {
      valid: false,
      code: 'EMPTY_FILE',
      reason: 'Uploaded image file contains no readable bytes',
    };
  }

  if (!hasValidImageMagicBytes(headerBytes, normalizedMime)) {
    return {
      valid: false,
      code: 'INVALID_MAGIC_BYTES',
      reason: `Image binary header does not match declared MIME type "${normalizedMime}"`,
    };
  }

  return {
    valid: true,
    mimeType: normalizedMime,
    byteLength: file.size,
  };
}

export function validateStoredWebpImage(dataUrl: string): ImageValidationResult {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    return {
      valid: false,
      code: 'EMPTY_FILE',
      reason: 'Stored WebP data URL must be a non-empty string',
    };
  }

  if (dataUrl.length > MAX_STORED_WEBP_DATA_URL_LENGTH) {
    return {
      valid: false,
      code: 'FILE_TOO_LARGE',
      reason: `imageDataUrl exceeds maximum length of ${MAX_STORED_WEBP_DATA_URL_LENGTH} characters`,
    };
  }

  // O(1) edge-whitespace guard without copying potentially large payloads
  if (
    dataUrl.charCodeAt(0) <= 0x20 ||
    dataUrl.charCodeAt(dataUrl.length - 1) <= 0x20
  ) {
    return {
      valid: false,
      code: 'INVALID_BASE64',
      reason: 'imageDataUrl must not contain leading or trailing whitespace',
    };
  }

  if (!dataUrl.startsWith(WEBP_DATA_URL_PREFIX)) {
    return {
      valid: false,
      code: 'INVALID_TYPE',
      reason: `imageDataUrl must start with ${WEBP_DATA_URL_PREFIX}`,
    };
  }

  const base64Payload = dataUrl.slice(WEBP_DATA_URL_PREFIX.length);
  if (base64Payload.length === 0) {
    return {
      valid: false,
      code: 'EMPTY_FILE',
      reason: 'imageDataUrl must contain non-empty base64 WebP payload',
    };
  }

  const structuralResult = validateStoredWebpDataUrl(dataUrl);
  if (!structuralResult.valid) {
    const isTooLarge = structuralResult.reason.includes(
      `${MAX_STORED_WEBP_BYTES} bytes`,
    );
    return {
      valid: false,
      code: isTooLarge ? 'FILE_TOO_LARGE' : 'INVALID_BASE64',
      reason: structuralResult.reason,
    };
  }

  if (base64Payload.length < WEBP_HEADER_BASE64_CHARS) {
    return {
      valid: false,
      code: 'INVALID_MAGIC_BYTES',
      reason: 'Stored WebP payload is too short to contain a valid RIFF/WEBP header',
    };
  }

  let headerBytes: Uint8Array;
  try {
    const decodedPrefix = atob(base64Payload.slice(0, WEBP_HEADER_BASE64_CHARS));
    headerBytes = Uint8Array.from(decodedPrefix, (ch) => ch.charCodeAt(0));
  } catch {
    return {
      valid: false,
      code: 'INVALID_BASE64',
      reason: 'imageDataUrl contains invalid base64 encoding in header',
    };
  }

  if (!hasValidImageMagicBytes(headerBytes, 'image/webp')) {
    return {
      valid: false,
      code: 'INVALID_MAGIC_BYTES',
      reason: 'Stored imageDataUrl does not contain valid WebP (RIFF/WEBP) magic bytes',
    };
  }

  return {
    valid: true,
    mimeType: 'image/webp',
    byteLength: structuralResult.byteLength,
  };
}
