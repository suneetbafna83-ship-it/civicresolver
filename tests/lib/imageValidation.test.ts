import { describe, expect, it } from 'vitest';
import {
  MAX_RAW_UPLOAD_IMAGE_BYTES,
  MAX_STORED_WEBP_BYTES,
  MAX_STORED_WEBP_DATA_URL_LENGTH,
  WEBP_DATA_URL_PREFIX,
} from '../../shared/types/civic.js';
import { validateStoredWebpDataUrl } from '../../shared/schemas/issue.js';
import {
  detectImageMimeFromMagicBytes,
  hasValidImageMagicBytes,
  isSupportedUploadImageMime,
  validateStoredWebpImage,
  validateUploadImageBytes,
  validateUploadImageFile,
  type UploadImageBlobLike,
} from '../../src/lib/media/imageValidation.js';

function createJpegBytes(totalSize = 32): Uint8Array {
  const bytes = new Uint8Array(totalSize);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  return bytes;
}

function createPngBytes(totalSize = 32): Uint8Array {
  const bytes = new Uint8Array(totalSize);
  bytes[0] = 0x89;
  bytes[1] = 0x50;
  bytes[2] = 0x4e;
  bytes[3] = 0x47;
  bytes[4] = 0x0d;
  bytes[5] = 0x0a;
  bytes[6] = 0x1a;
  bytes[7] = 0x0a;
  return bytes;
}

function createWebpBytes(totalSize = 32): Uint8Array {
  const bytes = new Uint8Array(Math.max(12, totalSize));
  // RIFF
  bytes[0] = 0x52;
  bytes[1] = 0x49;
  bytes[2] = 0x46;
  bytes[3] = 0x46;
  // size placeholder
  bytes[4] = 0x18;
  // WEBP
  bytes[8] = 0x57;
  bytes[9] = 0x45;
  bytes[10] = 0x42;
  bytes[11] = 0x50;
  return bytes;
}

function createWebpDataUrl(byteLength: number): string {
  const bytes = createWebpBytes(byteLength);
  return `${WEBP_DATA_URL_PREFIX}${Buffer.from(bytes).toString('base64')}`;
}

function createMockBlob(
  bytes: Uint8Array,
  mimeType: string,
  declaredSize = bytes.byteLength,
): UploadImageBlobLike {
  return {
    size: declaredSize,
    type: mimeType,
    async arrayBuffer(): Promise<ArrayBuffer> {
      return bytes.slice().buffer;
    },
    slice(start = 0, end = bytes.byteLength): Blob {
      return new Blob([bytes.slice(start, end)], { type: mimeType });
    },
  };
}

describe('Image Validation & Magic-Byte Guards', () => {
  it('recognizes supported upload MIME types and detects magic bytes accurately', () => {
    expect(isSupportedUploadImageMime('image/jpeg')).toBe(true);
    expect(isSupportedUploadImageMime('IMAGE/PNG')).toBe(true);
    expect(isSupportedUploadImageMime('image/webp')).toBe(true);
    expect(isSupportedUploadImageMime('image/svg+xml')).toBe(false);
    expect(isSupportedUploadImageMime('image/gif')).toBe(false);

    const jpeg = createJpegBytes();
    const png = createPngBytes();
    const webp = createWebpBytes();

    expect(detectImageMimeFromMagicBytes(jpeg)).toBe('image/jpeg');
    expect(detectImageMimeFromMagicBytes(png)).toBe('image/png');
    expect(detectImageMimeFromMagicBytes(webp)).toBe('image/webp');
    expect(detectImageMimeFromMagicBytes(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBeNull();

    expect(hasValidImageMagicBytes(jpeg, 'image/jpeg')).toBe(true);
    expect(hasValidImageMagicBytes(jpeg, 'image/png')).toBe(false);
  });

  it('validates pre-compression upload files up to 5 MB and rejects > 5 MB or 0 bytes', async () => {
    const validPng = new Blob([createPngBytes(64).buffer as ArrayBuffer], {
      type: 'image/png',
    });
    const pngResult = await validateUploadImageFile(validPng);
    expect(pngResult).toEqual({
      valid: true,
      mimeType: 'image/png',
      byteLength: 64,
    });

    const exact5MbBlob = createMockBlob(
      createJpegBytes(16),
      'image/jpeg',
      MAX_RAW_UPLOAD_IMAGE_BYTES,
    );
    expect(await validateUploadImageFile(exact5MbBlob)).toEqual({
      valid: true,
      mimeType: 'image/jpeg',
      byteLength: MAX_RAW_UPLOAD_IMAGE_BYTES,
    });

    const over5MbBlob = createMockBlob(
      createJpegBytes(16),
      'image/jpeg',
      MAX_RAW_UPLOAD_IMAGE_BYTES + 1,
    );
    const overResult = await validateUploadImageFile(over5MbBlob);
    expect(overResult.valid).toBe(false);
    if (!overResult.valid) {
      expect(overResult.code).toBe('FILE_TOO_LARGE');
    }

    const emptyBlob = new Blob([], { type: 'image/webp' });
    const emptyResult = await validateUploadImageFile(emptyBlob);
    expect(emptyResult.valid).toBe(false);
    if (!emptyResult.valid) {
      expect(emptyResult.code).toBe('EMPTY_FILE');
    }
  });

  it('rejects unsupported MIMEs and spoofed magic-byte headers', async () => {
    const svgPayload = new TextEncoder().encode('<svg><script>alert(1)</script></svg>');
    const svgBlob = new Blob([svgPayload], { type: 'image/svg+xml' });
    const svgResult = await validateUploadImageFile(svgBlob);
    expect(svgResult.valid).toBe(false);
    if (!svgResult.valid) {
      expect(svgResult.code).toBe('INVALID_TYPE');
    }

    const spoofedJpg = new Blob([svgPayload], { type: 'image/jpeg' });
    const spoofResult = await validateUploadImageFile(spoofedJpg);
    expect(spoofResult.valid).toBe(false);
    if (!spoofResult.valid) {
      expect(spoofResult.code).toBe('INVALID_MAGIC_BYTES');
    }

    const crossMime = validateUploadImageBytes(createPngBytes(), 'image/webp');
    expect(crossMime.valid).toBe(false);
    if (!crossMime.valid) {
      expect(crossMime.code).toBe('INVALID_MAGIC_BYTES');
    }
  });

  it('validates stored WebP payload limits (122880 bytes and 165000 chars) and RIFF+WEBP header', () => {
    const exactMaxWebp = createWebpDataUrl(MAX_STORED_WEBP_BYTES);
    expect(exactMaxWebp.length).toBeLessThanOrEqual(MAX_STORED_WEBP_DATA_URL_LENGTH);
    expect(validateStoredWebpImage(exactMaxWebp)).toEqual({
      valid: true,
      mimeType: 'image/webp',
      byteLength: MAX_STORED_WEBP_BYTES,
    });

    const overMaxWebp = createWebpDataUrl(MAX_STORED_WEBP_BYTES + 1);
    const overBytesRes = validateStoredWebpImage(overMaxWebp);
    expect(overBytesRes.valid).toBe(false);
    if (!overBytesRes.valid) {
      expect(overBytesRes.code).toBe('FILE_TOO_LARGE');
    }

    const overCharCap = `${WEBP_DATA_URL_PREFIX}${'A'.repeat(MAX_STORED_WEBP_DATA_URL_LENGTH - WEBP_DATA_URL_PREFIX.length + 1)}`;
    const overCharRes = validateStoredWebpImage(overCharCap);
    expect(overCharRes.valid).toBe(false);
    if (!overCharRes.valid) {
      expect(overCharRes.code).toBe('FILE_TOO_LARGE');
    }
  });

  it('rejects non-WebP URLs, edge whitespace, truncated headers, and fake 0x41 WebP payloads', () => {
    const fake0x41 = `${WEBP_DATA_URL_PREFIX}${Buffer.alloc(64, 0x41).toString('base64')}`;
    expect(validateStoredWebpDataUrl(fake0x41).valid).toBe(true);
    const magicFail = validateStoredWebpImage(fake0x41);
    expect(magicFail.valid).toBe(false);
    if (!magicFail.valid) {
      expect(magicFail.code).toBe('INVALID_MAGIC_BYTES');
    }

    const pngUrl = `data:image/png;base64,${Buffer.from(createPngBytes(24)).toString('base64')}`;
    const pngRes = validateStoredWebpImage(pngUrl);
    expect(pngRes.valid).toBe(false);
    if (!pngRes.valid) {
      expect(pngRes.code).toBe('INVALID_TYPE');
    }

    const httpUrl = validateStoredWebpImage('https://example.com/photo.webp');
    expect(httpUrl.valid).toBe(false);
    if (!httpUrl.valid) {
      expect(httpUrl.code).toBe('INVALID_TYPE');
    }

    const validUrl = createWebpDataUrl(24);
    const paddedUrl = validateStoredWebpImage(`  ${validUrl}  `);
    expect(paddedUrl.valid).toBe(false);
    if (!paddedUrl.valid) {
      expect(paddedUrl.code).toBe('INVALID_BASE64');
    }

    const shortWebp = `${WEBP_DATA_URL_PREFIX}${Buffer.from([0x52, 0x49, 0x46, 0x46]).toString('base64')}`;
    const shortRes = validateStoredWebpImage(shortWebp);
    expect(shortRes.valid).toBe(false);
    if (!shortRes.valid) {
      expect(shortRes.code).toBe('INVALID_MAGIC_BYTES');
    }
  });
});
